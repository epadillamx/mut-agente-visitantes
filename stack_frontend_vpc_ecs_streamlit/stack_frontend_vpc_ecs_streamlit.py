"""
Credits for this Streamlit + ECS stack: https://github.com/aws-samples/deploy-streamlit-app/
"""

from aws_cdk import (
    Duration,
    Stack,
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_iam as iam,
    aws_dynamodb as dynamodb,
    aws_secretsmanager as secretsmanager,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_elasticloadbalancingv2 as elbv2,
    SecretValue,
    CfnOutput,
)
from constructs import Construct
from frontend_docker_app.config_file import Config

CUSTOM_HEADER_NAME = "X-Custom-Header"

class GenAiVirtualAssistantVpcEcsStreamlitStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, input_metadata, input_ddb_table_arn, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Define prefix that will be used in some resource names
        prefix = Config.STACK_NAME
        
        # Store Streamlit Application Username and Password, using Secrets Manager. 
        secret_auth = secretsmanager.Secret(self, "SsmParamStreamlitSecretAppSrv",
                                       secret_name=input_metadata['ssm_secret_name'],
                                       secret_object_value={
                                           "username": SecretValue.unsafe_plain_text(input_metadata['ssm_app_server_username'],),
                                           "password": SecretValue.unsafe_plain_text(input_metadata['ssm_app_server_password'],)
                                       }
                                       )

        # VPC for ALB and ECS cluster
        vpc = ec2.Vpc(
            self,
            f"{prefix}AppVpc",
            ip_addresses=ec2.IpAddresses.cidr("10.0.0.0/16"),
            max_azs=2,
            vpc_name=f"{prefix}-stl-vpc",
            nat_gateways=1
        )

        # Add SSM Endpoints to the VPC
        vpc.add_interface_endpoint("VpcGenAiSsmEndpoint",
                                   service=ec2.InterfaceVpcEndpointAwsService.SSM)

        # Security Group
        ecs_security_group = ec2.SecurityGroup(
            self,
            f"{prefix}SecurityGroupECS",
            vpc=vpc,
            security_group_name=f"{prefix}-stl-ecs-sg",
        )

        # ALB Security Group creation
        alb_security_group = ec2.SecurityGroup(
            self,
            f"{prefix}SecurityGroupALB",
            vpc=vpc,
            security_group_name=f"{prefix}-stl-alb-sg",
        )

        # Add Security Group Inbound Rules
        ecs_security_group.add_ingress_rule(
            peer=alb_security_group,
            connection=ec2.Port.tcp(8501),
            description="ALB traffic",
        )

        # ECS cluster and service definition
        cluster = ecs.Cluster(
            self,
            f"{prefix}Cluster",
            enable_fargate_capacity_providers=True,
            vpc=vpc)

        # ALB to connect to ECS
        alb = elbv2.ApplicationLoadBalancer(
            self,
            f"{prefix}Alb",
            vpc=vpc,
            internet_facing=True,
            load_balancer_name=f"{prefix}-stl",
            security_group=alb_security_group,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
        )

        # Add physical resources
        fargate_task_definition = ecs.FargateTaskDefinition(
            self,
            f"{prefix}WebappTaskDef",
            memory_limit_mib=1024,
            cpu=512,
        )

        # Build Dockerfile from local folder and push to ECR
        image = ecs.ContainerImage.from_asset('frontend_docker_app')

        # Confirm where to store the logs
        fargate_task_definition.add_container(
            f"{prefix}WebContainer",
            # Use an image from DockerHub
            image=image,
            port_mappings=[
                ecs.PortMapping(
                    container_port=8501,
                    protocol=ecs.Protocol.TCP)],
            logging=ecs.LogDrivers.aws_logs(stream_prefix="WebContainerLogs"),
        )

        """Fargate Service Config:
        - Sets a base of 1 for the FARGATE capacity provider, ensuring at least one task is always running on Fargate On-Demand.
        - Uses FARGATE_SPOT for additional capacity with a higher weight, which can help reduce costs.
        - Sets the desired_count to 1, which means the service will maintain at least one running task at all times.
        """
        service = ecs.FargateService(
            self,
            f"{prefix}ECSService",
            cluster=cluster,
            task_definition=fargate_task_definition,
            service_name=f"{prefix}-stl-front-01",
            security_groups=[ecs_security_group],
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
            capacity_provider_strategies=[
                ecs.CapacityProviderStrategy(
                    capacity_provider="FARGATE",
                    weight=1,
                    base=1
                ),
                ecs.CapacityProviderStrategy(
                    capacity_provider="FARGATE_SPOT",
                    weight=4
                )
            ],
            desired_count=1,
            min_healthy_percent=50
        )

        # Prevent cold starts, you might want to add a scaling policy. 
        scaling = service.auto_scale_task_count(
            max_capacity=5,
            min_capacity=1
        )

        # Scaling CPU Rules
        scaling.scale_on_cpu_utilization(
            f"{prefix}CpuScaling",
            target_utilization_percent=70,
            scale_in_cooldown=Duration.seconds(60),
            scale_out_cooldown=Duration.seconds(60)
        )

        # Grant access to Bedrock, DynamoDB
        # - IMPORTANT: The Agent ARN can be LIMITED here, instead of "*"
        bedrock_policy = iam.Policy(self, f"{prefix}BedrockPolicy",
                                    statements=[
                                        iam.PolicyStatement(
                                            actions=[
                                                "bedrock:InvokeModel",
                                                "bedrock:InvokeAgent",
                                                "bedrock:InvokeModelWithResponseStream",
                                                "bedrock:RetrieveAndGenerate",
                                                "bedrock:Retrieve"
                                                ],
                                            resources=["*"]
                                        )
                                    ]
                                    )
        
        # Create IAM role first
        task_role = fargate_task_definition.task_role
        task_role.attach_inline_policy(bedrock_policy)
        
        # Get DDB Table name:        
        ddb_table_agent = dynamodb.Table.from_table_arn(self, "ddb_ecomm_table_agent", input_ddb_table_arn)
        ddb_table_agent.grant_read_write_data(task_role)

        # Grant access to read the secret in Secrets Manager
        secret_auth.grant_read(task_role)

        # Add ALB as CloudFront Origin
        origin = origins.LoadBalancerV2Origin(
            alb,
            custom_headers={CUSTOM_HEADER_NAME: Config.CUSTOM_HEADER_VALUE},
            origin_shield_enabled=False,
            protocol_policy=cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        )

        # Cloudfront Options
        cloudfront_distribution = cloudfront.Distribution(
            self,
            f"{prefix}CfDist",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origin,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER,
            ),
        )

        # ALB Listener
        http_listener = alb.add_listener(
            f"{prefix}HttpListener",
            port=80,
            open=True,
        )

        # Add Targets to ELB
        http_listener.add_targets(
            f"{prefix}TargetGroup",
            target_group_name=f"{prefix}-tg",
            port=8501,
            priority=1,
            conditions=[
                elbv2.ListenerCondition.http_header(
                    CUSTOM_HEADER_NAME,
                    [Config.CUSTOM_HEADER_VALUE])],
            protocol=elbv2.ApplicationProtocol.HTTP,
            targets=[service],
        )
        
        # Add a default action to the listener that will deny all requests that
        http_listener.add_action(
            "default-action",
            action=elbv2.ListenerAction.fixed_response(
                status_code=403,
                content_type="text/plain",
                message_body="Access denied",
            ),
        )

        # Output CloudFront URL & Cognito pool id
        CfnOutput(self, "CloudFrontDistributionURL", value=cloudfront_distribution.domain_name)

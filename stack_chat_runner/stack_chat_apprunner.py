from aws_cdk import (
    Stack,
    CfnOutput,
    Aws,
    RemovalPolicy,
    aws_iam as iam,
    aws_secretsmanager as secretsmanager,
    aws_s3 as s3,
    aws_ecr_assets as ecr_assets,
    Duration,
)
from constructs import Construct
import os

class ChatRunnerNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str,
                 conversations_table=None, sessions_table=None,
                 agent_id=None, input_metadata=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        AWS App Runner Stack para WhatsApp Chat con Bedrock Agent
        """

        # Get secret ARN from context
        secret_arn = input_metadata.get("secret_complete_arn") if input_metadata else None
        if not secret_arn:
            raise ValueError("secret_complete_arn must be provided in cdk.json context")

        # Import Secrets Manager secret for WhatsApp credentials
        whatsapp_secret = secretsmanager.Secret.from_secret_complete_arn(
            self,
            "WhatsAppSecret",
            secret_complete_arn=secret_arn
        )

        # Create S3 bucket for temporal cache (embeddings model cache)
        self.cache_bucket = s3.Bucket(
            self,
            "ChatRunnerCacheBucket",
            bucket_name=f"chat-runner-cache-{Aws.ACCOUNT_ID}-{Aws.REGION}",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            versioned=False,
            lifecycle_rules=[
                s3.LifecycleRule(
                    id="DeleteOldCacheFiles",
                    enabled=True,
                    expiration=Duration.days(7),
                    abort_incomplete_multipart_upload_after=Duration.days(1)
                )
            ],
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True
        )

        # Default values for configuration
        DEFAULT_AGENT_ID = agent_id

        # Build environment variables for App Runner
        environment_vars = {
            # Bedrock Agent configuration
            "AGENT_ID": DEFAULT_AGENT_ID,
            "AGENT_ALIAS_ID": 'change',
            # S3 Cache bucket
            "CACHE_BUCKET_NAME": self.cache_bucket.bucket_name,
            # Configure transformers to use /tmp for model cache
            "TRANSFORMERS_CACHE": "/tmp/.cache",
            "HF_HOME": "/tmp/.cache",
            # Logger configuration - production mode
            "NODE_ENV": "production",
            # Port for App Runner
            "PORT": "8080"
        }

        # Add DynamoDB table names if provided
        if conversations_table:
            environment_vars["CONVERSATIONS_TABLE"] = conversations_table.table_name
        if sessions_table:
            environment_vars["SESSIONS_TABLE"] = sessions_table.table_name

        # Build Docker image and push to ECR
        docker_image_asset = ecr_assets.DockerImageAsset(
            self,
            "ChatRunnerDockerImage",
            directory=os.path.join(os.path.dirname(__file__)),
            file="Dockerfile.apprunner"
        )

        # Create IAM role for App Runner instance
        instance_role = iam.Role(
            self,
            "ChatRunnerInstanceRole",
            assumed_by=iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
            description="IAM role for App Runner instance to access AWS services"
        )

        # Add Bedrock permissions
        self._configure_apprunner_permissions(instance_role, DEFAULT_AGENT_ID)

        # Grant DynamoDB permissions if tables are provided
        if conversations_table:
            conversations_table.grant_read_write_data(instance_role)
        if sessions_table:
            sessions_table.grant_read_write_data(instance_role)

        # Grant permissions to read from Secrets Manager
        whatsapp_secret.grant_read(instance_role)

        # Grant S3 permissions for cache bucket
        self.cache_bucket.grant_read_write(instance_role)

        # Grant S3 permissions for data bucket
        instance_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:ListBucket",
                    "s3:GetObject",
                    "s3:PutObject"
                ],
                resources=[
                    f"arn:aws:s3:::raw-virtual-assistant-data-{Aws.ACCOUNT_ID}-{Aws.REGION}",
                    f"arn:aws:s3:::raw-virtual-assistant-data-{Aws.ACCOUNT_ID}-{Aws.REGION}/*"
                ]
            )
        )

        # Create IAM role for App Runner service (to access ECR)
        access_role = iam.Role(
            self,
            "ChatRunnerAccessRole",
            assumed_by=iam.ServicePrincipal("build.apprunner.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("service-role/AWSAppRunnerServicePolicyForECRAccess")
            ]
        )

        # Create App Runner Service using L1 construct (CfnService)
        # Note: CDK doesn't have L2 constructs for App Runner yet
        from aws_cdk import aws_apprunner as apprunner

        # Build image configuration with secrets
        image_configuration = apprunner.CfnService.ImageConfigurationProperty(
            port="8080",
            runtime_environment_variables=[
                {"name": k, "value": v} for k, v in environment_vars.items()
            ],
            runtime_environment_secrets=[
                {
                    "name": "TOKEN_WHATS",
                    "value": f"{whatsapp_secret.secret_arn}:TOKEN_WHATSAPP::"
                },
                {
                    "name": "IPHONE_ID_WHATS",
                    "value": f"{whatsapp_secret.secret_arn}:VISITANTES_PHONE_ID::"
                },
                {
                    "name": "VERIFY_TOKEN",
                    "value": f"{whatsapp_secret.secret_arn}:VERIFY_TOKEN_WHATSAPP::"
                }
            ]
        )

        self.app_runner_service = apprunner.CfnService(
            self,
            "ChatRunnerService",
            source_configuration=apprunner.CfnService.SourceConfigurationProperty(
                authentication_configuration=apprunner.CfnService.AuthenticationConfigurationProperty(
                    access_role_arn=access_role.role_arn
                ),
                image_repository=apprunner.CfnService.ImageRepositoryProperty(
                    image_identifier=docker_image_asset.image_uri,
                    image_repository_type="ECR",
                    image_configuration=image_configuration
                )
            ),
            instance_configuration=apprunner.CfnService.InstanceConfigurationProperty(
                cpu="1 vCPU",
                memory="2 GB",
                instance_role_arn=instance_role.role_arn
            ),
            health_check_configuration=apprunner.CfnService.HealthCheckConfigurationProperty(
                protocol="HTTP",
                path="/",
                interval=10,
                timeout=5,
                healthy_threshold=1,
                unhealthy_threshold=5
            ),
            service_name="chat-runner-whatsapp-service"
        )

        """
        Outputs
        """

        # Return App Runner Service ARN
        CfnOutput(
            self,
            "output-apprunner-service-arn",
            value=self.app_runner_service.attr_service_arn,
            description="App Runner Service ARN"
        )

        # Return App Runner Service URL
        CfnOutput(
            self,
            "output-apprunner-service-url",
            value=f"https://{self.app_runner_service.attr_service_url}",
            description="App Runner Service Base URL"
        )

        # Return Webhook URL
        CfnOutput(
            self,
            "output-webhook-url",
            value=f"https://{self.app_runner_service.attr_service_url}/webhook",
            description="WhatsApp Webhook URL (use this in Meta Developer Console)"
        )

        # Return Chat Test URL
        CfnOutput(
            self,
            "output-chat-test-url",
            value=f"https://{self.app_runner_service.attr_service_url}/chat",
            description="Direct Chat Test URL"
        )

        # Return Cache Bucket Name
        CfnOutput(
            self,
            "output-cache-bucket-name",
            value=self.cache_bucket.bucket_name,
            description="S3 Cache Bucket for temporary storage"
        )

    def _configure_apprunner_permissions(self, role: iam.Role, agent_id=None) -> None:
        """
        Configures IAM permissions for the App Runner instance to invoke Bedrock Agent.
        """

        # ARNs for agent and all its aliases
        agent_arn = f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent/{agent_id}"
        agent_alias_arn_wildcard = f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent-alias/{agent_id}/*"

        # 1. Grant Bedrock Agent RUNTIME permissions
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock-agent-runtime:InvokeAgent",
                    "bedrock-agent-runtime:Retrieve"
                ],
                resources=[
                    agent_arn,
                    agent_alias_arn_wildcard
                ]
            )
        )

        # 2. Grant Bedrock Agent CONTROL PLANE permissions
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeAgent"
                ],
                resources=[
                    agent_arn,
                    agent_alias_arn_wildcard
                ]
            )
        )

        # 2b. Additional control plane permissions for metadata
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:GetAgent",
                    "bedrock:GetAgentAlias",
                    "bedrock:ListAgentAliases"
                ],
                resources=[
                    agent_arn,
                    agent_alias_arn_wildcard
                ]
            )
        )

        # 3. Grant Knowledge Base runtime permissions
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock-agent-runtime:Retrieve",
                    "bedrock-agent-runtime:RetrieveAndGenerate"
                ],
                resources=[
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:knowledge-base/*"
                ]
            )
        )

        # 4. Grant Foundation Model permissions
        role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                resources=[
                    "arn:aws:bedrock:*::foundation-model/*",
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:inference-profile/*"
                ]
            )
        )

from aws_cdk import (
    Stack,
    CfnOutput,
    Aws,
    Duration,
    aws_lambda as _lambda,
    aws_lambda_python_alpha as _alambda,
    aws_apigateway as apigw,
    aws_iam as iam,
)
from constructs import Construct

class GenAiVirtualAssistantApiGatewayStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, input_agent_id: str, input_agent_alias_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function
        """

        # Powertools for AWS layer. Do not Change account ID. See docs at: https://powertools.aws.dev/
        sdk_lambda_layer_arn = f"arn:aws:lambda:{Aws.REGION}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python312-x86_64:2"

        # Create function using Layer with the same Python version
        self.lambda_fn = _alambda.PythonFunction(
            self,
            "virtual-assistant-api-lambda-fn",
            entry="./stack_api_gateway_lambda/",
            runtime=_lambda.Runtime.PYTHON_3_12,
            description="Function to interact with Bedrock Agent via API Gateway",
            index="lambda_function.py",
            handler="lambda_handler",
            layers=[
                _alambda.PythonLayerVersion.from_layer_version_arn(
                    self,
                    'lambda-layer-powertools-api',
                    sdk_lambda_layer_arn
                    )
                ],
            timeout=Duration.seconds(120),
            memory_size=512,
        )

        # Add environment variables for Agent ID and Alias ID
        self.lambda_fn.add_environment(key="AGENT_ID", value=input_agent_id)
        self.lambda_fn.add_environment(key="AGENT_ALIAS_ID", value=input_agent_alias_id)

        """
        @ IAM Permissions for Bedrock Agent
        """

        # Grant Lambda permission to invoke Bedrock Agent
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeAgent",
                    "bedrock:Retrieve",
                    "bedrock:RetrieveAndGenerate"
                ],
                resources=[
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent/{input_agent_id}",
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent-alias/{input_agent_id}/{input_agent_alias_id}"
                ]
            )
        )

        """
        @ API Gateway REST API
        """

        # Create REST API
        self.api = apigw.RestApi(
            self,
            "virtual-assistant-api",
            rest_api_name="Virtual Assistant API",
            description="REST API to interact with Amazon Bedrock Virtual Assistant Agent",
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                throttling_rate_limit=100,
                throttling_burst_limit=200,
                logging_level=apigw.MethodLoggingLevel.INFO,
                data_trace_enabled=True,
                metrics_enabled=True
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"]
            )
        )

        # Create Lambda integration
        lambda_integration = apigw.LambdaIntegration(
            self.lambda_fn,
            proxy=True,
            integration_responses=[
                apigw.IntegrationResponse(
                    status_code="200",
                    response_parameters={
                        'method.response.header.Access-Control-Allow-Origin': "'*'"
                    }
                )
            ]
        )

        # Create /chat resource
        chat_resource = self.api.root.add_resource("chat")

        # Add POST method to /chat
        chat_resource.add_method(
            "POST",
            lambda_integration,
            method_responses=[
                apigw.MethodResponse(
                    status_code="200",
                    response_parameters={
                        'method.response.header.Access-Control-Allow-Origin': True
                    },
                    response_models={
                        'application/json': apigw.Model.EMPTY_MODEL
                    }
                )
            ]
        )

        # Create /health resource for health checks
        health_resource = self.api.root.add_resource("health")
        health_resource.add_method(
            "GET",
            apigw.MockIntegration(
                integration_responses=[
                    apigw.IntegrationResponse(
                        status_code="200",
                        response_templates={
                            "application/json": '{"status": "healthy"}'
                        }
                    )
                ],
                request_templates={
                    "application/json": '{"statusCode": 200}'
                }
            ),
            method_responses=[
                apigw.MethodResponse(status_code="200")
            ]
        )

        """
        @ Outputs
        """

        # Return API Gateway URL
        CfnOutput(self, "output-api-gateway-url",
                  value=self.api.url,
                  description="API Gateway endpoint URL")

        CfnOutput(self, "output-api-gateway-chat-url",
                  value=f"{self.api.url}chat",
                  description="API Gateway chat endpoint URL")

        CfnOutput(self, "output-lambda-fn-arn",
                  value=self.lambda_fn.function_arn,
                  description="Lambda function ARN")

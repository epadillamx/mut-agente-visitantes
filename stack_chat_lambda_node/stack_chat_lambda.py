from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
)
from constructs import Construct
import os

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function
        """
        
        # Default values for configuration (can be overridden via environment)
        DEFAULT_AGENT_ID = "EJVTR9GKUE"
        DEFAULT_AGENT_ALIAS_ID = "DV8JJEPK8M"
        DEFAULT_TOKEN_WHATS = "EAARiF0M4rZBwBPFb4inzWTd3izfO8koHUTHvZAea8xWLOhWec33COWTmosXyYyUHmLoprWBnZCR1Rf2kiFKF8F4LrFenzB0ryLzyzYx8PTCeOUpi1IVdgkVgVfHoGGzDnIJvMM6nYoALpm5Jh24AlnXPyNfL4tgdSlGDkIoGm2bnkySlqI6gqC59bXbnwZDZD"
        DEFAULT_IPHONE_ID = "671787702683016"
        DEFAULT_VERIFY_TOKEN = "gASgcVFirbcJ735%$32"

        # Create Node.js 22 Lambda function
        self.lambda_fn = _lambda.Function(
            self,
            "chat-lambda-fn",
            runtime=_lambda.Runtime.NODEJS_22_X,
            handler="index.handler",
            code=_lambda.Code.from_asset(os.path.join(os.path.dirname(__file__), "lambda")),
            description="Lambda function that invokes Bedrock Agent for WhatsApp chat interactions",
            timeout=Duration.seconds(120),  # Increased timeout for Bedrock calls
            memory_size=1024,
            environment={
                # Bedrock Agent configuration
                "AGENT_ID": DEFAULT_AGENT_ID,
                "AGENT_ALIAS_ID": DEFAULT_AGENT_ALIAS_ID,
                # WhatsApp credentials
                "TOKEN_WHATS": DEFAULT_TOKEN_WHATS,
                "IPHONE_ID_WHATS": DEFAULT_IPHONE_ID,
                "VERIFY_TOKEN": DEFAULT_VERIFY_TOKEN
            }
        )

        # Add Bedrock permissions to Lambda
        self._configure_lambda_permissions()


        """
        @ API Gateway
        """

        # Create REST API Gateway
        api = apigateway.RestApi(
            self,
            "chat-api",
            rest_api_name="WhatsApp Bedrock Agent API",
            description="API Gateway for WhatsApp Bedrock Agent Lambda",
            deploy_options=apigateway.StageOptions(
                stage_name="prod"
            )
        )

        # Create Lambda integration
        lambda_integration = apigateway.LambdaIntegration(
            self.lambda_fn,
            proxy=True,  # Proxy integration passes all request data to Lambda
            allow_test_invoke=True
        )

        # Add GET method to root for health check
        api.root.add_method("GET", lambda_integration)

        # Add POST method to root for chat testing
        api.root.add_method("POST", lambda_integration)

        # Create /webhook resource
        webhook = api.root.add_resource("webhook")
        
        # Add GET method to /webhook (WhatsApp verification)
        webhook.add_method("GET", lambda_integration)
        
        # Add POST method to /webhook (WhatsApp messages)
        webhook.add_method("POST", lambda_integration)

        # Create /chat resource for direct testing
        chat = api.root.add_resource("chat")
        chat.add_method("POST", lambda_integration)

        """
        @ Outputs
        """

        # Return Lambda function ARN
        CfnOutput(
            self,
            "output-lambda-fn-arn",
            value=self.lambda_fn.function_arn,
            description="Lambda Function ARN"
        )

        # Return API Gateway URL
        CfnOutput(
            self,
            "output-api-gateway-url",
            value=api.url,
            description="API Gateway Base URL"
        )

        # Return Webhook URL
        CfnOutput(
            self,
            "output-webhook-url",
            value=f"{api.url}webhook",
            description="WhatsApp Webhook URL (use this in Meta Developer Console)"
        )

        # Return Chat Test URL
        CfnOutput(
            self,
            "output-chat-test-url",
            value=f"{api.url}chat",
            description="Direct Chat Test URL"
        )

    def _configure_lambda_permissions(self) -> None:
        """
        Configures IAM permissions for the Lambda function to invoke Bedrock Agent.
        """
        # Grant permissions to invoke Bedrock Agent
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeAgent",
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                    "bedrock:GetAgent",
                    "bedrock:ListAgents",
                    "bedrock:GetAgentAlias",
                    "bedrock:ListAgentAliases"
                ],
                resources=["*"]
            )
        )

        # Grant permissions to access Knowledge Base (if Lambda needs direct access)
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:Retrieve",
                    "bedrock:RetrieveAndGenerate"
                ],
                resources=["*"]
            )
        )

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_ssm as ssm,
)
from constructs import Construct
import os

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function
        """
        
        # Parameter Store paths for all configuration
        PARAM_AGENT_ID = "/whatsapp/bedrock-agent/agent-id"
        PARAM_AGENT_ALIAS_ID = "/whatsapp/bedrock-agent/agent-alias-id"
        PARAM_TOKEN_WHATS = "/whatsapp/bedrock-agent/token"
        PARAM_IPHONE_ID = "/whatsapp/bedrock-agent/phone-id"
        PARAM_VERIFY_TOKEN = "/whatsapp/bedrock-agent/verify-token"

        # Create Node.js 22 Lambda function
        self.lambda_fn = _lambda.Function(
            self,
            "chat-lambda-fn",
            runtime=_lambda.Runtime.NODEJS_22_X,
            handler="index.handler",
            code=_lambda.Code.from_asset(os.path.join(os.path.dirname(__file__), "lambda")),
            description="Lambda function that invokes Bedrock Agent for WhatsApp chat interactions",
            timeout=Duration.seconds(60),  # Increased timeout for Bedrock calls
            memory_size=512,  # Increased memory for better performance
            environment={
                # Parameter Store paths for Bedrock Agent IDs
                "PARAM_AGENT_ID": PARAM_AGENT_ID,
                "PARAM_AGENT_ALIAS_ID": PARAM_AGENT_ALIAS_ID,
                # Parameter Store paths for WhatsApp credentials
                "PARAM_TOKEN_WHATS": PARAM_TOKEN_WHATS,
                "PARAM_IPHONE_ID": PARAM_IPHONE_ID,
                "PARAM_VERIFY_TOKEN": PARAM_VERIFY_TOKEN
            }
        )

        # Add Bedrock permissions to Lambda
        self._configure_lambda_permissions()
        
        # Add SSM Parameter Store permissions
        self._configure_ssm_permissions(
            PARAM_AGENT_ID, 
            PARAM_AGENT_ALIAS_ID, 
            PARAM_TOKEN_WHATS, 
            PARAM_IPHONE_ID, 
            PARAM_VERIFY_TOKEN
        )

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

    def _configure_ssm_permissions(self, param_agent_id: str, param_agent_alias_id: str, 
                                   param_token: str, param_phone: str, param_verify: str) -> None:
        """
        Configures IAM permissions for the Lambda function to read SSM Parameter Store.
        """
        # Grant permissions to read specific parameters from SSM
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "ssm:GetParameter",
                    "ssm:GetParameters"
                ],
                resources=[
                    f"arn:aws:ssm:{Stack.of(self).region}:{Stack.of(self).account}:parameter{param_agent_id}",
                    f"arn:aws:ssm:{Stack.of(self).region}:{Stack.of(self).account}:parameter{param_agent_alias_id}",
                    f"arn:aws:ssm:{Stack.of(self).region}:{Stack.of(self).account}:parameter{param_token}",
                    f"arn:aws:ssm:{Stack.of(self).region}:{Stack.of(self).account}:parameter{param_phone}",
                    f"arn:aws:ssm:{Stack.of(self).region}:{Stack.of(self).account}:parameter{param_verify}"
                ]
            )
        )

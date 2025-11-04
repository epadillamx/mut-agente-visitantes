from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    Aws,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
)
from constructs import Construct
import os

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, 
                 conversations_table=None, sessions_table=None,
                 agent_id=None, agent_alias_id=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function
        """
        
        # Default values for configuration (can be overridden via environment)
        DEFAULT_AGENT_ID = "MEL0HVUHUD"
        DEFAULT_AGENT_ALIAS_ID = "5Z5OLHQDGI"
        DEFAULT_TOKEN_WHATS = "EAARiF0M4rZBwBPFb4inzWTd3izfO8koHUTHvZAea8xWLOhWec33COWTmosXyYyUHmLoprWBnZCR1Rf2kiFKF8F4LrFenzB0ryLzyzYx8PTCeOUpi1IVdgkVgVfHoGGzDnIJvMM6nYoALpm5Jh24AlnXPyNfL4tgdSlGDkIoGm2bnkySlqI6gqC59bXbnwZDZD"
        DEFAULT_IPHONE_ID = "671787702683016"
        DEFAULT_VERIFY_TOKEN = "gASgcVFirbcJ735%$32"

        # Build environment variables
        environment_vars = {
            # Bedrock Agent configuration
            "AGENT_ID": DEFAULT_AGENT_ID,
            "AGENT_ALIAS_ID": DEFAULT_AGENT_ALIAS_ID,
            # WhatsApp credentials
            "TOKEN_WHATS": DEFAULT_TOKEN_WHATS,
            "IPHONE_ID_WHATS": DEFAULT_IPHONE_ID,
            "VERIFY_TOKEN": DEFAULT_VERIFY_TOKEN
        }

        # Add DynamoDB table names if provided
        if conversations_table:
            environment_vars["CONVERSATIONS_TABLE"] = conversations_table.table_name
        if sessions_table:
            environment_vars["SESSIONS_TABLE"] = sessions_table.table_name

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
            environment=environment_vars
        )

        # Add Bedrock permissions to Lambda
        self._configure_lambda_permissions(DEFAULT_AGENT_ID, DEFAULT_AGENT_ALIAS_ID)

        # Grant DynamoDB permissions if tables are provided
        if conversations_table:
            conversations_table.grant_read_write_data(self.lambda_fn)
        if sessions_table:
            sessions_table.grant_read_write_data(self.lambda_fn)


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

        # Create /history resource for conversation history
        history = api.root.add_resource("history")
        history.add_method("GET", lambda_integration)

        # Create /stats resource for user statistics
        stats = api.root.add_resource("stats")
        stats.add_method("GET", lambda_integration)

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

    def _configure_lambda_permissions(self, agent_id=None, agent_alias_id=None) -> None:
        """
        Configures IAM permissions for the Lambda function to invoke Bedrock Agent.
        CRITICAL: AWS Bedrock requires BOTH permissions:
        - bedrock:InvokeAgent (control plane - for agent metadata)
        - bedrock-agent-runtime:InvokeAgent (data plane - for actual invocation)
        
        HARDCODED PERMISSIONS for agent R7C1BNS64U and alias I6BK3OAQWB
        """

        # HARDCODED ARNs for current agent
        agent_arn = f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent/{agent_id}"
        agent_alias_arn = f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent-alias/{agent_id}/{agent_alias_id}"

        # 1. Grant Bedrock Agent RUNTIME permissions (for actual invocation)
        # This is the CRITICAL permission for invoking the agent
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock-agent-runtime:InvokeAgent",
                    "bedrock-agent-runtime:Retrieve"
                ],
                resources=[
                    agent_arn,
                    agent_alias_arn
                ]
            )
        )

        # 2. Grant Bedrock Agent CONTROL PLANE permissions
        # These are needed for agent metadata and invocation validation
        # CRITICAL: bedrock:InvokeAgent is REQUIRED for agent invocation
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeAgent"
                ],
                resources=[
                    agent_arn,
                    agent_alias_arn
                ]
            )
        )
        
        # 2b. Additional control plane permissions for metadata
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:GetAgent",
                    "bedrock:GetAgentAlias",
                    "bedrock:ListAgentAliases"
                ],
                resources=[
                    agent_arn,
                    agent_alias_arn
                ]
            )
        )

        # 3. Grant Knowledge Base runtime permissions
        self.lambda_fn.add_to_role_policy(
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

        # 4. Grant Foundation Model permissions (for direct model invocation if needed)
        # Note: The agent already has permissions to invoke models, but this allows
        # the Lambda to directly invoke models for any custom processing if required
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                resources=[
                    "arn:aws:bedrock:*::foundation-model/*"
                ]
            )
        )

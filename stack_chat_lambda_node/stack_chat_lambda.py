from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    Aws,
    RemovalPolicy,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_secretsmanager as secretsmanager,
    aws_dynamodb as dynamodb,
)
from constructs import Construct
import os

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str,
                 conversations_table=None, sessions_table=None,
                 input_metadata=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ DynamoDB Tables
        """

        # Create DynamoDB table for incidents
        self.incidents_table = dynamodb.Table(
            self,
            "IncidentsTable",
            partition_key=dynamodb.Attribute(
                name="id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery=True
        )

        # Add GSI for querying by local_id
        self.incidents_table.add_global_secondary_index(
            index_name="local_id-fecha_creacion-index",
            partition_key=dynamodb.Attribute(
                name="local_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="fecha_creacion",
                type=dynamodb.AttributeType.STRING
            )
        )

        """
        @ Lambda function - Chat
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



        # Build environment variables
        environment_vars = {
            # Reference to Secrets Manager secret (resolved at runtime by Lambda)
            "WHATSAPP_SECRET_ARN": secret_arn,
            # Logger configuration - production mode (solo ERROR logs)
            "NODE_ENV": "development",
        }

        # Add DynamoDB table names if provided
        if conversations_table:
            environment_vars["CONVERSATIONS_TABLE"] = conversations_table.table_name
        if sessions_table:
            environment_vars["SESSIONS_TABLE"] = sessions_table.table_name

        # Create Node.js 20.x Lambda function
        self.lambda_fn = _lambda.Function(
            self,
            "chat-lambda-fn",
            runtime=_lambda.Runtime.NODEJS_22_X,
            handler="index.handler",
            code=_lambda.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "lambda")
            ),
            description="Lambda function that invokes Bedrock Agent for WhatsApp chat interactions",
            timeout=Duration.seconds(120),
            memory_size=512,
            environment=environment_vars
        )

       
        # Grant DynamoDB permissions if tables are provided
        if conversations_table:
            conversations_table.grant_read_write_data(self.lambda_fn)
        if sessions_table:
            sessions_table.grant_read_write_data(self.lambda_fn)

        # Grant permissions to read from Secrets Manager
        whatsapp_secret.grant_read(self.lambda_fn)

        # Grant permissions to invoke Bedrock models
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                resources=[
                    f"arn:aws:bedrock:{Aws.REGION}::foundation-model/*",
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:inference-profile/*",
                    f"arn:aws:bedrock:us::{Aws.ACCOUNT_ID}:inference-profile/*"
                ]
            )
        )

        """
        @ Lambda function - WhatsApp Flow
        """

        # Build environment variables for WhatsApp Flow Lambda
        flow_environment_vars = {
            "NODE_ENV": "development",
            "WHATSAPP_SECRET_ARN": secret_arn,
            "DYNAMODB_TABLE_INCIDENCIAS": self.incidents_table.table_name,
        }

        # Add private key passphrase if provided
        whatsapp_passphrase = input_metadata.get("whatsapp_private_key_passphrase") if input_metadata else None
        if whatsapp_passphrase:
            flow_environment_vars["WHATSAPP_PRIVATE_KEY_PASSPHRASE"] = whatsapp_passphrase

        # Create WhatsApp Flow Lambda function
        self.whatsapp_flow_lambda = _lambda.Function(
            self,
            "whatsapp-flow-lambda-fn",
            runtime=_lambda.Runtime.NODEJS_22_X,
            handler="lambda-handler.handler",
            code=_lambda.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "lambda_flow_app")
            ),
            description="Lambda function for WhatsApp Flow incident reporting",
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=flow_environment_vars
        )

        # Grant DynamoDB permissions to WhatsApp Flow Lambda
        self.incidents_table.grant_read_write_data(self.whatsapp_flow_lambda)
        
        # Grant permissions to read from Secrets Manager
        whatsapp_secret.grant_read(self.whatsapp_flow_lambda)

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

        # Create /flow resource for WhatsApp Flow endpoint
        flow = api.root.add_resource("flow")
        flow_lambda_integration = apigateway.LambdaIntegration(
            self.whatsapp_flow_lambda,
            proxy=True,
            allow_test_invoke=True
        )
        flow.add_method("POST", flow_lambda_integration)
        
        # Create /health resource for WhatsApp Flow health check
        health = api.root.add_resource("health")
        health.add_method("GET", flow_lambda_integration)
        
        # Create /locales/count resource for WhatsApp Flow
        locales = api.root.add_resource("locales")
        locales_count = locales.add_resource("count")
        locales_count.add_method("GET", flow_lambda_integration)

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

        # Return WhatsApp Flow Lambda ARN
        CfnOutput(
            self,
            "output-whatsapp-flow-lambda-arn",
            value=self.whatsapp_flow_lambda.function_arn,
            description="WhatsApp Flow Lambda Function ARN"
        )

        # Return WhatsApp Flow URL
        CfnOutput(
            self,
            "output-whatsapp-flow-url",
            value=f"{api.url}flow",
            description="WhatsApp Flow Endpoint URL"
        )

        # Return Incidents Table Name
        CfnOutput(
            self,
            "output-incidents-table-name",
            value=self.incidents_table.table_name,
            description="DynamoDB Incidents Table Name"
        )

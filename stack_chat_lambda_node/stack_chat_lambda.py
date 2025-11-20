from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    Size,
    Aws,
    RemovalPolicy,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_ssm as ssm,
    aws_secretsmanager as secretsmanager,
    aws_s3 as s3,
)
from constructs import Construct
import os

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, 
                 conversations_table=None, sessions_table=None,
                 agent_id=None, input_metadata=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function
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
            "ChatLambdaCacheBucket",
            bucket_name=f"chat-lambda-cache-{Aws.ACCOUNT_ID}-{Aws.REGION}",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            versioned=False,
            lifecycle_rules=[
                s3.LifecycleRule(
                    id="DeleteOldCacheFiles",
                    enabled=True,
                    expiration=Duration.days(7),  # Eliminar archivos después de 7 días
                    abort_incomplete_multipart_upload_after=Duration.days(1)
                )
            ],
            removal_policy=RemovalPolicy.DESTROY,  # Eliminar bucket al destruir el stack
            auto_delete_objects=True  # Eliminar objetos automáticamente
        )
        
        # Default values for configuration (can be overridden via environment)
        DEFAULT_AGENT_ID = agent_id

        # Build environment variables
        environment_vars = {
            # Bedrock Agent configuration
            "AGENT_ID": DEFAULT_AGENT_ID,
            "AGENT_ALIAS_ID": 'change',
            # WhatsApp credentials from Secrets Manager
            "TOKEN_WHATS": whatsapp_secret.secret_value_from_json("TOKEN_WHATSAPP").unsafe_unwrap(),
            "IPHONE_ID_WHATS": whatsapp_secret.secret_value_from_json("ID_PHONE_WHATSAPP").unsafe_unwrap(),
            "VERIFY_TOKEN": whatsapp_secret.secret_value_from_json("VERIFY_TOKEN_WHATSAPP").unsafe_unwrap(),
            # S3 Cache bucket
            "CACHE_BUCKET_NAME": self.cache_bucket.bucket_name
        }

        # Add DynamoDB table names if provided
        if conversations_table:
            environment_vars["CONVERSATIONS_TABLE"] = conversations_table.table_name
        if sessions_table:
            environment_vars["SESSIONS_TABLE"] = sessions_table.table_name

        # Create Node.js 22 Lambda function using Docker Container Image
        # This allows us to package @xenova/transformers which exceeds layer size limits
        self.lambda_fn = _lambda.DockerImageFunction(
            self,
            "chat-lambda-fn",
            code=_lambda.DockerImageCode.from_image_asset(
                directory=os.path.join(os.path.dirname(__file__)),
                file="Dockerfile"
            ),
            description="Lambda function that invokes Bedrock Agent for WhatsApp chat interactions",
            timeout=Duration.seconds(120),  # Increased timeout for Bedrock calls
            memory_size=2048,  # 2GB para soportar modelos de embeddings
            ephemeral_storage_size=Size.mebibytes(1024),  # 1GB almacenamiento temporal para cache de modelos
            environment=environment_vars
        )

        # Add Bedrock permissions to Lambda
        self._configure_lambda_permissions(DEFAULT_AGENT_ID)

        # Grant DynamoDB permissions if tables are provided
        if conversations_table:
            conversations_table.grant_read_write_data(self.lambda_fn)
        if sessions_table:
            sessions_table.grant_read_write_data(self.lambda_fn)
        
        # Grant permissions to read from Secrets Manager
        whatsapp_secret.grant_read(self.lambda_fn)
        
        # Grant S3 permissions for cache bucket
        self.cache_bucket.grant_read_write(self.lambda_fn)


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
        
        # Return Cache Bucket Name
        CfnOutput(
            self,
            "output-cache-bucket-name",
            value=self.cache_bucket.bucket_name,
            description="S3 Cache Bucket for Lambda temporary storage"
        )

    def _configure_lambda_permissions(self, agent_id=None) -> None:
        """
        Configures IAM permissions for the Lambda function to invoke Bedrock Agent.
        CRITICAL: AWS Bedrock requires BOTH permissions:
        - bedrock:InvokeAgent (control plane - for agent metadata)
        - bedrock-agent-runtime:InvokeAgent (data plane - for actual invocation)
        
        Note: AGENT_ALIAS_ID is dynamic and updated by the sync Lambda, so we use wildcard (*)
        """

        # ARNs for agent and all its aliases
        agent_arn = f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent/{agent_id}"
        agent_alias_arn_wildcard = f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent-alias/{agent_id}/*"

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
                    agent_alias_arn_wildcard
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
                    agent_alias_arn_wildcard
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
                    agent_alias_arn_wildcard
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

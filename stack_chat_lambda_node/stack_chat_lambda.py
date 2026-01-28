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
    aws_ec2 as ec2,  # Para configuración VPC (producción)
)
from constructs import Construct
import os
from dotenv import load_dotenv

# Cargar variables de entorno desde configuraciones/.env
env_path = os.path.join(os.path.dirname(__file__), 'configuraciones', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"✓ Credenciales cargadas desde: {env_path}")
else:
    print(f"⚠️ ADVERTENCIA: No se encontró {env_path}")

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str,
                 conversations_table=None, sessions_table=None,
                 whatsapp_usuarios_table=None, whatsapp_tickets_table=None,
                 incidencia_sessions_table=None,
                 input_metadata=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ============================================================================
        # VPC CONFIGURATION (Comentado - Solo necesario para PRODUCCIÓN con RDS privado)
        # El RDS de QA es público, no necesita VPC
        # Descomentar cuando se necesite conectar a RDS PostgreSQL de PRODUCCIÓN
        # ============================================================================
        # VPC_ID = "vpc-0d57dff405e619cd8"
        # VPC_SUBNET_IDS = ["subnet-036a190a48b0b6656", "subnet-079ddf3624577788a"]
        # VPC_SECURITY_GROUP_IDS = ["sg-0a36e272934165600"]
        #
        # # Import existing VPC
        # vpc = ec2.Vpc.from_lookup(
        #     self,
        #     "ExistingVpc",
        #     vpc_id=VPC_ID
        # )
        #
        # # Import existing subnets
        # subnets = [
        #     ec2.Subnet.from_subnet_id(self, f"Subnet{i}", subnet_id)
        #     for i, subnet_id in enumerate(VPC_SUBNET_IDS)
        # ]
        #
        # # Import existing security group
        # security_groups = [
        #     ec2.SecurityGroup.from_security_group_id(self, f"SG{i}", sg_id)
        #     for i, sg_id in enumerate(VPC_SECURITY_GROUP_IDS)
        # ]
        #
        # # VPC configuration for Lambda functions
        # vpc_config = {
        #     "vpc": vpc,
        #     "vpc_subnets": ec2.SubnetSelection(subnets=subnets),
        #     "security_groups": security_groups
        # }
        # ============================================================================

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



        # Build environment variables (leer desde .env)
        environment_vars = {
            # Reference to Secrets Manager secret (resolved at runtime by Lambda)
            "WHATSAPP_SECRET_ARN": secret_arn,
            # Logger configuration
            "NODE_ENV": "development",
            # ============================================================================
            # DEV_MODE: true = desarrollo, false = producción
            # Controla si Fracttal usa credenciales de desarrollo o del secret
            # ============================================================================
            "DEV_MODE": os.environ.get("DEV_MODE", "true"),
            # ============================================================================
            # WHATSAPP - Credenciales de QA (desde .env cuando DEV_MODE=true)
            # En producción (DEV_MODE=false), se usan las del secret
            # ============================================================================
            "TOKEN_WHATS": os.environ.get("TOKEN_WHATS", ""),
            "PHONE_NUMBER_ID": os.environ.get("PHONE_NUMBER_ID", ""),
            "VERIFY_TOKEN": os.environ.get("VERIFY_TOKEN", ""),
            # ============================================================================
            # ZENDESK - Credenciales y configuración (desde .env)
            # ============================================================================
            "ZENDESK_REMOTE_URI": os.environ.get("ZENDESK_REMOTE_URI", ""),
            "ZENDESK_USERNAME": os.environ.get("ZENDESK_USERNAME", ""),
            "ZENDESK_TOKEN": os.environ.get("ZENDESK_TOKEN", ""),
            # Grupos de Zendesk
            "ZENDESK_GROUP_DEV_ID": os.environ.get("ZENDESK_GROUP_DEV_ID", ""),
            "ZENDESK_GROUP_DEV_NAME": os.environ.get("ZENDESK_GROUP_DEV_NAME", ""),
            "ZENDESK_GROUP_PROD_ID": os.environ.get("ZENDESK_GROUP_PROD_ID", ""),
            "ZENDESK_GROUP_PROD_NAME": os.environ.get("ZENDESK_GROUP_PROD_NAME", ""),
            # ============================================================================
            # FRACTTAL - Credenciales de desarrollo (desde .env cuando DEV_MODE=true)
            # En producción (DEV_MODE=false), se usan las del secret
            # ============================================================================
            "FRACTTAL_KEY": os.environ.get("FRACTTAL_KEY", ""),
            "FRACTTAL_SECRET": os.environ.get("FRACTTAL_SECRET", ""),
            "FRACTTAL_USER_CODE": os.environ.get("FRACTTAL_USER_CODE", ""),
            # ============================================================================
            # POSTGRESQL - Credenciales de lectura (desde .env)
            # ============================================================================
            "DB_HOST": os.environ.get("DB_HOST", ""),
            "DB_PORT": os.environ.get("DB_PORT", ""),
            "DB_USER": os.environ.get("DB_USER", ""),
            "DB_PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "DB_NAME": os.environ.get("DB_NAME", ""),
        }

        # Add DynamoDB table names if provided
        if conversations_table:
            environment_vars["CONVERSATIONS_TABLE"] = conversations_table.table_name
        if sessions_table:
            environment_vars["SESSIONS_TABLE"] = sessions_table.table_name
        if whatsapp_usuarios_table:
            environment_vars["WHATSAPP_USUARIOS_TABLE"] = whatsapp_usuarios_table.table_name
        if whatsapp_tickets_table:
            environment_vars["WHATSAPP_TICKETS_TABLE"] = whatsapp_tickets_table.table_name
        if incidencia_sessions_table:
            environment_vars["INCIDENCIA_SESSIONS_TABLE"] = incidencia_sessions_table.table_name

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
        if whatsapp_usuarios_table:
            whatsapp_usuarios_table.grant_read_write_data(self.lambda_fn)
        if whatsapp_tickets_table:
            whatsapp_tickets_table.grant_read_write_data(self.lambda_fn)
        if incidencia_sessions_table:
            incidencia_sessions_table.grant_read_write_data(self.lambda_fn)

        # Grant permissions to read from Secrets Manager
        whatsapp_secret.grant_read(self.lambda_fn)

        # Grant permissions to invoke Bedrock models (all regions for cross-region inference)
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                resources=[
                    # Foundation models in current region
                    f"arn:aws:bedrock:{Aws.REGION}::foundation-model/*",
                    # Foundation models in other regions (for cross-region inference)
                    "arn:aws:bedrock:us-east-1::foundation-model/*",
                    "arn:aws:bedrock:us-east-2::foundation-model/*",
                    "arn:aws:bedrock:us-west-2::foundation-model/*",
                    # Inference profiles
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:inference-profile/*",
                    f"arn:aws:bedrock:us-east-1:{Aws.ACCOUNT_ID}:inference-profile/*",
                    f"arn:aws:bedrock:us-east-2:{Aws.ACCOUNT_ID}:inference-profile/*",
                    f"arn:aws:bedrock:us-west-2:{Aws.ACCOUNT_ID}:inference-profile/*",
                    # Cross-region inference profiles (us.anthropic.*)
                    "arn:aws:bedrock:us:*:inference-profile/*"
                ]
            )
        )

        """
        @ Lambda function - WhatsApp Flow
        """

        # Build environment variables for WhatsApp Flow Lambda (desde .env)
        flow_environment_vars = {
            "NODE_ENV": "development",
            "WHATSAPP_SECRET_ARN": secret_arn,
            "DYNAMODB_TABLE_INCIDENCIAS": self.incidents_table.table_name,
            # ============================================================================
            # DEV_MODE: true = desarrollo, false = producción
            # Controla si Fracttal usa credenciales de desarrollo o del secret
            # ============================================================================
            "DEV_MODE": os.environ.get("DEV_MODE", "true"),
            # ============================================================================
            # ZENDESK - Credenciales y configuración (desde .env)
            # ============================================================================
            "ZENDESK_REMOTE_URI": os.environ.get("ZENDESK_REMOTE_URI", ""),
            "ZENDESK_USERNAME": os.environ.get("ZENDESK_USERNAME", ""),
            "ZENDESK_TOKEN": os.environ.get("ZENDESK_TOKEN", ""),
            # Grupos de Zendesk
            "ZENDESK_GROUP_DEV_ID": os.environ.get("ZENDESK_GROUP_DEV_ID", ""),
            "ZENDESK_GROUP_DEV_NAME": os.environ.get("ZENDESK_GROUP_DEV_NAME", ""),
            "ZENDESK_GROUP_PROD_ID": os.environ.get("ZENDESK_GROUP_PROD_ID", ""),
            "ZENDESK_GROUP_PROD_NAME": os.environ.get("ZENDESK_GROUP_PROD_NAME", ""),
            # ============================================================================
            # FRACTTAL - Credenciales de desarrollo (desde .env cuando DEV_MODE=true)
            # En producción (DEV_MODE=false), se usan las del secret
            # ============================================================================
            "FRACTTAL_KEY": os.environ.get("FRACTTAL_KEY", ""),
            "FRACTTAL_SECRET": os.environ.get("FRACTTAL_SECRET", ""),
            "FRACTTAL_USER_CODE": os.environ.get("FRACTTAL_USER_CODE", ""),
            # ============================================================================
            # POSTGRESQL - Credenciales de lectura (desde .env)
            # ============================================================================
            "DB_HOST": os.environ.get("DB_HOST", ""),
            "DB_PORT": os.environ.get("DB_PORT", ""),
            "DB_USER": os.environ.get("DB_USER", ""),
            "DB_PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "DB_NAME": os.environ.get("DB_NAME", ""),
        }

        # Add private key passphrase if provided
        whatsapp_passphrase = input_metadata.get("whatsapp_private_key_passphrase") if input_metadata else None
        if whatsapp_passphrase:
            flow_environment_vars["WHATSAPP_PRIVATE_KEY_PASSPHRASE"] = whatsapp_passphrase

        # Create WhatsApp Flow Lambda function
        # ============================================================================
        # PRODUCCIÓN: Para conectar a RDS PostgreSQL, agregar vpc_config:
        # Descomentar las siguientes líneas y la sección VPC al inicio del archivo:
        #   **vpc_config,  # Agregar al final de los parámetros
        # ============================================================================
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
            environment=flow_environment_vars,
            # ============================================================================
            # VPC CONFIG (Descomentar para PRODUCCIÓN con RDS)
            # **vpc_config,
            # ============================================================================
        )

        # Grant DynamoDB permissions to WhatsApp Flow Lambda
        self.incidents_table.grant_read_write_data(self.whatsapp_flow_lambda)
        
        # Grant permissions to read from Secrets Manager
        whatsapp_secret.grant_read(self.whatsapp_flow_lambda)

        # Grant permissions to invoke Bedrock models (for classification)
        self.whatsapp_flow_lambda.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                resources=[
                    f"arn:aws:bedrock:{Aws.REGION}::foundation-model/*",
                    "arn:aws:bedrock:us-east-1::foundation-model/*",
                    "arn:aws:bedrock:us-east-2::foundation-model/*",
                    "arn:aws:bedrock:us-west-2::foundation-model/*",
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:inference-profile/*",
                    f"arn:aws:bedrock:us-east-1:{Aws.ACCOUNT_ID}:inference-profile/*",
                ]
            )
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

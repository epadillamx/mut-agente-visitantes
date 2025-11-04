from aws_cdk import (
    Stack, 
    CfnOutput,
    Aws,
    Duration,
    aws_lambda as _lambda,
    aws_lambda_python_alpha as _alambda,
    aws_s3 as s3,
    aws_iam as iam,
)
from constructs import Construct

class VectorialSyncLambdaStack(Stack):
    """
    Stack que crea Lambda para sincronizar los 4 data sources del Knowledge Base
    - Inicia ingestion jobs para: eventos, restaurantes, preguntas, stores
    - Sincroniza automáticamente con Pinecone (manejado por Bedrock internamente)
    - Prepara el agente Bedrock con datos actualizados
    """

    def __init__(self, scope: Construct, construct_id: str, input_metadata, input_s3_bucket_arn, kb_id, agent_id, chat_lambda_fn=None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda Function: Vectorial Sync
        """
        self.lambda_fn = _alambda.PythonFunction(
            self,
            "vectorial-sync-lambda-fn",
            entry="./stack_lambda_sync_vectorial/lambda",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="lambda_handler",
            index="lambda_function.py",
            memory_size=2048,
            timeout=Duration.seconds(900),  # 15 minutos para sincronización completa
            description="Sincroniza los 4 data sources del Knowledge Base de Bedrock (eventos, restaurantes, preguntas, stores)",
            environment={
                "S3_BUCKET_NAME": f"raw-virtual-assistant-data-{Aws.ACCOUNT_ID}-{Aws.REGION}",
                "S3_VECTORIAL_PREFIX": input_metadata['s3_knowledge_base_prefixes'][0].rstrip('/'),
                "KNOWLEDGE_BASE_ID": kb_id,
                "AGENT_ID": agent_id,
                "CHAT_LAMBDA_FUNCTION_NAME": chat_lambda_fn.function_name if chat_lambda_fn else ""
            }
        )

        """
        @ S3 Permissions
        """
        s3_bucket = s3.Bucket.from_bucket_attributes(
            self, 
            "syncS3Bucket", 
            bucket_arn=input_s3_bucket_arn
        )
        s3_bucket.grant_read(self.lambda_fn)

        """
        @ Bedrock Permissions
        """
        # Permisos para acceder al Knowledge Base y preparar el agente
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock:StartIngestionJob",
                    "bedrock:GetIngestionJob",
                    "bedrock:ListIngestionJobs",
                    "bedrock:GetKnowledgeBase",
                    "bedrock:ListDataSources",  # Necesario para obtener Data Source ID
                    "bedrock:AssociateThirdPartyKnowledgeBase",  # Necesario para iniciar ingestion jobs
                    "bedrock:PrepareAgent",
                    "bedrock:GetAgent",
                    "bedrock:CreateAgentAlias",  # Necesario para crear nuevos alias
                    "bedrock:UpdateAgentAlias",  # Por si necesita actualizar
                    "bedrock:ListAgentAliases"   # Para listar aliases existentes
                ],
                resources=[
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:knowledge-base/{kb_id}",
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent/{agent_id}",
                    f"arn:aws:bedrock:{Aws.REGION}:{Aws.ACCOUNT_ID}:agent-alias/{agent_id}/*"
                ]
            )
        )

        """
        @ Lambda Update Permissions
        """
        # Permisos para actualizar la configuración del Lambda Chat
        if chat_lambda_fn:
            self.lambda_fn.add_to_role_policy(
                iam.PolicyStatement(
                    actions=[
                        "lambda:UpdateFunctionConfiguration",
                        "lambda:GetFunctionConfiguration"
                    ],
                    resources=[
                        chat_lambda_fn.function_arn
                    ]
                )
            )

        """
        @ CloudWatch Logs Permissions
        """
        self.lambda_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                resources=[f"arn:aws:logs:{Aws.REGION}:{Aws.ACCOUNT_ID}:*"]
            )
        )

        """
        @ Outputs
        """
        CfnOutput(
            self, 
            "output-sync-lambda-arn", 
            value=self.lambda_fn.function_arn,
            description="ARN del Lambda de sincronización vectorial"
        )

        CfnOutput(
            self, 
            "output-sync-lambda-name", 
            value=self.lambda_fn.function_name,
            description="Nombre del Lambda de sincronización vectorial"
        )

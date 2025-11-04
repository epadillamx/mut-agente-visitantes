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

class DataExtractionLambdaStack(Stack):
    """
    Stack que crea Lambda para extracción de datos desde API de WordPress (mut.cl)
    - Extrae eventos, tiendas y restaurantes
    - Prepara datos vectoriales
    - Guarda en S3 bucket raw-virtual-assistant-data
    """

    def __init__(self, scope: Construct, construct_id: str, input_s3_bucket_arn, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda Function: Data Extraction
        """
        self.lambda_fn = _alambda.PythonFunction(
            self,
            "data-extraction-lambda-fn",
            entry="./stack_lambda_extraction/lambda",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="lambda_handler",
            index="lambda_function.py",
            memory_size=2048,
            timeout=Duration.seconds(900),  # 15 minutos para procesar todas las fuentes
            description="Extrae eventos, tiendas y restaurantes desde mut.cl y prepara datos vectoriales",
            environment={
                "S3_BUCKET_NAME": f"raw-virtual-assistant-data-{Aws.ACCOUNT_ID}-{Aws.REGION}",
                "S3_RAW_PREFIX": "raw/",
                "S3_VECTORIAL_PREFIX": "vectorial/",
                "API_BASE_URL": "https://mut.cl/wp-json/wp/v2"
            }
        )

        """
        @ S3 Permissions
        """
        # Otorgar permisos de lectura/escritura al bucket S3
        s3_bucket = s3.Bucket.from_bucket_attributes(
            self, 
            "extractionS3Bucket", 
            bucket_arn=input_s3_bucket_arn
        )
        s3_bucket.grant_read_write(self.lambda_fn)

        """
        @ IAM Permissions adicionales si son necesarias
        """
        # Agregar permisos para poder hacer llamadas HTTPS externas
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
            "output-extraction-lambda-arn", 
            value=self.lambda_fn.function_arn,
            description="ARN del Lambda de extracción de datos"
        )

        CfnOutput(
            self, 
            "output-extraction-lambda-name", 
            value=self.lambda_fn.function_name,
            description="Nombre del Lambda de extracción de datos"
        )

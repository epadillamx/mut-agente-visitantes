from aws_cdk import (
    Stack, 
    CfnOutput,
    Aws,
    Duration,
    aws_lambda as _lambda,
    aws_lambda_python_alpha as _alambda,
    aws_s3 as s3,
)
from constructs import Construct

class GenAiVirtualAssistantEtlLambdaStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, input_metadata, input_s3_bucket_arn, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function: same runtime vs Lambda version
        """

        # SDK for Pandas layer. Do not Change account ID. See docs at: https://aws-sdk-pandas.readthedocs.io/
        sdk_lambda_layer_arn = f"arn:aws:lambda:{Aws.REGION}:336392948345:layer:AWSSDKPandas-Python312:15"

        # Create function using Layer with the same Python version
        self.lambda_fn = _alambda.PythonFunction(
            self,
            "virtual-assistant-lambda-etl-fn",
            entry="./stack_backend_lambda_light_etl/",
            runtime=_lambda.Runtime.PYTHON_3_12,
            memory_size=1024,
            description="Function to process the new incoming inventory",
            index="lambda_function.py",
            handler="lambda_handler",
            layers=[
                _alambda.PythonLayerVersion.from_layer_version_arn(
                    self,
                    'lambda-layer-sdkforpandas',
                    sdk_lambda_layer_arn
                    )
                ],
            timeout=Duration.seconds(600),
        )

        # Add OS variable with S3 KB output path, to Lambda function
        # - Note: determine if element 0 from 's3_knowledge_base_prefixes' should be hard-coded or not!
        self.lambda_fn.add_environment(key="KB_S3_ECOMM_PATH", value=input_metadata['s3_knowledge_base_prefixes'][0].rstrip('/'))

        """
        @ S3 Permissions
        """

        # Pull S3 bucket deployed, for the KB data
        s3_bucket = s3.Bucket.from_bucket_attributes(self, "virtualAssitantS3Bucket", bucket_arn=input_s3_bucket_arn)
        s3_bucket.grant_read_write(self.lambda_fn)

        """
        @ Outputs
        """
        
        # Return bucket ARN
        CfnOutput(self, "output-lambda-fn-arn", value=self.lambda_fn.function_arn)

from aws_cdk import (
    Stack,
    Aws,
    aws_s3 as s3,
    RemovalPolicy,
    CfnOutput,
)
from constructs import Construct

class GenAiVirtualAssistantS3Stack(Stack):

    def __init__(self, scope: Construct, construct_id: str, input_metadata, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        if input_metadata['virtual_assistant_data_bucket_arn']:
            self.bucket = s3.Bucket.from_bucket_attributes(self, 
                                                           "rawVirtualAssistantS3Bucket", 
                                                           bucket_arn=input_metadata['virtual_assistant_data_bucket_arn'])
        else:
            self.bucket = s3.Bucket(self, 
                                    "rawVirtualAssistantS3Bucket",
                                    bucket_name=f"raw-virtual-assistant-data-{Aws.ACCOUNT_ID}-{Aws.REGION}", 
                                    removal_policy=RemovalPolicy.RETAIN)
        
        # Return bucket ARN
        CfnOutput(self, "output-s3-bucket-arn", value=self.bucket.bucket_arn)
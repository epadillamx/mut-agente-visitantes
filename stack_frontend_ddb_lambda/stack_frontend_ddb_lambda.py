from aws_cdk import (
    Stack, 
    CfnOutput,
    Aws,
    Duration,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_lambda as _lambda,
    aws_lambda_python_alpha as _alambda,
)
from constructs import Construct

class GenAiVirtualAssistantDDBLambdaStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ DynamoDB Table
        """

        # Simple table. No Global settings. Delete TBL on Stack Destroy.  More at https://go.aws/3NSxVck
        self.table = dynamodb.TableV2(self, "ddb-tbl-virtual-assistant",
                                      partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
                                      sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
                                      billing= dynamodb.Billing.on_demand(),
                                      removal_policy=RemovalPolicy.DESTROY
                     )
        
        """
        @ Lambda function
        """

        # Powertools for AWS layer. Do not Change account ID. See docs at: https://powertools.aws.dev/
        sdk_lambda_layer_arn = f"arn:aws:lambda:{Aws.REGION}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python312-x86_64:2"

        # Create function using Layer with the same Python version
        self.lambda_fn = _alambda.PythonFunction(
            self,
            "virtual-assistant-lambda-fn",
            entry="./stack_frontend_ddb_lambda/",
            runtime=_lambda.Runtime.PYTHON_3_12,
            description="Function to store product orders in DynamoDB",
            index="lambda_function.py",
            handler="lambda_handler",
            layers=[
                _alambda.PythonLayerVersion.from_layer_version_arn(
                    self,
                    'lambda-layer-powertools',
                    sdk_lambda_layer_arn
                    )
                ],
            timeout=Duration.seconds(30),
        )

        # Add OS variable with DDB table name, to Lambda function
        self.lambda_fn.add_environment(key="DDB_TABLE_NAME", value=self.table.table_name)

        """
        @ DynamoDB Permissions
          - Note: table.grant_write_data grants the following actions:
                dynamodb:BatchWriteItem
                dynamodb:DeleteItem
                dynamodb:DescribeTable
                dynamodb:PutItem
                dynamodb:UpdateItem
        """
        # Lambda function, to upsert data in DynamoDB
        self.table.grant_write_data(self.lambda_fn)

        """
        @ Outputs
        """
        
        # Return bucket ARN
        CfnOutput(self, "output-ddb-table-arn", value=self.table.table_arn)
        CfnOutput(self, "output-lambda-fn-arn", value=self.lambda_fn.function_arn)

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
)
from constructs import Construct
import os

class ChatLambdaNodeStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Lambda function
        """

        # Create Node.js 22 Lambda function
        self.lambda_fn = _lambda.Function(
            self,
            "chat-lambda-fn",
            runtime=_lambda.Runtime.NODEJS_22_X,
            handler="index.handler",
            code=_lambda.Code.from_asset(os.path.join(os.path.dirname(__file__), "lambda")),
            description="Lambda function that invokes Bedrock Agent for chat interactions",
            timeout=Duration.seconds(60),  # Increased timeout for Bedrock calls
            memory_size=512,  # Increased memory for better performance
        )

        # Add Bedrock permissions to Lambda
        self._configure_lambda_permissions()

        """
        @ API Gateway
        """

        # Create REST API Gateway
        api = apigateway.RestApi(
            self,
            "chat-api",
            rest_api_name="Chat API",
            description="API Gateway for Chat Lambda function",
            deploy_options=apigateway.StageOptions(
                stage_name="prod"
            )
        )

        # Create Lambda integration
        lambda_integration = apigateway.LambdaIntegration(
            self.lambda_fn,
            request_templates={
                "application/json": '{ "statusCode": "200" }'
            }
        )

        # Add POST method to root path
        api.root.add_method("POST", lambda_integration)

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
            description="API Gateway URL"
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

import os
from aws_cdk import Environment, App, Tags
from stack_backend_s3.stack_backend_s3 import GenAiVirtualAssistantS3Stack
from stack_backend_lambda_light_etl.stack_backend_lambda_light_etl import GenAiVirtualAssistantEtlLambdaStack
from stack_backend_bedrock.stack_backend_bedrock import GenAiVirtualAssistantBedrockStack
from stack_frontend_ddb_lambda.stack_frontend_ddb_lambda import GenAiVirtualAssistantDDBLambdaStack
from stack_chat_lambda_node.stack_chat_lambda import ChatLambdaNodeStack
#from stack_frontend_vpc_ecs_streamlit.stack_frontend_vpc_ecs_streamlit import GenAiVirtualAssistantVpcEcsStreamlitStack

# AWS Settings 
app = App()
env_aws_settings = Environment(account=os.environ['CDK_DEFAULT_ACCOUNT'], region=os.environ['CDK_DEFAULT_REGION'])

# Choose environment to deploy; see cdk.json file. CLI: cdk deploy --context <<env-production>> 
env_name = "env-virtual-assistant-dev01"
env_context_params = app.node.try_get_context(env_name)

# S3 Stack
s3_stack = GenAiVirtualAssistantS3Stack(app, 
                                        "GenAiVirtualAssistantS3Stack", 
                                        env=env_aws_settings, 
                                        input_metadata=env_context_params)

# Lambda for Light ETL
etl_stack = GenAiVirtualAssistantEtlLambdaStack(app,
                                                "GenAiVirtualAssistantEtlLambdaStack",
                                                env=env_aws_settings,
                                                input_metadata=env_context_params,
                                                input_s3_bucket_arn=s3_stack.bucket.bucket_arn)

# DynamoDB & Lambda Stack.
ddb_stack = GenAiVirtualAssistantDDBLambdaStack(app,
                                                "GenAiVirtualAssistantDDBLambdaStack",
                                                env=env_aws_settings)


# Bedrock Stack
bedrock_stack = GenAiVirtualAssistantBedrockStack(app,
                                                  "GenAiVirtualAssistantBedrockStack",
                                                  env=env_aws_settings,
                                                  input_metadata=env_context_params,
                                                  input_s3_bucket_arn=s3_stack.bucket.bucket_arn)


# Chat Lambda with API Gateway Stack
chat_stack = ChatLambdaNodeStack(app,
                                              "ChatLambdaNodeStack",
                                              env=env_aws_settings)

# Hard Dependencies
bedrock_stack.add_dependency(s3_stack)
etl_stack.add_dependency(s3_stack)
#st_stack.add_dependency(ddb_stack)

# Add Tags
for stack in [s3_stack, etl_stack, bedrock_stack, ddb_stack, chat_stack]:
    Tags.of(stack).add("environment", env_name)

app.synth()

import os
from aws_cdk import Environment, App, Tags
from stack_backend_s3.stack_backend_s3 import GenAiVirtualAssistantS3Stack
from stack_backend_lambda_light_etl.stack_backend_lambda_light_etl import GenAiVirtualAssistantEtlLambdaStack
from stack_backend_bedrock.stack_backend_bedrock import GenAiVirtualAssistantBedrockStack
from stack_conversation_dynamodb.stack_conversation_dynamodb import StackConversationDynamoDB
from stack_chat_lambda_node.stack_chat_lambda import ChatLambdaNodeStack
#from stack_frontend_vpc_ecs_streamlit.stack_frontend_vpc_ecs_streamlit import GenAiVirtualAssistantVpcEcsStreamlitStack

# AWS Settings 
app = App()
env_aws_settings = Environment(account=os.environ['CDK_DEFAULT_ACCOUNT'], region=os.environ['CDK_DEFAULT_REGION'])

# Choose environment to deploy; see cdk.json file. CLI: cdk deploy --context <<env-production>> 
env_name = "env-virtual-assistant-prod"
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




# Bedrock Stack
bedrock_stack = GenAiVirtualAssistantBedrockStack(app,
                                                  "GenAiVirtualAssistantBedrockStack",
                                                  env=env_aws_settings,
                                                  input_metadata=env_context_params,
                                                  input_s3_bucket_arn=s3_stack.bucket.bucket_arn)

# DynamoDB Stack for Conversation Storage
conversation_stack = StackConversationDynamoDB(app,
                                               "MutConversationStack",
                                               env=env_aws_settings)

# Chat Lambda with API Gateway Stack
chat_stack = ChatLambdaNodeStack(app,
                                 "ChatLambdaNodeStack",
                                 env=env_aws_settings,
                                 conversations_table=conversation_stack.conversations_table,
                                 sessions_table=conversation_stack.sessions_table,
                                 agent_id=bedrock_stack.agent_id,
                                 agent_alias_id=bedrock_stack.agent_alias_id)

# Hard Dependencies
bedrock_stack.add_dependency(s3_stack)
etl_stack.add_dependency(s3_stack)
chat_stack.add_dependency(conversation_stack)
chat_stack.add_dependency(bedrock_stack)
#st_stack.add_dependency(ddb_stack)

# Add Tags
for stack in [s3_stack, etl_stack, bedrock_stack, conversation_stack, chat_stack]:
    Tags.of(stack).add("environment", env_name)

app.synth()

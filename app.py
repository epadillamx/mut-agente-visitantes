import os
from aws_cdk import Environment, App, Tags
from stack_backend_s3.stack_backend_s3 import GenAiVirtualAssistantS3Stack
from stack_backend_lambda_light_etl.stack_backend_lambda_light_etl import GenAiVirtualAssistantEtlLambdaStack
from stack_backend_bedrock.stack_backend_bedrock import GenAiVirtualAssistantBedrockStack
from stack_conversation_dynamodb.stack_conversation_dynamodb import StackConversationDynamoDB
from stack_chat_lambda_node.stack_chat_lambda import ChatLambdaNodeStack
from stack_lambda_extraction.stack_lambda_extraction import DataExtractionLambdaStack
from stack_lambda_sync_vectorial.stack_lambda_sync_vectorial import VectorialSyncLambdaStack
from stack_stepfunctions_orchestrator.stack_stepfunctions_orchestrator import DataPipelineOrchestratorStack
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

# Lambda for Data Extraction
extraction_stack = DataExtractionLambdaStack(app,
                                             "DataExtractionLambdaStack",
                                             env=env_aws_settings,
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
                                 agent_id="G7LSHMCB2H",
                                 input_metadata=env_context_params)

# Lambda for Vectorial Synchronization
sync_stack = VectorialSyncLambdaStack(app,
                                      "VectorialSyncLambdaStack",
                                      env=env_aws_settings,
                                      input_metadata=env_context_params,
                                      input_s3_bucket_arn=s3_stack.bucket.bucket_arn,
                                      kb_id="LQAKZNJMP9",
                                      agent_id="G7LSHMCB2H",
                                      chat_lambda_fn=chat_stack.lambda_fn)

# Step Functions Orchestrator with EventBridge
orchestrator_stack = DataPipelineOrchestratorStack(app,
                                                   "DataPipelineOrchestratorStack",
                                                   env=env_aws_settings,
                                                   extraction_lambda=extraction_stack.lambda_fn,
                                                   etl_lambda=etl_stack.lambda_fn,
                                                   sync_lambda=sync_stack.lambda_fn)

# Hard Dependencies
bedrock_stack.add_dependency(s3_stack)
etl_stack.add_dependency(s3_stack)
extraction_stack.add_dependency(s3_stack)
sync_stack.add_dependency(s3_stack)
sync_stack.add_dependency(chat_stack)  # Agregado para que sync_stack tenga acceso al lambda de chat
orchestrator_stack.add_dependency(extraction_stack)
orchestrator_stack.add_dependency(etl_stack)
orchestrator_stack.add_dependency(sync_stack)
chat_stack.add_dependency(conversation_stack)
#st_stack.add_dependency(ddb_stack)

# Add Tags
for stack in [s3_stack, etl_stack, bedrock_stack, conversation_stack, chat_stack, extraction_stack, sync_stack, orchestrator_stack]:
    Tags.of(stack).add("environment", env_name)

app.synth()

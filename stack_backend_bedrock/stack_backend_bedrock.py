import os
from cdklabs.generative_ai_cdk_constructs import bedrock, opensearchserverless
from aws_cdk import (
    Stack, 
    aws_lambda as _lambda,
    aws_s3 as s3,
    aws_iam as iam
)
from constructs import Construct

class GenAiVirtualAssistantBedrockStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, input_metadata, input_s3_bucket_arn, input_lambda_fn_arn, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        """
        @ Knowledge Base
        """

        # Pull S3 bucket deployed, for the KB data
        s3_bucket = s3.Bucket.from_bucket_attributes(self, "virtualAssitantS3Bucket", bucket_arn=input_s3_bucket_arn)

        # We create the AOSS collection manually, to control Standby Replicas (default=None), description, etc.
        # See: https://github.com/awslabs/generative-ai-cdk-constructs/blob/main/apidocs/namespaces/opensearchserverless/README.md
        vector_store = opensearchserverless.VectorCollection(self, 
                                                             'aoss-real-estate-properties-01',
                                                             description="Collection for Real Estate Properties Knowledge Base",
                                                             standby_replicas=opensearchserverless.VectorCollectionStandbyReplicas.DISABLED)

        # Create Knowledge Base
        # - See docs: https://awslabs.github.io/generative-ai-cdk-constructs/src/cdk-lib/bedrock/
        kb = bedrock.VectorKnowledgeBase(self, 'KnowledgeBase01', 
            embeddings_model=bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
            instruction='Use this knowledge base to answer questions about the products we sell, in our department store. Return maximum 5 products or items.',
            vector_store=vector_store
            )
        
        # Add Data Source. See docs at https://go.aws/3wDsCbC
        # - Optional: ChunkingStrategy=X, max_tokens=500, overlap_percentage=20   
        bedrock.S3DataSource(self, 'virtualAssistantDataSource',
            bucket=s3_bucket,
            knowledge_base=kb,
            inclusion_prefixes=input_metadata['s3_knowledge_base_prefixes'],
            data_source_name='virtual-assistant-s3-sources',
            chunking_strategy=bedrock.ChunkingStrategy.NONE
        )

        """
        @ Amazon Guardrails creation
        """

        # Add Agent Guardrail
        guardrail = bedrock.Guardrail(self, 'dangerousProductsGuardrail',
            name='guardrail-dangerous-products',
            description= "Users can ask about our products. The guardrail will block users from inquiring about or requesting information related to dangerous products")

        # Add Sensitive information filters, just in case we find PII data in the products sold by our partners.
        guardrail.add_pii_filter(
            type = bedrock.pii_type.General.ADDRESS,
            action = bedrock.GuardrailAction.ANONYMIZE,
        )

        # Add contextual grounding
        guardrail.add_contextual_grounding_filter(
            type= bedrock.ContextualGroundingFilterType.GROUNDING,
            threshold= 0.70,
        )

        # Add Denied topics . You can use default Topic or create your custom Topic with createTopic function. The default Topics can also be overwritten.
        guardrail.add_contextual_grounding_filter(
            type= bedrock.ContextualGroundingFilterType.RELEVANCE,
            threshold= 0.70,
        )

        # Add Specific Denied topics
        guardrail.add_denied_topic_filter(
            bedrock.Topic.custom(
                name= "Legal_Advice",
                definition=
                    "Offering guidance or suggestions on legal matters, legal actions, interpretation of laws, or legal rights and responsibilities.",
                examples= [
                    "Can I sue someone for this product?",
                    "What are my legal rights if what I bought from you made me sick?",
                    "What are the legal regulations for the products you sell?",
                    "What should I do to file a legal complaint?",
                    "Can you explain the regulation for this product to me?",
                ]
            )
        )

        # Add Specific Denied topics
        # Tip: There's a quota for 'Example phrases per Topic'
        guardrail.add_denied_topic_filter(
            bedrock.Topic.custom(
                name= "Dangerous_Products",
                definition="requesting information related to dangerous products, such as guns, drugs, or other potentially harmful items.",
                examples = [ "Do you sell guns?", 
                            "Do you have any information on drugs?", 
                            "Where can I get prescription medication without a doctor's note?", 
                            "Do you have any illegal substances for sale?", 
                            "I'm looking for ways to make homemade weapons, can you help?"
                            ]
            )
        )

        # Optional - Add Word filters. You can upload words from a file with addWordFilterFromFile function.
        guardrail.add_word_filter("drugs")
        guardrail.add_word_filter("gun")
        guardrail.add_word_filter("bomb")
        guardrail.add_managed_word_list_filter(bedrock.ManagedWordFilterType.PROFANITY)

        """
        @ Bedrock Agents creation
        """

        # IMPORTANT: Not a GOOD PRACTICE to hardcode the agent_instruction. Use a DB, Bedrock Prompt Management, etc., and pull it dynamically.
        agent_instruction = """
        You are a friendly virtual assistant for our department store. You can answer questions about the products we sell, in our department store, but you can also place orders.
        For questions about products, query your knowledge base to find the answer.
        
        For orders, use the upsertOrder function to place an order, using the following information:
        
        1. Call the upsertOrder function by passing the following parameters, paying attention to the data type in parenthesis: "product_id" (string), "product_name" (string), "price" (float), "quantity (integer)" and "order_notes" (string).
        2. For the parameter "order_notes", add in here all relevant information you consider to the order, like even if you had an issue when placing the order, or if the inventory needs re-stocking, or if the user was angry, or the color of the product, etc. 
        3. If any of these parameters are not provided, look for the value in the knowledge base. For example, if the price is null, look for the price of the product in the knowledge base.
        4. The upsertOrder function will return a confirmation message with the product ID (product_id) submitted.
        
        Try to be helpful, asking to the customers if they want more information about the products provided, or if they want to see the product reviews.
        Whenever possible, do upselling by offering products related to the user query.
        If the user query is not related to the products, you must answer that you don't have the information.
        Do not use any XML tags in the response.
        """

        # Create Agent With KB and Guardrail. Confirm models; e.g. ANTHROPIC_CLAUDE_HAIKU_V1_0, ANTHROPIC_CLAUDE_3_5_HAIKU_V1_0, etc. 
        agent = bedrock.Agent(self, 'Agent01',
            foundation_model=bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_SONNET_V1_0,
            instruction=agent_instruction,
            user_input_enabled=True,
            code_interpreter_enabled=False,            
            should_prepare_agent=True,
            knowledge_bases=[kb],
            guardrail=guardrail
        )

        # Get Lambda Function
        lambda_fn = _lambda.Function.from_function_attributes(self, 
                                                              "virtual-assistant-lambda", 
                                                              function_arn=input_lambda_fn_arn, 
                                                              same_environment=True)

        # Get Agent OpenAPI schema
        script_dir = os.path.dirname(__file__)
        rel_path = "openapi/schema.json"
        schema_file_path = os.path.join(script_dir, rel_path)

        # Define Action Groups
        action_group = bedrock.AgentActionGroup(
            name="store-product-order",
            description="Use this function to store a product order.",
            executor= bedrock.ActionGroupExecutor.fromlambda_function(lambda_fn),
            enabled=True,
            api_schema=bedrock.ApiSchema.from_local_asset(schema_file_path)
            )

        # Add Action Groups
        agent.add_action_group(action_group)

        # Add Agent alias; e.g. if CHANGES, then add >>> alias_name='virtual-assistant-alias-anthropic'
        agent_alias_v1 = bedrock.AgentAlias(self, 'AgentAlias01',
            agent=agent, 
            alias_name='virtual-assistant-alias-anthropic',        
            description='Agent alias for the virtual assistant, with KB included'
        )

        """
        @ Lambda permissions to be executed by our Bedrock Agent
        """

        # Grant Lambda function to be invoked by our Bedrock agent
        # - Note: using L1/Cfn, not lambda_checks_fn.add_permission. To-investigate https://github.com/aws/aws-cdk/issues/7588 
        _lambda.CfnPermission(self, "virtual-assistant-allow-bedrock",
                              action="lambda:InvokeFunction",
                              function_name=lambda_fn.function_name,
                              principal="bedrock.amazonaws.com",
                              source_arn=agent.agent_arn)

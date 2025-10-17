import json
from loguru import logger

def retrieve_and_generate_stream(
    bedrock_client, 
    bedrock_kb_client, 
    model_id, 
    user_query, 
    knowledge_base_id, 
    top_p, 
    temperature, 
    max_results=3, 
    metadata_filter=None, 
    session_id=None
):
    try:
        # Get Model ARN from Model ID
        response = bedrock_client.get_foundation_model(modelIdentifier=model_id)
        model_arn = response['modelDetails']['modelArn']
        
        # Prepare the request
        request_payload = {
            "input": {
                "text": user_query
            },
            "retrieveAndGenerateConfiguration": {
                "knowledgeBaseConfiguration": {
                    "generationConfiguration": {
                        "inferenceConfig": {
                            "textInferenceConfig": {
                                "maxTokens": 8192,
                                "temperature": temperature,
                                "topP": top_p
                            }
                        },
                    },
                    "knowledgeBaseId": knowledge_base_id,
                    "modelArn": model_arn,
                    "retrievalConfiguration": {
                        "vectorSearchConfiguration": {
                            "numberOfResults": max_results,
                            "overrideSearchType": "HYBRID", # Or SEMANTIC
                        }
                    }
                },
                "type": "KNOWLEDGE_BASE"
            }
        }

        # Add the "filter" key only if metadata_filter has a value
        if metadata_filter:
            request_payload["retrieveAndGenerateConfiguration"]["knowledgeBaseConfiguration"]["retrievalConfiguration"]["vectorSearchConfiguration"]["filter"] = metadata_filter
            
        # Add sessionId at the root level if available
        if session_id:
            request_payload["sessionId"] = session_id

        # API call
        logger.info("Calling Bedrock Retrieve and Generate Stream...")
        logger.info(f"Request payload: {json.dumps(request_payload, indent=4)}")
        response = bedrock_kb_client.retrieve_and_generate_stream(**request_payload)

        # Capture sessionId
        session_id = response.get("sessionId")

        # Define the streaming generator
        def stream_response():
            full_response = ""  
            stream = response.get("stream")
            if stream:
                for event in stream:
                    if "output" in event:
                        text_piece = event["output"]["text"]
                        full_response += text_piece
                        yield text_piece
            return full_response, session_id  # Return final response and sessionId

        # Return the generator and the response object
        generator = stream_response()
        print("Products found and presented to customer!")

        return generator, session_id

    except Exception as e:
        print(f"Error in retrieve_and_generate_stream: {e}")
        return None, None


def retrieve_from_kb(bedrock_kb_client, user_query, knowledge_base_id, max_results=3, metadata_filter=None):
    """_summary_

    Args:
        bedrock_kb_client (_type_): _description_
        user_query (_type_): _description_
        knowledge_base_id (_type_): _description_
        max_results (int, optional): _description_. Defaults to 3.
        metadata_filter (_type_, optional): _description_. Defaults to None.
        aws_region (str, optional): _description_. Defaults to "us-west-2".

    Returns:
        _type_: _description_
    """

    retrieve_config = {
        'vectorSearchConfiguration': {
            'numberOfResults': max_results,  
            'overrideSearchType': "HYBRID", #HYBRID/SEMANTIC
        }
    }

    print("Metadata filter: {}, and KB is: {}".format(metadata_filter, knowledge_base_id))
    
    if metadata_filter:
        retrieve_config['vectorSearchConfiguration']['filter'] = metadata_filter

    try:
            
        logger.info(f"Request payload to retrieve API: {json.dumps(retrieve_config, indent=4)}")
        response = bedrock_kb_client.retrieve(
            knowledgeBaseId=knowledge_base_id,
            retrievalQuery={
                'text': user_query
            },
            retrievalConfiguration=retrieve_config
        )

        # Temporary print for demo-purposes
        print("\nFiles queried:")
        print(response['retrievalResults'][0]['location'])
        
        print("\nMetadata queried:")
        print(response['retrievalResults'][0]['metadata'])

        print(f"\nRetrieval Score: {response['retrievalResults'][0]['score']}")
        print("#"*100)
        
        # Extract and return the retrieved results
        return response['retrievalResults']
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None


def retrieve_products(user_query, knowledge_base_id, bedrock_kb_client, metadata_filter):
    """_summary_

    Args:
        user_query (_type_): _description_
        knowledge_base_id (_type_): _description_

    Returns:
        _type_: _description_
    """
    
    # Try to retrieve products
    products = retrieve_from_kb(bedrock_kb_client=bedrock_kb_client, user_query=user_query, knowledge_base_id=knowledge_base_id, metadata_filter=metadata_filter)
    
    if products:
        products_references = []
        
        for _file in products:
            src = _file['metadata']['x-amz-bedrock-kb-source-uri']
            products_references.append(src)
        
        all_products = []
        for product in products:
            all_products.append(product['content']['text'])
        
        return all_products, products_references

    else:
        return None, None


# Init a messages list to store the conversation history
messages = []


def stream_conversation(bedrock_client,
                        model_id,
                        system_prompt,
                        user_query,
                        products,
                        temperature=0.0,
                        max_tokens=4096,
                        top_k=200,
                        pricing_list='bedrock_pricing.json'):
    """_summary_

    Args:
        bedrock_client (_type_): _description_
        model_id (_type_): _description_
        user_query (_type_): _description_
        products (_type_): _description_
        temperature (float, optional): _description_. Defaults to 0.0.
        max_tokens (int, optional): _description_. Defaults to 4096.
        top_k (int, optional): _description_. Defaults to 200.
        pricing_list (str, optional): _description_. Defaults to 'bedrock_pricing.json'.

    Yields:
        _delta_: Delta text to be streamed to the front-end
    """

    # Base inference parameters to use.
    inference_config = {"temperature": temperature, "maxTokens": max_tokens}
    
    # Additional inference parameters to use.
    additional_model_fields = {"top_k": top_k}

    base_prompt_template = """
    Below, you will find the products we have in stock, that may be relevant to the user query.
    The products are provided in CSV. 
    
    <products>
    {kb_products}
    </products>

    Based on that products above from our Department Store product inventory, reply on the following questions: 
    <questions>{questions}</questions> 
    """

    # Format message, as per Model requirements. See: https://docs.anthropic.com/en/api/messages 
    message = {
        "role": "user",
        "content": [{"text": base_prompt_template.format(kb_products=products,
                                                         questions=user_query)}]
        }
    
    # Append the formatted user message to the list of messages.
    messages.append(message)
    
    # Format system prompt, as per Bedrock requirements
    system_prompts = [{"text": system_prompt}]

    try:

        # Send the message.
        response = bedrock_client.converse_stream(
            modelId=model_id,
            messages=messages,
            system=system_prompts,
            inferenceConfig=inference_config,
            additionalModelRequestFields=additional_model_fields
        )

        stream = response.get('stream')
        
        # Looping through the response from the converse_stream api call
        if stream:
            
            # create a variable that will be used to store the streaming content so that we can later append it to the messages
            streaming_text = ""
            
            for event in stream:

                if 'messageStart' in event:
                    print(f"\nRole: {event['messageStart']['role']}")
                    
                if 'contentBlockDelta' in event:
                    # using a generator object to stream the text to the streamlit front end.
                    yield event['contentBlockDelta']['delta']['text']
                    
                    # Add the streaming chunks to our place holder
                    streaming_text += event['contentBlockDelta']['delta']['text']

                if 'messageStop' in event:
                    print(f"\nStop reason: {event['messageStop']['stopReason']}")
                    
                    # Construct the message for the next conversation turn
                    message = {
                        "role": "assistant",
                        "content": [{"text": streaming_text}]
                    }
                    
                    messages.append(message)

                if 'metadata' in event:
                    # Print somme information regarging input and output tokesns as well as latency in ms
                    metadata = event['metadata']
                    print('#'*100)

                    if 'usage' in metadata:
                        
                        print("\nToken usage")
                        print(f"Input tokens: {metadata['usage']['inputTokens']}")
                        print(f"Output tokens: {metadata['usage']['outputTokens']}")

                        # Fetch pricing info
                        with open(pricing_list,'r', encoding='utf-8') as f:
                            pricing_file = json.load(f)

                        # Estimate cost of call
                        print(f"Model: {model_id}, at temperature {temperature} and Top-K of {top_k}")
                        print("""
                            \n🚨IMPORTANT🚨: Confirm pricing is up-to-date at https://aws.amazon.com/bedrock/pricing/. Update bedrock_pricing.json accordingly.
                            """)
                        print(f"Price per 1,000 input tokens: {pricing_file[model_id]['input']*1000:.5f}")
                        print(f"Price per 1,000 output tokens: {pricing_file[model_id]['output']*1000:.5f}")
                        cost_input_tokens = float(metadata['usage']['inputTokens']) * pricing_file[model_id]['input']
                        cost_output_tokens = float(metadata['usage']['outputTokens']) * pricing_file[model_id]['output']
                        total_cost = round(cost_input_tokens + cost_output_tokens,16)

                        # Print estimated cost
                        print(f"\nTotal tokens in session: {metadata['usage']['totalTokens']}. Estimated cost: ${total_cost:.10f}")
                        
                    if 'metrics' in event['metadata']:
                        print(
                            f"\nLatency: {metadata['metrics']['latencyMs']} milliseconds")
                    print('#'*100)

    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

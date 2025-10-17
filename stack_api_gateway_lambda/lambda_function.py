"""
Lambda function to interact with Amazon Bedrock Agent via API Gateway
"""
import json
import os
import boto3
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()

# Initialize Bedrock Agent Runtime client
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

# Get environment variables
AGENT_ID = os.environ.get('AGENT_ID')
AGENT_ALIAS_ID = os.environ.get('AGENT_ALIAS_ID')


def invoke_bedrock_agent(user_input: str, session_id: str = None) -> dict:
    """
    Invokes the Bedrock Agent with the user input

    Args:
        user_input: The user's question or request
        session_id: Optional session ID for conversation continuity

    Returns:
        Dictionary with agent response and session ID
    """
    try:
        # Prepare the request parameters
        request_params = {
            'agentId': AGENT_ID,
            'agentAliasId': AGENT_ALIAS_ID,
            'inputText': user_input
        }

        # Add session ID if provided
        if session_id:
            request_params['sessionId'] = session_id

        # Invoke the agent
        response = bedrock_agent_runtime.invoke_agent(**request_params)

        # Process the streaming response
        agent_response = ""
        session_id_response = None

        event_stream = response['completion']
        for event in event_stream:
            if 'chunk' in event:
                chunk = event['chunk']
                if 'bytes' in chunk:
                    agent_response += chunk['bytes'].decode('utf-8')

            # Get session ID from the response
            if 'sessionId' in response:
                session_id_response = response['sessionId']

        return {
            'response': agent_response,
            'sessionId': session_id_response or session_id
        }

    except ClientError as e:
        logger.error(f"Error invoking Bedrock Agent: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise


@logger.inject_lambda_context
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    """
    Lambda handler for API Gateway requests

    Expected request body:
    {
        "message": "User question here",
        "sessionId": "optional-session-id"
    }
    """
    try:
        # Log the incoming event
        logger.info(f"Received event: {json.dumps(event)}")

        # Validate environment variables
        if not AGENT_ID or not AGENT_ALIAS_ID:
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'error': 'Agent configuration missing. AGENT_ID or AGENT_ALIAS_ID not set.'
                })
            }

        # Parse request body
        if 'body' in event:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        else:
            body = event

        # Extract message and session ID
        user_message = body.get('message', '')
        session_id = body.get('sessionId', None)

        # Validate message
        if not user_message:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                'body': json.dumps({
                    'error': 'Message is required in the request body'
                })
            }

        # Invoke the Bedrock Agent
        result = invoke_bedrock_agent(user_message, session_id)

        # Return successful response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'message': result['response'],
                'sessionId': result['sessionId']
            })
        }

    except ClientError as e:
        logger.error(f"AWS Client Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'error': 'Error communicating with Bedrock Agent',
                'details': str(e)
            })
        }
    except Exception as e:
        logger.error(f"Unexpected Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }

const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require("@aws-sdk/client-bedrock-agent-runtime");

/**
 * Lambda function that invokes Bedrock Agent for chat interactions
 * @param {Object} event - API Gateway event object
 * @returns {Object} Response object with statusCode and body
 */
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    // Configuration
    const AGENT_ID = process.env.AGENT_ID || 'FH6HJUBIZQ';
    const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID || 'LP1AND7OTN';
    const REGION = process.env.AWS_REGION || 'us-east-1';

    // Parse the request body
    let requestBody = {};
    if (event.body) {
        try {
            requestBody = JSON.parse(event.body);
        } catch (error) {
            console.error('Error parsing body:', error);
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Invalid JSON in request body',
                    message: error.message
                })
            };
        }
    }

    // Extract parameters
    const sessionId = requestBody.sessionId || requestBody.idSession || `session-${Date.now()}`;
    const question = requestBody.question || requestBody.pregunta || requestBody.message;

    // Validate required parameters
    if (!question) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Missing required parameter',
                message: 'Parameter "question" is required',
                example: {
                    sessionId: 'unique-session-id',
                    question: '¿Qué eventos hay esta semana?'
                }
            })
        };
    }

    console.log(`Invoking Bedrock Agent - SessionId: ${sessionId}, Question: ${question}`);

    try {
        // Create Bedrock Agent Runtime client
        const client = new BedrockAgentRuntimeClient({ region: REGION });

        // Prepare the command
        const command = new InvokeAgentCommand({
            agentId: AGENT_ID,
            agentAliasId: AGENT_ALIAS_ID,
            sessionId: sessionId,
            inputText: question
        });

        // Invoke the agent
        const response = await client.send(command);

        // Process the streaming response
        let agentResponse = '';
        let citations = [];
        let trace = [];

        if (response.completion) {
            for await (const event of response.completion) {
                if (event.chunk) {
                    // Decode the chunk
                    const chunk = event.chunk;
                    if (chunk.bytes) {
                        const decodedChunk = new TextDecoder().decode(chunk.bytes);
                        agentResponse += decodedChunk;
                    }
                }

                // Extract citations if available
                if (event.attribution) {
                    const attribution = event.attribution;
                    if (attribution.citations) {
                        citations.push(...attribution.citations);
                    }
                }

                // Extract trace information for debugging
                if (event.trace) {
                    trace.push(event.trace);
                }
            }
        }

        console.log('Agent Response:', agentResponse);
        console.log('Citations:', JSON.stringify(citations, null, 2));

        // Prepare successful response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
                sessionId: sessionId,
                question: question,
                answer: agentResponse,
                citations: citations,
                timestamp: new Date().toISOString(),
                metadata: {
                    agentId: AGENT_ID,
                    agentAliasId: AGENT_ALIAS_ID,
                    region: REGION
                }
            })
        };

    } catch (error) {
        console.error('Error invoking Bedrock Agent:', error);

        // Handle specific error types
        let errorMessage = 'Error invoking Bedrock Agent';
        let statusCode = 500;

        if (error.name === 'AccessDeniedException') {
            errorMessage = 'Access denied to Bedrock Agent. Check IAM permissions.';
            statusCode = 403;
        } else if (error.name === 'ResourceNotFoundException') {
            errorMessage = 'Agent or Alias not found. Check AGENT_ID and AGENT_ALIAS_ID.';
            statusCode = 404;
        } else if (error.name === 'ThrottlingException') {
            errorMessage = 'Request throttled. Please try again later.';
            statusCode = 429;
        }

        return {
            statusCode: statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: errorMessage,
                details: error.message,
                errorType: error.name,
                timestamp: new Date().toISOString()
            })
        };
    }
};

const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require("@aws-sdk/client-bedrock-agent-runtime");
const { getParameter } = require('./ssmHelper');

/**
 * Invoca al agente de Bedrock con la pregunta del usuario
 * @param {string} userId - ID del usuario (número de teléfono)
 * @param {string} question - Pregunta del usuario
 * @param {string} messageId - ID del mensaje de WhatsApp
 * @returns {Promise<string>} - Respuesta del agente o '#REPLICA#' si es mensaje duplicado
 */
async function getAgente(userId, question, messageId) {
    try {
        // Get Agent IDs from Parameter Store
        const PARAM_AGENT_ID = process.env.PARAM_AGENT_ID || '/whatsapp/bedrock-agent/agent-id';
        const PARAM_AGENT_ALIAS_ID = process.env.PARAM_AGENT_ALIAS_ID || '/whatsapp/bedrock-agent/agent-alias-id';
        
        const AGENT_ID = await getParameter(PARAM_AGENT_ID, false);  // No requiere decryption
        const AGENT_ALIAS_ID = await getParameter(PARAM_AGENT_ALIAS_ID, false);
        const REGION = process.env.AWS_REGION || 'us-east-1';

        console.log(`📞 Invocando Bedrock Agent para usuario: ${userId}`);
        console.log(`🤖 Agent ID: ${AGENT_ID}, Alias: ${AGENT_ALIAS_ID}`);
        console.log(`💬 Pregunta: ${question}`);

        // Validar que la pregunta no esté vacía
        if (!question || question.trim() === '') {
            console.log('⚠️ Pregunta vacía, ignorando...');
            return '#REPLICA#';
        }

        // Create Bedrock Agent Runtime client
        const client = new BedrockAgentRuntimeClient({ region: REGION });

        // Usar el userId como sessionId para mantener contexto de conversación
        const sessionId = `whatsapp-${userId}`;

        // Prepare the command
        const command = new InvokeAgentCommand({
            agentId: AGENT_ID,
            agentAliasId: AGENT_ALIAS_ID,
            sessionId: sessionId,
            inputText: question
        });

        console.log(`🔄 Enviando solicitud a Bedrock Agent...`);
        const startTime = Date.now();

        // Invoke the agent
        const response = await client.send(command);

        // Process the streaming response
        let agentResponse = '';
        let citations = [];

        if (response.completion) {
            for await (const event of response.completion) {
                if (event.chunk) {
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
            }
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`✅ Respuesta recibida en ${duration}ms`);
        console.log(`📝 Respuesta del agente: ${agentResponse.substring(0, 100)}...`);
        
        if (citations.length > 0) {
            console.log(`📚 Citations encontradas: ${citations.length}`);
        }

        // Si la respuesta está vacía, devolver mensaje por defecto
        if (!agentResponse || agentResponse.trim() === '') {
            console.log('⚠️ Respuesta vacía del agente');
            return 'Lo siento, no pude procesar tu pregunta en este momento. ¿Puedes intentarlo de nuevo?';
        }

        return agentResponse.trim();

    } catch (error) {
        console.error('❌ Error invocando Bedrock Agent:', error);

        // Handle specific error types
        if (error.name === 'AccessDeniedException') {
            console.error('🔒 Error de permisos: El Lambda no tiene acceso al agente de Bedrock');
            return 'Lo siento, hay un problema de configuración. Por favor, contacta al soporte técnico.';
        } else if (error.name === 'ResourceNotFoundException') {
            console.error('🔍 Error: Agente o Alias no encontrado');
            return 'Lo siento, el servicio no está disponible en este momento. Por favor, intenta más tarde.';
        } else if (error.name === 'ThrottlingException') {
            console.error('⏱️ Error: Demasiadas solicitudes');
            return 'Lo siento, hay muchas solicitudes en este momento. Por favor, intenta de nuevo en unos segundos.';
        } else if (error.name === 'ValidationException') {
            console.error('⚠️ Error de validación:', error.message);
            return 'Lo siento, hubo un problema con tu pregunta. ¿Puedes reformularla?';
        }

        // Error genérico
        return 'Lo siento, hubo un error procesando tu pregunta. Por favor, intenta de nuevo.';
    }
}

module.exports = { getAgente };

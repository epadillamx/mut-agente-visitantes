const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require("@aws-sdk/client-bedrock-agent-runtime");

/**
 * Invoca al agente de Bedrock con la pregunta del usuario
 * @param {string} userId - ID del usuario (número de teléfono)
 * @param {string} question - Pregunta del usuario
 * @param {string} messageId - ID del mensaje de WhatsApp
 * @returns {Promise<string>} - Respuesta del agente o '#REPLICA#' si es mensaje duplicado
 */
async function getAgente(userId, question, messageId) {
    try {
        // Get Agent IDs directly from environment variables
        const AGENT_ID = process.env.AGENT_ID || '';
        const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID || '';
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

        // Prepare the command
        const command = new InvokeAgentCommand({
            agentId: AGENT_ID,
            agentAliasId: AGENT_ALIAS_ID,
            sessionId: userId,
            inputText: question
        });

        console.log(`🔄 Enviando solicitud a Bedrock Agent...`);
        const startTime = Date.now();

        // Invoke the agent
        const response = await client.send(command);

        console.log(`🔄 Respuesta inicial recibida, procesando stream...`);

        // Process the streaming response - IMPORTANTE: Esperamos a que todo el stream se complete
        let agentResponse = '';
        let citations = [];
        let chunkCount = 0;

        if (response.completion) {
            try {
                // Iteramos y esperamos TODOS los eventos del stream
                for await (const event of response.completion) {
                    console.log(`📦 Procesando evento ${++chunkCount}:`, JSON.stringify(Object.keys(event)));
                    
                    // Procesar chunks de texto
                    if (event.chunk && event.chunk.bytes) {
                        const decodedChunk = new TextDecoder('utf-8').decode(event.chunk.bytes);
                        agentResponse += decodedChunk;
                        
                    }

                    // Extraer citations si están disponibles
                    if (event.attribution && event.attribution.citations) {
                        citations.push(...event.attribution.citations);
                       
                    }

                    // Log otros tipos de eventos para debugging
                    if (event.trace) {
                        console.log(`🔍 Trace event recibido`);
                    }
                    if (event.returnControl) {
                        console.log(`🎮 Return control event recibido`);
                    }
                }

                console.log(`✅ Stream completado. Total de chunks procesados: ${chunkCount}`);
            } catch (streamError) {
                console.error('❌ Error procesando stream:', streamError);
                throw streamError;
            }
        } else {
            console.warn('⚠️ No se recibió completion stream en la respuesta');
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`✅ Respuesta completa recibida en ${duration}ms`);
        console.log(`📏 Longitud total de la respuesta: ${agentResponse.length} caracteres`);
        console.log(`📝 Respuesta del agente: ${agentResponse.substring(0, 200)}${agentResponse.length > 200 ? '...' : ''}`);
        
        if (citations.length > 0) {
            console.log(`📚 Total de citations encontradas: ${citations.length}`);
        }

        // Validar que la respuesta no esté vacía
        if (!agentResponse || agentResponse.trim() === '') {
            console.log('⚠️ Respuesta vacía del agente después de procesar el stream');
            return 'Lo siento, no pude procesar tu pregunta en este momento. ¿Puedes intentarlo de nuevo?';
        }

        const finalResponse = agentResponse.trim();
        console.log(`🎯 Retornando respuesta final (${finalResponse.length} caracteres)`);
        
        return finalResponse;

    } catch (error) {
        console.error('❌ Error invocando Bedrock Agent:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

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
        } else if (error.name === 'ServiceUnavailableException') {
            console.error('🔧 Servicio no disponible temporalmente');
            return 'Lo siento, el servicio no está disponible en este momento. Por favor, intenta más tarde.';
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            console.error('🌐 Error de conexión o timeout');
            return 'Lo siento, hubo un problema de conexión. Por favor, intenta de nuevo.';
        }

        // Error genérico
        console.error('❓ Error no categorizado:', error.name || 'Unknown');
        return 'Lo siento, hubo un error procesando tu pregunta. Por favor, intenta de nuevo.';
    }
}

module.exports = { getAgente };

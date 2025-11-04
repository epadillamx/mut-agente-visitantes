const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require("@aws-sdk/client-bedrock-agent-runtime");
const { ConversationService } = require('./conversationService');
const util = require('util');

/**
 * Invoca al agente de Bedrock con la pregunta del usuario y guarda la conversación
 * @param {string} userId - ID del usuario (número de teléfono)
 * @param {string} question - Pregunta del usuario
 * @param {string} messageId - ID del mensaje de WhatsApp
 * @returns {Promise<string>} - Respuesta del agente o '#REPLICA#' si es mensaje duplicado
 */
async function getAgente(userId, question, messageId) {
    const conversationService = new ConversationService();

    try {
        // Get Agent IDs directly from environment variables

        //console.log(`************************** 2 *********************************************`);
        //console.log(`======================  mensajeId ${messageId}`);
        const AGENT_ID = process.env.AGENT_ID || 'MEL0HVUHUD';
        const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID || '5Z5OLHQDGI';
        const REGION = process.env.AWS_REGION || 'us-east-1';



        // Validar que la pregunta no esté vacía
        if (!question || question.trim() === '') {

            return '#REPLICA#';
        }
        // validar que idmensaje en dynamo no exista
        /*const isDuplicate = await conversationService.isDuplicateMessage(messageId);
        if (isDuplicate) {

            return '#REPLICA#';
        }*/

        // Create Bedrock Agent Runtime client
        const client = new BedrockAgentRuntimeClient({ region: REGION });

        // Prepare the command
        //console.log(`************************** 3 *********************************************`);
        //console.log(`======================  mensajeId ${messageId}`);
        const command = new InvokeAgentCommand({
            agentId: AGENT_ID,
            agentAliasId: AGENT_ALIAS_ID,
            sessionId: userId,
            inputText: question
        });


        const startTime = Date.now();

        // Invoke the agent and wait for complete response
        const response = await client.send(command);



        // Process the complete response - NO streaming
        let finalResponse = '';
        const urlSet = new Set();

        if (response.completion) {
            try {
                const chunks = [];

                for await (const event of response.completion) {
                    console.log('++++++++++++++++++++|+++++++++++++++++++++++++++++');
                    //console.log('event:', JSON.stringify(event.chunk?.attribution?.citations, null, 2));

                    for (const citation of event.chunk?.attribution?.citations || []) {
                        for (const meta of citation.retrievedReferences || []) {
                            urlSet.add(meta.metadata['x-amz-bedrock-kb-source-uri']);
                            urlSet.add(meta.metadata.data_source);
                        }

                    }

                    if (event.chunk && event.chunk.bytes) {
                        const decodedChunk = new TextDecoder('utf-8').decode(event.chunk.bytes);
                        chunks.push(decodedChunk);
                        console.log('📝 Chunk agregado, longitud:', decodedChunk.length);
                    }

                    // Romper el bucle cuando detectemos el final de la respuesta
                    if (event.chunk && event.chunk.attribution) {
                        console.log('🔚 Detectado evento de atribución - finalizando stream');
                        break;
                    }

                    // También romper si detectamos un evento de trace de finalización
                    if (event.trace && event.trace.orchestrationTrace &&
                        event.trace.orchestrationTrace.rationale) {
                        console.log('🔚 Detectado evento de trace final - finalizando stream');
                        break;
                    }

                    // Romper si detectamos que el chunk no tiene más bytes (final del stream)
                    if (event.chunk && !event.chunk.bytes && event.chunk.attribution) {
                        console.log('🔚 Detectado final del stream - no más bytes');
                        break;
                    }

                    // Romper si detectamos eventos de finalización específicos
                    if (event.returnControl || event.files || event.codeInterpreterInvocationOutput) {
                        console.log('🔚 Detectado evento de control/finalización - cortando stream');
                        break;
                    }
                }

                // Join all chunks into final response
                finalResponse = chunks.join('').trim();
                console.log('✅ Stream procesado completamente, chunks totales:', chunks.length);

            } catch (streamError) {
                console.error('❌ Error procesando respuesta:', streamError);
                throw streamError;
            }
        } else {
            console.warn('⚠️ No se recibió completion en la respuesta');
        }

        //console.log(`************************** 5 *********************************************`);
        const isDuplicate = await conversationService.isDuplicateMessage(messageId);
        if (isDuplicate) {
            //console.log(`************************** 5.1 #REPLICA# *********************************************`);
            return '#REPLICA#';
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        //console.log(`************************** 6 *********************************************`);
        //console.log(`======================  mensajeId ${messageId}`);
        //console.log(`Respuesta completa recibida: ${finalResponse.length} caracteres`);

        // Validar que la respuesta no esté vacía
        if (!finalResponse || finalResponse === '') {
            console.log('⚠️ Respuesta vacía del agente');
            return 'Lo siento, no pude procesar tu pregunta en este momento. ¿Puedes intentarlo de nuevo?';
        }


        // 💾 Guardar la conversación con trazabilidad completa
        try {
            const traceabilityData = {
                urlSet: Array.from(urlSet),
                agentMetadata: {
                    agentId: AGENT_ID,
                    agentAliasId: AGENT_ALIAS_ID,
                    sessionId: userId,
                    processingTimeMs: duration,
                    region: REGION
                }
            };
            //console.log(`************************** 7 ********************************************* `);
            // console.log(`======================  mensajeId ${messageId}`);

            await conversationService.saveMessage(userId, question, finalResponse, messageId, traceabilityData);

            // console.log(`************************** 9 ********************************************* `);

        } catch (saveError) {
            console.error('⚠️ Error guardando conversación (no crítico):', saveError);
            // No interrumpir el flujo si falla el guardado
        }

        return finalResponse;

    } catch (error) {
        // Log detailed error including non-enumerable properties to help debug AccessDenied issues
        console.error('❌ Error invocando Bedrock Agent:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        try {
            console.error('❌ Full error (util.inspect):', util.inspect(error, { showHidden: true, depth: 6 }));
        } catch (inspectErr) {
            console.error('⚠️ Error inspecting thrown error:', inspectErr);
        }

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
        const errorResponse = 'Lo siento, hubo un error procesando tu pregunta. Por favor, intenta de nuevo.';

        // En caso de error, también intentar guardar para análisis
        try {
            const errorTraceability = {
                citations: [],
                traceEvents: [],
                agentMetadata: {
                    error: error.name,
                    errorMessage: error.message
                }
            };
            await conversationService.saveMessage(userId, question, `ERROR: ${error.message}`, messageId, errorTraceability);
        } catch (saveError) {
            console.error('⚠️ Error guardando conversación de error:', saveError);
        }

        return errorResponse;
    }
}

module.exports = { getAgente };

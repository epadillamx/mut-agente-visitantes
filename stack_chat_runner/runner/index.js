import { getAgente } from './getAgente.js';
import { sendMessage, MarkStatusMessage,sendMessageList } from './send.message.js';
import { inputLlm } from './llm-vector.js';
import logger from './logger.js';
import { ConversationService } from './conversationService.js';

/**
 * Cache en memoria para deduplicación de mensajes
 * Usa Set para búsquedas O(1) con límite de tamaño
 */
const processedMessageIds = new Set();
const MESSAGE_CACHE_MAX_SIZE = 1000; // Máximo de messageIds en memoria
const MESSAGE_CACHE_TTL_MS = 3600000; // 1 hora de TTL
const messageTimestamps = new Map(); // Guarda timestamp de cada messageId

/**
 * Cache en memoria para rastrear respuestas enviadas
 * Evita enviar la misma respuesta múltiples veces al mismo usuario
 * Formato: `${from}:${messageId}` -> true
 */
const sentResponses = new Set();
const sentResponsesTimestamps = new Map();
const RESPONSE_CACHE_MAX_SIZE = 1000;
const RESPONSE_CACHE_TTL_MS = 3600000; // 1 hora de TTL

/**
 * Verifica si un mensaje ya fue procesado (deduplicación)
 */
function isDuplicateMessage(messageId) {
    if (processedMessageIds.has(messageId)) {
        logger.warn(`Mensaje duplicado detectado: ${messageId}`);
        return true;
    }
    return false;
}

/**
 * Verifica si ya se envió una respuesta para este mensaje
 */
function isResponseAlreadySent(from, messageId) {
    const key = `${from}:${messageId}`;
    if (sentResponses.has(key)) {
        logger.warn(`Respuesta ya enviada para: ${key}`);
        return true;
    }
    return false;
}

/**
 * Marca una respuesta como enviada
 */
function markResponseAsSent(from, messageId) {
    const now = Date.now();
    const key = `${from}:${messageId}`;

    // Limpiar respuestas expiradas
    for (const [respKey, timestamp] of sentResponsesTimestamps.entries()) {
        if (now - timestamp > RESPONSE_CACHE_TTL_MS) {
            sentResponses.delete(respKey);
            sentResponsesTimestamps.delete(respKey);
        }
    }

    // Si el cache está lleno, eliminar la respuesta más antigua
    if (sentResponses.size >= RESPONSE_CACHE_MAX_SIZE) {
        const oldestKey = sentResponsesTimestamps.keys().next().value;
        sentResponses.delete(oldestKey);
        sentResponsesTimestamps.delete(oldestKey);
    }

    // Agregar la nueva respuesta
    sentResponses.add(key);
    sentResponsesTimestamps.set(key, now);
    logger.cache(`Respuesta marcada como enviada: ${key} (Cache: ${sentResponses.size}/${RESPONSE_CACHE_MAX_SIZE})`);
}

/**
 * Marca un mensaje como procesado y maneja la limpieza del cache
 */
function markMessageAsProcessed(messageId) {
    const now = Date.now();

    // Limpiar mensajes expirados antes de agregar uno nuevo
    for (const [id, timestamp] of messageTimestamps.entries()) {
        if (now - timestamp > MESSAGE_CACHE_TTL_MS) {
            processedMessageIds.delete(id);
            messageTimestamps.delete(id);
        }
    }

    // Si el cache está lleno, eliminar el mensaje más antiguo
    if (processedMessageIds.size >= MESSAGE_CACHE_MAX_SIZE) {
        const oldestId = messageTimestamps.keys().next().value;
        processedMessageIds.delete(oldestId);
        messageTimestamps.delete(oldestId);
    }

    // Agregar el nuevo mensaje
    processedMessageIds.add(messageId);
    messageTimestamps.set(messageId, now);
    logger.cache(`Mensaje marcado como procesado: ${messageId} (Cache: ${processedMessageIds.size}/${MESSAGE_CACHE_MAX_SIZE})`);
}

/**
 * Lambda Handler - Procesa peticiones de API Gateway
 * Soporta:
 * - GET /webhook - Verificación de webhook de WhatsApp
 * - POST /webhook - Recibir mensajes de WhatsApp
 * - POST /chat - Endpoint directo para pruebas
 * - GET /history - Obtener historial de conversaciones
 */
export const handler = async (event) => {
    //console.log('📥 Event received:', JSON.stringify(event, null, 2));

    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    const path = event.path || event.requestContext?.http?.path || '/';

    try {

        // GET /webhook - Verificación de webhook de WhatsApp
        if (httpMethod === 'GET' && path.includes('/webhook')) {
            return handleWebhookVerification(event);
        }
        // POST /webhook - Recibir mensajes de WhatsApp

        if (httpMethod === 'POST' && path.includes('/webhook')) {

            return handleWhatsAppMessage(event);
        }

        // POST /chat - Endpoint directo para pruebas
        if (httpMethod === 'POST' && path.includes('/chat')) {
            return await handleDirectChat(event);
        }

        // GET /history - Obtener historial de conversaciones
        if (httpMethod === 'GET' && path.includes('/history')) {
            return await handleConversationHistory(event);
        }

        // GET /stats - Obtener estadísticas de usuario
        if (httpMethod === 'GET' && path.includes('/stats')) {
            return await handleUserStats(event);
        }

        // GET / - Health check
        if (httpMethod === 'GET' && (path === '/' || path === '')) {
            return createResponse(200, {
                status: 'ok',
                service: 'Bedrock Agent WhatsApp Lambda',
                version: '1.0.0',
                endpoints: {
                    'GET /webhook': 'WhatsApp webhook verification',
                    'POST /webhook': 'WhatsApp message receiver',
                    'POST /chat': 'Direct chat endpoint for testing',
                    'GET /history': 'Get conversation history (requires userId param)',
                    'GET /stats': 'Get user conversation statistics (requires userId param)'
                },
                timestamp: new Date().toISOString()
            });
        }

        // 404 - Endpoint no encontrado
        return createResponse(404, {
            error: 'Endpoint not found',
            path: path,
            method: httpMethod
        });

    } catch (error) {
        logger.error('Error en handler principal:', error);
        return createResponse(500, {
            error: 'Error interno del servidor',
            details: error.message
        });
    }
};

/**
 * Maneja la verificación del webhook de WhatsApp (GET)
 */
async function handleWebhookVerification(event) {
    try {
        const queryParams = event.queryStringParameters || {};
        const mode = queryParams['hub.mode'];
        const token = queryParams['hub.verify_token'];
        const challenge = queryParams['hub.challenge'];

        // Obtener VERIFY_TOKEN desde variable de entorno
        const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'mi_token_secreto_123';

        logger.debug('Verificación webhook:', { mode, token, challenge });

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                logger.success('WEBHOOK_VERIFIED');
                return {
                    statusCode: 200,
                    body: challenge,
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                };
            } else {
                logger.warn('Verificación fallida. Tokens no coinciden.');
                return createResponse(403, 'Forbidden');
            }
        } else {
            logger.warn('Faltan parámetros mode o token');
            return createResponse(400, 'Bad Request');
        }
    } catch (error) {
        logger.error('Error en verificación webhook:', error);
        return createResponse(500, { error: 'Error en verificación' });
    }
}

/**
 * Maneja mensajes entrantes de WhatsApp (POST)
 */
async function handleWhatsAppMessage(event) {
    try {
        const body = JSON.parse(event.body || '{}');

        //console.log('📨 Webhook POST recibido:', JSON.stringify(body, null, 2));

        // Verificar que es una notificación de WhatsApp
        if (body.object === 'whatsapp_business_account') {
            let response = '';
            let from = ''




            // Procesar todos los mensajes
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {

                    if (change.value && change.value.messages) {
                        for (const message of change.value.messages) {
                            from = message.from;
                            const messageType = message.type;
                            let messageBody = '';
                            let messageId = message.id;
                            let isChat = false;
                            if (messageType === 'text' && message.text) {
                                messageBody = message.text.body;
                                isChat = true;
                            } else if (messageType === 'interactive' && message.interactive) {
                                const messageTypeInteractive = message.interactive.list_reply;
                                messageBody = messageTypeInteractive.title;
                                if (messageBody === 'Otras preguntas') {
                                    if (isDuplicateMessage(messageId)) {
                                        logger.debug(`Mensaje duplicado ignorado: ${messageId}`);
                                        continue; // Saltar este mensaje
                                    }
                                    markMessageAsProcessed(messageId);
                                    await MarkStatusMessage(messageId);
                                    const agentResponseotras = "Por favor, escribe tu pregunta y con gusto te ayudaré.";
                                    await sendMessage(from, agentResponseotras);
                                    continue;
                                }
                                isChat = true;
                            }
                            if (isChat) {

                                try {
                                    // Verificar si el mensaje ya fue procesado (deduplicación)
                                    if (isDuplicateMessage(messageId)) {
                                        logger.debug(`Mensaje duplicado ignorado: ${messageId}`);
                                        continue; // Saltar este mensaje
                                    }


                                    // Marcar mensaje como procesado ANTES de procesarlo
                                    markMessageAsProcessed(messageId);

                                    await MarkStatusMessage(messageId);
                                    logger.warn(`===============MSS ${from}: ${messageBody} || ${messageId}`);

                                    let startTime = Date.now();
                                    // Pasamos `from` (teléfono) como userId para que inputLlm
                                    // cargue el historial conversacional reciente del usuario.
                                    const agentResponse = await inputLlm(messageBody, from);


                                    logger.warn(`===============RESPUESTA ${from}: RE: ${agentResponse}  || ${messageId}`);
                                    if (agentResponse == 'MENU_BIENVENIDA') {
                                        await sendMessageList(from);
                                    } else {
                                        await sendMessage(from, agentResponse);
                                    }

                                    let endTime = Date.now();
                                    const duration = endTime - startTime;
                                    logger.warn("Tiempo de respuesta (s):", duration / 1000);

                                    const traceabilityData = {
                                        agentMetadata: {
                                            sessionId: from,
                                            processingTimeMs: duration,
                                        }
                                    };
                                    // Guardar mensaje de forma asíncrona sin esperar (fire and forget)
                                    const conversationService = new ConversationService();
                                    conversationService.saveMessage(from, messageBody, agentResponse, messageId, traceabilityData).catch(err => {
                                        logger.error('Error guardando mensaje (background):', err);
                                    });



                                } catch (processError) {
                                    logger.error('Error procesando mensaje:', processError);
                                    response = 'Lo siento, hubo un error interno. Por favor, inténtalo de nuevo.';
                                }
                            }

                        }
                    }
                }
            }

            //if (isSendMessage) {
            //  await sendMessage(from, response);
            //}
            logger.debug('Procesamiento de webhook completado');
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'ok' })
            };

        } else {
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'ignored' })
            };
        }

    } catch (error) {
        logger.error('Error en webhookChat:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error interno del servidor' })
        };
    }
}

/**
 * Maneja endpoint de chat directo para pruebas (POST)
 */
async function handleDirectChat(event) {
    try {
        const body = JSON.parse(event.body || '{}');
        const { sessionId, question, pregunta, message } = body;
        const userQuestion = question || pregunta || message;

        if (!userQuestion) {
            return createResponse(400, {
                error: 'Missing required parameter',
                message: 'Parameter "question" is required',
                example: {
                    sessionId: 'test-session-123',
                    question: '¿Qué eventos hay esta semana?'
                }
            });
        }

        const userId = sessionId || `test-${Date.now()}`;
        logger.info(`Prueba directa - SessionId: ${userId}, Question: ${userQuestion}`);

        // Llamar directamente a inputLlm (flujo local sin Bedrock Agent)
        // Pasamos userId para activar memoria conversacional también en pruebas
        const startTime = Date.now();
        const agentResponse = await inputLlm(userQuestion, userId);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        logger.info(`✅ Respuesta generada en ${elapsed}s`);

        // Guardar el turno en DynamoDB para que la memoria conversacional funcione
        // en pruebas multi-turn vía /chat (fire-and-forget, como el webhook real).
        // El messageId aquí es sintético porque /chat no tiene message_id de WhatsApp.
        const syntheticMessageId = `chat-${userId}-${Date.now()}`;
        const conversationService = new ConversationService();
        conversationService.saveMessage(userId, userQuestion, agentResponse, syntheticMessageId, {
            agentMetadata: { sessionId: userId, processingTimeMs: Date.now() - startTime, source: 'direct-chat' }
        }).catch(err => logger.error('Error guardando mensaje /chat (background):', err));

        return createResponse(200, {
            sessionId: userId,
            question: userQuestion,
            answer: agentResponse,
            timestamp: new Date().toISOString(),
            processingTime: `${elapsed}s`
        });

    } catch (error) {
        logger.error('Error en /chat:', error);
        return createResponse(500, {
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}

/**
 * Maneja solicitudes de historial de conversaciones
 * GET /history?userId=1234567890&days=7&limit=100
 */
async function handleConversationHistory(event) {
    try {
        const queryParams = event.queryStringParameters || {};
        const userId = queryParams.userId;
        const days = parseInt(queryParams.days) || 7;
        const limit = parseInt(queryParams.limit) || 100;

        if (!userId) {
            return createResponse(400, {
                error: 'userId is required',
                message: 'Debes proporcionar un userId en los query parameters',
                example: '/history?userId=1234567890&days=7&limit=100'
            });
        }

        logger.info(`Obteniendo historial para userId: ${userId}, días: ${days}, límite: ${limit}`);

        const conversationService = new ConversationService();

        // Obtener conversaciones de múltiples días
        const conversations = await conversationService.getUserConversations(userId, days, limit);

        // Organizar conversaciones por fecha
        const conversationsByDate = {};
        conversations.forEach(conv => {
            const date = conv.conversation_id.split('#')[1]; // Extraer fecha del conversation_id
            if (!conversationsByDate[date]) {
                conversationsByDate[date] = [];
            }
            conversationsByDate[date].push({
                timestamp: conv.timestamp,
                created_at: conv.created_at,
                user_message: conv.user_message,
                agent_response: conv.agent_response,
                message_id: conv.message_id
            });
        });

        // Ordenar fechas de más reciente a más antigua
        const sortedDates = Object.keys(conversationsByDate).sort().reverse();

        return createResponse(200, {
            success: true,
            userId: userId,
            totalMessages: conversations.length,
            totalDays: sortedDates.length,
            filters: { days, limit },
            conversations: conversationsByDate,
            dates: sortedDates,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error obteniendo historial:', error);
        return createResponse(500, {
            error: 'Internal server error',
            message: 'Error obteniendo el historial de conversaciones',
            details: error.message
        });
    }
}

/**
 * Maneja solicitudes de estadísticas de usuario
 * GET /stats?userId=1234567890
 */
async function handleUserStats(event) {
    try {
        const queryParams = event.queryStringParameters || {};
        const userId = queryParams.userId;

        if (!userId) {
            return createResponse(400, {
                error: 'userId is required',
                message: 'Debes proporcionar un userId en los query parameters',
                example: '/stats?userId=1234567890'
            });
        }

        logger.info(`Obteniendo estadísticas para userId: ${userId}`);

        const conversationService = new ConversationService();

        // Obtener estadísticas del usuario
        const stats = await conversationService.getUserStats(userId);

        // Obtener información de sesión activa
        const activeSession = await conversationService.getActiveSession(userId);

        return createResponse(200, {
            success: true,
            userId: userId,
            statistics: stats,
            activeSession: activeSession,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error obteniendo estadísticas:', error);
        return createResponse(500, {
            error: 'Internal server error',
            message: 'Error obteniendo las estadísticas del usuario',
            details: error.message
        });
    }
}

/**
 * Crea una respuesta HTTP estándar
 */
function createResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    };
}

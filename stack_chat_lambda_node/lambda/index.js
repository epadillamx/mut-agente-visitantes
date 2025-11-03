const { getAgente } = require('./getAgente');
const { sendMessage, MarkStatusMessage } = require('./send.message');
const { accumulateMessage } = require('./acumulacion');
const { ConversationService } = require('./conversationService');

/**
 * Lambda Handler - Procesa peticiones de API Gateway
 * Soporta:
 * - GET /webhook - Verificación de webhook de WhatsApp
 * - POST /webhook - Recibir mensajes de WhatsApp
 * - POST /chat - Endpoint directo para pruebas
 * - GET /history - Obtener historial de conversaciones
 */
exports.handler = async (event) => {
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
          
            return await handleWhatsAppMessage(event);
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
        console.error('❌ Error en handler principal:', error);
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

        console.log('🔍 Verificación webhook:', { mode, token, challenge });

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('✅ WEBHOOK_VERIFIED');
                return {
                    statusCode: 200,
                    body: challenge,
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                };
            } else {
                console.log('❌ Verificación fallida. Tokens no coinciden.');
                return createResponse(403, 'Forbidden');
            }
        } else {
            console.log('❌ Faltan parámetros mode o token');
            return createResponse(400, 'Bad Request');
        }
    } catch (error) {
        console.error('❌ Error en verificación webhook:', error);
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
            let processedMessageId = ''; // Mover fuera para controlar duplicados
            let messageProcessed = false; // Flag para salir de los loops

            // Procesar todos los mensajes
            for (const entry of body.entry || []) {
                if (messageProcessed) break; // Salir si ya procesamos un mensaje
                
                for (const change of entry.changes || []) {
                    if (messageProcessed) break; // Salir si ya procesamos un mensaje
                    
                    if (change.value && change.value.messages) {
                        for (const message of change.value.messages) {
                            const from = message.from;
                            const messageType = message.type;
                            const messageId = message.id;

                            

                            // Verificar si ya procesamos este mensaje
                            if (processedMessageId === messageId) {
                                console.log(`⚠️ Mensaje duplicado detectado: ${messageId}`);
                                messageProcessed = true;
                                break;
                            }

                            if (messageType === 'text' && message.text) {
                                const messageBody = message.text.body;
                                console.log(`📩 Procesando mensaje ${messageId} de ${from}`);

                                try {
                                    // Marcar mensaje como procesado ANTES de procesarlo
                                    processedMessageId = messageId;
                                    
                                    // Marcar como leído en WhatsApp
                                    await MarkStatusMessage(messageId);
                                    
                                    // Llamar al agente y enviar respuesta
                                   

                                    const agentResponse = await getAgente(from, messageBody, messageId);
                                    if (agentResponse === '#REPLICA#') {
                                        console.log(`⚠️ Respuesta duplicada del agente para el mensaje ${messageId}`);
                                    } else {
                                        await sendMessage(from, agentResponse);
                                    }

                                    // Marcar que procesamos un mensaje y salir
                                    messageProcessed = true;
                                    break;

                                } catch (processError) {
                                    console.error('❌ Error procesando mensaje:', processError);
                                    // Enviar mensaje de error al usuario
                                    if (from) {
                                        await sendMessage(from, '¿Puedes repetirme tu pregunta, por favor?');
                                    }
                                    // Marcar como procesado incluso si falló
                                    messageProcessed = true;
                                    break;
                                }
                            } else {
                                console.log(`⚠️ Tipo de mensaje no soportado: ${messageType}`);
                                if (from && messageType !== 'reaction') {
                                    await sendMessage(from, '¿Puedes repetirme tu pregunta?');
                                }
                                // No marcar como procesado, continuar con siguientes mensajes
                            }
                        }
                    }
                }
            }

            // Responder inmediatamente a WhatsApp con 200 OK
            console.log(`📤 Respondiendo a WhatsApp con 200 OK`);
            return createResponse(200, {
                status: 'ok',
                message: 'Mensaje recibido',
                processed: messageProcessed,
                messageId: processedMessageId || 'none'
            });

        } else {
            console.log('⚠️ Objeto no es whatsapp_business_account:', body.object);
            return createResponse(200, {
                status: 'ignored',
                message: 'No es un mensaje de WhatsApp'
            });
        }

    } catch (error) {
        console.error('❌ Error en webhook POST:', error);
        return createResponse(500, {
            error: 'Error interno del servidor',
            details: error.message
        });
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
        console.log(`🧪 Prueba directa - SessionId: ${userId}, Question: ${userQuestion}`);

        // Llamar directamente al agente
        const agentResponse = await getAgente(userId, userQuestion, 'test-message-id');

        return createResponse(200, {
            sessionId: userId,
            question: userQuestion,
            answer: agentResponse,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error en /chat:', error);
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

        console.log(`📚 Obteniendo historial para userId: ${userId}, días: ${days}, límite: ${limit}`);

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
        console.error('❌ Error obteniendo historial:', error);
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

        console.log(`📊 Obteniendo estadísticas para userId: ${userId}`);

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
        console.error('❌ Error obteniendo estadísticas:', error);
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

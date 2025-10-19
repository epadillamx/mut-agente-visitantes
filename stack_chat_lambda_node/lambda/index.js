const { getAgente } = require('./getAgente');
const { sendMessage, MarkStatusMessage } = require('./send.message');
const { accumulateMessage } = require('./acumulacion');
const { getParameter } = require('./ssmHelper');

/**
 * Lambda Handler - Procesa peticiones de API Gateway
 * Soporta:
 * - GET /webhook - Verificación de webhook de WhatsApp
 * - POST /webhook - Recibir mensajes de WhatsApp
 * - POST /chat - Endpoint directo para pruebas
 */
exports.handler = async (event) => {
    console.log('📥 Event received:', JSON.stringify(event, null, 2));

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

        // GET / - Health check
        if (httpMethod === 'GET' && (path === '/' || path === '')) {
            return createResponse(200, {
                status: 'ok',
                service: 'Bedrock Agent WhatsApp Lambda',
                version: '1.0.0',
                endpoints: {
                    'GET /webhook': 'WhatsApp webhook verification',
                    'POST /webhook': 'WhatsApp message receiver',
                    'POST /chat': 'Direct chat endpoint for testing'
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
        
        // Obtener VERIFY_TOKEN desde Parameter Store
        const verifyTokenPath = process.env.PARAM_VERIFY_TOKEN || '/whatsapp/bedrock-agent/verify-token';
        const VERIFY_TOKEN = await getParameter(verifyTokenPath);

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
        console.log('📨 Webhook POST recibido:', JSON.stringify(body, null, 2));

        // Verificar que es una notificación de WhatsApp
        if (body.object === 'whatsapp_business_account') {
            let from = '';

            // Procesar todos los mensajes
            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    if (change.value && change.value.messages) {
                        for (const message of change.value.messages) {
                            from = message.from;
                            const messageType = message.type;

                            if (messageType === 'text' && message.text) {
                                const messageBody = message.text.body;
                                const messageId = message.id;

                                try {
                                    // Marcar mensaje como leído
                                    MarkStatusMessage(messageId);

                                    console.log(`===================MENSAJE==================`);
                                    console.log(`📱 Recibido de ${from}:`, messageBody);

                                    // Acumular mensajes del usuario
                                    const messagePromise = accumulateMessage(from, messageBody);

                                    if (messagePromise) {
                                        // Procesar mensajes acumulados (async, no esperar)
                                        messagePromise
                                            .then(async (message_full) => {
                                                if (message_full != null && message_full.trim() !== '') {
                                                    console.log(`📝 Mensaje completo de ${from}:`, message_full);

                                                    // Llamar al agente de Bedrock
                                                    const agentResponse = await getAgente(from, message_full, messageId);

                                                    // Enviar respuesta si no es mensaje duplicado
                                                    if (agentResponse !== '#REPLICA#') {
                                                        console.log(`💬 Enviando respuesta a ${from}`);
                                                        await sendMessage(from, agentResponse);
                                                    } else {
                                                        console.log(`⏭️ Mensaje duplicado ignorado`);
                                                    }
                                                }
                                            })
                                            .catch(error => {
                                                console.error('❌ Error en acumulación:', error);
                                                // Enviar mensaje de error al usuario
                                                sendMessage(from, 'Lo siento, hubo un error procesando tu mensaje. Por favor, intenta de nuevo.');
                                            });
                                    }

                                } catch (processError) {
                                    console.error('❌ Error procesando mensaje:', processError);
                                    // Enviar mensaje de error al usuario
                                    if (from) {
                                        await sendMessage(from, 'Lo siento, hubo un error interno. Por favor, inténtalo de nuevo.');
                                    }
                                }
                            } else {
                                console.log(`⚠️ Tipo de mensaje no soportado: ${messageType}`);
                                if (from && messageType !== 'reaction') {
                                    await sendMessage(from, 'Lo siento, solo puedo procesar mensajes de texto en este momento.');
                                }
                            }
                        }
                    }
                }
            }

            // Responder inmediatamente a WhatsApp con 200 OK
            return createResponse(200, { 
                status: 'ok', 
                message: 'Mensaje recibido' 
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

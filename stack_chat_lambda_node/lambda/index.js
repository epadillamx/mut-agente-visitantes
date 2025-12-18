import { sendMessage, MarkStatusMessage, sendFlow, sendInteractiveButtons } from './send.message.js';
import { inputLlm } from './llm-vector.js';
import logger from './logger.js';
import { ConversationService } from './conversationService.js';
import { getWhatsAppCredentials, getFracttalCredentials } from './secrets.js';
import { randomUUID } from 'crypto';

/**
 * Capitaliza la primera letra de cada palabra
 * @param {string} str - Texto a capitalizar
 * @returns {string} Texto con primera letra de cada palabra en mayúscula
 */
function capitalizeWords(str) {
    if (!str) return str;
    return str.toLowerCase().split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Importaciones condicionales para servicios de incidencias
let clasificarIncidencia = null;
let clasificarUrgencia = null;
let clasificarTipo = null;
let ZENDESK_CATEGORIES = null;
let TAG_TO_TYPE = null;
let getGroupName = null;
let getFracttalService = null;
let parseLocalId = null;
let getContratoByNumero = null;
let getNumeroContratoByFractalCode = null;
let getClasificacionFracttal = null;
let checkUserByPhone = null;
let getUserIdByEmail = null;   // PostgreSQL - obtener userId por email
let createTicket = null;
let crearTicketZendesk = null;
let createUserAndTicket = null;  // DynamoDB write service
let getUsuarioByPhone = null;    // DynamoDB - verificar usuario existente

try {
    const classificationModule = await import('./services/classificationService.js');
    clasificarIncidencia = classificationModule.clasificarIncidencia;
    clasificarUrgencia = classificationModule.clasificarUrgencia;
    clasificarTipo = classificationModule.clasificarTipo;
    ZENDESK_CATEGORIES = classificationModule.ZENDESK_CATEGORIES;
    console.log('[INIT] classificationService cargado exitosamente');
} catch (e) {
    console.error('[INIT] Error cargando classificationService:', e.message);
}

try {
    const fracttalModule = await import('./services/fracttalService.js');
    getFracttalService = fracttalModule.getFracttalService;
    console.log('[INIT] fracttalService cargado exitosamente');
} catch (e) {
    console.error('[INIT] Error cargando fracttalService:', e.message);
}

try {
    const postgresModule = await import('./services/postgresService.js');
    parseLocalId = postgresModule.parseLocalId;
    getContratoByNumero = postgresModule.getContratoByNumero;
    getNumeroContratoByFractalCode = postgresModule.getNumeroContratoByFractalCode;
    getClasificacionFracttal = postgresModule.getClasificacionFracttal;
    checkUserByPhone = postgresModule.checkUserByPhone;
    getUserIdByEmail = postgresModule.getUserIdByEmail;
    // NOTA: createTicket fue removido - ahora se usa dynamoDbWriteService
    console.log('[INIT] postgresService cargado exitosamente (SOLO LECTURA)');
} catch (e) {
    console.error('[INIT] Error cargando postgresService:', e.message);
}

try {
    const zendeskModule = await import('./services/zendeskService.js');
    crearTicketZendesk = zendeskModule.crearTicketZendesk;
    TAG_TO_TYPE = zendeskModule.TAG_TO_TYPE;
    getGroupName = zendeskModule.getGroupName;
    console.log('[INIT] zendeskService cargado exitosamente');
} catch (e) {
    console.error('[INIT] Error cargando zendeskService:', e.message);
}

try {
    const dynamoDbModule = await import('./services/dynamoDbWriteService.js');
    createUserAndTicket = dynamoDbModule.createUserAndTicket;
    getUsuarioByPhone = dynamoDbModule.getUsuarioByPhone;
    // Funciones para sesiones de incidencia
    var getOrCreateIncidenciaSession = dynamoDbModule.getOrCreateIncidenciaSession;
    var deleteIncidenciaSession = dynamoDbModule.deleteIncidenciaSession;
    // Función para actualizar local del usuario
    var updateUsuarioLocal = dynamoDbModule.updateUsuarioLocal;
    console.log('[INIT] dynamoDbWriteService cargado exitosamente');
} catch (e) {
    console.error('[INIT] Error cargando dynamoDbWriteService:', e.message);
}

console.log('[INIT] Lambda index.js inicializado - VERSION 5.0 con Flujo de Cambio de Local');


/**
 * Cache en memoria para deduplicación de mensajes
 * Usa Set para búsquedas O(1) con límite de tamaño
 */
const processedMessageIds = new Set();
const MESSAGE_CACHE_MAX_SIZE = 1000; // Máximo de messageIds en memoria
const MESSAGE_CACHE_TTL_MS = 3600000; // 1 hora de TTL
const messageTimestamps = new Map(); // Guarda timestamp de cada messageId


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
    console.log(`[LAMBDA] ========== INVOCACION ${new Date().toISOString()} ==========`);
    console.log(`[LAMBDA] Method: ${event.httpMethod}, Path: ${event.path}`);
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

        // Obtener VERIFY_TOKEN desde Secrets Manager
        const secrets = await getWhatsAppCredentials();
        const VERIFY_TOKEN = secrets.VERIFY_TOKEN;

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
    let idFlowFulla = "660310043715044"; // todo el flujo desde la captura de local hasta el resumen
    let idFlowincidencia = "1906191903584411"; // solo la captura de incidencia
    let idFlowCambiarLocal = "839718892221678"; // solo selector de local (para usuarios existentes que quieren cambiar)
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

                            if (messageType === 'text' && message.text) {
                                const messageBody = message.text.body;
                                const messageId = message.id;

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
                                    //const agentResponse = await inputLlm(messageBody);
                                    //logger.warn(`===============RESPUESTA ${from}: RE: ${agentResponse}  || ${messageId}`);

                                    /*logger.warn(`===============RESPUESTA ${from}: RE: ${agentResponse}  || ${messageId}`);
                                    await sendMessage(from, agentResponse);*/

                                    //await sendFlow(from, idFlowFulla, "Hola, con este formulario puedes capturar tu incidencia",'INCIDENT_FORM');
                                    // Verificar si el usuario ya existe en DynamoDB (nueva tabla)
                                    let existingUser = null;
                                    let isReturningUser = false;
                                    
                                    if (getUsuarioByPhone) {
                                        try {
                                            existingUser = await getUsuarioByPhone(from);
                                            isReturningUser = existingUser && existingUser.nombre && existingUser.local_id;
                                            console.log(`[USER_CHECK] Usuario ${from}: ${isReturningUser ? 'EXISTENTE' : 'NUEVO'}`, existingUser);
                                        } catch (userCheckError) {
                                            console.error('[USER_CHECK] Error verificando usuario:', userCheckError);
                                        }
                                    } else {
                                        console.warn('[USER_CHECK] getUsuarioByPhone no disponible, tratando como usuario nuevo');
                                    }
                                    
                                    let agentResponse;
                                    
                                    // Obtener o crear incidenciaSessionId desde mut-incidencia-sessions
                                    // Esta tabla NO tiene TTL - la sesión persiste hasta que el usuario
                                    // complete el formulario y cree un ticket
                                    let incidenciaSessionId;
                                    if (getOrCreateIncidenciaSession) {
                                        incidenciaSessionId = await getOrCreateIncidenciaSession(from);
                                    } else {
                                        // Fallback si no está disponible
                                        incidenciaSessionId = randomUUID();
                                        console.warn('[INCIDENCIA] getOrCreateIncidenciaSession no disponible, usando UUID aleatorio');
                                    }
                                    console.log(`[INCIDENCIA] Sesión de incidencia: ${incidenciaSessionId}`);
                                    
                                    if (isReturningUser) {
                                        // Usuario conocido: mostrar opciones con botones interactivos
                                        const nombreCorto = capitalizeWords(existingUser.nombre.split(' ')[0]);
                                        const localActual = existingUser.nombre_local_display || existingUser.nombre_local || 'tu local';
                                        
                                        agentResponse = `¡Hola ${nombreCorto}! 👋\n\nTu local actual: *${localActual}*\n\n¿Qué deseas hacer?`;
                                        
                                        // Enviar botones con opciones
                                        const buttons = [
                                            { id: `reportar_${incidenciaSessionId}`, title: "📝 Reportar" },
                                            { id: `cambiar_${incidenciaSessionId}`, title: "🏢 Cambiar Local" }
                                        ];
                                        
                                        console.log(`[USER_CHECK] Usuario EXISTENTE - Enviando botones de opciones`);
                                        await sendInteractiveButtons(from, agentResponse, buttons);
                                        
                                        // Actualizar agentResponse para log
                                        agentResponse += '\n[Se enviaron botones de opciones]';
                                    } else {
                                        // Usuario nuevo: flujo completo con búsqueda de locales
                                        agentResponse = "Hola 👋\n\nPara reportar una incidencia, completa el formulario a continuación ⬇️";
                                        await sendMessage(from, agentResponse);
                                        
                                        // Enviar Flow completo con incidencia_session_id
                                        const initData = {
                                            is_returning_user: false,
                                            incidencia_session_id: incidenciaSessionId
                                        };
                                        await sendFlow(from, idFlowFulla, "Reportar Incidencia", 'INCIDENT_FORM', initData);
                                        agentResponse += '\n[Se envió formulario completo]';
                                    }


                                    let endTime = Date.now();
                                    const duration = endTime - startTime;
                                    logger.warn("Tiempo de respuesta (s):", duration / 1000);

                                    const traceabilityData = {
                                        agentMetadata: {
                                            sessionId: from,
                                            processingTimeMs: duration,
                                        },
                                        // ID de sesión para vincular con el ticket que se creará
                                        incidenciaSessionId: incidenciaSessionId
                                    };
                                    // Guardar mensaje de forma asíncrona sin esperar (fire and forget)
                                    const conversationService = new ConversationService();
                                    conversationService.saveMessage(from, messageBody, agentResponse, messageId, traceabilityData, 'incidencias').catch(err => {
                                        logger.error('Error guardando mensaje (background):', err);
                                    });



                                } catch (processError) {
                                    logger.error('Error procesando mensaje:', processError);
                                    response = 'Lo siento, hubo un error interno. Por favor, inténtalo de nuevo.';
                                }
                            } else {

                                const interactive = message.interactive;
                                
                                // ========== MANEJO DE BOTONES INTERACTIVOS ==========
                                // Respuesta cuando el usuario presiona un botón (Reportar / Cambiar Local)
                                if (interactive && interactive.type === 'button_reply' && interactive.button_reply) {
                                    const buttonId = interactive.button_reply.id;
                                    const messageId = message.id;
                                    
                                    console.log(`[BUTTON_REPLY] Usuario ${from} presionó botón: ${buttonId}`);
                                    
                                    try {
                                        // Extraer incidenciaSessionId del ID del botón
                                        // Formato: "reportar_{sessionId}" o "cambiar_{sessionId}"
                                        const parts = buttonId.split('_');
                                        const action = parts[0]; // "reportar" o "cambiar"
                                        const incidenciaSessionId = parts.slice(1).join('_'); // El resto es el sessionId
                                        
                                        // Obtener usuario existente para pre-cargar datos
                                        let existingUser = null;
                                        if (getUsuarioByPhone) {
                                            existingUser = await getUsuarioByPhone(from);
                                        }
                                        
                                        if (action === 'reportar') {
                                            // Usuario eligió "Reportar Incidencia" - enviar Flow simplificado
                                            console.log(`[BUTTON_REPLY] Enviando Flow de incidencia`);
                                            
                                            const localCompoundId = existingUser?.local_id ? 
                                                `${existingUser.local_id}|${existingUser.fractal_code || ''}|||` : null;
                                            
                                            const initData = {
                                                nombre: existingUser?.nombre || '',
                                                email: existingUser?.email || '',
                                                local: localCompoundId,
                                                local_nombre: existingUser?.nombre_local || '',
                                                is_returning_user: true,
                                                incidencia_session_id: incidenciaSessionId
                                            };
                                            
                                            await sendFlow(from, idFlowincidencia, "Reportar Incidencia", null, initData);
                                            
                                            // Log de conversación
                                            const conversationService = new ConversationService();
                                            conversationService.saveMessage(from, '[Botón: Reportar Incidencia]', '[Se envió formulario de incidencia]', messageId, { incidenciaSessionId }, 'incidencias').catch(err => {
                                                logger.error('Error guardando mensaje (background):', err);
                                            });
                                            
                                        } else if (action === 'cambiar') {
                                            // Usuario eligió "Cambiar Local" - enviar Flow de selección de local
                                            console.log(`[BUTTON_REPLY] Enviando Flow de cambio de local`);
                                            
                                            // Preparar datos para el Flow de cambio de local
                                            // Este Flow solo tiene selector de local, luego redirigiremos
                                            const initData = {
                                                is_returning_user: true,
                                                is_local_change: true, // Flag para identificar que es cambio de local
                                                nombre: existingUser?.nombre || '',
                                                email: existingUser?.email || '',
                                                incidencia_session_id: incidenciaSessionId
                                            };
                                            
                                            await sendFlow(from, idFlowCambiarLocal, "Cambiar Local", null, initData);
                                            
                                            // Log de conversación
                                            const conversationService = new ConversationService();
                                            conversationService.saveMessage(from, '[Botón: Cambiar Local]', '[Se envió formulario de cambio de local]', messageId, { incidenciaSessionId }, 'incidencias').catch(err => {
                                                logger.error('Error guardando mensaje (background):', err);
                                            });
                                        }
                                        
                                    } catch (buttonError) {
                                        logger.error('[BUTTON_REPLY] Error procesando botón:', buttonError);
                                        await sendMessage(from, 'Lo siento, hubo un error. Por favor intenta de nuevo.');
                                    }
                                    
                                // ========== MANEJO DE RESPUESTAS DE FLOWS ==========    
                                } else if (interactive && interactive.type === 'nfm_reply' && interactive.nfm_reply && interactive.nfm_reply.response_json) {
                                    try {
                                        const responseData = JSON.parse(interactive.nfm_reply.response_json);
                                        let { nombre, local, flow_token, incidencia, email } = responseData;
                                        let localNombreFromToken = null;  // Para guardar el nombre del local del token
                                        
                                        console.log('[FLOW_COMPLETE] ========== PROCESANDO INCIDENCIA V2.0 ==========');
                                        console.log(`[FLOW_COMPLETE] Servicios disponibles: parseLocalId=${!!parseLocalId}, clasificarIncidencia=${!!clasificarIncidencia}, getFracttalService=${!!getFracttalService}`);
                                        console.log(`[FLOW_COMPLETE] Datos recibidos del Flow: nombre=${nombre}, local=${local}, incidencia=${incidencia}, email=${email}`);
                                        console.log(`[FLOW_COMPLETE] flow_token: ${flow_token}`);
                                        
                                        // Si el flow_token indica usuario existente, extraer datos del token
                                        // Esto es necesario para el Flow simplificado que solo envía 'incidencia'
                                        // IMPORTANTE: También extraemos incidencia_session_id para vincular la conversación
                                        let incidenciaSessionId = null;
                                        let isLocalChange = false; // Flag para detectar cambio de local
                                        
                                        if (flow_token && (flow_token.startsWith('returning_') || flow_token.startsWith('new_'))) {
                                            try {
                                                const parts = flow_token.split('_');
                                                if (parts.length >= 3) {
                                                    const base64Data = parts.slice(2).join('_');
                                                    const userData = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf8'));
                                                    console.log('[FLOW_COMPLETE] Datos extraídos del flow_token:', JSON.stringify(userData));
                                                    
                                                    // Extraer incidencia_session_id (aplica a ambos tipos de usuario)
                                                    if (userData.incidencia_session_id) {
                                                        incidenciaSessionId = userData.incidencia_session_id;
                                                        console.log(`[FLOW_COMPLETE] incidencia_session_id extraído: ${incidenciaSessionId}`);
                                                    }
                                                    
                                                    // Detectar si es un cambio de local
                                                    if (userData.is_local_change) {
                                                        isLocalChange = true;
                                                        console.log('[FLOW_COMPLETE] ========== CAMBIO DE LOCAL DETECTADO ==========');
                                                    }
                                                    
                                                    // Usar datos del token si no vienen en el response (solo para returning users)
                                                    if (userData.is_returning_user) {
                                                        if (!nombre && userData.nombre) nombre = userData.nombre;
                                                        if (!email && userData.email) email = userData.email;
                                                        if (!local && userData.local) local = userData.local;
                                                        // Guardar el nombre del local del token para usarlo después
                                                        if (userData.local_nombre) localNombreFromToken = userData.local_nombre;
                                                    }
                                                    
                                                    console.log(`[FLOW_COMPLETE] Datos después de merge: nombre=${nombre}, local=${local}, email=${email}, localNombreFromToken=${localNombreFromToken}`);
                                                }
                                            } catch (tokenError) {
                                                console.error('[FLOW_COMPLETE] Error extrayendo datos del flow_token:', tokenError);
                                            }
                                        }
                                        
                                        // Parsear el ID compuesto del local (si el servicio está disponible)
                                        let localData = null;
                                        let localNombre = 'local no especificado'; // Se llenará después
                                        let localNombreDisplay = 'local no especificado'; // Nombre con sufijo de tipo (ej: "ADIDAS - Local")
                                        let fractalCode = null;
                                        let locatarioId = null;
                                        let tipoLocal = null; // 'Local' u 'Oficina'
                                        
                                        if (parseLocalId) {
                                            localData = parseLocalId(local);
                                            console.log(`[FLOW_COMPLETE] localData parseado:`, JSON.stringify(localData));
                                        } else {
                                            console.warn('[FLOW_COMPLETE] parseLocalId no disponible, usando local raw');
                                        }
                                        
                                        if (localData) {
                                            locatarioId = localData.locatarioId;
                                            fractalCode = localData.fractalCode;
                                            tipoLocal = localData.tipo; // 'Local' u 'Oficina'
                                            
                                            // Verificar si localNombreFromToken es válido (no vacío, no solo "Local " o "Local")
                                            const tokenNombreValido = localNombreFromToken && 
                                                                      localNombreFromToken.trim() !== '' && 
                                                                      localNombreFromToken.trim() !== 'Local' &&
                                                                      !localNombreFromToken.trim().match(/^Local\s*$/);
                                            
                                            if (tokenNombreValido) {
                                                // Usar el nombre del token si es válido
                                                localNombre = localNombreFromToken;
                                                console.log(`[FLOW_COMPLETE] Usando nombre del token: ${localNombre}`);
                                            } else {
                                                // Intentar obtener nombre del contrato desde PostgreSQL
                                                if (localData.numeroContrato && getContratoByNumero) {
                                                    try {
                                                        const contratoInfo = await getContratoByNumero(localData.numeroContrato);
                                                        if (contratoInfo && contratoInfo.nombre_contrato) {
                                                            localNombre = contratoInfo.nombre_contrato;
                                                            console.log(`[FLOW_COMPLETE] Nombre obtenido de PostgreSQL: ${localNombre}`);
                                                        } else if (localData.codigoLocal) {
                                                            localNombre = `Local ${localData.codigoLocal}`;
                                                        }
                                                    } catch (err) {
                                                        console.error('[FLOW_COMPLETE] Error obteniendo contrato:', err);
                                                        if (localData.codigoLocal) localNombre = `Local ${localData.codigoLocal}`;
                                                    }
                                                } else if (localData.codigoLocal) {
                                                    localNombre = `Local ${localData.codigoLocal}`;
                                                }
                                            }
                                            
                                            // Construir nombre_local_display con el sufijo de tipo
                                            // Formato: "ADIDAS ORIGINALS - Local" o "COCA COLA - Oficina"
                                            if (tipoLocal) {
                                                localNombreDisplay = `${localNombre} - ${tipoLocal}`;
                                            } else {
                                                localNombreDisplay = localNombre;
                                            }
                                            
                                            console.log(`[FLOW_COMPLETE] Local parseado: nombre=${localNombre}, display=${localNombreDisplay}, tipo=${tipoLocal}, fractalCode=${fractalCode}, locatarioId=${locatarioId}`);
                                        }
                                        
                                        // ========== MANEJO DE CAMBIO DE LOCAL ==========
                                        // Si es un cambio de local, actualizar el usuario y redirigir al Flow de incidencia
                                        if (isLocalChange && local) {
                                            console.log('[LOCAL_CHANGE] ========== PROCESANDO CAMBIO DE LOCAL ==========');
                                            
                                            // Obtener numeroContrato si tenemos fractalCode
                                            let numeroContratoNuevo = null;
                                            if (fractalCode && getNumeroContratoByFractalCode) {
                                                try {
                                                    const contratoData = await getNumeroContratoByFractalCode(fractalCode);
                                                    if (contratoData) {
                                                        numeroContratoNuevo = contratoData.numero_contrato;
                                                        // Obtener nombre del local si aún no lo tenemos
                                                        if (localNombre === 'local no especificado' && numeroContratoNuevo && getContratoByNumero) {
                                                            const contratoInfo = await getContratoByNumero(numeroContratoNuevo);
                                                            if (contratoInfo && contratoInfo.nombre_contrato) {
                                                                localNombre = contratoInfo.nombre_contrato;
                                                            }
                                                        }
                                                    }
                                                } catch (contratoErr) {
                                                    console.error('[LOCAL_CHANGE] Error obteniendo numeroContrato:', contratoErr);
                                                }
                                            }
                                            
                                            // Actualizar el usuario en DynamoDB
                                            if (updateUsuarioLocal) {
                                                try {
                                                    const updatedUser = await updateUsuarioLocal(from, {
                                                        local_id: localData?.locatarioId || local,
                                                        nombre_local: localNombre,
                                                        nombre_local_display: localNombreDisplay,
                                                        fractal_code: fractalCode || '',
                                                        numero_contrato: numeroContratoNuevo
                                                    });
                                                    console.log(`[LOCAL_CHANGE] Usuario actualizado:`, JSON.stringify(updatedUser));
                                                } catch (updateErr) {
                                                    console.error('[LOCAL_CHANGE] Error actualizando usuario:', updateErr);
                                                }
                                            }
                                            
                                            // Notificar al usuario que el local fue actualizado (usar nombre_local_display)
                                            await sendMessage(from, `✅ Tu local ha sido actualizado a: *${localNombreDisplay}*\n\n¿Necesitas reportar una incidencia? Completa el formulario ⬇️`);
                                            
                                            // Obtener datos actualizados del usuario
                                            let existingUser = null;
                                            if (getUsuarioByPhone) {
                                                existingUser = await getUsuarioByPhone(from);
                                            }
                                            
                                            // Construir el ID compuesto del local para pre-selección
                                            const localCompoundId = existingUser?.local_id ? 
                                                `${existingUser.local_id}|${existingUser.fractal_code || ''}|||` : local;
                                            
                                            // Enviar Flow de incidencia con los datos actualizados
                                            const initData = {
                                                nombre: existingUser?.nombre || nombre,
                                                email: existingUser?.email || email,
                                                local: localCompoundId,
                                                local_nombre: existingUser?.nombre_local || localNombre,
                                                is_returning_user: true,
                                                incidencia_session_id: incidenciaSessionId
                                            };
                                            
                                            console.log(`[LOCAL_CHANGE] Enviando Flow de incidencia con datos actualizados`);
                                            await sendFlow(from, idFlowincidencia, "Reportar Incidencia", null, initData);
                                            
                                            // Log de conversación
                                            const conversationService = new ConversationService();
                                            conversationService.saveMessage(from, `[Cambio de local a: ${localNombre}]`, `Local actualizado. Se envió formulario de incidencia.`, message.id, { incidenciaSessionId }, 'incidencias').catch(err => {
                                                logger.error('Error guardando mensaje (background):', err);
                                            });
                                            
                                            // Terminar procesamiento aquí - no continuar con clasificación de ticket
                                            continue;
                                        }
                                        
                                        // Asignar valores por defecto si están vacíos y capitalizar nombre
                                        nombre = nombre?.trim() ? capitalizeWords(nombre) : 'Usuario';
                                        email = email?.trim() ? email : 'sin email proporcionado';
                                        
                                        let fracttalId = null;
                                        let zendeskId = null;
                                        let clasificacion = { nombre_nivel_1: 'Otros', nombre_nivel_2: 'Otros', nombre_nivel_3: 'Otros' };
                                        let urgencia = 'Normal'; // Valor por defecto
                                        let tipoClasificacion = null; // typeclass: reclamos, incidencia, etc.
                                        let destino = 'fracttal'; // por defecto va a Fracttal
                                        let numeroContrato = null;
                                        
                                        // Paso 1: Clasificar urgencia con Bedrock
                                        if (clasificarUrgencia) {
                                            try {
                                                console.log('[FLOW_COMPLETE] Paso 1: Clasificando urgencia con Bedrock...');
                                                urgencia = await clasificarUrgencia(incidencia);
                                                console.log(`[FLOW_COMPLETE] Urgencia clasificada: ${urgencia}`);
                                            } catch (urgErr) {
                                                console.error('[FLOW_COMPLETE] Error clasificando urgencia:', urgErr);
                                            }
                                        }
                                        
                                        // Paso 2: Clasificar tipo (Zendesk vs Fracttal) con Bedrock
                                        if (clasificarTipo) {
                                            try {
                                                console.log('[FLOW_COMPLETE] Paso 2: Clasificando tipo (Zendesk/Fracttal) con Bedrock...');
                                                const tipoResult = await clasificarTipo(incidencia);
                                                tipoClasificacion = tipoResult.typeclass;
                                                destino = tipoResult.destino;
                                                console.log(`[FLOW_COMPLETE] Tipo: ${tipoClasificacion}, Destino: ${destino}`);
                                            } catch (tipoErr) {
                                                console.error('[FLOW_COMPLETE] Error clasificando tipo:', tipoErr);
                                            }
                                        }
                                        
                                        // Paso 2.5: Obtener numeroContrato si tenemos fractalCode
                                        if (fractalCode && getNumeroContratoByFractalCode) {
                                            try {
                                                console.log('[FLOW_COMPLETE] Paso 2.5: Obteniendo numeroContrato...');
                                                const contratoData = await getNumeroContratoByFractalCode(fractalCode);
                                                if (contratoData) {
                                                    numeroContrato = contratoData.numero_contrato;
                                                    console.log(`[FLOW_COMPLETE] numeroContrato obtenido: ${numeroContrato}`);
                                                    
                                                    // Paso 2.6: Obtener nombre del local si aún no lo tenemos
                                                    if (localNombre === 'local no especificado' && numeroContrato && getContratoByNumero) {
                                                        try {
                                                            const contratoInfo = await getContratoByNumero(numeroContrato);
                                                            if (contratoInfo && contratoInfo.nombre_contrato) {
                                                                localNombre = contratoInfo.nombre_contrato;
                                                                console.log(`[FLOW_COMPLETE] Nombre del local obtenido de PostgreSQL: ${localNombre}`);
                                                            }
                                                        } catch (nombreErr) {
                                                            console.error('[FLOW_COMPLETE] Error obteniendo nombre del local:', nombreErr);
                                                        }
                                                    }
                                                }
                                            } catch (contratoErr) {
                                                console.error('[FLOW_COMPLETE] Error obteniendo numeroContrato:', contratoErr);
                                            }
                                        }
                                        
                                        // ============================================================
                                        // ROUTING: ZENDESK vs FRACTTAL
                                        // ============================================================
                                        
                                        if (destino === 'zendesk' && crearTicketZendesk) {
                                            // ========== RUTA ZENDESK ==========
                                            console.log('[FLOW_COMPLETE] ========== PROCESANDO EN ZENDESK ==========');
                                            
                                            try {
                                                const zendeskResult = await crearTicketZendesk({
                                                    email: email,
                                                    nombre: nombre,
                                                    typeclass: tipoClasificacion,
                                                    incidencia: incidencia,
                                                    urgencia: urgencia,
                                                    localNombre: localNombre,
                                                    numeroContrato: numeroContrato,
                                                    locatarioId: locatarioId
                                                });
                                                
                                                if (zendeskResult.ok) {
                                                    zendeskId = zendeskResult.ticketId;
                                                    console.log(`[FLOW_COMPLETE] Ticket Zendesk creado exitosamente. ID: ${zendeskId}`);
                                                } else {
                                                    console.error('[FLOW_COMPLETE] Error creando ticket Zendesk:', zendeskResult.error);
                                                }
                                            } catch (zendeskError) {
                                                console.error('[FLOW_COMPLETE] Error en proceso Zendesk:', zendeskError);
                                            }
                                            
                                            // Construir categoría para Zendesk: "Zendesk > Tipo > Tag (con espacios)"
                                            // Calcular tipo desde el tag
                                            const tipoFromTagZendesk = TAG_TO_TYPE ? TAG_TO_TYPE[tipoClasificacion] : null;
                                            const tipoLegible = tipoFromTagZendesk === 'question' ? 'Pregunta' : 'Incidente';
                                            // Convertir tag de guiones bajos a espacios (ej: Servicios_Internos -> Servicios Internos)
                                            const tagLegible = (tipoClasificacion || 'Otros').replace(/_/g, ' ');
                                            clasificacion = { 
                                                nombre_nivel_1: 'Zendesk', 
                                                nombre_nivel_2: tipoLegible, 
                                                nombre_nivel_3: tagLegible 
                                            };
                                            
                                        } else if (fractalCode && clasificarIncidencia && getFracttalService && getClasificacionFracttal) {
                                            // ========== RUTA FRACTTAL ==========
                                            console.log('[FLOW_COMPLETE] ========== PROCESANDO EN FRACTTAL ==========');
                                            
                                            try {
                                                // Obtener categorías de clasificación Fracttal
                                                console.log('[FLOW_COMPLETE] Paso 3: Obteniendo categorías de clasificación Fracttal...');
                                                const categoriasJson = await getClasificacionFracttal();
                                                console.log(`[FLOW_COMPLETE] Categorías obtenidas: ${categoriasJson.length} caracteres`);
                                                
                                                // Clasificar incidencia con Bedrock (3 niveles)
                                                console.log('[FLOW_COMPLETE] Paso 4: Clasificando incidencia con Bedrock (3 niveles)...');
                                                clasificacion = await clasificarIncidencia(incidencia, categoriasJson);
                                                console.log(`[FLOW_COMPLETE] Clasificación: Nivel1=${clasificacion.nombre_nivel_1}, Nivel2=${clasificacion.nombre_nivel_2}, Nivel3=${clasificacion.nombre_nivel_3}`);
                                                
                                                // Crear ticket en Fracttal
                                                console.log('[FLOW_COMPLETE] Paso 5: Creando ticket en Fracttal...');
                                                const fracttalCredentials = await getFracttalCredentials();
                                                const fracttalService = getFracttalService(fracttalCredentials);
                                                
                                                const fracttalResult = await fracttalService.createWorkRequest({
                                                    fractalCode: fractalCode,
                                                    descripcion: incidencia,
                                                    nombre: nombre,
                                                    email: email,
                                                    nivel1: clasificacion.nombre_nivel_1,
                                                    nivel2: clasificacion.nombre_nivel_2,
                                                    nivel3: clasificacion.nombre_nivel_3,
                                                    locatarioId: locatarioId,
                                                    urgente: urgencia === 'Urgente'
                                                });
                                                
                                                fracttalId = fracttalResult.fracttalId;
                                                console.log(`[FLOW_COMPLETE] Ticket Fracttal creado exitosamente. ID: ${fracttalId}`);
                                                
                                            } catch (fracttalError) {
                                                console.error('[FLOW_COMPLETE] Error en proceso Bedrock/Fracttal:', fracttalError);
                                                // Continuar sin Fracttal, solo enviar mensaje
                                            }
                                        } else {
                                            console.warn(`[FLOW_COMPLETE] Servicios no disponibles. destino=${destino}, fractalCode=${fractalCode}, servicios: clasificarTipo=${!!clasificarTipo}, zendesk=${!!crearTicketZendesk}, fracttal=${!!getFracttalService}`);
                                        }
                                        
                                        // Determinar el ID del ticket creado (Zendesk o Fracttal)
                                        const ticketId = zendeskId || fracttalId;
                                        const sistemaTicket = zendeskId ? 'Zendesk' : (fracttalId ? 'Fracttal' : null);
                                        
                                        // Construir categoría como path completo: "Nivel1 > Nivel2 > Nivel3"
                                        const categoriaCompleta = `${clasificacion.nombre_nivel_1} > ${clasificacion.nombre_nivel_2} > ${clasificacion.nombre_nivel_3}`;
                                        
                                        // Calcular campos adicionales para ETL a log_ticket
                                        let tipoTicket = 'Incidente'; // Default para Fracttal
                                        let grupoTicket = null;
                                        let userIdSistema = null;
                                        let subjectFormateado = null;
                                        
                                        if (destino === 'zendesk' && tipoClasificacion) {
                                            // Para Zendesk: calcular tipo y grupo
                                            const tipoFromTag = TAG_TO_TYPE ? TAG_TO_TYPE[tipoClasificacion] : null;
                                            tipoTicket = tipoFromTag === 'question' ? 'Pregunta' : 'Incidente';
                                            grupoTicket = getGroupName ? getGroupName() : 'SAC MUT';
                                            // Subject usa el tag con espacios
                                            const tagConEspacios = tipoClasificacion.replace(/_/g, ' ');
                                            subjectFormateado = `${tagConEspacios} | ${localNombre}`;
                                        } else if (destino === 'fracttal') {
                                            // Para Fracttal: siempre es incidente
                                            tipoTicket = 'Incidente';
                                            subjectFormateado = `Fracttal | ${localNombre}`;
                                        }
                                        
                                        // Buscar userId en PostgreSQL por email
                                        if (getUserIdByEmail && email) {
                                            try {
                                                userIdSistema = await getUserIdByEmail(email);
                                                console.log(`[FLOW_COMPLETE] userId del sistema: ${userIdSistema || 'no encontrado'}`);
                                            } catch (userIdErr) {
                                                console.error('[FLOW_COMPLETE] Error buscando userId:', userIdErr);
                                            }
                                        }
                                        
                                        // Paso 6: Guardar en DynamoDB (reemplaza PostgreSQL)
                                        if (createUserAndTicket) {
                                            try {
                                                console.log('[FLOW_COMPLETE] Paso 6: Guardando en DynamoDB...');
                                                
                                                const dynamoResult = await createUserAndTicket({
                                                    // Datos de usuario
                                                    userName: nombre,
                                                    userEmail: email,
                                                    userPhone: from,
                                                    localId: locatarioId,
                                                    localName: localNombre,
                                                    localNameDisplay: localNombreDisplay,
                                                    fractalCode: fractalCode,
                                                    numeroContrato: numeroContrato,
                                                    
                                                    // Datos de ticket
                                                    descripcion: incidencia,
                                                    urgencia: urgencia,
                                                    categoria: categoriaCompleta,
                                                    estado: ticketId ? 'Abierto' : 'Cancelado',
                                                    idFracttal: fracttalId || null,
                                                    idZendesk: zendeskId || null,
                                                    destino: destino,
                                                    typeclass: tipoClasificacion ? tipoClasificacion.replace(/_/g, ' ') : null,
                                                    sessionId: message?.id || null,
                                                    
                                                    // Nuevos campos para ETL a log_ticket
                                                    tipoTicket: tipoTicket,
                                                    grupoTicket: grupoTicket,
                                                    userIdSistema: userIdSistema,
                                                    subject: subjectFormateado,
                                                    locatarioId: locatarioId,
                                                    
                                                    // Campo para vincular con mut-conversations
                                                    incidenciaSessionId: incidenciaSessionId
                                                });
                                                
                                                console.log(`[FLOW_COMPLETE] Guardado en DynamoDB - Usuario: ${dynamoResult.usuarioId}, Ticket: ${dynamoResult.ticketId}`);
                                            } catch (dbError) {
                                                console.error('[FLOW_COMPLETE] Error guardando en DynamoDB:', dbError);
                                            }
                                        } else {
                                            console.warn('[FLOW_COMPLETE] Servicio DynamoDB no disponible, saltando guardado');
                                        }
                                        
                                        // Paso 7: Enviar mensaje de confirmación
                                        let agentResponse;
                                        if (ticketId) {
                                            agentResponse = `Gracias por reportar la incidencia. Se ha creado el ticket #${ticketId}.`;
                                        } else {
                                            agentResponse = `Gracias por reportar la incidencia. Hemos registrado tu reporte.`;
                                        }
                                        
                                        console.log(`[FLOW_COMPLETE] Enviando respuesta al usuario: ${agentResponse}`);
                                        console.log(`[FLOW_COMPLETE] ========== INCIDENCIA PROCESADA V3.0 (${sistemaTicket || 'Sin sistema'}) ==========`);

                                        await sendMessage(from, agentResponse);
                                        
                                        // Paso 8: Guardar log de incidencia en DynamoDB (mut-conversations)
                                        // Solo se guarda si se creó un ticket exitosamente
                                        if (ticketId) {
                                            try {
                                                const conversationService = new ConversationService();
                                                
                                                // Log completo de la incidencia para poder replicar la conversación
                                                const incidenciaLog = {
                                                    // Tipo de registro
                                                    type: 'incidencia_ticket',
                                                    
                                                    // ID de sesión para vincular con el registro inicial
                                                    incidenciaSessionId: incidenciaSessionId,
                                                    
                                                    // Identificadores del ticket
                                                    ticketId: ticketId,
                                                    idZendesk: zendeskId || null,
                                                    idFracttal: fracttalId || null,
                                                    sistema: sistemaTicket,  // 'Zendesk' o 'Fracttal'
                                                    destino: destino,
                                                    estado: 'Abierto',
                                                    
                                                    // Datos del usuario
                                                    usuario: {
                                                        nombre: nombre,
                                                        email: email,
                                                        telefono: from
                                                    },
                                                    
                                                    // Datos del local/contrato
                                                    local: {
                                                        nombre: localNombre,
                                                        numeroContrato: numeroContrato,
                                                        locatarioId: locatarioId,
                                                        fractalCode: fractalCode
                                                    },
                                                    
                                                    // Clasificación y contenido
                                                    ticket: {
                                                        descripcion: incidencia,
                                                        typeclass: tipoClasificacion ? tipoClasificacion.replace(/_/g, ' ') : null,
                                                        tipoTicket: tipoTicket,  // 'Pregunta' o 'Incidente'
                                                        categoria: categoriaCompleta,
                                                        urgencia: urgencia,
                                                        subject: subjectFormateado,
                                                        grupoTicket: grupoTicket
                                                    },
                                                    
                                                    // Respuesta del bot
                                                    respuestaBot: agentResponse,
                                                    
                                                    // Metadata
                                                    fechaCreacion: new Date().toISOString()
                                                };
                                                
                                                await conversationService.saveMessage(
                                                    from, 
                                                    `[INCIDENCIA] ${incidencia}`, 
                                                    agentResponse, 
                                                    message.id,
                                                    incidenciaLog,
                                                    'incidencias'
                                                );
                                                console.log('[FLOW_COMPLETE] Log de incidencia guardado en mut-conversations');
                                                
                                                // Eliminar sesión de incidencia de mut-incidencia-sessions
                                                // El próximo "hola" generará un nuevo ID
                                                if (deleteIncidenciaSession) {
                                                    await deleteIncidenciaSession(from);
                                                    console.log('[FLOW_COMPLETE] Sesión de incidencia eliminada de mut-incidencia-sessions');
                                                }
                                            } catch (dynamoErr) {
                                                console.error('[FLOW_COMPLETE] Error guardando log de incidencia:', dynamoErr);
                                            }
                                        } else {
                                            console.log('[FLOW_COMPLETE] No se guardó log en mut-conversations (ticket no creado)');
                                        }
                                    } catch (err) {
                                        console.error('[FLOW_COMPLETE] Error parseando response_json:', err);
                                        await sendMessage(from, 'Lo siento, hubo un error procesando tu reporte. Por favor intenta de nuevo más tarde.');
                                    }
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

        // Llamar directamente al agente
        const agentResponse = await getAgente(userId, userQuestion, 'test-message-id');

        return createResponse(200, {
            sessionId: userId,
            question: userQuestion,
            answer: agentResponse,
            timestamp: new Date().toISOString()
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

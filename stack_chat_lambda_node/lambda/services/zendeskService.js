/**
 * Servicio de Zendesk para la Lambda de WhatsApp
 * Maneja creación de usuarios y tickets en Zendesk
 * Credenciales leídas desde variables de entorno (.env)
 */
import logger from '../logger.js';

// ============================================================================
// CONFIGURACIÓN ZENDESK (desde variables de entorno)
// ============================================================================
let zendeskConfigLogged = false;

function getZendeskConfig() {
    const isProd = process.env.DEV_MODE !== 'true';
    
    const config = {
        remoteUri: process.env.ZENDESK_REMOTE_URI,
        username: process.env.ZENDESK_USERNAME,
        token: process.env.ZENDESK_TOKEN,
        
        // Grupos de Zendesk - selección basada en DEV_MODE
        group: isProd 
            ? { 
                id: parseInt(process.env.ZENDESK_GROUP_PROD_ID), 
                name: process.env.ZENDESK_GROUP_PROD_NAME
              }
            : { 
                id: parseInt(process.env.ZENDESK_GROUP_DEV_ID), 
                name: process.env.ZENDESK_GROUP_DEV_NAME
              },
        
        isProd
    };
    
    // Log solo una vez para no saturar los logs
    if (!zendeskConfigLogged) {
        logger.info(`[ZENDESK_CONFIG] DEV_MODE=${process.env.DEV_MODE}, isProd=${isProd}`);
        logger.info(`[ZENDESK_CONFIG] remoteUri: ${config.remoteUri || 'MISSING'}`);
        logger.info(`[ZENDESK_CONFIG] username: ${config.username || 'MISSING'}`);
        logger.info(`[ZENDESK_CONFIG] token: ${config.token ? config.token.substring(0, 5) + '...' : 'MISSING'}`);
        logger.info(`[ZENDESK_CONFIG] group: id=${config.group.id}, name=${config.group.name}`);
        zendeskConfigLogged = true;
    }
    
    return config;
}

// Tags por tipo de ticket (EXACTOS del portal de locatarios)
const TAGS_POR_TIPO = {
    question: ['Informacion_General'],
    incident: ['Reclamos', 'Denuncia_de_Objetos', 'Robo', 'Accidente', 'Servicios_Internos', 'Sugerencias']
};

// Mapeo de tag a tipo (question/incident)
const TAG_TO_TYPE = {
    'Informacion_General': 'question',
    'Reclamos': 'incident',
    'Denuncia_de_Objetos': 'incident',
    'Robo': 'incident',
    'Accidente': 'incident',
    'Servicios_Internos': 'incident',
    'Sugerencias': 'incident'
};

// ============================================================================
// UTILIDADES
// ============================================================================
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(email) {
    return String(email ?? '').trim().toLowerCase();
}

function isValidEmail(email) {
    return emailRegex.test(cleanEmail(email));
}

/**
 * Genera headers de autenticación para Zendesk API
 */
function getAuthHeaders() {
    const config = getZendeskConfig();
    const auth = Buffer.from(`${config.username}/token:${config.token}`).toString('base64');
    return {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Obtiene el ID del grupo según el ambiente (prod/dev)
 */
function getGroupId() {
    return getZendeskConfig().group.id;
}

/**
 * Obtiene el nombre del grupo según el ambiente
 */
function getGroupName() {
    return getZendeskConfig().group.name;
}

/**
 * Obtiene la URL base de Zendesk
 */
function getRemoteUri() {
    return getZendeskConfig().remoteUri;
}

// ============================================================================
// FUNCIONES DE USUARIO ZENDESK
// ============================================================================

/**
 * Busca un usuario en Zendesk por email
 * @param {string} email - Email del usuario
 * @returns {Promise<object|null>} Usuario encontrado o null
 */
async function findUserByEmail(email) {
    const clean = cleanEmail(email);
    if (!isValidEmail(clean)) return null;
    
    try {
        const url = `${getRemoteUri()}/users/search.json?query=email:${encodeURIComponent(clean)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            logger.error('[ZENDESK] Error buscando usuario:', response.status, response.statusText);
            return null;
        }
        
        const data = await response.json();
        
        if (data.users && data.users.length > 0) {
            logger.info('[ZENDESK] Usuario encontrado:', data.users[0].id);
            return data.users[0];
        }
        
        return null;
    } catch (error) {
        logger.error('[ZENDESK] Error en findUserByEmail:', error.message);
        return null;
    }
}

/**
 * Verifica si existe un usuario por email
 * @param {string} email - Email del usuario
 * @returns {Promise<boolean>} true si existe
 */
async function userExistsByEmail(email) {
    const user = await findUserByEmail(email);
    return Boolean(user?.id);
}

/**
 * Obtiene el ID de usuario por email
 * @param {string} email - Email del usuario
 * @returns {Promise<number|null>} ID del usuario o null
 */
async function getUserIdByEmail(email) {
    const user = await findUserByEmail(email);
    return user?.id ?? null;
}

/**
 * Crea un usuario end-user en Zendesk
 * @param {object} params - { email, nombre, apellido }
 * @returns {Promise<number>} ID del usuario creado
 */
async function createZendeskUser({ email, nombre, apellido = '' }) {
    const clean = cleanEmail(email);
    if (!isValidEmail(clean)) throw new Error('Email inválido');
    
    const name = [nombre, apellido].filter(Boolean).join(' ').trim() || clean;
    
    try {
        const url = `${getRemoteUri()}/users.json`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                user: {
                    name,
                    email: clean,
                    role: 'end-user'
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error('[ZENDESK] Error creando usuario:', response.status, errorText);
            throw new Error(`Error creando usuario: ${response.status}`);
        }
        
        const data = await response.json();
        const userId = data.user?.id;
        
        if (!userId) throw new Error('Zendesk no devolvió un id de usuario');
        
        logger.info('[ZENDESK] Usuario creado con ID:', userId);
        return userId;
    } catch (error) {
        logger.error('[ZENDESK] Error en createZendeskUser:', error.message);
        throw error;
    }
}

/**
 * Obtiene o crea un usuario en Zendesk
 * @param {object} params - { email, nombre, apellido }
 * @returns {Promise<number>} ID del usuario
 */
async function getOrCreateRequesterId({ email, nombre, apellido = '' }) {
    const clean = cleanEmail(email);
    if (!isValidEmail(clean)) throw new Error('Email inválido');
    
    const existingId = await getUserIdByEmail(clean);
    if (existingId) {
        logger.info('[ZENDESK] Usuario existente, ID:', existingId);
        return existingId;
    }
    
    return await createZendeskUser({ email: clean, nombre, apellido });
}

// ============================================================================
// FUNCIONES DE TICKETS ZENDESK
// ============================================================================

/**
 * Resuelve el tipo de ticket (question/incident) basado en typeclass
 * @param {string} typeclass - Tipo de clasificación
 * @returns {string} 'question' o 'incident'
 */
function resolveTipoFromTypeclass(typeclass) {
    // Usar el mapeo TAG_TO_TYPE para determinar el tipo
    return TAG_TO_TYPE[typeclass] || 'incident';
}

/**
 * Resuelve la prioridad basada en el tipo
 * @param {string} tipo - Tipo de ticket
 * @param {string} urgencia - Urgencia clasificada
 * @returns {string} 'low', 'normal', 'high' o 'urgent'
 */
function resolvePrioridad(tipo, urgencia) {
    if (urgencia === 'Urgente') return 'urgent';
    if (urgencia === 'Media') return 'high';
    if (tipo === 'incident') return 'normal';
    return 'low';
}

/**
 * Normaliza un tag (espacios → guion_bajo)
 * @param {string} tag - Tag a normalizar
 * @returns {string} Tag normalizado
 */
function normalizeTag(tag) {
    return String(tag ?? '').trim().replace(/\s+/g, '_');
}

/**
 * Construye el payload del ticket de Zendesk
 * Formato igual que el portal de locatarios:
 * - Subject: "{Tag} | {Nombre_Local}"
 * - Body: Solo la descripción de la incidencia
 * - Tags: Solo el tag normalizado (sin 'whatsapp' ni 'mut')
 * @param {object} params - Parámetros del ticket
 * @returns {object} Payload para crear ticket
 */
function buildTicketData({
    requesterId,
    subject,
    body,
    typeclass,
    urgencia = 'Normal',
    localNombre = ''
}) {
    if (!requesterId) throw new Error('requesterId requerido');
    
    const groupId = getGroupId();
    const tipo = resolveTipoFromTypeclass(typeclass);
    const priority = resolvePrioridad(tipo, urgencia);
    const normalizedTag = normalizeTag(typeclass);
    
    return {
        ticket: {
            type: tipo,
            priority,
            group_id: groupId,
            requester_id: requesterId,
            subject: subject,
            comment: {
                body: body
            },
            tags: [normalizedTag]  // Solo el tag, igual que el portal
        }
    };
}

/**
 * Crea un ticket en Zendesk
 * @param {object} ticketData - Payload del ticket
 * @returns {Promise<object>} Ticket creado
 */
async function createZendeskTicket(ticketData) {
    try {
        const url = `${getRemoteUri()}/tickets.json`;
        
        logger.info('[ZENDESK] Creando ticket:', JSON.stringify(ticketData, null, 2));
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(ticketData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error('[ZENDESK] Error creando ticket:', response.status, errorText);
            throw new Error(`Error creando ticket: ${response.status}`);
        }
        
        const data = await response.json();
        const ticketId = data.ticket?.id;
        
        logger.info('[ZENDESK] Ticket creado con ID:', ticketId);
        return data.ticket;
    } catch (error) {
        logger.error('[ZENDESK] Error en createZendeskTicket:', error.message);
        throw error;
    }
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Función principal para crear un ticket completo en Zendesk
 * Similar a zendeskTest en mut-agent-back
 * 
 * @param {object} params - Parámetros
 * @param {string} params.email - Email del usuario
 * @param {string} params.nombre - Nombre del usuario
 * @param {string} params.typeclass - Clasificación del tipo (reclamos, informacion, etc.)
 * @param {string} params.incidencia - Descripción de la incidencia
 * @param {string} params.urgencia - Nivel de urgencia
 * @param {string} params.localNombre - Nombre del local
 * @param {string} params.numeroContrato - Número de contrato (opcional)
 * @param {string} params.locatarioId - ID del locatario (opcional)
 * @returns {Promise<object>} { ok, ticketId, requesterId, groupName }
 */
async function crearTicketZendesk({
    email,
    nombre,
    typeclass,
    incidencia,
    urgencia = 'Normal',
    localNombre = '',
    numeroContrato = null,
    locatarioId = null
}) {
    logger.info('[ZENDESK] ========== CREANDO TICKET ZENDESK ==========');
    logger.info('[ZENDESK] Email:', email);
    logger.info('[ZENDESK] Nombre:', nombre);
    logger.info('[ZENDESK] Typeclass:', typeclass);
    logger.info('[ZENDESK] Urgencia:', urgencia);
    logger.info('[ZENDESK] Local:', localNombre);
    logger.info('[ZENDESK] Contrato:', numeroContrato);
    logger.info('[ZENDESK] Ambiente:', getZendeskConfig().isProd ? 'PRODUCCIÓN' : 'DESARROLLO');
    
    try {
        // 1) Obtener o crear usuario en Zendesk
        const requesterId = await getOrCreateRequesterId({ email, nombre });
        
        // 2) Construir subject: "{Tag} | {Nombre_Local}" (igual que portal)
        const subject = `${typeclass} | ${localNombre}`;
        
        // 3) Body: Solo la descripción de la incidencia (igual que portal)
        const body = incidencia;
        
        // 4) Construir payload
        const ticketData = buildTicketData({
            requesterId,
            subject,
            body,
            typeclass,
            urgencia,
            localNombre
        });
        
        // 5) Crear ticket
        const ticket = await createZendeskTicket(ticketData);
        
        logger.info('[ZENDESK] ========== TICKET CREADO EXITOSAMENTE ==========');
        logger.info('[ZENDESK] Ticket ID:', ticket.id);
        logger.info('[ZENDESK] Grupo:', getGroupName());
        
        return {
            ok: true,
            ticketId: ticket.id,
            requesterId,
            groupName: getGroupName(),
            numeroContrato,
            locatarioId
        };
        
    } catch (error) {
        logger.error('[ZENDESK] ========== ERROR CREANDO TICKET ==========');
        logger.error('[ZENDESK] Error:', error.message);
        
        return {
            ok: false,
            error: error.message
        };
    }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================
export {
    // Configuración
    getZendeskConfig,
    TAGS_POR_TIPO,
    TAG_TO_TYPE,
    getGroupId,
    getGroupName,
    getRemoteUri,
    
    // Usuarios
    findUserByEmail,
    userExistsByEmail,
    getUserIdByEmail,
    createZendeskUser,
    getOrCreateRequesterId,
    
    // Tickets
    resolveTipoFromTypeclass,
    resolvePrioridad,
    normalizeTag,
    buildTicketData,
    createZendeskTicket,
    
    // Función principal
    crearTicketZendesk
};

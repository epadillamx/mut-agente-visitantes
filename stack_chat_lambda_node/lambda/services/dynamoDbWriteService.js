/**
 * DynamoDB Write Service
 * Reemplaza las operaciones de escritura de PostgreSQL
 * Tablas: mut-whatsapp-usuarios, mut-whatsapp-tickets, mut-incidencia-sessions
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    DynamoDBDocumentClient, 
    PutCommand, 
    GetCommand, 
    UpdateCommand,
    QueryCommand,
    DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import logger from '../logger.js';

// Cliente DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

// Nombres de tablas desde variables de entorno
const USUARIOS_TABLE = process.env.WHATSAPP_USUARIOS_TABLE || 'mut-whatsapp-usuarios';
const TICKETS_TABLE = process.env.WHATSAPP_TICKETS_TABLE || 'mut-whatsapp-tickets';
const INCIDENCIA_SESSIONS_TABLE = process.env.INCIDENCIA_SESSIONS_TABLE || 'mut-incidencia-sessions';

// ============================================================================
// USUARIOS - Operaciones CRUD
// ============================================================================

/**
 * Obtener usuario por teléfono (phone es el PK)
 * @param {string} phone - Número de teléfono
 * @returns {Promise<object|null>} Usuario o null si no existe
 */
async function getUsuarioByPhone(phone) {
    try {
        const command = new GetCommand({
            TableName: USUARIOS_TABLE,
            Key: { phone }
        });
        
        const response = await docClient.send(command);
        
        if (response.Item) {
            logger.info(`[DYNAMODB] Usuario encontrado: ${phone}`);
            return response.Item;
        }
        
        logger.info(`[DYNAMODB] Usuario no encontrado: ${phone}`);
        return null;
    } catch (error) {
        logger.error('[DYNAMODB] Error obteniendo usuario:', error);
        throw error;
    }
}

/**
 * Crear o actualizar usuario
 * @param {object} userData - Datos del usuario
 * @returns {Promise<object>} Usuario creado/actualizado
 */
async function saveUsuario(userData) {
    const {
        phone,
        nombre,
        email,
        local_id,
        nombre_local,
        nombre_local_display,
        fractal_code,
        numero_contrato = null
    } = userData;
    
    if (!phone) {
        throw new Error('phone es requerido para guardar usuario');
    }
    
    const now = Date.now();
    
    try {
        // Verificar si el usuario existe
        const existingUser = await getUsuarioByPhone(phone);
        
        const item = {
            phone,
            nombre: nombre || existingUser?.nombre || '',
            email: email || existingUser?.email || '',
            local_id: local_id || existingUser?.local_id || '',
            nombre_local: nombre_local || existingUser?.nombre_local || '',
            nombre_local_display: nombre_local_display || existingUser?.nombre_local_display || nombre_local || '',
            fractal_code: fractal_code || existingUser?.fractal_code || '',
            numero_contrato: numero_contrato || existingUser?.numero_contrato || null,
            updated_at: now
        };
        
        // Si es nuevo usuario, agregar created_at
        if (!existingUser) {
            item.created_at = now;
            item.id = existingUser?.id || Math.floor(Math.random() * 1000000); // ID legacy para compatibilidad
        } else {
            item.created_at = existingUser.created_at;
            item.id = existingUser.id;
        }
        
        const command = new PutCommand({
            TableName: USUARIOS_TABLE,
            Item: item
        });
        
        await docClient.send(command);
        
        logger.info(`[DYNAMODB] Usuario ${existingUser ? 'actualizado' : 'creado'}: ${phone}`);
        return item;
        
    } catch (error) {
        logger.error('[DYNAMODB] Error guardando usuario:', error);
        throw error;
    }
}

/**
 * Actualizar solo los campos del local de un usuario existente
 * @param {string} phone - Número de teléfono del usuario
 * @param {object} localData - Datos del local a actualizar
 * @returns {Promise<object>} Usuario actualizado
 */
async function updateUsuarioLocal(phone, localData) {
    const {
        local_id,
        nombre_local,
        nombre_local_display,
        fractal_code,
        numero_contrato = null
    } = localData;
    
    if (!phone) {
        throw new Error('phone es requerido para actualizar local del usuario');
    }
    
    const now = Date.now();
    
    try {
        // Verificar que el usuario existe
        const existingUser = await getUsuarioByPhone(phone);
        
        if (!existingUser) {
            throw new Error(`Usuario no encontrado: ${phone}`);
        }
        
        // Actualizar solo los campos del local usando UpdateCommand
        const command = new UpdateCommand({
            TableName: USUARIOS_TABLE,
            Key: { phone },
            UpdateExpression: 'SET local_id = :local_id, nombre_local = :nombre_local, nombre_local_display = :nombre_local_display, fractal_code = :fractal_code, numero_contrato = :numero_contrato, updated_at = :updated_at',
            ExpressionAttributeValues: {
                ':local_id': local_id || '',
                ':nombre_local': nombre_local || '',
                ':nombre_local_display': nombre_local_display || nombre_local || '',
                ':fractal_code': fractal_code || '',
                ':numero_contrato': numero_contrato,
                ':updated_at': now
            },
            ReturnValues: 'ALL_NEW'
        });
        
        const result = await docClient.send(command);
        
        logger.info(`[DYNAMODB] Local actualizado para usuario ${phone}: ${nombre_local} (fractal_code: ${fractal_code})`);
        return result.Attributes;
        
    } catch (error) {
        logger.error('[DYNAMODB] Error actualizando local del usuario:', error);
        throw error;
    }
}

// ============================================================================
// TICKETS - Operaciones CRUD
// ============================================================================

/**
 * Crear un nuevo ticket
 * @param {object} ticketData - Datos del ticket
 * @returns {Promise<object>} Ticket creado con id
 */
async function saveTicket(ticketData) {
    const {
        phone,
        user_id = null,
        descripcion,
        urgencia = 'Normal',
        categoria,
        estado = 'Abierto',
        idfracttal = null,
        idzendesk = null,
        destino = null,  // 'zendesk' o 'fracttal'
        sessionid = null,
        typeclass = null,
        nombre = null,
        email = null,
        local_nombre = null,
        numero_contrato = null,
        fractal_code = null,
        // Nuevos campos para ETL a log_ticket
        tipo_ticket = null,       // "Pregunta" o "Incidente"
        grupo_ticket = null,      // "SAC MUT" o "test"
        user_id_sistema = null,   // UUID del usuario en tabla 'user' de PostgreSQL
        subject = null,           // Subject formateado: "{tag} | {localNombre}"
        locatario_id = null,      // ID del locatario
        // Campo para vincular ticket con conversaciones
        incidencia_session_id = null  // UUID de sesión en mut-conversations
    } = ticketData;
    
    if (!phone) {
        throw new Error('phone es requerido para guardar ticket');
    }
    
    const now = Date.now();
    const ticketId = randomUUID();
    
    // TTL: 90 días (3 meses) desde ahora (en segundos Unix para DynamoDB)
    const TTL_DAYS = 90;
    const ttl = Math.floor(now / 1000) + (TTL_DAYS * 24 * 60 * 60);
    
    // date_partition para GSI date-index (formato: "2025-12-17")
    const date_partition = new Date(now).toISOString().split('T')[0];
    
    // ticket_id unificado para GSI ticket-id-index
    // Guarda el ID como string sin prefijo (260, 12345, etc.)
    // Si no hay ID externo, no se incluye en el item (DynamoDB no permite NULL en índices)
    let ticket_id = null;
    if (idfracttal) {
        ticket_id = String(idfracttal);
    } else if (idzendesk) {
        ticket_id = String(idzendesk);
    }
    
    const item = {
        // Keys
        phone,
        created_at: now,
        
        // Partition key para GSI date-index
        date_partition,
        
        // Identificadores
        id: ticketId,
        user_id,
        sessionid,
        
        // Datos del ticket
        descripcion,
        urgencia,
        categoria,
        estado,
        typeclass,
        destino,
        
        // IDs externos (mantener para compatibilidad)
        idfracttal,
        idzendesk,
        
        // Datos del usuario (desnormalizados para consultas)
        nombre,
        email,
        local_nombre,
        numero_contrato,
        fractal_code,
        locatario_id,
        
        // Campos para ETL a log_ticket
        tipo_ticket,           // "Pregunta" o "Incidente"
        grupo_ticket,          // "SAC MUT" o "test"
        user_id_sistema,       // UUID del usuario en PostgreSQL
        subject,               // Subject formateado
        
        // Campo para vincular con conversaciones (mut-conversations)
        incidencia_session_id,
        
        // TTL para limpieza automática (20 días)
        ttl,
        
        // Timestamps
        updated_at: now,
        fecha_creacion: new Date(now).toISOString()
    };
    
    // Agregar ticket_id solo si existe (DynamoDB no permite NULL en índices GSI)
    if (ticket_id) {
        item.ticket_id = ticket_id;
    }
    
    try {
        const command = new PutCommand({
            TableName: TICKETS_TABLE,
            Item: item
        });
        
        await docClient.send(command);
        
        logger.info(`[DYNAMODB] Ticket creado: ${ticketId} para ${phone}`);
        logger.info(`[DYNAMODB] Destino: ${destino}, ID externo: ${destino === 'zendesk' ? idzendesk : idfracttal}`);
        
        return item;
        
    } catch (error) {
        logger.error('[DYNAMODB] Error guardando ticket:', error);
        throw error;
    }
}

/**
 * Obtener tickets por teléfono
 * @param {string} phone - Número de teléfono
 * @param {number} limit - Límite de resultados (default 10)
 * @returns {Promise<Array>} Lista de tickets
 */
async function getTicketsByPhone(phone, limit = 10) {
    try {
        const command = new QueryCommand({
            TableName: TICKETS_TABLE,
            KeyConditionExpression: 'phone = :phone',
            ExpressionAttributeValues: {
                ':phone': phone
            },
            ScanIndexForward: false, // Orden descendente por created_at
            Limit: limit
        });
        
        const response = await docClient.send(command);
        
        logger.info(`[DYNAMODB] Encontrados ${response.Items?.length || 0} tickets para ${phone}`);
        return response.Items || [];
        
    } catch (error) {
        logger.error('[DYNAMODB] Error obteniendo tickets:', error);
        throw error;
    }
}

/**
 * Obtener tickets por estado
 * @param {string} estado - Estado del ticket ('Abierto', 'Cerrado', etc.)
 * @param {number} limit - Límite de resultados
 * @returns {Promise<Array>} Lista de tickets
 */
async function getTicketsByEstado(estado, limit = 50) {
    try {
        const command = new QueryCommand({
            TableName: TICKETS_TABLE,
            IndexName: 'estado-index',
            KeyConditionExpression: 'estado = :estado',
            ExpressionAttributeValues: {
                ':estado': estado
            },
            ScanIndexForward: false,
            Limit: limit
        });
        
        const response = await docClient.send(command);
        
        logger.info(`[DYNAMODB] Encontrados ${response.Items?.length || 0} tickets con estado ${estado}`);
        return response.Items || [];
        
    } catch (error) {
        logger.error('[DYNAMODB] Error obteniendo tickets por estado:', error);
        throw error;
    }
}

/**
 * Actualizar estado de un ticket
 * @param {string} phone - Teléfono del usuario
 * @param {number} created_at - Timestamp de creación (sort key)
 * @param {string} nuevoEstado - Nuevo estado
 * @returns {Promise<object>} Ticket actualizado
 */
async function updateTicketEstado(phone, created_at, nuevoEstado) {
    try {
        const command = new UpdateCommand({
            TableName: TICKETS_TABLE,
            Key: { phone, created_at },
            UpdateExpression: 'SET estado = :estado, updated_at = :updated',
            ExpressionAttributeValues: {
                ':estado': nuevoEstado,
                ':updated': Date.now()
            },
            ReturnValues: 'ALL_NEW'
        });
        
        const response = await docClient.send(command);
        
        logger.info(`[DYNAMODB] Ticket actualizado a estado: ${nuevoEstado}`);
        return response.Attributes;
        
    } catch (error) {
        logger.error('[DYNAMODB] Error actualizando ticket:', error);
        throw error;
    }
}

// ============================================================================
// FUNCIÓN PRINCIPAL - Reemplaza createTicket de PostgreSQL
// ============================================================================

/**
 * Crear usuario y ticket en DynamoDB
 * Reemplaza la función createTicket de postgresService.js
 * 
 * @param {object} data - Datos del ticket y usuario
 * @returns {Promise<object>} { usuarioId, ticketId }
 */
async function createUserAndTicket(data) {
    const {
        // Datos de usuario
        userName,
        userEmail,
        userPhone,
        localId,
        localName,
        localNameDisplay = null,
        fractalCode,
        numeroContrato = null,
        
        // Datos de ticket
        descripcion,
        urgencia = 'Normal',
        categoria,
        estado = 'Abierto',
        idFracttal = null,
        idZendesk = null,
        destino = null,
        typeclass = null,
        sessionId = null,
        
        // Nuevos campos para ETL a log_ticket
        tipoTicket = null,        // "Pregunta" o "Incidente"
        grupoTicket = null,       // "SAC MUT" o "test"
        userIdSistema = null,     // UUID del usuario en PostgreSQL
        subject = null,           // Subject formateado
        locatarioId = null,       // ID del locatario
        
        // Campo para vincular con mut-conversations
        incidenciaSessionId = null  // UUID de la sesión de incidencia
    } = data;
    
    logger.info('[DYNAMODB] ========== GUARDANDO EN DYNAMODB ==========');
    logger.info(`[DYNAMODB] Phone: ${userPhone}`);
    logger.info(`[DYNAMODB] Destino: ${destino}`);
    
    try {
        // Guardar/actualizar usuario
        const usuario = await saveUsuario({
            phone: userPhone,
            nombre: userName,
            email: userEmail,
            local_id: localId,
            nombre_local: localName,
            nombre_local_display: localNameDisplay || localName,
            fractal_code: fractalCode,
            numero_contrato: numeroContrato
        });
        
        // 2. Crear ticket
        const ticket = await saveTicket({
            phone: userPhone,
            user_id: usuario.id,
            descripcion,
            urgencia,
            categoria,
            estado,
            idfracttal: idFracttal,
            idzendesk: idZendesk,
            destino,
            typeclass,
            sessionid: sessionId,
            nombre: userName,
            email: userEmail,
            local_nombre: localName,
            numero_contrato: numeroContrato,
            fractal_code: fractalCode,
            // Nuevos campos para ETL
            tipo_ticket: tipoTicket,
            grupo_ticket: grupoTicket,
            user_id_sistema: userIdSistema,
            subject: subject,
            locatario_id: locatarioId,
            // Campo para vincular con mut-conversations
            incidencia_session_id: incidenciaSessionId
        });
        
        logger.info('[DYNAMODB] ========== GUARDADO EXITOSO ==========');
        logger.info(`[DYNAMODB] Usuario ID: ${usuario.id}`);
        logger.info(`[DYNAMODB] Ticket ID: ${ticket.id}`);
        
        return {
            usuarioId: usuario.id,
            ticketId: ticket.id,
            usuario,
            ticket
        };
        
    } catch (error) {
        logger.error('[DYNAMODB] ========== ERROR GUARDANDO ==========');
        logger.error('[DYNAMODB] Error:', error);
        throw error;
    }
}

// ============================================================================
// SESIONES DE INCIDENCIA - Para vincular logs con tickets
// Sin TTL - se elimina manualmente cuando se crea el ticket
// ============================================================================

/**
 * Obtiene o crea una sesión de incidencia para el usuario
 * Si ya existe una sesión pendiente, la retorna
 * Si no existe, crea una nueva
 * @param {string} phone - Número de teléfono del usuario
 * @returns {Promise<string>} incidenciaSessionId
 */
async function getOrCreateIncidenciaSession(phone) {
    try {
        // Buscar sesión existente
        const getCommand = new GetCommand({
            TableName: INCIDENCIA_SESSIONS_TABLE,
            Key: { phone }
        });
        
        const result = await docClient.send(getCommand);
        
        if (result.Item) {
            logger.info(`[INCIDENCIA_SESSION] Reutilizando sesión existente para ${phone}: ${result.Item.incidencia_session_id}`);
            return result.Item.incidencia_session_id;
        }
        
        // Crear nueva sesión
        const incidenciaSessionId = randomUUID();
        const now = Date.now();
        
        const putCommand = new PutCommand({
            TableName: INCIDENCIA_SESSIONS_TABLE,
            Item: {
                phone,
                incidencia_session_id: incidenciaSessionId,
                created_at: now,
                created_at_iso: new Date(now).toISOString()
            }
        });
        
        await docClient.send(putCommand);
        logger.info(`[INCIDENCIA_SESSION] Nueva sesión creada para ${phone}: ${incidenciaSessionId}`);
        
        return incidenciaSessionId;
        
    } catch (error) {
        logger.error('[INCIDENCIA_SESSION] Error en getOrCreateIncidenciaSession:', error);
        // Fallback: generar UUID sin guardar
        return randomUUID();
    }
}

/**
 * Elimina la sesión de incidencia del usuario
 * Se llama cuando el usuario completa el formulario y crea un ticket
 * @param {string} phone - Número de teléfono del usuario
 */
async function deleteIncidenciaSession(phone) {
    try {
        const deleteCommand = new DeleteCommand({
            TableName: INCIDENCIA_SESSIONS_TABLE,
            Key: { phone }
        });
        
        await docClient.send(deleteCommand);
        logger.info(`[INCIDENCIA_SESSION] Sesión eliminada para ${phone}`);
        
    } catch (error) {
        logger.error('[INCIDENCIA_SESSION] Error eliminando sesión:', error);
        // No lanzar error, no es crítico
    }
}

/**
 * Obtiene la sesión de incidencia activa (si existe)
 * @param {string} phone - Número de teléfono del usuario
 * @returns {Promise<object|null>} Sesión o null
 */
async function getIncidenciaSession(phone) {
    try {
        const getCommand = new GetCommand({
            TableName: INCIDENCIA_SESSIONS_TABLE,
            Key: { phone }
        });
        
        const result = await docClient.send(getCommand);
        return result.Item || null;
        
    } catch (error) {
        logger.error('[INCIDENCIA_SESSION] Error obteniendo sesión:', error);
        return null;
    }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

export {
    // Usuarios
    getUsuarioByPhone,
    saveUsuario,
    updateUsuarioLocal,
    
    // Tickets
    saveTicket,
    getTicketsByPhone,
    getTicketsByEstado,
    updateTicketEstado,
    
    // Función principal (reemplaza createTicket de PostgreSQL)
    createUserAndTicket,
    
    // Sesiones de incidencia
    getOrCreateIncidenciaSession,
    deleteIncidenciaSession,
    getIncidenciaSession
};
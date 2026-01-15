const { Pool } = require('pg');
const { getPostgresConfig } = require('../utils/secrets');

let pool = null;

/**
 * Initialize PostgreSQL connection pool
 * @returns {Promise<Pool>} PostgreSQL pool
 */
async function getPool() {
    if (pool) {
        return pool;
    }

    try {
        const config = await getPostgresConfig();
        console.log(`[POSTGRES] Connecting to ${config.host}:${config.port}/${config.database}`);
        
        pool = new Pool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            // Connection pool settings optimized for Lambda
            max: 5,                    // Maximum connections
            idleTimeoutMillis: 30000,  // Close idle connections after 30s
            connectionTimeoutMillis: 10000, // Fail if can't connect in 10s
            // SSL configuration (disabled for local development)
            ssl: config.host !== 'localhost' ? { rejectUnauthorized: false } : false
        });

        // Test connection
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        console.log('[POSTGRES] Connection pool initialized successfully');
        return pool;
    } catch (error) {
        console.error('[POSTGRES] Failed to initialize connection pool:', error);
        throw error;
    }
}

/**
 * Check database connection status
 * @returns {Promise<object>} Connection status
 */
async function checkConnection() {
    try {
        const db = await getPool();
        const result = await db.query('SELECT NOW() as current_time, current_database() as database');
        return {
            status: 'ok',
            database: result.rows[0].database,
            serverTime: result.rows[0].current_time,
            message: 'PostgreSQL connection successful'
        };
    } catch (error) {
        console.error('[POSTGRES] Connection check failed:', error);
        return {
            status: 'error',
            message: error.message,
            code: error.code
        };
    }
}

/**
 * Search contratos by name (case insensitive LIKE)
 * Busca por el nombreComercial del CONTRATO (no del locatario)
 * @param {string} searchTerm - Search query
 * @param {number} limit - Maximum results (default: 10)
 * @returns {Promise<Array>} Array of matching contratos with id and title for WhatsApp dropdown
 */
async function searchLocatarios(searchTerm, limit = 10) {
    if (!searchTerm || searchTerm.length < 3) {
        return [];
    }

    try {
        const db = await getPool();
        
        // Query corregida: buscar por nombreComercial del CONTRATO
        // y mostrar el nombre del contrato con sufijo de tipo (Oficina/Local)
        // DISTINCT ON: evita duplicados cuando un fractal_code tiene múltiples contratos
        // Se queda con el contrato más reciente (ORDER BY created_at DESC)
        const query = `
            SELECT DISTINCT ON (ul."fracttalCode")
                c."nombreComercial" as nombre_contrato,
                c."numeroContrato" as numero_contrato,
                ul."fracttalCode" as fractal_code,
                l.id as locatario_id,
                l."nombreComercial" as nombre_locatario,
                ul."codigoLocal" as codigo_local,
                c."centroComercial" as centro_comercial,
                CASE
                    WHEN c."centroComercial" = 'OFICINAS' THEN 'Oficina'
                    ELSE 'Local'
                END AS tipo
            FROM contrato c
            INNER JOIN locatario l ON l.id = c."locatarioId"
            INNER JOIN unidad_locativa ul ON ul."codigoLocal" = c."unidadLocativaCodigoLocal"
            WHERE c."nombreComercial" ILIKE $1
                AND c.status = 1
                AND ul."fracttalCode" IS NOT NULL
                AND c."centroComercial" IN ('RETAIL', 'OFICINAS', 'RETAILNOVENTAS')
            ORDER BY ul."fracttalCode", c.created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [`%${searchTerm.trim()}%`, limit]);
        
        console.log(`[POSTGRES] searchLocatarios: Found ${result.rows.length} results for "${searchTerm}"`);
        console.log(`[POSTGRES] Raw results:`, JSON.stringify(result.rows, null, 2));
        
        // Transform to WhatsApp Flow format
        // ID format: locatarioId|fractalCode|codigoLocal|tipo|numeroContrato (usando | como separador)
        // Title: "NombreContrato - Tipo" para que el usuario pueda diferenciar
        return result.rows.map(row => ({
            id: `${row.locatario_id}|${row.fractal_code}|${row.codigo_local}|${row.tipo}|${row.numero_contrato}`,
            title: `${row.nombre_contrato} - ${row.tipo}`
        }));
    } catch (error) {
        console.error('[POSTGRES] Error searching locatarios:', error);
        throw error;
    }
}

/**
 * Get locatario by ID
 * @param {string} locatarioId - Locatario ID
 * @returns {Promise<object|null>} Locatario object or null
 */
async function getLocatarioById(locatarioId) {
    try {
        const db = await getPool();
        
        const query = `
            SELECT 
                l."nombreComercial" as nombre,
                ul."fracttalCode" as fractal_code,
                l.id as locatario_id,
                ul."codigoLocal" as codigo_local,
                CASE
                    WHEN c."centroComercial" = 'OFICINAS' THEN 'Oficina'
                    ELSE 'Local'
                END AS tipo
            FROM locatario l
            INNER JOIN contrato c ON l.id = c."locatarioId"
            INNER JOIN unidad_locativa ul ON ul."codigoLocal" = c."unidadLocativaCodigoLocal"
            WHERE l.id = $1
                AND c.status = 1
                AND ul."fracttalCode" IS NOT NULL
            LIMIT 1
        `;

        const result = await db.query(query, [locatarioId]);
        
        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: `${row.locatario_id}_${row.fractal_code}`,
            title: row.nombre,
            locatario_id: row.locatario_id,
            fractal_code: row.fractal_code,
            codigo_local: row.codigo_local,
            tipo: row.tipo
        };
    } catch (error) {
        console.error('[POSTGRES] Error getting locatario by ID:', error);
        throw error;
    }
}

/**
 * Check if user exists by phone
 * @param {string} phone - User phone number
 * @returns {Promise<object|null>} User object or null
 */
async function checkUserByPhone(phone) {
    try {
        const db = await getPool();
        
        const query = `
            SELECT u.id, u.nombre, u.email, u.nombre_local, u.local_id, u.fractal_code
            FROM whatsapp_usuarios u
            WHERE u.phone = $1
        `;

        const result = await db.query(query, [phone]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('[POSTGRES] Error checking user by phone:', error);
        throw error;
    }
}

/**
 * Create or update user and create ticket
 * Replicates logic from mut-agent-back createTicketDb
 * @param {object} ticketData - Ticket data
 * @returns {Promise<number>} Created ticket ID
 */
async function createTicket(ticketData) {
    const db = await getPool();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        let userId = ticketData.userId;

        // If new user, create first
        if (ticketData.isNewUser && !userId) {
            const insertUserQuery = `
                INSERT INTO whatsapp_usuarios (nombre, email, local_id, phone, nombre_local, fractal_code)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `;
            const userResult = await client.query(insertUserQuery, [
                ticketData.userName,
                ticketData.userEmail,
                ticketData.localId,
                ticketData.userPhone,
                ticketData.localName,
                ticketData.fractalCode
            ]);
            userId = userResult.rows[0].id;
            console.log(`[POSTGRES] Created new user with ID: ${userId}`);
        } else if (userId) {
            // Update existing user
            const updateUserQuery = `
                UPDATE whatsapp_usuarios 
                SET nombre=$1, email=$2, local_id=$3, phone=$4, nombre_local=$5, fractal_code=$6 
                WHERE id=$7
            `;
            await client.query(updateUserQuery, [
                ticketData.userName,
                ticketData.userEmail,
                ticketData.localId,
                ticketData.userPhone,
                ticketData.localName,
                ticketData.fractalCode,
                userId
            ]);
            console.log(`[POSTGRES] Updated user with ID: ${userId}`);
        }

        // Create ticket
        const insertTicketQuery = `
            INSERT INTO whatsapp_tickets (user_id, descripcion, urgencia, categoria, idfracttal, estado)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;
        const ticketResult = await client.query(insertTicketQuery, [
            userId,
            ticketData.descripcion,
            ticketData.urgencia || false,
            ticketData.categoria,
            ticketData.idFracttal || null,
            ticketData.estado || 'pendiente'
        ]);

        const ticketId = ticketResult.rows[0].id;
        console.log(`[POSTGRES] Created ticket with ID: ${ticketId}`);

        await client.query('COMMIT');
        return ticketId;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[POSTGRES] Error creating ticket:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Close the connection pool (for cleanup)
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('[POSTGRES] Connection pool closed');
    }
}

/**
 * Parse a compound local ID from WhatsApp Flow selection
 * ID format: locatarioId|fractalCode|codigoLocal|tipo|numeroContrato
 * @param {string} compoundId - The compound ID from dropdown selection
 * @returns {object} Parsed local info { locatarioId, fractalCode, codigoLocal, tipo, numeroContrato }
 */
function parseLocalId(compoundId) {
    if (!compoundId || compoundId === '0') {
        return null;
    }
    
    const parts = compoundId.split('|');
    if (parts.length < 4) {
        console.warn(`[POSTGRES] Invalid compound ID format: ${compoundId}`);
        return null;
    }
    
    return {
        locatarioId: parts[0],
        fractalCode: parts[1],
        codigoLocal: parts[2],
        tipo: parts[3],
        numeroContrato: parts[4] || null
    };
}

/**
 * Get contrato by numero de contrato
 * @param {string} numeroContrato - Numero de contrato
 * @returns {Promise<object|null>} Contrato info or null
 */
async function getContratoByNumero(numeroContrato) {
    try {
        const db = await getPool();
        
        const query = `
            SELECT 
                c."nombreComercial" as nombre_contrato,
                c."numeroContrato" as numero_contrato,
                l.id as locatario_id,
                ul."fracttalCode" as fractal_code,
                ul."codigoLocal" as codigo_local,
                CASE
                    WHEN c."centroComercial" = 'OFICINAS' THEN 'Oficina'
                    ELSE 'Local'
                END AS tipo
            FROM contrato c
            INNER JOIN locatario l ON l.id = c."locatarioId"
            INNER JOIN unidad_locativa ul ON ul."codigoLocal" = c."unidadLocativaCodigoLocal"
            WHERE c."numeroContrato" = $1
                AND c.status = 1
            LIMIT 1
        `;

        const result = await db.query(query, [numeroContrato]);
        
        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    } catch (error) {
        console.error('[POSTGRES] Error getting contrato by numero:', error);
        throw error;
    }
}

/**
 * Get all Fracttal classification categories (3 levels)
 * Returns JSON string for Bedrock classification
 * @returns {Promise<string>} JSON string with all categories
 */
async function getClasificacionFracttal() {
    try {
        const db = await getPool();
        
        const query = `
            WITH
                nivel_3 AS (
                    SELECT id, nombre, descripcion, "padreId"
                    FROM fracttal_clasificacion
                    WHERE nivel = 3 AND status = 1
                ),
                nivel_2 AS (
                    SELECT id, nombre, "padreId"
                    FROM fracttal_clasificacion
                    WHERE nivel = 2 AND status = 1
                ),
                nivel_1 AS (
                    SELECT id, nombre, "padreId"
                    FROM fracttal_clasificacion
                    WHERE nivel = 1 AND status = 1
                )
            SELECT
                n3.nombre AS nombre_nivel_3,
                n3.descripcion AS descripcion_nivel_3,
                n2.nombre AS nombre_nivel_2,
                n1.nombre AS nombre_nivel_1
            FROM
                nivel_3 n3
                INNER JOIN nivel_2 n2 ON n3."padreId" = n2.id
                INNER JOIN nivel_1 n1 ON n2."padreId" = n1.id
            ORDER BY
                n1.nombre, n2.nombre, n3.nombre
        `;

        const result = await db.query(query);
        
        console.log(`[POSTGRES] Loaded ${result.rows.length} Fracttal categories`);
        
        return JSON.stringify(result.rows);
    } catch (error) {
        console.error('[POSTGRES] Error getting Fracttal classification:', error);
        throw error;
    }
}

module.exports = {
    getPool,
    checkConnection,
    searchLocatarios,
    getLocatarioById,
    checkUserByPhone,
    createTicket,
    closePool,
    parseLocalId,
    getContratoByNumero,
    getClasificacionFracttal
};

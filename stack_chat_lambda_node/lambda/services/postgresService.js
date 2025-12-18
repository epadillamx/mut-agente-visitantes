/**
 * PostgreSQL service for the main Lambda
 * SOLO LECTURA - Las operaciones de escritura se hacen en DynamoDB
 * Ver: dynamoDbWriteService.js para operaciones de escritura
 */
import pg from 'pg';
import { getPostgresConfig } from '../secrets.js';
import logger from '../logger.js';

const { Pool } = pg;
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
        logger.info(`[POSTGRES] Connecting to ${config.host}:${config.port}/${config.database}`);
        
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
        
        logger.info('[POSTGRES] Connection pool initialized successfully');
        return pool;
    } catch (error) {
        logger.error('[POSTGRES] Failed to initialize connection pool:', error);
        throw error;
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
        logger.warn(`[POSTGRES] Invalid compound ID format: ${compoundId}`);
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
        logger.error('[POSTGRES] Error getting contrato by numero:', error);
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
        
        logger.info(`[POSTGRES] Loaded ${result.rows.length} Fracttal categories`);
        
        return JSON.stringify(result.rows);
    } catch (error) {
        logger.error('[POSTGRES] Error getting Fracttal classification:', error);
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
        logger.error('[POSTGRES] Error checking user by phone:', error);
        throw error;
    }
}

// ============================================================================
// NOTA: Las funciones de escritura (createTicket) fueron movidas a DynamoDB
// Ver: dynamoDbWriteService.js - createUserAndTicket()
// ============================================================================

/**
 * Get numeroContrato by fractal_code
 * Relación: whatsapp_usuarios.fractal_code → unidad_locativa.fracttalCode → contrato.numeroContrato
 * @param {string} fractalCode - Código Fracttal del usuario
 * @returns {Promise<object|null>} { numeroContrato, nombreComercial, locatarioId } or null
 */
async function getNumeroContratoByFractalCode(fractalCode) {
    try {
        if (!fractalCode) {
            logger.warn('[POSTGRES] fractalCode es null o vacío');
            return null;
        }
        
        const db = await getPool();
        
        const query = `
            SELECT 
                c."numeroContrato" as numero_contrato,
                c."nombreComercial" as nombre_comercial,
                c."locatarioId" as locatario_id,
                ul."codigoLocal" as codigo_local
            FROM unidad_locativa ul
            INNER JOIN contrato c ON c."unidadLocativaCodigoLocal" = ul."codigoLocal"
            WHERE ul."fracttalCode" = $1
                AND c.status = 1
            LIMIT 1
        `;

        const result = await db.query(query, [fractalCode]);
        
        if (result.rows.length === 0) {
            logger.info(`[POSTGRES] No se encontró contrato para fractalCode: ${fractalCode}`);
            return null;
        }

        logger.info(`[POSTGRES] Contrato encontrado: ${result.rows[0].numero_contrato}`);
        return result.rows[0];
    } catch (error) {
        logger.error('[POSTGRES] Error getting numeroContrato by fractalCode:', error);
        return null;
    }
}

/**
 * Get user ID from PostgreSQL 'user' table by email
 * This is for ETL sync to log_ticket table
 * @param {string} email - User email
 * @returns {Promise<string|null>} User UUID or null if not found
 */
async function getUserIdByEmail(email) {
    try {
        if (!email) {
            logger.warn('[POSTGRES] email es null o vacío para getUserIdByEmail');
            return null;
        }
        
        const db = await getPool();
        const emailNormalized = email.toLowerCase().trim();
        
        logger.info(`[POSTGRES] Buscando usuario por correo: ${emailNormalized}`);
        
        // NOTA: La columna en la tabla "user" es "correo", NO "email"
        const query = `
            SELECT id, nombre, correo
            FROM public."user"
            WHERE LOWER(correo) = $1
            LIMIT 1
        `;

        const result = await db.query(query, [emailNormalized]);
        
        logger.info(`[POSTGRES] Resultado query: ${result.rows.length} filas encontradas`);
        
        if (result.rows.length === 0) {
            logger.info(`[POSTGRES] No se encontró usuario para correo: ${emailNormalized}`);
            return null;
        }

        logger.info(`[POSTGRES] Usuario encontrado: id=${result.rows[0].id}, nombre=${result.rows[0].nombre}, correo=${result.rows[0].correo}`);
        return result.rows[0].id;
    } catch (error) {
        logger.error('[POSTGRES] Error getting userId by email:', error);
        return null;
    }
}

/**
 * Close the connection pool (for cleanup)
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('[POSTGRES] Connection pool closed');
    }
}

export {
    getPool,
    parseLocalId,
    getContratoByNumero,
    getNumeroContratoByFractalCode,
    getClasificacionFracttal,
    checkUserByPhone,
    getUserIdByEmail,
    closePool
};
// NOTA: createTicket fue removido - usar dynamoDbWriteService.createUserAndTicket()

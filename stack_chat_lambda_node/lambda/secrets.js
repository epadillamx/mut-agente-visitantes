import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import logger from './logger.js';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Cache for secrets to avoid repeated API calls
let cachedSecrets = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 300000; // 5 minutes

// ============================================================================
// MODO DE EJECUCIÓN: Se lee desde process.env.DEV_MODE
// true = desarrollo (usa .env para Fracttal)
// false = producción (usa secret para Fracttal)
// ============================================================================
function isDevMode() {
    return process.env.DEV_MODE === 'true';
}

/**
 * Fetches all credentials from AWS Secrets Manager
 * Uses in-memory cache to minimize API calls
 * In DEV_MODE, uses hardcoded development credentials for DB and Fracttal
 */
export async function getWhatsAppCredentials() {
    const now = Date.now();
    
    // Return cached secrets if still valid
    if (cachedSecrets && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL_MS)) {
        logger.debug('Using cached secrets');
        return cachedSecrets;
    }

    const secretArn = process.env.WHATSAPP_SECRET_ARN;
    
    if (!secretArn) {
        logger.error('WHATSAPP_SECRET_ARN environment variable not set');
        throw new Error('Secret ARN not configured');
    }

    try {
        logger.debug(`Fetching secrets from: ${secretArn}`);
        
        const command = new GetSecretValueCommand({
            SecretId: secretArn
        });

        const response = await client.send(command);
        
        if (!response.SecretString) {
            throw new Error('Secret value is empty');
        }

        const secrets = JSON.parse(response.SecretString);
        
        // Validate required WhatsApp fields
        if (!secrets.TOKEN_WHATSAPP || !secrets.ID_PHONE_WHATSAPP || !secrets.VERIFY_TOKEN_WHATSAPP) {
            throw new Error('Missing required WhatsApp secret fields');
        }

        // Cache the secrets - WhatsApp credentials always from secret 'main'
        const devMode = isDevMode();
        
        cachedSecrets = {
            // WhatsApp credentials (siempre del secret)
            TOKEN_WHATS: secrets.TOKEN_WHATSAPP,
            IPHONE_ID_WHATS: secrets.ID_PHONE_WHATSAPP,
            VERIFY_TOKEN: secrets.VERIFY_TOKEN_WHATSAPP,
            WHATSAPP_PRIVATE_KEY: secrets.WHATSAPP_PRIVATE_KEY || '',
            WHATSAPP_PRIVATE_KEY_PASSPHRASE: secrets.WHATSAPP_PRIVATE_KEY_PASSPHRASE || '',
            
            // PostgreSQL credentials - desde variables de entorno (.env)
            DB_HOST: process.env.DB_HOST,
            DB_PORT: process.env.DB_PORT,
            DB_USER: process.env.DB_USER,
            DB_PASSWORD: process.env.DB_PASSWORD,
            DB_NAME: process.env.DB_NAME,
            
            // Fracttal credentials - DEV: desde .env, PROD: desde secret
            // En PROD se usa FRACTTAL_USER_CODE_BOT (usuario bot dedicado)
            FRACTTAL_KEY: devMode ? process.env.FRACTTAL_KEY : secrets.FRACTTAL_KEY,
            FRACTTAL_SECRET: devMode ? process.env.FRACTTAL_SECRET : secrets.FRACTTAL_SECRET,
            FRACTTAL_USER_CODE: devMode ? process.env.FRACTTAL_USER_CODE : secrets.FRACTTAL_USER_CODE_BOT
        };
        cacheTimestamp = now;

        logger.info('Successfully fetched credentials from Secrets Manager');
        logger.info(`Using ${devMode ? 'DEVELOPMENT (.env)' : 'PRODUCTION (secret)'} credentials for Fracttal`);
        
        // Log para verificar credenciales (mostrando solo prefijos por seguridad)
        logger.info(`[CREDENTIALS] DEV_MODE=${devMode}`);
        logger.info(`[CREDENTIALS] FRACTTAL_KEY=${cachedSecrets.FRACTTAL_KEY ? cachedSecrets.FRACTTAL_KEY.substring(0, 5) + '...' : 'MISSING'}`);
        logger.info(`[CREDENTIALS] FRACTTAL_SECRET=${cachedSecrets.FRACTTAL_SECRET ? cachedSecrets.FRACTTAL_SECRET.substring(0, 5) + '...' : 'MISSING'}`);
        logger.info(`[CREDENTIALS] FRACTTAL_USER_CODE=${cachedSecrets.FRACTTAL_USER_CODE || 'MISSING'}`);
        logger.info(`[CREDENTIALS] DB_HOST=${cachedSecrets.DB_HOST || 'MISSING'}`);
        logger.info(`[CREDENTIALS] DB_USER=${cachedSecrets.DB_USER || 'MISSING'}`);
        
        return cachedSecrets;

    } catch (error) {
        logger.error('Error fetching secrets from Secrets Manager:', error);
        throw error;
    }
}

/**
 * Get all credentials (wrapper for getWhatsAppCredentials)
 * @returns {Promise<object>} All credentials
 */
export async function getAllCredentials() {
    return getWhatsAppCredentials();
}

/**
 * Get PostgreSQL connection config
 * @returns {Promise<object>} PostgreSQL config
 */
export async function getPostgresConfig() {
    const creds = await getAllCredentials();
    return {
        host: creds.DB_HOST,
        port: creds.DB_PORT,
        user: creds.DB_USER,
        password: creds.DB_PASSWORD,
        database: creds.DB_NAME
    };
}

/**
 * Get Fracttal credentials
 * @returns {Promise<object>} Fracttal credentials
 */
export async function getFracttalCredentials() {
    const creds = await getAllCredentials();
    return {
        fracttalKey: creds.FRACTTAL_KEY,
        fracttalSecret: creds.FRACTTAL_SECRET,
        fracttalUserCode: creds.FRACTTAL_USER_CODE
    };
}

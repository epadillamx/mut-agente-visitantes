import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import logger from './logger.js';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Cache for secrets to avoid repeated API calls
let cachedSecrets = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 300000; // 5 minutes

// ============================================================================
// DESARROLLO: Credenciales hardcodeadas para desarrollo local
// En producción, estas se obtienen del secret 'main'
// ============================================================================
const DEV_MODE = process.env.NODE_ENV === 'development' || process.env.USE_DEV_CREDENTIALS === 'true';

const DEV_CREDENTIALS = {
    // PostgreSQL - PRODUCCIÓN (solo lectura desde analytics)
    DB_HOST: 'analitycs-public.csv0o86qyhsj.us-east-1.rds.amazonaws.com',
    DB_PORT: 5432,
    DB_USER: 'administrator',
    DB_PASSWORD: '4]EdCEx?h6254l1fBeQ6B.jHLwVl',
    DB_NAME: 'sisgest',
    
    // Fracttal - QA/Desarrollo (hardcodeadas - NO CAMBIAR)
    FRACTTAL_KEY: 'OKRXgjm4z1WO9aew3f',
    FRACTTAL_SECRET: 'gASgcVFirbc4uN5wANdkjAsgVkaQ5Kly',
    FRACTTAL_USER_CODE: 'FD1'
};

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
        cachedSecrets = {
            // WhatsApp credentials (siempre del secret)
            TOKEN_WHATS: secrets.TOKEN_WHATSAPP,
            IPHONE_ID_WHATS: secrets.ID_PHONE_WHATSAPP,
            VERIFY_TOKEN: secrets.VERIFY_TOKEN_WHATSAPP,
            WHATSAPP_PRIVATE_KEY: secrets.WHATSAPP_PRIVATE_KEY || '',
            WHATSAPP_PRIVATE_KEY_PASSPHRASE: secrets.WHATSAPP_PRIVATE_KEY_PASSPHRASE || '',
            
            // PostgreSQL credentials - DEV: hardcoded, PROD: from secret
            DB_HOST: DEV_MODE ? DEV_CREDENTIALS.DB_HOST : secrets.host,
            DB_PORT: DEV_MODE ? DEV_CREDENTIALS.DB_PORT : secrets.port,
            DB_USER: DEV_MODE ? DEV_CREDENTIALS.DB_USER : secrets.username,
            DB_PASSWORD: DEV_MODE ? DEV_CREDENTIALS.DB_PASSWORD : secrets.password,
            DB_NAME: DEV_MODE ? DEV_CREDENTIALS.DB_NAME : secrets.dbname,
            
            // Fracttal credentials - DEV: hardcoded, PROD: from secret
            FRACTTAL_KEY: DEV_MODE ? DEV_CREDENTIALS.FRACTTAL_KEY : secrets.FRACTTAL_KEY,
            FRACTTAL_SECRET: DEV_MODE ? DEV_CREDENTIALS.FRACTTAL_SECRET : secrets.FRACTTAL_SECRET,
            FRACTTAL_USER_CODE: DEV_MODE ? DEV_CREDENTIALS.FRACTTAL_USER_CODE : secrets.FRACTTAL_USER_CODE
        };
        cacheTimestamp = now;

        logger.info('Successfully fetched credentials from Secrets Manager');
        logger.info(`Using ${DEV_MODE ? 'DEVELOPMENT' : 'PRODUCTION'} credentials for DB and Fracttal`);
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

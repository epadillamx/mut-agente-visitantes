const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

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
    // PostgreSQL - QA (en línea)
    DB_HOST: 'qa.csv0o86qyhsj.us-east-1.rds.amazonaws.com',
    DB_PORT: 5432,
    DB_USER: 'administrator',
    DB_PASSWORD: 'g1*E0wt%h4J7b9Oh',
    DB_NAME: 'sisgestqa',
    
    // Fracttal - Desarrollo/QA
    FRACTTAL_KEY: 'OKRXgjm4z1WO9aew3f',
    FRACTTAL_SECRET: 'gASgcVFirbc4uN5wANdkjAsgVkaQ5Kly',
    FRACTTAL_USER_CODE: 'FD1'
};

// ============================================================================
// PRODUCCIÓN: Credenciales del secret 'main' (comentadas para referencia)
// ============================================================================
// DB_HOST: 'rds-sisgest-mut-migration-14.csv0o86qyhsj.us-east-1.rds.amazonaws.com'
// DB_PORT: 5432
// DB_USER: 'administrator'
// DB_PASSWORD: '4]EdCEx?h6254l1fBeQ6B.jHLwVl'
// DB_NAME: 'sisgest'
// FRACTTAL_KEY: 'aRTAhwUuyNp9qbFBPc'
// FRACTTAL_SECRET: 'ub5TVkRQ3974O0PYRhb4C4fMgzHAaihW'
// FRACTTAL_USER_CODE: 'AGENTE-PORTAL-LOCATARIOS'
// ============================================================================

/**
 * Fetches all credentials from AWS Secrets Manager (secret 'main')
 * Uses in-memory cache to minimize API calls
 * In DEV_MODE, uses hardcoded development credentials for DB and Fracttal
 * In LOCAL_MODE (no WHATSAPP_SECRET_ARN), uses all hardcoded credentials
 */
async function getWhatsAppCredentials() {
    const now = Date.now();
    
    // Return cached secrets if still valid
    if (cachedSecrets && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL_MS)) {
        console.log('[SECRETS] Using cached secrets');
        return cachedSecrets;
    }

    const secretArn = process.env.WHATSAPP_SECRET_ARN;
    
    // LOCAL MODE: No secret ARN, use all hardcoded credentials
    if (!secretArn) {
        console.log('[SECRETS] LOCAL MODE: No WHATSAPP_SECRET_ARN, using hardcoded credentials');
        
        cachedSecrets = {
            // WhatsApp credentials (mock for local testing)
            TOKEN_WHATS: 'local_mock_token',
            IPHONE_ID_WHATS: 'local_mock_phone_id',
            VERIFY_TOKEN: 'local_mock_verify_token',
            WHATSAPP_PRIVATE_KEY: '',
            WHATSAPP_PRIVATE_KEY_PASSPHRASE: '',
            
            // PostgreSQL credentials - Development
            DB_HOST: DEV_CREDENTIALS.DB_HOST,
            DB_PORT: DEV_CREDENTIALS.DB_PORT,
            DB_USER: DEV_CREDENTIALS.DB_USER,
            DB_PASSWORD: DEV_CREDENTIALS.DB_PASSWORD,
            DB_NAME: DEV_CREDENTIALS.DB_NAME,
            
            // Fracttal credentials - Development
            FRACTTAL_KEY: DEV_CREDENTIALS.FRACTTAL_KEY,
            FRACTTAL_SECRET: DEV_CREDENTIALS.FRACTTAL_SECRET,
            FRACTTAL_USER_CODE: DEV_CREDENTIALS.FRACTTAL_USER_CODE,
            
            // Zendesk credentials (empty for local)
            ZENDESK_USERNAME: '',
            ZENDESK_TOKEN: '',
            ZENDESK_REMOTE_URI: '',
            
            // Bedrock credentials (empty for local)
            BEDROCK_ACCESS_KEY: '',
            BEDROCK_SECRET_KEY: ''
        };
        cacheTimestamp = now;
        
        console.log('[SECRETS] Using LOCAL DEVELOPMENT credentials');
        return cachedSecrets;
    }

    try {
        console.log(`[SECRETS] Fetching secrets from: ${secretArn}`);
        console.log(`[SECRETS] DEV_MODE: ${DEV_MODE}`);
        
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
            FRACTTAL_USER_CODE: DEV_MODE ? DEV_CREDENTIALS.FRACTTAL_USER_CODE : secrets.FRACTTAL_USER_CODE,
            
            // Zendesk credentials (siempre del secret)
            ZENDESK_USERNAME: secrets.ZENDESK_USERNAME || '',
            ZENDESK_TOKEN: secrets.ZENDESK_TOKEN || '',
            ZENDESK_REMOTE_URI: secrets.ZENDESK_REMOTE_URI || '',
            
            // Bedrock credentials (siempre del secret)
            BEDROCK_ACCESS_KEY: secrets.BEDROCK_ACCESS_KEY || '',
            BEDROCK_SECRET_KEY: secrets.BEDROCK_SECRET_KEY || ''
        };
        cacheTimestamp = now;

        console.log('[SECRETS] Successfully fetched credentials from Secrets Manager');
        console.log(`[SECRETS] Using ${DEV_MODE ? 'DEVELOPMENT' : 'PRODUCTION'} credentials for DB and Fracttal`);
        return cachedSecrets;

    } catch (error) {
        console.error('[SECRETS] Error fetching secrets from Secrets Manager:', error);
        throw error;
    }
}

/**
 * Get all credentials (wrapper for getWhatsAppCredentials)
 * @returns {Promise<object>} All credentials
 */
async function getAllCredentials() {
    return getWhatsAppCredentials();
}

/**
 * Get PostgreSQL connection config
 * @returns {Promise<object>} PostgreSQL config
 */
async function getPostgresConfig() {
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
async function getFracttalCredentials() {
    const creds = await getAllCredentials();
    return {
        key: creds.FRACTTAL_KEY,
        secret: creds.FRACTTAL_SECRET,
        userCode: creds.FRACTTAL_USER_CODE
    };
}

/**
 * Get Zendesk credentials
 * @returns {Promise<object>} Zendesk credentials
 */
async function getZendeskCredentials() {
    const creds = await getAllCredentials();
    return {
        username: creds.ZENDESK_USERNAME,
        token: creds.ZENDESK_TOKEN,
        remoteUri: creds.ZENDESK_REMOTE_URI
    };
}

module.exports = { 
    getWhatsAppCredentials, 
    getAllCredentials,
    getPostgresConfig,
    getFracttalCredentials,
    getZendeskCredentials
};

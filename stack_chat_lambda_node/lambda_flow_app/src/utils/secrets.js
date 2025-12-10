const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Cache for secrets to avoid repeated API calls
let cachedSecrets = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Fetches WhatsApp credentials from AWS Secrets Manager
 * Uses in-memory cache to minimize API calls
 */
async function getWhatsAppCredentials() {
    const now = Date.now();
    
    // Return cached secrets if still valid
    if (cachedSecrets && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL_MS)) {
        console.log('[SECRETS] Using cached secrets');
        return cachedSecrets;
    }

    const secretArn = process.env.WHATSAPP_SECRET_ARN;
    
    if (!secretArn) {
        console.error('[SECRETS] WHATSAPP_SECRET_ARN environment variable not set');
        throw new Error('Secret ARN not configured');
    }

    try {
        console.log(`[SECRETS] Fetching secrets from: ${secretArn}`);
        
        const command = new GetSecretValueCommand({
            SecretId: secretArn
        });

        const response = await client.send(command);
        
        if (!response.SecretString) {
            throw new Error('Secret value is empty');
        }

        const secrets = JSON.parse(response.SecretString);
        
        // Validate required fields - including WHATSAPP_PRIVATE_KEY
        if (!secrets.TOKEN_WHATSAPP || !secrets.ID_PHONE_WHATSAPP || !secrets.VERIFY_TOKEN_WHATSAPP) {
            throw new Error('Missing required secret fields');
        }

        // Cache the secrets
        cachedSecrets = {
            TOKEN_WHATS: secrets.TOKEN_WHATSAPP,
            IPHONE_ID_WHATS: secrets.ID_PHONE_WHATSAPP,
            VERIFY_TOKEN: secrets.VERIFY_TOKEN_WHATSAPP,
            WHATSAPP_PRIVATE_KEY: secrets.WHATSAPP_PRIVATE_KEY || '',
            WHATSAPP_PRIVATE_KEY_PASSPHRASE: secrets.WHATSAPP_PRIVATE_KEY_PASSPHRASE || ''
        };
        cacheTimestamp = now;

        console.log('[SECRETS] Successfully fetched WhatsApp credentials from Secrets Manager');
        return cachedSecrets;

    } catch (error) {
        console.error('[SECRETS] Error fetching secrets from Secrets Manager:', error);
        throw error;
    }
}

module.exports = { getWhatsAppCredentials };

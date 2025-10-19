const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

// Cache para parámetros
const parameterCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene un parámetro de SSM Parameter Store con cache
 * @param {string} parameterName - Nombre completo del parámetro (ej: /whatsapp/bedrock-agent/token)
 * @param {boolean} withDecryption - Si debe desencriptar (true para SecureString)
 * @returns {Promise<string>} - Valor del parámetro
 */
async function getParameter(parameterName, withDecryption = true) {
    // Verificar cache
    const cacheKey = `${parameterName}_${withDecryption}`;
    const cached = parameterCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`✅ Parámetro obtenido de cache: ${parameterName}`);
        return cached.value;
    }

    try {
        const region = process.env.AWS_REGION || 'us-east-1';
        const client = new SSMClient({ region });

        console.log(`🔍 Obteniendo parámetro de SSM: ${parameterName}`);

        const command = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: withDecryption
        });

        const response = await client.send(command);
        const value = response.Parameter?.Value || '';

        // Guardar en cache
        parameterCache.set(cacheKey, {
            value: value,
            timestamp: Date.now()
        });

        console.log(`✅ Parámetro obtenido: ${parameterName} (${value.length} caracteres)`);
        return value;

    } catch (error) {
        console.error(`❌ Error obteniendo parámetro ${parameterName}:`, error);

        if (error.name === 'ParameterNotFound') {
            console.error(`⚠️ Parámetro no encontrado: ${parameterName}`);
            console.error(`💡 Crear con: aws ssm put-parameter --name "${parameterName}" --value "YOUR_VALUE" --type SecureString`);
        } else if (error.name === 'AccessDeniedException') {
            console.error(`🔒 Sin permisos para acceder al parámetro: ${parameterName}`);
            console.error(`💡 Verificar permisos IAM del Lambda: ssm:GetParameter`);
        }

        throw error;
    }
}

/**
 * Obtiene múltiples parámetros de una vez
 * @param {string[]} parameterNames - Array de nombres de parámetros
 * @param {boolean} withDecryption - Si debe desencriptar
 * @returns {Promise<Object>} - Objeto con los parámetros {nombre: valor}
 */
async function getParameters(parameterNames, withDecryption = true) {
    const results = {};
    
    for (const paramName of parameterNames) {
        try {
            results[paramName] = await getParameter(paramName, withDecryption);
        } catch (error) {
            console.error(`❌ Error obteniendo parámetro ${paramName}:`, error.message);
            results[paramName] = null;
        }
    }
    
    return results;
}

/**
 * Obtiene las credenciales de WhatsApp desde Parameter Store
 * @returns {Promise<Object>} - Objeto con las credenciales
 */
async function getWhatsAppCredentials() {
    try {
        const tokenPath = process.env.PARAM_TOKEN_WHATS || '/whatsapp/bedrock-agent/token';
        const phoneIdPath = process.env.PARAM_IPHONE_ID || '/whatsapp/bedrock-agent/phone-id';
        const verifyTokenPath = process.env.PARAM_VERIFY_TOKEN || '/whatsapp/bedrock-agent/verify-token';

        console.log('🔐 Obteniendo credenciales de WhatsApp desde SSM Parameter Store...');

        const credentials = await getParameters([tokenPath, phoneIdPath, verifyTokenPath]);

        return {
            token: credentials[tokenPath],
            phoneId: credentials[phoneIdPath],
            verifyToken: credentials[verifyTokenPath]
        };

    } catch (error) {
        console.error('❌ Error obteniendo credenciales de WhatsApp:', error);
        throw error;
    }
}

/**
 * Limpia el cache de parámetros
 */
function clearCache() {
    parameterCache.clear();
    console.log('🗑️ Cache de parámetros limpiado');
}

module.exports = {
    getParameter,
    getParameters,
    getWhatsAppCredentials,
    clearCache
};

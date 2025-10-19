
const { getWhatsAppCredentials } = require('./ssmHelper');

// Cache de credenciales
let credentialsCache = null;

/**
 * Obtiene las credenciales de WhatsApp (con cache)
 */
async function getCredentials() {
    if (!credentialsCache) {
        credentialsCache = await getWhatsAppCredentials();
    }
    return credentialsCache;
}

async function MarkStatusMessage(message_id) {
    try {
        const credentials = await getCredentials();

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Authorization", `Bearer ${credentials.token}`);

        const raw = JSON.stringify({
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        // Usar await para esperar la respuesta
        const response = await fetch(`https://graph.facebook.com/v22.0/${credentials.phoneId}/messages`, requestOptions);

        // Verificar si la respuesta fue exitosa
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Parsear la respuesta como JSON
        const result = await response.json();

        return {
            success: true,
            data: result,
            messageId: message_id
        };

    } catch (error) {
        console.error('❌ Error marcando mensaje como leído:', error);

        return {
            success: false,
            error: error.message,
            messageId: message_id
        };
    }
}


async function sendMessage(phone, userMessage) {
    try {
        const credentials = await getCredentials();

        console.log(`===================RESPUESTA==================`);
        console.log(`RESPUESTA ${phone}:`, userMessage);

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Authorization", `Bearer ${credentials.token}`);

        const raw = JSON.stringify({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {
                "preview_url": false,
                "body": userMessage
            }
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        // Usar await para esperar la respuesta
        const response = await fetch(`https://graph.facebook.com/v22.0/${credentials.phoneId}/messages`, requestOptions);

        // Verificar si la respuesta fue exitosa
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Parsear la respuesta como JSON
        const result = await response.json();

        return {
            success: true,
            data: result,
            messageId: result.messages?.[0]?.id,
            phone: phone,
            message: userMessage
        };

    } catch (error) {
        console.error('❌ Error enviando mensaje:', error);

        return {
            success: false,
            error: error.message,
            phone: phone,
            message: userMessage
        };
    }
}

module.exports = { sendMessage, MarkStatusMessage };
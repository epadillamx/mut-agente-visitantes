import logger from './logger.js';
import { getWhatsAppCredentials } from './secrets.js';

/**
 * Obtiene las credenciales de WhatsApp desde Secrets Manager
 */
async function getCredentials() {
    const secrets = await getWhatsAppCredentials();
    return {
        token: secrets.TOKEN_WHATS,
        phoneId: secrets.IPHONE_ID_WHATS
    };
}

async function MarkStatusMessage(message_id_sent) {
    try {

        const credentials = await getCredentials();

        const response = await fetch(
            `https://graph.facebook.com/v22.0/${credentials.phoneId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${credentials.token}`
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    status: "read",
                    message_id: message_id_sent
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const result = await response.json();

        return {
            success: true,
            data: result,
            messageId: message_id_sent
        };

    } catch (error) {
        logger.error('Error marcando mensaje como leído:', error);

        return {
            success: false,
            error: error.message,
            messageId: message_id_sent
        };
    }
}


async function sendMessage(phone, userMessage) {
    try {
        const credentials = await getCredentials();
        logger.debug('Enviando mensaje a WhatsApp');



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
        logger.error('Error enviando mensaje:', error);

        return {
            success: false,
            error: error.message,
            phone: phone,
            message: userMessage
        };
    }
}

export { sendMessage, MarkStatusMessage };
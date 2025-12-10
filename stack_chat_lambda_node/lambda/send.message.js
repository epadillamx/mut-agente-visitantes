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

/**
 * Envía un WhatsApp Flow a un usuario
 * @param {string} phone - Número de teléfono del destinatario (formato: 521234567890)
 * @param {string} flowId - ID del Flow (default: 660310043715044)
 * @param {string} flowCta - Texto del botón de llamada a la acción (default: "Reportar Incidencia")
 * @param {object} flowData - Datos opcionales para pre-llenar el flow
 * @returns {Promise<object>} Resultado del envío
 */
async function sendFlow(phone, flowId = '660310043715044', flowCta = 'Reportar Incidencia', flowData = {}) {
    try {
        const credentials = await getCredentials();
        logger.debug(`Enviando WhatsApp Flow ${flowId} a ${phone}`);

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Authorization", `Bearer ${credentials.token}`);

        const flowMessage = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": {
                "type": "flow",
                "header": {
                    "type": "text",
                    "text": "Sistema de Incidencias"
                },
                "body": {
                    "text": "Por favor completa el siguiente formulario para reportar tu incidencia."
                },
                "footer": {
                    "text": "Powered by WhatsApp Flow"
                },
                "action": {
                    "name": "flow",
                    "parameters": {
                        "flow_message_version": "3",
                        "flow_token": `flow_token_${Date.now()}`,
                        "flow_id": flowId,
                        "flow_cta": flowCta,
                        "flow_action": "navigate",
                        "flow_action_payload": {
                            "screen": "INCIDENT_FORM"
                        }
                    }
                }
            }
        };

        // Solo agregar data si hay datos para enviar
        if (flowData && Object.keys(flowData).length > 0) {
            flowMessage.interactive.action.parameters.flow_action_payload.data = flowData;
        }

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: JSON.stringify(flowMessage),
            redirect: "follow"
        };

        const response = await fetch(
            `https://graph.facebook.com/v22.0/${credentials.phoneId}/messages`,
            requestOptions
        );

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const result = await response.json();
        logger.success(`Flow enviado exitosamente a ${phone}`);

        return {
            success: true,
            data: result,
            messageId: result.messages?.[0]?.id,
            phone: phone,
            flowId: flowId
        };

    } catch (error) {
        logger.error('Error enviando Flow:', error);

        return {
            success: false,
            error: error.message,
            phone: phone,
            flowId: flowId
        };
    }
}

export { sendMessage, MarkStatusMessage, sendFlow };
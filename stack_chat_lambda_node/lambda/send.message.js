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
 * Usa flow_action: "data_exchange" para que WhatsApp llame al endpoint /flow con INIT
 * El flowController decidirá a qué pantalla enviar basándose en los datos del flow_token
 * 
 * @param {string} phone - Número de teléfono del destinatario (formato: 521234567890)
 * @param {string} flowId - ID del Flow (default: 660310043715044)
 * @param {string} flowCta - Texto del botón de llamada a la acción (default: "Reportar Incidencia")
 * @param {string} screen - Pantalla inicial del flow (ignorado, se decide en INIT)
 * @param {object} initData - Datos del usuario para pre-llenar el flow
 * @returns {Promise<object>} Resultado del envío
 */
async function sendFlow(phone, flowId, flowCta, screen, initData = null) {
    try {
        const credentials = await getCredentials();
        logger.debug(`Enviando WhatsApp Flow ${flowId} a ${phone}`);

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Authorization", `Bearer ${credentials.token}`);

        // Crear flow_token con datos del usuario codificados
        // El flowController leerá esto en el evento INIT y decidirá la pantalla
        // IMPORTANTE: incidencia_session_id se incluye para vincular la conversación con el ticket
        let flowToken;
        
        if (initData && initData.is_returning_user) {
            // Usuario existente: codificar sus datos en el flow_token
            const userData = {
                nombre: initData.nombre,
                email: initData.email || '',
                current_email: initData.current_email || '', // Para cambio de correo
                local: initData.local,
                local_nombre: initData.local_nombre || '',
                is_returning_user: true,
                is_local_change: initData.is_local_change || false, // Flag para identificar cambio de local
                is_email_change: initData.is_email_change || false, // Flag para identificar cambio de correo
                incidencia_session_id: initData.incidencia_session_id || null
            };
            const base64Data = Buffer.from(JSON.stringify(userData)).toString('base64');
            flowToken = `returning_${Date.now()}_${base64Data}`;
            logger.debug(`Usuario existente - datos codificados en flow_token para INIT (is_local_change: ${userData.is_local_change}, is_email_change: ${userData.is_email_change})`);
        } else {
            // Usuario nuevo: incluir incidencia_session_id en el token
            const userData = {
                is_returning_user: false,
                incidencia_session_id: initData?.incidencia_session_id || null
            };
            const base64Data = Buffer.from(JSON.stringify(userData)).toString('base64');
            flowToken = `new_${Date.now()}_${base64Data}`;
            logger.debug(`Usuario nuevo - flow_token con incidencia_session_id`);
        }

        // Usar data_exchange para que WhatsApp llame al endpoint con INIT
        // Esto permite al flowController decidir dinámicamente la pantalla inicial
        // Determinar header y body basado en el tipo de operación
        const isLocalChange = initData?.is_local_change || false;
        const isEmailChange = initData?.is_email_change || false;
        
        let headerText, bodyText;
        if (isEmailChange) {
            headerText = "Cambiar Correo";
            bodyText = "Actualiza tu correo electrónico.";
        } else if (isLocalChange) {
            headerText = "Cambiar Local";
            bodyText = "Selecciona tu nuevo local para continuar.";
        } else {
            headerText = "Reportar Incidencia";
            bodyText = "Describe el problema que has encontrado y lo atenderemos a la brevedad.";
        }

        const flowMessage = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": {
                "type": "flow",
                "header": {
                    "type": "text",
                    "text": headerText
                },
                "body": {
                    "text": bodyText
                },
                "footer": {
                    "text": "MUT-Locatarios"
                },
                "action": {
                    "name": "flow",
                    "parameters": {
                        "flow_message_version": "3",
                        "flow_token": flowToken,
                        "flow_id": flowId,
                        "flow_cta": flowCta,
                        "flow_action": "data_exchange"
                    }
                }
            }
        };

        logger.info(`[FLOW] ========== ENVIANDO FLOW ==========`);
        logger.info(`[FLOW] flow_action: data_exchange (INIT será llamado)`);
        logger.info(`[FLOW] flow_token: ${flowToken}`);
        logger.info(`[FLOW] Usuario existente: ${initData?.is_returning_user ? 'SI' : 'NO'}`);
        logger.info(`[FLOW] Full message: ${JSON.stringify(flowMessage, null, 2)}`);

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

        const responseText = await response.text();
        logger.info(`[FLOW] Response status: ${response.status}`);
        logger.info(`[FLOW] Response body: ${responseText}`);

        if (!response.ok) {
            logger.error(`[FLOW] ERROR enviando flow: ${responseText}`);
            throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
        }

        const result = JSON.parse(responseText);
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

/**
 * Envía botones interactivos de WhatsApp
 * Máximo 3 botones permitidos por WhatsApp
 * 
 * @param {string} phone - Número de teléfono del destinatario
 * @param {string} bodyText - Texto del cuerpo del mensaje
 * @param {Array<{id: string, title: string}>} buttons - Array de botones (máximo 3)
 * @param {string} headerText - Texto opcional del header
 * @returns {Promise<object>} Resultado del envío
 */
async function sendInteractiveButtons(phone, bodyText, buttons, headerText = null) {
    try {
        const credentials = await getCredentials();
        logger.debug(`Enviando botones interactivos a ${phone}`);

        if (!buttons || buttons.length === 0 || buttons.length > 3) {
            throw new Error('Se requieren entre 1 y 3 botones');
        }

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Authorization", `Bearer ${credentials.token}`);

        // Construir estructura de botones
        const buttonRows = buttons.map(btn => ({
            type: "reply",
            reply: {
                id: btn.id,
                title: btn.title.substring(0, 20) // WhatsApp limita a 20 caracteres
            }
        }));

        const interactiveMessage = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: bodyText
                },
                action: {
                    buttons: buttonRows
                }
            }
        };

        // Agregar header si se proporciona
        if (headerText) {
            interactiveMessage.interactive.header = {
                type: "text",
                text: headerText
            };
        }

        logger.info(`[BUTTONS] Enviando ${buttons.length} botones a ${phone}`);

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: JSON.stringify(interactiveMessage),
            redirect: "follow"
        };

        const response = await fetch(
            `https://graph.facebook.com/v22.0/${credentials.phoneId}/messages`,
            requestOptions
        );

        const responseText = await response.text();

        if (!response.ok) {
            logger.error(`[BUTTONS] ERROR: ${responseText}`);
            throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
        }

        const result = JSON.parse(responseText);
        logger.success(`Botones enviados exitosamente a ${phone}`);

        return {
            success: true,
            data: result,
            messageId: result.messages?.[0]?.id,
            phone: phone
        };

    } catch (error) {
        logger.error('Error enviando botones interactivos:', error);

        return {
            success: false,
            error: error.message,
            phone: phone
        };
    }
}

export { sendMessage, MarkStatusMessage, sendFlow, sendInteractiveButtons };
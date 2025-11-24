import logger from './logger.js';

/**
 * Obtiene las credenciales de WhatsApp desde variables de entorno
 */
function getCredentials() {
    return {
        token: process.env.TOKEN_WHATS || 'PLACEHOLDER_UPDATE_WITH_REAL_TOKEN',
        phoneId: process.env.IPHONE_ID_WHATS || 'PLACEHOLDER_UPDATE_WITH_PHONE_ID'
    };
}

async function MarkStatusMessage(message_id_sent) {
    try {

        const credentials = getCredentials();

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
        const credentials = getCredentials();
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
async function sendMessageList(phone) {
    try {

        
        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Authorization", `Bearer ${process.env.TOKEN_WHATS}`);

        const raw = JSON.stringify({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "header": {
                    "type": "text",
                    "text": "¡Bienvenid@ a MUT!"
                },
                "body": {
                    "text": "Soy tu asistente virtual durante tu visita.\n\nA continuación, selecciona el tipo de ayuda que necesitas:"
                },
                "action": {
                    "button": "Ver opciones",
                    "sections": [
                        {
                            "rows": [
                                {
                                    "id": "opcion_1",
                                    "title": "Búsqueda de tiendas",
                                    "description": "Encuentra las tiendas que buscas"
                                },
                                {
                                    "id": "opcion_2",
                                    "title": "Ubicación de baños",
                                    "description": "Encuentra los baños más cercanos"
                                },
                                {
                                    "id": "opcion_3",
                                    "title": "Sectores para comer",
                                    "description": "Zonas de comida y descanso"
                                },
                                {
                                    "id": "opcion_4",
                                    "title": "Jardín de MUT",
                                    "description": "Información sobre el jardín"
                                },
                                {
                                    "id": "opcion_5",
                                    "title": "Cómo llegar al metro",
                                    "description": "Ruta desde MUT al metro"
                                },
                                {
                                    "id": "opcion_6",
                                    "title": "Salidas de MUT",
                                    "description": "Ubicación de las salidas"
                                },
                                {
                                    "id": "opcion_7",
                                    "title": "Oficinas MUT",
                                    "description": "Ubicación de oficinas"
                                },
                                {
                                    "id": "opcion_8",
                                    "title": "Estacionamientos",
                                    "description": "Información de estacionamientos"
                                },
                                {
                                    "id": "opcion_9",
                                    "title": "Bicihub MUT",
                                    "description": "Estacionamiento de bicicletas"
                                },
                                {
                                    "id": "opcion_10",
                                    "title": "Otras preguntas",
                                    "description": "Asistencia de emergencia"
                                }
                            ]
                        }
                    ]
                }
            }
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        // Usar await para esperar la respuesta
        const response = await fetch(`https://graph.facebook.com/v22.0/${process.env.IPHONE_ID_WHATS}/messages`, requestOptions);

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
            phone: phone
        };

    } catch (error) {
        console.error('❌ Error enviando mensaje:', error);

        return {
            success: false,
            error: error.message,
            phone: phone
        };
    }
}
export { sendMessage, MarkStatusMessage,sendMessageList };
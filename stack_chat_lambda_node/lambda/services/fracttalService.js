/**
 * Servicio para integración con Fracttal API
 * Maneja autenticación OAuth2 y creación de Work Requests
 */
import logger from '../logger.js';

class FracttalService {
    constructor(fracttalKey, fracttalSecret, userCode) {
        this.FRACTTAL_KEY = fracttalKey;
        this.FRACTTAL_SECRET = fracttalSecret;
        this.USER_CODE = userCode;
        this.baseUrl = 'https://app.fracttal.com/api';
        this.authUrl = 'https://one.fracttal.com/oauth/token';

        // Token cache en memoria
        this.tokenStorage = {
            accessToken: null,
            refreshToken: null,
            tokenType: null,
            expiresAt: null
        };
    }

    log(message) {
        logger.info(`[FRACTTAL] ${message}`);
    }

    error(message, errorData) {
        logger.error(`[FRACTTAL] ${message}`, errorData);
    }

    /**
     * Obtiene un token válido (OAuth2 client_credentials)
     * @returns {Promise<string>} Access token
     */
    async getValidToken() {
        // Si el token es válido, reutilizarlo
        if (this.isTokenValid()) {
            this.log('Usando token existente válido');
            return this.tokenStorage.accessToken;
        }

        const credentials = Buffer.from(`${this.FRACTTAL_KEY}:${this.FRACTTAL_SECRET}`).toString('base64');

        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');

            const response = await fetch(this.authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`
                },
                body: params.toString()
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            const { access_token, refresh_token, token_type, expires_in } = data;
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            // Guardar token
            this.tokenStorage = {
                accessToken: access_token,
                refreshToken: refresh_token,
                tokenType: token_type,
                expiresAt: expiresAt
            };

            this.log('Token obtenido exitosamente');
            return access_token;

        } catch (error) {
            this.error('Error obteniendo token:', error.message);
            throw new Error('No se pudo autenticar con Fracttal API');
        }
    }

    /**
     * Verifica si el token actual es válido
     * @returns {boolean}
     */
    isTokenValid() {
        if (!this.tokenStorage.accessToken || !this.tokenStorage.expiresAt) {
            return false;
        }
        // Margen de 60 segundos antes de expiración
        return new Date() < new Date(this.tokenStorage.expiresAt.getTime() - 60000);
    }

    /**
     * Crea un Work Request en Fracttal
     * @param {object} ticketData - Datos del ticket
     * @returns {Promise<object>} Respuesta de Fracttal
     */
    async createWorkRequest(ticketData) {
        const token = await this.getValidToken();

        // Fecha de incidente: 1 minuto antes para evitar problemas de sincronización
        const oneMinuteAgoUTC = new Date(Date.now() - 60000).toISOString();

        // Mapeo de campos según el nuevo orden:
        // types_description = Nivel 1 (principal)
        // types_1_description = Nivel 2 (intermedio)  
        // types_2_description = Nivel 3 (específico)
        const payload = {
            code: ticketData.fractalCode,
            description: ticketData.descripcion,
            requested_by: ticketData.nombre,
            email_requested_by: ticketData.email,
            types_description: ticketData.nivel1,      // Nivel 1 (principal)
            types_1_description: ticketData.nivel2,    // Nivel 2 (intermedio)
            types_2_description: ticketData.nivel3,    // Nivel 3 (específico)
            identifier: ticketData.locatarioId,
            date_incident: oneMinuteAgoUTC,
            user_code: this.USER_CODE,
            is_urgent: ticketData.urgente || false,
            user_type: 'HUMAN_RESOURCES'
        };

        this.log(`Creando Work Request para código: ${ticketData.fractalCode}`);
        logger.info('[FRACTTAL] Payload:', JSON.stringify(payload, null, 2));

        try {
            const response = await fetch(`${this.baseUrl}/work_requests/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                this.error(`Error HTTP ${response.status}:`, errorData);
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            
            if (data.success && data.data && data.data[0]) {
                const fracttalId = data.data[0].id;
                this.log(`Work Request creado exitosamente. ID: ${fracttalId}`);
                return {
                    success: true,
                    fracttalId: fracttalId,
                    data: data.data[0]
                };
            }

            return {
                success: true,
                fracttalId: null,
                data: data
            };

        } catch (error) {
            this.error('Error creando Work Request:', error.message);
            throw new Error(`Falló la creación del ticket en Fracttal: ${error.message}`);
        }
    }
}

// Singleton para reutilizar la instancia
let fracttalInstance = null;

/**
 * Obtiene una instancia del servicio Fracttal
 * @param {object} credentials - { fracttalKey, fracttalSecret, fracttalUserCode }
 * @returns {FracttalService}
 */
export function getFracttalService(credentials) {
    if (!fracttalInstance) {
        fracttalInstance = new FracttalService(
            credentials.fracttalKey,
            credentials.fracttalSecret,
            credentials.fracttalUserCode
        );
    }
    return fracttalInstance;
}

export { FracttalService };

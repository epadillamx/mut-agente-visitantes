const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

class ConversationService {
    constructor() {
        const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
        this.dynamoClient = DynamoDBDocumentClient.from(client);
        this.conversationsTable = process.env.CONVERSATIONS_TABLE || 'mut-conversations';
        this.sessionsTable = process.env.SESSIONS_TABLE || 'mut-sessions';
        
        console.log(`💾 ConversationService iniciado con tablas: ${this.conversationsTable}, ${this.sessionsTable}`);
    }

    /**
     * Genera un conversation_id único basado en userId y fecha
     * Formato: userId#YYYY-MM-DD
     */
    generateConversationId(userId) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return `${userId}#${today}`;
    }

    /**
     * Guarda un mensaje en la conversación
     * @param {string} userId - ID del usuario (número de teléfono)
     * @param {string} message - Mensaje del usuario
     * @param {string} response - Respuesta del agente
     * @param {string} messageId - ID único del mensaje
     * @returns {Promise<Object>} El item guardado en DynamoDB
     */
    async saveMessage(userId, message, response, messageId) {
        try {
            const conversationId = this.generateConversationId(userId);
            const timestamp = Date.now();
            
            // TTL: 90 días desde ahora (en segundos Unix)
            const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

            const conversationItem = {
                conversation_id: conversationId,
                timestamp: timestamp,
                user_id: userId,
                message_id: messageId,
                user_message: message,
                agent_response: response,
                created_at: new Date().toISOString(),
                ttl: ttl,
                message_length: {
                    user: message.length,
                    agent: response.length
                }
            };

            await this.dynamoClient.send(new PutCommand({
                TableName: this.conversationsTable,
                Item: conversationItem
            }));

            // Actualizar última actividad en sesiones
            await this.updateSessionActivity(userId, conversationId);

            console.log(`💾 Conversación guardada: ${conversationId} - ${messageId} (${message.length}/${response.length} chars)`);
            return conversationItem;

        } catch (error) {
            console.error('❌ Error guardando conversación:', error);
            throw error;
        }
    }

    /**
     * Obtiene el historial de conversación del día actual
     * @param {string} userId - ID del usuario
     * @param {number} limit - Límite de mensajes a recuperar
     * @returns {Promise<Array>} Array de mensajes ordenados cronológicamente
     */
    async getConversationHistory(userId, limit = 50) {
        try {
            const conversationId = this.generateConversationId(userId);
            
            const result = await this.dynamoClient.send(new QueryCommand({
                TableName: this.conversationsTable,
                KeyConditionExpression: 'conversation_id = :conversationId',
                ExpressionAttributeValues: {
                    ':conversationId': conversationId
                },
                ScanIndexForward: true, // Orden ascendente por timestamp
                Limit: limit
            }));

            const messages = result.Items || [];
            console.log(`📚 Historial obtenido: ${messages.length} mensajes para ${conversationId}`);
            return messages;

        } catch (error) {
            console.error('❌ Error obteniendo historial:', error);
            return [];
        }
    }

    /**
     * Obtiene conversaciones de múltiples días para un usuario
     * @param {string} userId - ID del usuario
     * @param {number} days - Número de días hacia atrás
     * @param {number} limit - Límite total de mensajes
     * @returns {Promise<Array>} Array de mensajes de múltiples días
     */
    async getUserConversations(userId, days = 7, limit = 100) {
        try {
            // Calcular timestamp de hace X días
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - days);
            const timestampLimit = daysAgo.getTime();

            const result = await this.dynamoClient.send(new QueryCommand({
                TableName: this.conversationsTable,
                IndexName: 'user-index',
                KeyConditionExpression: 'user_id = :userId AND #ts >= :timestampLimit',
                ExpressionAttributeNames: {
                    '#ts': 'timestamp'
                },
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':timestampLimit': timestampLimit
                },
                ScanIndexForward: false, // Más recientes primero
                Limit: limit
            }));

            const conversations = result.Items || [];
            console.log(`👤 Conversaciones del usuario: ${conversations.length} mensajes para ${userId} (últimos ${days} días)`);
            return conversations;

        } catch (error) {
            console.error('❌ Error obteniendo conversaciones del usuario:', error);
            return [];
        }
    }

    /**
     * Actualiza la actividad de la sesión
     * @param {string} userId - ID del usuario
     * @param {string} conversationId - ID de la conversación
     */
    async updateSessionActivity(userId, conversationId) {
        try {
            // TTL: 24 horas para sesiones activas
            const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

            await this.dynamoClient.send(new UpdateCommand({
                TableName: this.sessionsTable,
                Key: { user_id: userId },
                UpdateExpression: 'SET last_activity = :timestamp, conversation_id = :conversationId, #ttl = :ttl',
                ExpressionAttributeNames: {
                    '#ttl': 'ttl'
                },
                ExpressionAttributeValues: {
                    ':timestamp': new Date().toISOString(),
                    ':conversationId': conversationId,
                    ':ttl': ttl
                }
            }));

            console.log(`⏰ Sesión actualizada para ${userId}: ${conversationId}`);

        } catch (error) {
            console.error('❌ Error actualizando sesión:', error);
            // No lanzar error para evitar interrumpir el flujo principal
        }
    }

    /**
     * Obtiene información de la sesión activa
     * @param {string} userId - ID del usuario
     * @returns {Promise<Object|null>} Información de la sesión o null
     */
    async getActiveSession(userId) {
        try {
            const result = await this.dynamoClient.send(new GetCommand({
                TableName: this.sessionsTable,
                Key: { user_id: userId }
            }));

            if (result.Item) {
                console.log(`🔄 Sesión activa encontrada para ${userId}: ${result.Item.conversation_id}`);
            }
            
            return result.Item || null;

        } catch (error) {
            console.error('❌ Error obteniendo sesión activa:', error);
            return null;
        }
    }

    /**
     * Obtiene estadísticas de conversación para un usuario
     * @param {string} userId - ID del usuario
     * @returns {Promise<Object>} Estadísticas básicas
     */
    async getUserStats(userId) {
        try {
            const conversations = await this.getUserConversations(userId, 30, 1000); // Últimos 30 días
            
            const stats = {
                totalMessages: conversations.length,
                days: new Set(conversations.map(c => c.conversation_id.split('#')[1])).size,
                avgMessagesPerDay: 0,
                totalCharacters: {
                    user: conversations.reduce((sum, c) => sum + (c.message_length?.user || 0), 0),
                    agent: conversations.reduce((sum, c) => sum + (c.message_length?.agent || 0), 0)
                },
                firstMessage: conversations.length > 0 ? conversations[conversations.length - 1].created_at : null,
                lastMessage: conversations.length > 0 ? conversations[0].created_at : null
            };

            if (stats.days > 0) {
                stats.avgMessagesPerDay = Math.round(stats.totalMessages / stats.days);
            }

            console.log(`📊 Estadísticas para ${userId}: ${stats.totalMessages} mensajes en ${stats.days} días`);
            return stats;

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return { totalMessages: 0, days: 0, avgMessagesPerDay: 0 };
        }
    }
}

module.exports = { ConversationService };
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
     * Extrae el nombre del documento desde una URI de S3
     * @param {string} s3Uri - URI de S3 (s3://bucket/path/to/file.pdf)
     * @returns {string} Nombre del archivo
     */
    extractDocumentName(s3Uri) {
        if (!s3Uri) return 'unknown';
        const parts = s3Uri.split('/');
        return parts[parts.length - 1] || 'unknown';
    }

    /**
     * Procesa y estructura las citations para almacenamiento
     * @param {Array} citations - Citations del agente
     * @returns {Array} Citations procesadas
     */
    processCitations(citations) {
        if (!citations || citations.length === 0) return [];

        return citations.map(citation => {
            const retrievedReferences = citation.retrievedReferences || [];
            return {
                retrievedReferences: retrievedReferences.map(ref => ({
                    s3Uri: ref.location?.s3Location?.uri || null,
                    documentName: this.extractDocumentName(ref.location?.s3Location?.uri),
                    knowledgeBaseId: ref.metadata?.['x-amz-bedrock-kb-source-uri'] || ref.metadata?.knowledgeBaseId || null,
                    contentSnippet: ref.content?.text?.substring(0, 500) || null,
                    score: ref.metadata?.score || null,
                    metadata: ref.metadata || {}
                }))
            };
        });
    }

    /**
     * Extrae documentos únicos de las citations
     * @param {Array} processedCitations - Citations procesadas
     * @returns {Array} Lista de documentos únicos
     */
    extractUniqueDocuments(processedCitations) {
        const documentsMap = new Map();

        processedCitations.forEach(citation => {
            citation.retrievedReferences?.forEach(ref => {
                if (ref.s3Uri && !documentsMap.has(ref.s3Uri)) {
                    documentsMap.set(ref.s3Uri, {
                        documentName: ref.documentName,
                        s3Uri: ref.s3Uri,
                        knowledgeBaseId: ref.knowledgeBaseId
                    });
                }
            });
        });

        return Array.from(documentsMap.values());
    }

    /**
     * Guarda un mensaje en la conversación con trazabilidad completa
     * @param {string} userId - ID del usuario (número de teléfono)
     * @param {string} message - Mensaje del usuario
     * @param {string} response - Respuesta del agente
     * @param {string} messageId - ID único del mensaje
     * @param {Object} traceabilityData - Datos de trazabilidad (citations, traceEvents, agentMetadata)
     * @param {string} ticketNumber - Número de ticket (opcional)
     * @returns {Promise<Object>} El item guardado en DynamoDB
     */
    async saveMessage(userId, message, response, messageId, traceabilityData_input = null) {
        try {
             console.log(`************************** 8 | saveMessage | ********************************************* `);
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
                },
                traceabilityData: traceabilityData_input
            };

            await this.dynamoClient.send(new PutCommand({
                TableName: this.conversationsTable,
                Item: conversationItem
            }));

            // Actualizar última actividad en sesiones
            await this.updateSessionActivity(userId, conversationId);

           

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
    async isDuplicateMessage(messageId) {
        try {
            const result = await this.dynamoClient.send(new QueryCommand({
                TableName: this.conversationsTable,
                IndexName: 'message-id-index',
                KeyConditionExpression: 'message_id = :messageId',
                ExpressionAttributeValues: {
                    ':messageId': messageId
                },
                Limit: 1
            }));
            return result.Count > 0;
        } catch (error) {
            console.error('❌ Error verificando mensaje duplicado:', error);
            return false;
        }
    }

    /**
     * Obtiene la trazabilidad de un mensaje específico
     * @param {string} messageId - ID del mensaje
     * @returns {Promise<Object|null>} Trazabilidad del mensaje o null
     */
    async getMessageTraceability(messageId) {
        try {
            const result = await this.dynamoClient.send(new QueryCommand({
                TableName: this.conversationsTable,
                IndexName: 'message-id-index',
                KeyConditionExpression: 'message_id = :messageId',
                ExpressionAttributeValues: {
                    ':messageId': messageId
                },
                Limit: 1
            }));

            if (result.Items && result.Items.length > 0) {
                const message = result.Items[0];
                return {
                    messageId: message.message_id,
                    userId: message.user_id,
                    timestamp: message.created_at,
                    traceability: message.traceability || null,
                    userMessage: message.user_message,
                    agentResponse: message.agent_response
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Error obteniendo trazabilidad:', error);
            return null;
        }
    }

    /**
     * Obtiene estadísticas de fuentes de documentos usadas
     * @param {string} userId - ID del usuario
     * @param {number} days - Días hacia atrás
     * @returns {Promise<Object>} Estadísticas de documentos
     */
    async getDocumentUsageStats(userId, days = 30) {
        try {
            const conversations = await this.getUserConversations(userId, days, 1000);
            const documentStats = new Map();

            conversations.forEach(conv => {
                if (conv.traceability?.sourceDocuments) {
                    conv.traceability.sourceDocuments.forEach(doc => {
                        const key = doc.documentName;
                        if (!documentStats.has(key)) {
                            documentStats.set(key, {
                                documentName: doc.documentName,
                                s3Uri: doc.s3Uri,
                                knowledgeBaseId: doc.knowledgeBaseId,
                                usageCount: 0
                            });
                        }
                        documentStats.get(key).usageCount++;
                    });
                }
            });

            const stats = Array.from(documentStats.values())
                .sort((a, b) => b.usageCount - a.usageCount);

            console.log(`📊 Estadísticas de documentos para ${userId}: ${stats.length} documentos únicos`);
            return {
                totalUniqueDocuments: stats.length,
                documents: stats,
                periodDays: days
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de documentos:', error);
            return { totalUniqueDocuments: 0, documents: [], periodDays: days };
        }
    }
}

module.exports = { ConversationService };
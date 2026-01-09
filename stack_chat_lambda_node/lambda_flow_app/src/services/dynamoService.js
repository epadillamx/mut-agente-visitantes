const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

class DynamoService {
  constructor() {
    // For Lambda, credentials are automatically provided by IAM role
    // For local development, use environment variables
    const clientConfig = {
      region: process.env.AWS_REGION
    };

    // Only add explicit credentials if running locally
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      };
    }

    const client = new DynamoDBClient(clientConfig);

    this.dynamodb = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.DYNAMODB_TABLE_INCIDENCIAS;
  }

  /**
   * Save incident to DynamoDB
   * @param {object} incidentData - Incident data
   * @returns {Promise<object>} Saved incident
   */
  async saveIncident(incidentData) {
    const item = {
      id: uuidv4(),
      type: 'incidencia',  // Tipo para diferenciar de otras conversaciones
      nombre: incidentData.nombre,
      email: incidentData.email,
      local_id: incidentData.local_id,
      local_nombre: incidentData.local_nombre,
      fractal_code: incidentData.fractal_code || null,
      incidencia: incidentData.incidencia,
      // Clasificación Fracttal
      clasificacion_nivel1: incidentData.clasificacion_nivel1 || null,
      clasificacion_nivel2: incidentData.clasificacion_nivel2 || null,
      clasificacion_nivel3: incidentData.clasificacion_nivel3 || null,
      // IDs externos
      fracttal_id: incidentData.fracttal_id || null,
      ticket_db_id: incidentData.ticket_db_id || null,
      // Metadata
      fecha_creacion: new Date().toISOString(),
      estado: incidentData.estado || 'pendiente',
      source: 'whatsapp_flow'
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: item
    });

    try {
      await this.dynamodb.send(command);
      console.log('[DYNAMO] Incident saved successfully:', item.id);
      return item;
    } catch (error) {
      console.error('[DYNAMO] Error saving incident:', error);
      throw new Error('Failed to save incident');
    }
  }

  /**
   * Get incident by ID
   * @param {string} id - Incident ID
   * @returns {Promise<object>} Incident data
   */
  async getIncident(id) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: { id }
    });

    try {
      const result = await this.dynamodb.send(command);
      return result.Item;
    } catch (error) {
      console.error('Error getting incident from DynamoDB:', error);
      throw new Error('Failed to retrieve incident');
    }
  }

  /**
   * Get incidents by local ID
   * @param {string} localId - Local ID
   * @returns {Promise<Array>} Array of incidents
   */
  async getIncidentsByLocal(localId) {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'local_id-fecha_creacion-index',
      KeyConditionExpression: 'local_id = :local_id',
      ExpressionAttributeValues: {
        ':local_id': localId
      },
      ScanIndexForward: false // Sort by fecha_creacion descending
    });

    try {
      const result = await this.dynamodb.send(command);
      return result.Items;
    } catch (error) {
      console.error('Error querying incidents by local:', error);
      throw new Error('Failed to retrieve incidents');
    }
  }

  /**
   * Update incident status
   * @param {string} id - Incident ID
   * @param {string} status - New status
   * @returns {Promise<object>} Updated incident
   */
  async updateIncidentStatus(id, status) {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { id },
      UpdateExpression: 'SET estado = :status',
      ExpressionAttributeValues: {
        ':status': status
      },
      ReturnValues: 'ALL_NEW'
    });

    try {
      const result = await this.dynamodb.send(command);
      console.log('Incident status updated:', id);
      return result.Attributes;
    } catch (error) {
      console.error('Error updating incident status:', error);
      throw new Error('Failed to update incident status');
    }
  }
}

module.exports = new DynamoService();

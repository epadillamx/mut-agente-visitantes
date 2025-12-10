const flowController = require('./src/controllers/flowController');
const { decryptRequest, encryptResponse } = require('./src/utils/crypto');
const localService = require('./src/services/localService');
const { getWhatsAppCredentials } = require('./src/utils/secrets');
const fs = require('fs');
const path = require('path');

/**
 * AWS Lambda handler for WhatsApp Flow
 * Compatible with API Gateway Lambda Proxy Integration
 * @param {object} event - API Gateway event
 * @param {object} context - Lambda context
 * @returns {object} API Gateway response
 */
exports.handler = async (event, context) => {
  console.log(`[${new Date().toISOString()}] ${event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN'} ${event.path || event.rawPath || ''}`);
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const requestPath = event.path || event.rawPath || '';
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';

    // Route handling
    if (method === 'POST' && (requestPath === '/webhook/flow' || requestPath === '/flow')) {
      return await handleFlow(event);
    }

    if (method === 'GET' && (requestPath === '/webhook/health' || requestPath === '/health')) {
      return handleHealth();
    }

    if (method === 'GET' && (requestPath === '/webhook/locales/count' || requestPath === '/locales/count')) {
      return handleLocalesCount();
    }

    if (method === 'GET' && requestPath === '/') {
      return handleRoot();
    }

    // 404 handler
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Not found',
        path: requestPath
      })
    };
  } catch (error) {
    console.error('Unhandled error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};

/**
 * Handle WhatsApp Flow webhook POST /webhook/flow
 * @param {object} event - API Gateway event
 * @returns {object} API Gateway response
 */
async function handleFlow(event) {
  try {
    console.log('Received webhook request');

    // Parse request body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    console.log('Request body:', JSON.stringify(body, null, 2));


    let privateKey;
    let passphrase;

    // Fallback to file system (for local testing)
    try {
      const secrets = await getWhatsAppCredentials();
      // Get private key from environment or file system
      privateKey = Buffer.from(secrets.WHATSAPP_PRIVATE_KEY, 'base64').toString('utf-8');
      passphrase = secrets.WHATSAPP_PRIVATE_KEY_PASSPHRASE;
    } catch (error) {
      console.error('Private key not found in environment or file system');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Server configuration error'
        })
      };
    }


    // Check if request is encrypted
    const isEncrypted = body.encrypted_flow_data || body.encrypted_aes_key;

    let decryptedData;
    let aesKey;
    let initialVector;

    if (isEncrypted) {
      // Decrypt the request
      const decryptResult = decryptRequest(body, privateKey, passphrase);
      decryptedData = decryptResult.decryptedData;
      aesKey = decryptResult.aesKeyBuffer;
      initialVector = body.initial_vector;

      console.log('Decrypted data:', JSON.stringify(decryptedData, null, 2));
    } else {
      // For testing: accept unencrypted requests
      decryptedData = body;
      console.log('Unencrypted data (testing mode):', JSON.stringify(decryptedData, null, 2));
    }

    // Process the flow
    const responseData = await flowController.handleFlow(decryptedData);

    console.log('Response data:', JSON.stringify(responseData, null, 2));

    // Encrypt response if request was encrypted
    if (isEncrypted && aesKey && initialVector) {
      const encryptedResponse = encryptResponse(responseData, aesKey, initialVector);
      console.log('Encrypted response (base64):', encryptedResponse.substring(0, 100) + '...');

      // WhatsApp expects the base64 string directly as the response body
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: encryptedResponse
      };
    }

    // Return unencrypted response for testing
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: '3.0',
        data: {
          error: true,
          error_message: error.message || 'Internal server error'
        }
      })
    };
  }
}

/**
 * Handle health check GET /webhook/health
 * @returns {object} API Gateway response
 */
function handleHealth() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'whatsapp-flow-incidencias',
      environment: process.env.NODE_ENV || 'production',
      region: process.env.AWS_REGION,
      dynamodbTable: process.env.DYNAMODB_TABLE_INCIDENCIAS
    })
  };
}

/**
 * Handle locales count GET /webhook/locales/count
 * @returns {object} API Gateway response
 */
function handleLocalesCount() {
  try {
    const locales = localService.getAllLocales();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        total: locales.length,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error getting locales count:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Error getting locales count',
        message: error.message
      })
    };
  }
}

/**
 * Handle root endpoint GET /
 * @returns {object} API Gateway response
 */
function handleRoot() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service: 'WhatsApp Flow - Incidencias',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        webhook: 'POST /webhook/flow',
        health: 'GET /webhook/health',
        localesCount: 'GET /webhook/locales/count'
      }
    })
  };
}

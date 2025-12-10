const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const flowController = require('../controllers/flowController');
const { decryptRequest, encryptResponse } = require('../utils/crypto');

/**
 * POST /webhook/flow
 * Main webhook endpoint for WhatsApp Flow
 */
router.post('/flow', async (req, res) => {
  try {
    console.log('Received webhook request');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const privateKey = fs.readFileSync(path.join(__dirname, '../../private_key.pem'), 'utf-8');
    const passphrase = 'mutflowinT2.$';

    if (!privateKey || !passphrase) {
      console.error('WhatsApp encryption keys not configured');
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    // Check if request is encrypted
    const isEncrypted = req.body.encrypted_flow_data || req.body.encrypted_aes_key;

    let decryptedData;
    let aesKey;
    let initialVector;

    if (isEncrypted) {
      // Decrypt the request
      const decryptResult = decryptRequest(req.body, privateKey, passphrase);
      decryptedData = decryptResult.decryptedData;
      aesKey = decryptResult.aesKeyBuffer;
      initialVector = req.body.initial_vector;

      console.log('Decrypted data:', JSON.stringify(decryptedData, null, 2));
    } else {
      // For testing: accept unencrypted requests
      decryptedData = req.body;
      console.log('Unencrypted data (testing mode):', JSON.stringify(decryptedData, null, 2));
    }

    // Process the flow
    const responseData = await flowController.handleFlow(decryptedData);

    console.log('Response data:', JSON.stringify(responseData, null, 2));

    // Encrypt response if request was encrypted
    if (isEncrypted && aesKey && initialVector) {
      const encryptedResponse = encryptResponse(responseData, aesKey, initialVector);
      console.log('Encrypted response (base64):', encryptedResponse);
      
      // WhatsApp expects the base64 string directly as the response body
      res.set('Content-Type', 'text/plain');
      return res.send(encryptedResponse);
    }

    // Return unencrypted response for testing
    return res.json(responseData);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      version: '3.0',
      data: {
        error: true,
        error_message: error.message || 'Internal server error'
      }
    });
  }
});

/**
 * GET /webhook/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'whatsapp-flow-incidencias'
  });
});

/**
 * GET /webhook/locales/count
 * Get total number of locales
 */
router.get('/locales/count', (req, res) => {
  const localService = require('../services/localService');
  const locales = localService.getAllLocales();
  res.json({
    total: locales.length,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

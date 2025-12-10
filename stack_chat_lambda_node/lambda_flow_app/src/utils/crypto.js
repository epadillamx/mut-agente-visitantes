const crypto = require('crypto');

/**
 * Decrypts incoming WhatsApp Flow requests
 * @param {object} encryptedFlow - Encrypted flow object from request body
 * @param {string} privateKey - Private key in PEM format
 * @param {string} passphrase - Private key passphrase
 * @returns {object} Object with decrypted data and AES key
 */
function decryptRequest(encryptedFlow, privateKey, passphrase) {
  try {
    console.log('Encrypted flow object received:', JSON.stringify(encryptedFlow, null, 2));

    // Validate required fields
    if (!encryptedFlow.encrypted_aes_key) {
      throw new Error('Missing encrypted_aes_key in request');
    }
    if (!encryptedFlow.initial_vector) {
      throw new Error('Missing initial_vector in request');
    }
    if (!encryptedFlow.encrypted_flow_data) {
      throw new Error('Missing encrypted_flow_data in request');
    }

    // Decrypt AES key using RSA private key
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        passphrase: passphrase,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(encryptedFlow.encrypted_aes_key, 'base64')
    );

    // Decrypt flow data using AES-GCM
    // WhatsApp sends encrypted_flow_data with the auth tag appended (last 16 bytes)
    const encryptedDataBuffer = Buffer.from(encryptedFlow.encrypted_flow_data, 'base64');
    
    // Extract auth tag (last 16 bytes) and encrypted data (everything else)
    const authTag = encryptedDataBuffer.slice(-16);
    const encryptedData = encryptedDataBuffer.slice(0, -16);

    const decipher = crypto.createDecipheriv(
      'aes-128-gcm',
      decryptedAesKey,
      Buffer.from(encryptedFlow.initial_vector, 'base64')
    );

    decipher.setAuthTag(authTag);

    let decryptedFlowData = decipher.update(encryptedData, null, 'utf-8');
    decryptedFlowData += decipher.final('utf-8');

    return {
      decryptedData: JSON.parse(decryptedFlowData),
      aesKeyBuffer: decryptedAesKey
    };
  } catch (error) {
    console.error('Error decrypting request:', error);
    throw new Error('Failed to decrypt request');
  }
}

/**
 * Encrypts response for WhatsApp Flow
 * @param {object} response - Response object to encrypt
 * @param {Buffer} aesKeyBuffer - AES key as Buffer
 * @param {string} initialVectorBase64 - Initial vector in base64 format
 * @returns {string} Encrypted response with auth tag
 */
function encryptResponse(response, aesKeyBuffer, initialVectorBase64) {
  try {
    const responseJson = JSON.stringify(response);

    // Flip initial vector for response
    const flippedIv = [];
    const initialVector = Buffer.from(initialVectorBase64, 'base64');

    for (let i = 0; i < initialVector.length; i++) {
      flippedIv.push(initialVector[i] ^ 0xFF);
    }

    const cipher = crypto.createCipheriv(
      'aes-128-gcm',
      aesKeyBuffer,
      Buffer.from(flippedIv)
    );

    const encryptedBuffer = Buffer.concat([
      cipher.update(responseJson, 'utf-8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Append auth tag to encrypted data
    const encryptedWithTag = Buffer.concat([encryptedBuffer, authTag]);

    return encryptedWithTag.toString('base64');
  } catch (error) {
    console.error('Error encrypting response:', error);
    throw new Error('Failed to encrypt response');
  }
}

/**
 * Validates email format
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  decryptRequest,
  encryptResponse,
  isValidEmail
};

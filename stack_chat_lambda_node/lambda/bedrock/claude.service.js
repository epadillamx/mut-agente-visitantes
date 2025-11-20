const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { bedrockRuntimeClient } = require('./bedrock.js');

// Claude Haiku 4.5 - Soporta prompt caching (mínimo 4096 tokens)
// Usando inference profile para us-east-1
const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/**
 * Invoca el modelo Claude Haiku 4.5 con prompt caching
 * @param {string} prompt - El prompt para Claude
 * @param {string} systemMessage - Mensaje del sistema (opcional)
 * @returns {Promise<string>} - La respuesta de Claude
 */
async function invokeClaude(prompt, systemMessage = '') {
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    system: [
      {
        type: "text",
        text: systemMessage,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{
      role: 'user',
      content: prompt
    }]
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    body: JSON.stringify(payload)
  });

  try {
    const response = await bedrockRuntimeClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
  } catch (error) {
    console.error('Error invocando Claude:', error);
    throw error;
  }
}

module.exports = {
  invokeClaude
};
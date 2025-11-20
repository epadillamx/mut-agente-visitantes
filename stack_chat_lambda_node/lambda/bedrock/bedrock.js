import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';


// Cliente para operaciones generales de Bedrock
const bedrockClient = new BedrockClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Cliente para invocar modelos
const bedrockRuntimeClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Verificar conexión con Bedrock
async function checkBedrockStatus() {
  try {
    const command = new ListFoundationModelsCommand({});
    await bedrockClient.send(command);
    return 'ok';
  } catch (error) {
    console.error('Error de conexión a Bedrock:', error);
    return 'error';
  }
}

export {
  bedrockClient,
  bedrockRuntimeClient,
  checkBedrockStatus
};
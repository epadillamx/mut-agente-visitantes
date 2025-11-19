const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require('@aws-sdk/client-bedrock-agent-runtime');

// Cargar variables de entorno
dotenv.config();

// Configuración del agente de Bedrock
const AGENT_ID = process.env.AGENT_ID || '9VEMPEULVZ';
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID || 'AEEB0GXHSK';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const PORT = process.env.PORT || 3000;

// Cliente de Bedrock con configuración de credenciales por defecto
const bedrockClient = new BedrockAgentRuntimeClient({
  region: AWS_REGION,
  // Usa la cadena de credenciales por defecto de AWS:
  // 1. Variables de entorno (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
  // 2. Archivo de credenciales (~/.aws/credentials)
  // 3. Perfiles de IAM (en EC2, ECS, Lambda, etc.)
  credentials: undefined // undefined = usar cadena de credenciales por defecto
});

// Almacenamiento temporal de sesiones (en producción usar DynamoDB)
const sessions = new Map();

// Inicializar Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/requerimientos', express.static(path.join(__dirname, 'requerimientos')));

/**
 * Invoca al agente de Bedrock y procesa la respuesta
 */
async function invokeBedrockAgent(userId, question) {
  try {
    console.log(`📨 Invocando agente para usuario: ${userId}`);
    console.log(`❓ Pregunta: ${question}`);

    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId: userId,
      inputText: question,
    });

    const startTime = Date.now();
    const response = await bedrockClient.send(command);
    
    let finalResponse = '';
    const citations = new Set();

    if (response.completion) {
      for await (const event of response.completion) {
        // Procesar chunks de texto
        if (event.chunk?.bytes) {
          const decodedChunk = new TextDecoder('utf-8').decode(event.chunk.bytes);
          finalResponse += decodedChunk;
        }

        // Extraer citations
        if (event.chunk?.attribution?.citations) {
          for (const citation of event.chunk.attribution.citations) {
            for (const ref of citation.retrievedReferences || []) {
              if (ref.metadata?.['x-amz-bedrock-kb-source-uri']) {
                citations.add(ref.metadata['x-amz-bedrock-kb-source-uri']);
              }
            }
          }
        }

        // Detectar final del stream
        if (event.chunk?.attribution || event.trace) {
          break;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Respuesta procesada en ${duration}ms`);
    console.log(`📝 Longitud de respuesta: ${finalResponse.length} caracteres`);

    return {
      response: finalResponse.trim() || 'Lo siento, no pude generar una respuesta. ¿Puedes reformular tu pregunta?',
      citations: Array.from(citations),
    };
  } catch (error) {
    console.error('❌ Error invocando Bedrock Agent:', error);
    
    let errorMessage = 'Lo siento, hubo un error procesando tu pregunta.';
    
    if (error.name === 'AccessDeniedException') {
      errorMessage = 'Error de permisos. Verifica las credenciales de AWS.';
    } else if (error.name === 'ResourceNotFoundException') {
      errorMessage = 'Agente no encontrado. Verifica AGENT_ID y AGENT_ALIAS_ID.';
    } else if (error.name === 'ThrottlingException') {
      errorMessage = 'Demasiadas solicitudes. Por favor, intenta de nuevo en unos segundos.';
    }

    return {
      response: errorMessage,
      error: error.message,
    };
  }
}

// ==================== RUTAS ====================

/**
 * POST /api/chat
 * Enviar un mensaje al chatbot
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message || message.trim() === '') {
      return res.status(400).json({ error: 'userId y message son requeridos' });
    }

    // Obtener o crear sesión
    if (!sessions.has(userId)) {
      sessions.set(userId, { userId, messages: [] });
    }

    const session = sessions.get(userId);

    // Guardar mensaje del usuario
    session.messages.push({ role: 'user', content: message });

    // Invocar agente de Bedrock
    const result = await invokeBedrockAgent(userId, message);

    // Guardar respuesta del asistente
    session.messages.push({ role: 'assistant', content: result.response });

    res.json({
      userId,
      response: result.response,
      citations: result.citations,
      error: result.error,
    });
  } catch (error) {
    console.error('❌ Error en /api/chat:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/chat/:userId
 * Obtener historial de conversación
 */
app.get('/api/chat/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const session = sessions.get(userId);

    if (!session) {
      return res.json({ messages: [] });
    }

    res.json({ messages: session.messages });
  } catch (error) {
    console.error('❌ Error en GET /api/chat/:userId:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/chat/:userId
 * Limpiar sesión de usuario
 */
app.delete('/api/chat/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    if (sessions.has(userId)) {
      sessions.delete(userId);
      return res.json({ message: 'Sesión eliminada correctamente' });
    }

    res.status(404).json({ error: 'Sesión no encontrada' });
  } catch (error) {
    console.error('❌ Error en DELETE /api/chat/:userId:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/health
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    agent: {
      id: AGENT_ID,
      alias: AGENT_ALIAS_ID,
      region: AWS_REGION,
    },
  });
});

/**
 * GET /
 * Servir interfaz principal
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Mounjaro Chatbot corriendo en http://localhost:${PORT}`);
  console.log(`🤖 Agent ID: ${AGENT_ID}`);
  console.log(`🔧 Alias ID: ${AGENT_ALIAS_ID}`);
  console.log(`🌎 Region: ${AWS_REGION}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

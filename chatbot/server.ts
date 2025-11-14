import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";

// Configuración del agente de Bedrock
const AGENT_ID = process.env.AGENT_ID || "9VEMPEULVZ";
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID || "AEEB0GXHSK";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Cliente de Bedrock
const bedrockClient = new BedrockAgentRuntimeClient({ region: AWS_REGION });

// Almacenamiento temporal de sesiones (en producción usar DynamoDB)
const sessions = new Map<string, { userId: string; messages: Array<{ role: string; content: string }> }>();

interface ChatMessage {
  userId: string;
  message: string;
}

interface ChatResponse {
  response: string;
  citations?: string[];
  error?: string;
}

/**
 * Invoca al agente de Bedrock y procesa la respuesta
 */
async function invokeBedrockAgent(userId: string, question: string): Promise<ChatResponse> {
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
    
    let finalResponse = "";
    const citations = new Set<string>();

    if (response.completion) {
      for await (const event of response.completion) {
        // Procesar chunks de texto
        if (event.chunk?.bytes) {
          const decodedChunk = new TextDecoder("utf-8").decode(event.chunk.bytes);
          finalResponse += decodedChunk;
        }

        // Extraer citations
        if (event.chunk?.attribution?.citations) {
          for (const citation of event.chunk.attribution.citations) {
            for (const ref of citation.retrievedReferences || []) {
              if (ref.metadata?.["x-amz-bedrock-kb-source-uri"]) {
                citations.add(ref.metadata["x-amz-bedrock-kb-source-uri"]);
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
      response: finalResponse.trim() || "Lo siento, no pude generar una respuesta. ¿Puedes reformular tu pregunta?",
      citations: Array.from(citations),
    };
  } catch (error: any) {
    console.error("❌ Error invocando Bedrock Agent:", error);
    
    let errorMessage = "Lo siento, hubo un error procesando tu pregunta.";
    
    if (error.name === "AccessDeniedException") {
      errorMessage = "Error de permisos. Verifica las credenciales de AWS.";
    } else if (error.name === "ResourceNotFoundException") {
      errorMessage = "Agente no encontrado. Verifica AGENT_ID y AGENT_ALIAS_ID.";
    } else if (error.name === "ThrottlingException") {
      errorMessage = "Demasiadas solicitudes. Por favor, intenta de nuevo en unos segundos.";
    }

    return {
      response: errorMessage,
      error: error.message,
    };
  }
}

/**
 * Servidor Elysia con API de chatbot
 */
const app = new Elysia()
  .use(staticPlugin({
    assets: "public",
    prefix: "/",
  }))
  
  // Endpoint para enviar mensajes
  .post("/api/chat", async ({ body, set }) => {
    const { userId, message } = body as ChatMessage;

    if (!userId || !message || message.trim() === "") {
      set.status = 400;
      return { error: "userId y message son requeridos" };
    }

    // Obtener o crear sesión
    if (!sessions.has(userId)) {
      sessions.set(userId, { userId, messages: [] });
    }

    const session = sessions.get(userId)!;

    // Guardar mensaje del usuario
    session.messages.push({ role: "user", content: message });

    // Invocar agente de Bedrock
    const result = await invokeBedrockAgent(userId, message);

    // Guardar respuesta del asistente
    session.messages.push({ role: "assistant", content: result.response });

    return {
      userId,
      response: result.response,
      citations: result.citations,
      error: result.error,
    };
  })

  // Endpoint para obtener historial de conversación
  .get("/api/chat/:userId", ({ params }) => {
    const { userId } = params;
    const session = sessions.get(userId);

    if (!session) {
      return { messages: [] };
    }

    return { messages: session.messages };
  })

  // Endpoint para limpiar sesión
  .delete("/api/chat/:userId", ({ params, set }) => {
    const { userId } = params;
    
    if (sessions.has(userId)) {
      sessions.delete(userId);
      return { message: "Sesión eliminada correctamente" };
    }

    set.status = 404;
    return { error: "Sesión no encontrada" };
  })

  // Health check
  .get("/api/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    agent: {
      id: AGENT_ID,
      alias: AGENT_ALIAS_ID,
      region: AWS_REGION,
    },
  }))

  .listen(3000);

console.log(`🚀 Servidor Mounjaro Chatbot corriendo en http://localhost:${app.server?.port}`);
console.log(`🤖 Agent ID: ${AGENT_ID}`);
console.log(`🔧 Alias ID: ${AGENT_ALIAS_ID}`);
console.log(`🌎 Region: ${AWS_REGION}`);

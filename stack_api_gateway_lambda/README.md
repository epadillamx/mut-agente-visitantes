# API Gateway Lambda Stack - Bedrock Agent REST API

Este stack crea una API REST para interactuar con el Agente de Amazon Bedrock mediante API Gateway y Lambda.

## Arquitectura

- **API Gateway REST API**: Endpoint público para recibir peticiones HTTP
- **Lambda Function**: Procesa las peticiones y se comunica con el Agente de Bedrock
- **IAM Permissions**: Permisos para invocar el agente de Bedrock

## Endpoints

### POST /chat
Envía un mensaje al agente virtual y recibe una respuesta.

**Request Body:**
```json
{
  "message": "Do you have any toys for kids?",
  "sessionId": "optional-session-id-for-conversation-continuity"
}
```

**Response:**
```json
{
  "message": "Agent response here...",
  "sessionId": "session-id-12345"
}
```

### GET /health
Health check endpoint para verificar que la API está funcionando.

**Response:**
```json
{
  "status": "healthy"
}
```

## Ejemplo de Uso

### Usando curl

```bash
# Obtener la URL de la API después del deploy
export API_URL="https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod"

# Health Check
curl -X GET $API_URL/health

# Enviar un mensaje al agente
curl -X POST $API_URL/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What toys do you have for a 5 year old?"
  }'

# Continuar conversación con session ID
curl -X POST $API_URL/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you show me more options?",
    "sessionId": "previous-session-id-here"
  }'
```

### Usando Python

```python
import requests
import json

api_url = "https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod"

# Enviar mensaje
response = requests.post(
    f"{api_url}/chat",
    json={
        "message": "What educational toys do you have?",
        "sessionId": "my-session-123"  # Optional
    }
)

data = response.json()
print(f"Agent: {data['message']}")
print(f"Session ID: {data['sessionId']}")
```

### Usando JavaScript/Node.js

```javascript
const apiUrl = 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod';

async function chatWithAgent(message, sessionId = null) {
  const body = { message };
  if (sessionId) body.sessionId = sessionId;

  const response = await fetch(`${apiUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return data;
}

// Uso
chatWithAgent("Do you sell train toys?")
  .then(data => {
    console.log('Agent:', data.message);
    console.log('Session ID:', data.sessionId);
  });
```

## Deployment

```bash
# Deploy solo este stack
cdk deploy GenAiVirtualAssistantApiGatewayStack

# Deploy todos los stacks (recomendado)
cdk deploy --all
```

## Outputs

Después del deployment, CDK mostrará:

- `output-api-gateway-url`: URL base de la API
- `output-api-gateway-chat-url`: URL completa del endpoint /chat
- `output-lambda-fn-arn`: ARN de la función Lambda

## Configuración

El stack recibe los siguientes parámetros:

- `input_agent_id`: ID del Agente de Bedrock (obtenido del BedrockStack)
- `input_agent_alias_id`: ID del Alias del Agente (obtenido del BedrockStack)

Estos parámetros se pasan automáticamente desde el `app.py`.

## Características

- **CORS habilitado**: Permite llamadas desde navegadores web
- **Logging habilitado**: CloudWatch Logs para debugging
- **Throttling**: Límite de 100 requests/segundo con burst de 200
- **Session Management**: Mantiene el contexto de la conversación con session IDs
- **Error Handling**: Respuestas de error detalladas

## Permisos IAM

La función Lambda tiene permisos para:
- `bedrock:InvokeAgent`
- `bedrock:Retrieve`
- `bedrock:RetrieveAndGenerate`

## Costos

Ten en cuenta los costos asociados con:
- API Gateway (por número de requests)
- Lambda (por invocación y duración)
- Bedrock Agent (por invocación y tokens procesados)
- CloudWatch Logs (por volumen de logs)

## Troubleshooting

### Error: "Agent configuration missing"
- Verifica que el stack de Bedrock se haya desplegado correctamente
- Verifica que las variables de entorno AGENT_ID y AGENT_ALIAS_ID estén configuradas en Lambda

### Error: "Access Denied"
- Verifica que la función Lambda tenga permisos para invocar el agente de Bedrock
- Revisa la política IAM en el stack

### Timeout
- El timeout de Lambda está configurado en 120 segundos
- Si el agente tarda más, considera aumentar el timeout en `stack_api_gateway_lambda.py`

## Monitoreo

Puedes monitorear la API en:
- **CloudWatch Logs**: `/aws/lambda/GenAiVirtualAssistantApiGatewayStack-virtualassistantapilambda*`
- **API Gateway Dashboard**: Métricas de requests, latencia, errores
- **Lambda Metrics**: Invocaciones, errores, duración

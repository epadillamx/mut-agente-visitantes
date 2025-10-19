# Lambda de Chat con Bedrock Agent

## Descripción
Lambda function en Node.js que invoca el agente de Bedrock para responder preguntas sobre el centro comercial.

## Configuración

### Variables de Entorno
- `AGENT_ID`: FH6HJUBIZQ
- `AGENT_ALIAS_ID`: LP1AND7OTN
- `AWS_REGION`: us-east-1 (por defecto)

## API Request Format

### Endpoint
```
POST https://YOUR-API-GATEWAY-URL/prod
```

### Request Body
```json
{
  "sessionId": "unique-session-id",
  "question": "¿Qué eventos hay esta semana?"
}
```

**Parámetros:**
- `sessionId` (opcional): ID único de sesión para mantener contexto. Si no se proporciona, se genera automáticamente.
- `question` (requerido): Pregunta del usuario. También acepta `pregunta` o `message` como alias.

### Response Success (200)
```json
{
  "sessionId": "unique-session-id",
  "question": "¿Qué eventos hay esta semana?",
  "answer": "Esta semana tenemos los siguientes eventos...",
  "citations": [
    {
      "retrievedReferences": [
        {
          "content": {
            "text": "..."
          },
          "location": {
            "s3Location": {
              "uri": "s3://bucket/path/to/document.txt"
            }
          }
        }
      ]
    }
  ],
  "timestamp": "2025-10-19T12:00:00.000Z",
  "metadata": {
    "agentId": "FH6HJUBIZQ",
    "agentAliasId": "LP1AND7OTN",
    "region": "us-east-1"
  }
}
```

### Response Error (400/403/404/429/500)
```json
{
  "error": "Error message",
  "details": "Detailed error description",
  "errorType": "ErrorName",
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

## Ejemplos de Uso

### Ejemplo 1: Preguntar por eventos
```bash
curl -X POST https://YOUR-API-GATEWAY-URL/prod \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "question": "¿Qué eventos hay esta semana?"
  }'
```

### Ejemplo 2: Buscar una tienda
```bash
curl -X POST https://YOUR-API-GATEWAY-URL/prod \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "question": "¿Dónde está la tienda Nike?"
  }'
```

### Ejemplo 3: Recomendar restaurante
```bash
curl -X POST https://YOUR-API-GATEWAY-URL/prod \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "question": "Recomiéndame un restaurante italiano"
  }'
```

### Ejemplo 4: Pregunta frecuente
```bash
curl -X POST https://YOUR-API-GATEWAY-URL/prod \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "question": "¿Cuál es el horario del centro comercial?"
  }'
```

## Conversación con Contexto

El `sessionId` permite mantener el contexto de la conversación:

```bash
# Primera pregunta
curl -X POST https://YOUR-API-GATEWAY-URL/prod \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "conversation-001",
    "question": "¿Qué restaurantes italianos tienen?"
  }'

# Segunda pregunta (con contexto de la anterior)
curl -X POST https://YOUR-API-GATEWAY-URL/prod \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "conversation-001",
    "question": "¿Cuál me recomiendas?"
  }'
```

## Manejo de Errores

### Error 400 - Bad Request
```json
{
  "error": "Missing required parameter",
  "message": "Parameter \"question\" is required",
  "example": {
    "sessionId": "unique-session-id",
    "question": "¿Qué eventos hay esta semana?"
  }
}
```

### Error 403 - Access Denied
```json
{
  "error": "Access denied to Bedrock Agent. Check IAM permissions.",
  "details": "User: arn:aws:sts::123456789012:assumed-role/... is not authorized...",
  "errorType": "AccessDeniedException",
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

### Error 404 - Not Found
```json
{
  "error": "Agent or Alias not found. Check AGENT_ID and AGENT_ALIAS_ID.",
  "details": "Resource not found",
  "errorType": "ResourceNotFoundException",
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

### Error 429 - Throttling
```json
{
  "error": "Request throttled. Please try again later.",
  "details": "Rate exceeded",
  "errorType": "ThrottlingException",
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

## Despliegue

### 1. Instalar dependencias
```bash
cd stack_chat_lambda_node/lambda
npm install
```

### 2. Desplegar el stack
```bash
cd ../..
cdk deploy ChatLambdaNodeStack --require-approval never
```

### 3. Obtener la URL del API Gateway
```bash
aws cloudformation describe-stacks \
  --stack-name ChatLambdaNodeStack \
  --query "Stacks[0].Outputs[?OutputKey=='output-api-gateway-url'].OutputValue" \
  --output text
```

## Pruebas Locales

### Con AWS SAM Local
```bash
sam local invoke chat-lambda-fn --event test-event.json
```

### Event de prueba (test-event.json)
```json
{
  "body": "{\"sessionId\":\"test-123\",\"question\":\"¿Qué eventos hay hoy?\"}"
}
```

## Logs y Debugging

### Ver logs en CloudWatch
```bash
aws logs tail /aws/lambda/ChatLambdaNodeStack-chatlambdafn --follow
```

### Logs importantes
- `Event received`: Request completo recibido
- `Invoking Bedrock Agent`: SessionId y pregunta enviada
- `Agent Response`: Respuesta del agente
- `Citations`: Fuentes de información utilizadas
- `Error invoking Bedrock Agent`: Errores de invocación

## Permisos IAM Requeridos

El Lambda necesita los siguientes permisos:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeAgent",
        "bedrock:GetAgent",
        "bedrock:GetAgentAlias"
      ],
      "Resource": "*"
    }
  ]
}
```

## Arquitectura

```
Cliente
  ↓
API Gateway (POST /prod)
  ↓
Lambda Function (Node.js 22)
  ↓
Bedrock Agent (FH6HJUBIZQ)
  ↓
Knowledge Base (NRSWGGNEXW)
  ↓
S3 Bucket (datos)
```

## Dependencias

- `@aws-sdk/client-bedrock-agent-runtime`: ^3.600.0

## Configuración del Stack CDK

- **Runtime**: Node.js 22.x
- **Memory**: 512 MB
- **Timeout**: 60 segundos
- **Handler**: index.handler

## Notas Importantes

1. **SessionId**: Usar el mismo sessionId para mantener contexto entre preguntas
2. **Timeout**: Las llamadas a Bedrock pueden tardar hasta 30-40 segundos
3. **Citations**: La respuesta incluye las fuentes de información utilizadas
4. **CORS**: API Gateway tiene CORS habilitado para solicitudes desde navegador
5. **Streaming**: El código procesa la respuesta streaming del agente

## Troubleshooting

### Problema: "AccessDeniedException"
**Solución**: Verificar que el Lambda tenga permisos `bedrock:InvokeAgent`

### Problema: "ResourceNotFoundException"
**Solución**: Verificar que AGENT_ID y AGENT_ALIAS_ID sean correctos

### Problema: "Timeout"
**Solución**: Aumentar el timeout del Lambda o del API Gateway

### Problema: "Invalid JSON"
**Solución**: Verificar que el body sea JSON válido

---
**Última actualización:** 2025-10-19  
**Versión:** 1.0

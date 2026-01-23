# Lambda de Chat con Bedrock Agent (Nativo - Sin Express)

## Descripción
Lambda function en Node.js **nativo** (sin Express) que invoca el agente de Bedrock para responder preguntas sobre el centro comercial a través de WhatsApp.

## Arquitectura

```
WhatsApp → Meta Webhook → API Gateway → Lambda → Bedrock Agent → Knowledge Base → S3
                                           ↓
                                    Acumulación de Mensajes
                                           ↓
                                    WhatsApp (respuesta)
```

## Configuración

### Variables de Entorno

**Configuradas automáticamente por CDK:**
- `NODE_ENV`: Ambiente (development/production) - controla el nivel de logging
- `WHATSAPP_SECRET_ARN`: ARN del secreto en AWS Secrets Manager
- `CONVERSATIONS_TABLE`: Nombre de la tabla DynamoDB de conversaciones
- `SESSIONS_TABLE`: Nombre de la tabla DynamoDB de sesiones  
- `AWS_REGION`: Región AWS (automática por Lambda Runtime)

**Obtenidas desde Secrets Manager en runtime:**
- `TOKEN_WHATS`: Token de acceso de WhatsApp Business API
- `IPHONE_ID_WHATS`: ID del teléfono de WhatsApp Business
- `VERIFY_TOKEN`: Token de verificación para webhook de WhatsApp

**🔒 Nota de Seguridad:** Las credenciales sensibles ya NO se configuran como variables de entorno. Se obtienen dinámicamente desde AWS Secrets Manager usando el helper `getWhatsAppCredentials()` del módulo `secrets.js`. 

**Beneficios:**
- ✅ Evita exposición de credenciales en variables de entorno
- ✅ Centraliza gestión de secretos
- ✅ Permite rotación automática de credenciales
- ✅ Aplica controles de acceso IAM granulares
- ✅ Cache en memoria (5 min TTL) para mejor performance

## Endpoints

### 1. GET / (Health Check)
```bash
curl https://YOUR-API-GATEWAY-URL/prod/
```

**Response:**
```json
{
  "status": "ok",
  "service": "Bedrock Agent WhatsApp Lambda",
  "version": "1.0.0",
  "endpoints": {
    "GET /webhook": "WhatsApp webhook verification",
    "POST /webhook": "WhatsApp message receiver",
    "POST /chat": "Direct chat endpoint for testing"
  },
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

### 2. GET /webhook (Verificación de WhatsApp)
Usado por Meta/Facebook para verificar el webhook.

**Query Parameters:**
- `hub.mode=subscribe`
- `hub.verify_token=YOUR_VERIFY_TOKEN`
- `hub.challenge=RANDOM_STRING`

**Example:**
```
https://YOUR-API-GATEWAY-URL/prod/webhook?hub.mode=subscribe&hub.verify_token=mi_token_secreto_123&hub.challenge=12345
```

### 3. POST /webhook (Recibir Mensajes de WhatsApp)
Endpoint principal para recibir mensajes de WhatsApp.

**WhatsApp envía automáticamente a este endpoint cuando un usuario envía un mensaje.**

**Request Body (enviado por WhatsApp):**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "521234567890",
          "id": "wamid.xxx",
          "type": "text",
          "text": {
            "body": "¿Qué eventos hay esta semana?"
          }
        }]
      }
    }]
  }]
}
```

### 4. POST /chat (Pruebas Directas)
Endpoint para probar el agente directamente sin WhatsApp.

**Request:**
```bash
curl -X POST https://YOUR-API-GATEWAY-URL/prod/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "question": "¿Qué eventos hay esta semana?"
  }'
```

**Response:**
```json
{
  "sessionId": "test-123",
  "question": "¿Qué eventos hay esta semana?",
  "answer": "Esta semana tenemos los siguientes eventos...",
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

## Flujo de Mensajes de WhatsApp

1. **Usuario envía mensaje** → WhatsApp lo recibe
2. **WhatsApp POST a /webhook** → Lambda procesa
3. **Lambda acumula mensajes** → Espera 3 segundos por más mensajes
4. **Lambda llama a Bedrock Agent** → Obtiene respuesta
5. **Lambda envía respuesta** → WhatsApp entrega al usuario

### Acumulación de Mensajes
El sistema acumula múltiples mensajes del mismo usuario durante 3 segundos antes de enviarlos al agente. Esto evita múltiples invocaciones cuando el usuario envía mensajes consecutivos rápidamente.

## Instalación y Despliegue

### 1. Configurar AWS Secrets Manager

Cree un secreto con las credenciales de WhatsApp:

```bash
aws secretsmanager create-secret \
  --name whatsapp-credentials \
  --description "WhatsApp API credentials" \
  --secret-string '{
    "TOKEN_WHATSAPP": "your-whatsapp-token-here",
    "ID_PHONE_WHATSAPP": "your-phone-id-here",
    "VERIFY_TOKEN_WHATSAPP": "your-verify-token-here"
  }' \
  --profile mut-prod-territoria
```

Guarde el ARN del secreto que se muestra en la respuesta.

### 2. Configurar cdk.json

Actualice el contexto en `cdk.json`:

```json
{
  "context": {
    "secret_complete_arn": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:whatsapp-credentials-XXXXXX"
  }
}
```

### 3. Desplegar el stack
```bash
# Desde la raíz del proyecto
cd mut-agente-visitantes

# Activar entorno virtual
source venv/Scripts/activate  # Windows Git Bash
source venv/bin/activate       # Linux/Mac

# Instalar dependencias de Python
pip install -r requirements.txt

# Desplegar
cdk deploy ChatLambdaNodeStack --require-approval never --profile mut-prod-territoria
```

### 4. Obtener las URLs
Después del despliegue, verás los outputs:
```
Outputs:
ChatLambdaNodeStack.output-webhook-url = https://xxx.execute-api.us-east-1.amazonaws.com/prod/webhook
ChatLambdaNodeStack.output-chat-test-url = https://xxx.execute-api.us-east-1.amazonaws.com/prod/chat
```

## Configuración de WhatsApp Business

### 1. Ir a Meta Developer Console
https://developers.facebook.com/

### 2. Configurar Webhook
- **Callback URL**: `https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/webhook`
- **Verify Token**: `mi_token_secreto_123` (o el que configuraste)
- **Webhook Fields**: Seleccionar `messages`

### 3. Obtener Tokens
- **TOKEN_WHATS**: En WhatsApp > API Setup > Temporary access token (luego crear permanente)
- **IPHONE_ID_WHATS**: En WhatsApp > API Setup > Phone number ID

### 4. Verificar Configuración

**NO es necesario configurar variables de entorno manualmente.** El CDK stack configura automáticamente:

✅ Referencia al secreto de Secrets Manager  
✅ Permisos IAM para leer el secreto  
✅ Tablas DynamoDB  
✅ Permisos de Bedrock  

Para verificar el despliegue:
```bash
# Ver logs de la función
aws logs tail /aws/lambda/ChatLambdaNodeStack-chatlambdafn --follow --profile mut-prod-territoria

# Probar health check
curl https://YOUR-API-URL/prod/

# Probar verificación de webhook
curl "https://YOUR-API-URL/prod/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

## Ejemplos de Conversación

### Ejemplo 1: Consultar Eventos
```
Usuario: "¿Qué eventos hay esta semana?"
Bot: "Esta semana tenemos los siguientes eventos en el centro comercial:
      1. Concierto de Jazz - Viernes 20:00hrs - Plaza Central
      2. Festival de Comida - Sábado 12:00-22:00hrs - Explanada Principal
      3. Cuentacuentos para niños - Domingo 16:00hrs - Área Infantil"
```

### Ejemplo 2: Buscar Tienda
```
Usuario: "¿Dónde está Nike?"
Bot: "La tienda Nike se encuentra en el segundo piso, área deportiva, local 245.
      Horario: Lunes a Domingo 10:00 - 22:00hrs"
```

### Ejemplo 3: Recomendar Restaurante
```
Usuario: "Recomiéndame un restaurante italiano"
Bot: "Te recomiendo Trattoria Roma en el tercer piso, zona gourmet.
      Especialidades: Pasta fresca, pizzas al horno de leña.
      Precio promedio: $$
      Horario: 13:00 - 23:00hrs"
```

### Ejemplo 4: Conversación con Contexto
```
Usuario: "¿Qué restaurantes italianos tienen?"
Bot: "Tenemos 3 opciones: Trattoria Roma, La Dolce Vita y Pasta Amore..."

Usuario: "¿Cuál es el más económico?"
Bot: "Pasta Amore es la opción más económica, con precios desde $150..."
```

## Logs y Debugging

### Ver logs en CloudWatch
```bash
# Con perfil específico
aws logs tail /aws/lambda/ChatLambdaNodeStack-chatlambdafn --follow --profile mut-prod-territoria

# Filtrar solo errores
aws logs tail /aws/lambda/ChatLambdaNodeStack-chatlambdafn --follow --filter-pattern "ERROR" --profile mut-prod-territoria
```

### Logs importantes
- `🔧 Logger inicializado`: Configuración del logger (NODE_ENV: development/production)
- `[SECRETS] Fetching secrets`: Obteniendo credenciales de Secrets Manager
- `[SECRETS] Using cached secrets`: Usando cache de credenciales (mejor performance)
- `📥 Event received`: Request completo de API Gateway
- `🔍 Verificación webhook`: Verificación de webhook de WhatsApp
- `📨 Webhook POST recibido`: Mensaje de WhatsApp recibido
- `📱 Recibido de`: Mensaje individual procesado
- `📝 Mensaje completo`: Mensajes acumulados listos para enviar
- `📞 Invocando Bedrock Agent`: Llamada al agente
- `✅ Respuesta recibida`: Respuesta del agente
- `💬 Enviando respuesta`: Enviando mensaje a WhatsApp

### Niveles de Logging

El sistema usa diferentes niveles según `NODE_ENV`:

**Development (`NODE_ENV=development`):**
- Muestra: DEBUG, INFO, WARN, ERROR
- Útil para troubleshooting y desarrollo

**Production (`NODE_ENV=production`):**
- Muestra solo: WARN, ERROR  
- Reduce ruido en logs de producción

## Estructura de Archivos

```
lambda/
├── index.js                    # Handler principal (rutas y lógica)
├── getAgente.js                # Invocación a Bedrock Agent
├── send.message.js             # Envío de mensajes a WhatsApp (usa Secrets Manager)
├── llm-vector.js               # Integración con vectorial service
├── conversationService.js      # Gestión de conversaciones en DynamoDB
├── logger.js                   # Sistema de logging con niveles
├── secrets.js                  # 🔑 Cliente de AWS Secrets Manager
├── bedrock/
│   └── claude.service.js       # Servicio de Claude
├── plantillas/
│   └── prompts.js              # Prompts del sistema
├── package.json                # Dependencias (incluye @aws-sdk/client-secrets-manager)
└── README.md                   # Esta documentación
```

## Módulo secrets.js

Nuevo módulo para gestión segura de credenciales:

```javascript
import { getWhatsAppCredentials } from './secrets.js';

// Uso en cualquier módulo
const secrets = await getWhatsAppCredentials();
console.log(secrets.TOKEN_WHATS);
console.log(secrets.IPHONE_ID_WHATS);
console.log(secrets.VERIFY_TOKEN);
```

**Características:**
- ⚡ Cache en memoria (5 minutos TTL)
- 🔄 Recarga automática al expirar
- 🛡️ Manejo de errores robusto
- 📊 Logging detallado

## Manejo de Errores

El Lambda maneja los siguientes errores:

### AccessDeniedException
```json
{
  "error": "Access denied to Bedrock Agent. Check IAM permissions."
}
```
**Solución**: Verificar permisos IAM del Lambda

### ResourceNotFoundException
```json
{
  "error": "Agent or Alias not found."
}
```
**Solución**: Verificar AGENT_ID y AGENT_ALIAS_ID

### ThrottlingException
```json
{
  "error": "Request throttled. Please try again later."
}
```
**Solución**: Implementar retry logic o aumentar límites de Bedrock

### ValidationException
```json
{
  "error": "Hubo un problema con tu pregunta. ¿Puedes reformularla?"
}
```
**Solución**: El usuario debe reformular la pregunta

## Permisos IAM Requeridos

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeAgent",
        "bedrock:GetAgent",
        "bedrock:GetAgentAlias",
        "bedrock:Retrieve",
        "bedrock:RetrieveAndGenerate"
      ],
      "Resource": "*"
    }
  ]
}
```

## Pruebas Locales

### Probar endpoint /chat
```bash
curl -X POST https://YOUR-API-URL/prod/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-1",
    "question": "¿Qué eventos hay hoy?"
  }'
```

### Probar verificación webhook
```bash
curl "https://YOUR-API-URL/prod/webhook?hub.mode=subscribe&hub.verify_token=mi_token_secreto_123&hub.challenge=test123"
```

## Troubleshooting

### Problema: "Endpoint not found"
**Solución**: Verificar que la ruta esté correctamente configurada en API Gateway

### Problema: "VERIFY_TOKEN no coincide"
**Solución**: Actualizar la variable de entorno VERIFY_TOKEN en Lambda

### Problema: "WhatsApp no recibe respuestas"
**Solución**: 
1. Verificar TOKEN_WHATS y IPHONE_ID_WHATS
2. Ver logs de CloudWatch para errores
3. Verificar que el webhook esté verificado en Meta Console

### Problema: "Mensajes duplicados"
**Solución**: El sistema de acumulación debería prevenir esto. Verificar logs.

## Monitoreo

### Métricas importantes en CloudWatch:
- **Invocations**: Número de invocaciones del Lambda
- **Duration**: Tiempo de ejecución (debería ser < 60s)
- **Errors**: Errores de ejecución
- **Throttles**: Invocaciones throttled

---
**Última actualización:** 2025-10-19  
**Versión:** 2.0 (Nativo sin Express)


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

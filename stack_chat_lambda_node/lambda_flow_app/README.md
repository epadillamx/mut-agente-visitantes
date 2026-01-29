# WhatsApp Flow - Sistema de Reporte de Incidencias

AWS Lambda function en Node.js para gestionar un WhatsApp Flow de reporte de incidencias. El sistema permite a los usuarios buscar locales, reportar incidencias y guardarlas en AWS DynamoDB.

## Características

- 🔍 Búsqueda inteligente de locales (200+ locales incluidos)
- ✅ Validación de datos en tiempo real
- 🔐 Cifrado/descifrado de mensajes WhatsApp con claves RSA
- 💾 Almacenamiento seguro en DynamoDB
- 🔑 Credenciales gestionadas con AWS Secrets Manager
- 🚀 Despliegue serverless con AWS Lambda + API Gateway
- 📊 Health checks y endpoints de monitoreo
- ⚡ Runtime Node.js 22.x

## Arquitectura

```
WhatsApp Flow Request
        ↓
  API Gateway (/flow)
        ↓
  Lambda Handler (lambda-handler.js)
        ↓
  ┌─────┴─────┐
  ↓           ↓
Secrets    Flow Controller
Manager         ↓
  ↓       ┌────┴────┐
  ↓       ↓         ↓
  ↓    Local    DynamoDB
  ↓   Service   Service
  ↓       ↓         ↓
  └───→ Decrypt → Process → Save
              ↓
         Encrypt Response
              ↓
         API Gateway
              ↓
        WhatsApp Flow
```

## Estructura del Proyecto

```
lambda_flow_app/
├── lambda-handler.js              # AWS Lambda handler principal
├── src/
│   ├── controllers/
│   │   └── flowController.js      # Lógica del WhatsApp Flow
│   ├── services/
│   │   ├── localService.js        # Servicio de búsqueda de locales
│   │   └── dynamoService.js       # Servicio de DynamoDB
│   ├── data/
│   │   └── locales.json           # Lista de 210 locales del centro comercial
│   └── utils/
│       ├── crypto.js              # Cifrado/descifrado RSA + AES
│       └── secrets.js             # Cliente de AWS Secrets Manager
├── package.json
├── ARCHITECTURE.md                 # Arquitectura detallada
├── DEPLOYMENT.md                   # Guía de despliegue
├── LAMBDA_DEPLOYMENT.md            # Configuración Lambda específica
└── README.md                       # Esta documentación
```

## Requisitos Previos

- AWS CLI configurado
- AWS CDK instalado (`npm install -g aws-cdk`)
- Node.js 20+ (para desarrollo local)
- Cuenta de AWS con permisos para:
  - Lambda
  - API Gateway
  - DynamoDB
  - Secrets Manager
  - IAM
- WhatsApp Business Account configurado

## Despliegue con AWS CDK

### 1. Configurar Secrets Manager

Primero, cree un secreto en AWS Secrets Manager con las credenciales de WhatsApp:

```bash
aws secretsmanager create-secret \
  --name whatsapp-credentials \
  --description "WhatsApp API credentials" \
  --secret-string '{
    "TOKEN_WHATSAPP": "your-whatsapp-token",
    "ID_PHONE_WHATSAPP": "your-phone-id",
    "VERIFY_TOKEN_WHATSAPP": "your-verify-token",
    "WHATSAPP_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "WHATSAPP_PRIVATE_KEY_PASSPHRASE": "your-passphrase"
  }'
```

### 2. Configurar cdk.json

Actualice el archivo `cdk.json` en la raíz del proyecto:

```json
{
  "context": {
    "secret_complete_arn": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:whatsapp-credentials-XXXXXX"
  }
}
```

### 3. Desplegar el Stack

```bash
# Desde la raíz del proyecto
cd mut-agente-visitantes

# Activar entorno virtual de Python
source venv/Scripts/activate  # Windows Git Bash
# o
source venv/bin/activate       # Linux/Mac

# Desplegar el stack
cdk deploy ChatLambdaNodeStack --require-approval never --profile mut-prod-territoria
```

### 4. Obtener URLs del Deploy

Después del despliegue, CDK mostrará los outputs:

```
Outputs:
ChatLambdaNodeStack.output-whatsapp-flow-url = https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/flow
ChatLambdaNodeStack.output-health-url = https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/health
```

## Variables de Entorno (AWS Lambda)

Estas variables se configuran automáticamente por el CDK stack:

| Variable | Descripción | Origen |
|----------|-------------|--------|
| `NODE_ENV` | Ambiente de ejecución | CDK Stack |
| `WHATSAPP_SECRET_ARN` | ARN del secreto en Secrets Manager | CDK Stack |
| `DYNAMODB_TABLE_INCIDENCIAS` | Nombre de la tabla DynamoDB | CDK Stack |
| `AWS_REGION` | Región de AWS | Lambda Runtime |

**Nota:** Las credenciales de WhatsApp se obtienen en runtime desde Secrets Manager, no como variables de entorno directas por seguridad.

```bash
git clone <repository-url>
cd whatsapp-flow-incidencias
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copie el archivo `.env.example` a `.env` y configure las siguientes variables:

```bash
cp .env.example .env
```

Edite el archivo `.env`:

```env
PORT=3000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
DYNAMODB_TABLE_INCIDENCIAS=incidencias
NODE_ENV=development
```

### 4. Configurar AWS

#### Crear usuario IAM

1. Inicie sesión en AWS Console
2. Vaya a IAM → Usuarios → Crear usuario
3. Nombre: `whatsapp-flow-user`
4. Seleccione "Acceso mediante programación"
5. Adjunte la política: `AmazonDynamoDBFullAccess` (o cree una personalizada)

#### Política IAM personalizada (recomendada)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/incidencias",
        "arn:aws:dynamodb:us-east-1:*:table/incidencias/index/*"
      ]
    }
  ]
}
```

6. Copie las credenciales (Access Key ID y Secret Access Key)
7. Péguelas en el archivo `.env`

### 5. Crear tabla DynamoDB

```bash
node scripts/create-dynamodb-table.js create
```

Este script creará una tabla con la siguiente estructura:

- **Tabla**: `incidencias`
- **Partition Key**: `id` (String)
- **GSI**: `local_id-fecha_creacion-index`
  - Hash Key: `local_id` (String)
  - Range Key: `fecha_creacion` (String)

Para eliminar la tabla:

```bash
node scripts/create-dynamodb-table.js delete
```

### 6. Configurar WhatsApp Encryption

Para obtener las claves de cifrado de WhatsApp:

1. Genere un par de claves RSA:

```bash
# Generar clave privada
openssl genrsa -out private.pem -aes256 2048

# Extraer clave pública
openssl rsa -in private.pem -pubout -out public.pem
```

2. Copie el archivo `private.pem` a la raíz del proyecto como `private_key.pem`
3. La passphrase está configurada directamente en el código
4. Configure la clave pública en WhatsApp Business Manager usando el script:

```bash
./register-public-key.sh
```

5. Valide la configuración:

```bash
./validate-public-key.sh
```

## Ejecución

### Modo Desarrollo (sin Docker)

```bash
npm start
```

O con nodemon:

```bash
npm run dev
```

### Modo Producción con Docker

#### Construcción de la imagen

```bash
docker build -t whatsapp-flow-incidencias .
```

#### Ejecución con Docker Compose

```bash
docker-compose up --build
```

Para ejecutar en background:

```bash
docker-compose up -d
```

Ver logs:

```bash
docker-compose logs -f
```

Detener:

```bash
docker-compose down
```

#### Ejecución manual con Docker

```bash
docker run -p 3000:3000 --env-file .env whatsapp-flow-incidencias
```

## API Endpoints

### POST /webhook/flow

Endpoint principal para recibir requests del WhatsApp Flow.

**Request:**
```json
{
  "encrypted_flow_data": "...",
  "encrypted_aes_key": "...",
  "initial_vector": "..."
}
```

**Response:**
```json
{
  "version": "3.0",
  "screen": "INCIDENT_FORM",
  "data": { ... }
}
```

### GET /webhook/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-06T10:00:00.000Z",
  "service": "whatsapp-flow-incidencias"
}
```

### GET /webhook/locales/count

Retorna el número total de locales disponibles.

**Response:**
```json
{
  "total": 210,
  "timestamp": "2025-12-06T10:00:00.000Z"
}
```

## WhatsApp Flow - Estructura

### Pantallas

1. **INCIDENT_FORM**
   - Campos: nombre, email, búsqueda de local
   - Trigger: `search_local` para búsqueda dinámica

2. **INCIDENT_DETAILS**
   - Campo: descripción de la incidencia
   - Validación: mínimo 10 caracteres

3. **CONFIRMATION**
   - Muestra resumen de los datos
   - Acción final: `complete`

### Flujo de Datos

```
INIT → INCIDENT_FORM
       ↓ (search_local trigger)
       INCIDENT_FORM (con resultados)
       ↓ (submit)
       INCIDENT_DETAILS
       ↓ (submit)
       CONFIRMATION
       ↓ (complete)
       Guardado en DynamoDB
```

### Triggers Implementados

#### 1. search_local

**Input:**
```json
{
  "trigger": "search_local",
  "busqueda_local": "centro"
}
```

**Output:**
```json
{
  "version": "3.0",
  "screen": "INCIDENT_FORM",
  "data": {
    "locales": [
      {"id": "local_001", "title": "Centro Comercial Andino - Bogotá"}
    ],
    "is_local_enabled": true,
    "search_helper": "✅ 1 local encontrado"
  }
}
```

#### 2. Data Exchange (INCIDENT_DETAILS → CONFIRMATION)

**Input:**
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "local": "local_001",
  "incidencia": "Descripción de la incidencia..."
}
```

**Output:**
```json
{
  "version": "3.0",
  "screen": "CONFIRMATION",
  "data": {
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "local": "Centro Comercial Andino - Bogotá",
    "incidencia": "...",
    "resumen_datos": "Nombre: Juan Pérez\nEmail: juan@example.com",
    "resumen_incidencia": "Local: ...\n\nDescripción:\n..."
  }
}
```

#### 3. Complete Action

**Input:**
```json
{
  "action": "complete",
  "data": {
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "local_id": "local_001",
    "incidencia": "..."
  }
}
```

**Output:**
```json
{
  "version": "3.0",
  "data": {
    "success": true,
    "incident_id": "uuid-here",
    "message": "Incidencia reportada exitosamente"
  }
}
```

## Estructura de Datos en DynamoDB

### Item de Incidencia

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "local_id": "local_001",
  "local_nombre": "Centro Comercial Andino - Bogotá",
  "incidencia": "Descripción detallada de la incidencia...",
  "fecha_creacion": "2025-12-06T10:00:00.000Z",
  "estado": "pendiente"
}
```

### Consultas Disponibles

**Por ID:**
```javascript
await dynamoService.getIncident(id);
```

**Por Local:**
```javascript
await dynamoService.getIncidentsByLocal(localId);
```

**Actualizar Estado:**
```javascript
await dynamoService.updateIncidentStatus(id, 'resuelto');
```

## Validaciones

El sistema implementa las siguientes validaciones:

1. **Búsqueda de local**: Mínimo 3 caracteres
2. **Nombre**: No vacío
3. **Email**: Formato válido (regex)
4. **Local**: ID válido en la lista
5. **Incidencia**: Mínimo 10 caracteres

## Testing

### Test Manual con curl

**Health Check:**
```bash
curl http://localhost:3000/webhook/health
```

**Count Locales:**
```bash
curl http://localhost:3000/webhook/locales/count
```

**Test Flow (modo desarrollo sin cifrado):**
```bash
curl -X POST http://localhost:3000/webhook/flow \
  -H "Content-Type: application/json" \
  -d '{
    "action": "data_exchange",
    "screen": "INCIDENT_FORM",
    "data": {
      "trigger": "search_local",
      "busqueda_local": "bogota"
    }
  }'
```

## Logs y Monitoreo

El sistema registra los siguientes eventos:

- Requests recibidos
- Datos descifrados
- Búsquedas de locales
- Incidencias guardadas
- Errores

Para ver logs en Docker:

```bash
docker-compose logs -f app
```

## Solución de Problemas

### Error: "WhatsApp encryption keys not configured"

- Verifique que el archivo `private_key.pem` exista en la raíz del proyecto
- Confirme que el archivo contiene una clave RSA válida

### Error: "Failed to save incident"

- Verifique las credenciales de AWS
- Confirme que la tabla DynamoDB existe
- Revise los permisos IAM

### Error: "Failed to decrypt request"

- Verifique que la clave privada sea correcta
- Confirme que el passphrase sea correcto
- Asegúrese de que WhatsApp tenga la clave pública correcta

### Tabla DynamoDB no existe

```bash
node scripts/create-dynamodb-table.js create
```

## Seguridad

- Las claves privadas nunca deben commitearse al repositorio
- Use `.env` para credenciales sensibles
- Implemente rate limiting en producción
- Use HTTPS en producción
- Valide todos los inputs
- Mantenga las dependencias actualizadas

## Costos AWS

**DynamoDB:**
- Capacidad provisionada: 5 RCU / 5 WCU
- Costo estimado: ~$2.50/mes (bajo uso)
- Considere modo on-demand para uso variable

## Contribución

1. Fork el proyecto
2. Cree una rama para su feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit sus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Cree un Pull Request

## Licencia

ISC

## Soporte

Para preguntas o problemas, abra un issue en el repositorio.

## Notas Adicionales

### Despliegue en Producción

Para despliegue en AWS EC2, ECS, o Lambda:

1. Configure variables de entorno en el servicio
2. Use AWS Systems Manager Parameter Store o Secrets Manager para credenciales
3. Configure un Application Load Balancer
4. Implemente Auto Scaling
5. Configure CloudWatch para logs y métricas

### Próximas Mejoras

- Autenticación de webhook
- Rate limiting
- Caché de búsquedas
- Dashboard de administración
- Notificaciones por email
- Exportación de reportes
- Tests unitarios e integración


openssl genrsa -out private.pem -aes256 -passout pass:CHANGE 2048openssl rsa -in private.pem -pubout -out public.pem -passout pass:CHANGE
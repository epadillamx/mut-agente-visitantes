# Arquitectura del Sistema

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                      WhatsApp Business                       │
│                         (Cliente)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ HTTPS (Encrypted)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express Server (Node.js)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Webhook Routes (/webhook/*)              │  │
│  │  - POST /webhook/flow                                 │  │
│  │  - GET  /webhook/health                               │  │
│  │  - GET  /webhook/locales/count                        │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Crypto Utils (crypto.js)                 │  │
│  │  - Decrypt WhatsApp requests (RSA + AES-GCM)          │  │
│  │  - Encrypt WhatsApp responses (AES-GCM)               │  │
│  │  - Email validation                                   │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Flow Controller (flowController.js)           │  │
│  │  - Handle flow actions (init, data_exchange, complete)│  │
│  │  - Process triggers (search_local)                    │  │
│  │  - Validate form data                                 │  │
│  │  - Orchestrate services                               │  │
│  └─────────┬─────────────────────────────┬───────────────┘  │
│            │                             │                   │
│            ▼                             ▼                   │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │   Local Service      │    │    Dynamo Service        │  │
│  │ (localService.js)    │    │  (dynamoService.js)      │  │
│  │                      │    │                          │  │
│  │ - Load locales.json  │    │ - Save incidents         │  │
│  │ - Search locales     │    │ - Get incidents          │  │
│  │ - Validate local ID  │    │ - Query by local         │  │
│  │                      │    │ - Update status          │  │
│  └──────────┬───────────┘    └────────────┬─────────────┘  │
│             │                             │                 │
└─────────────┼─────────────────────────────┼─────────────────┘
              │                             │
              ▼                             ▼
    ┌──────────────────┐         ┌──────────────────────┐
    │  locales.json    │         │   AWS DynamoDB       │
    │  (210 locales)   │         │   Table: incidencias │
    └──────────────────┘         └──────────────────────┘
```

## Flujo de Datos - WhatsApp Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      INCIDENT_FORM                          │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Campos:                                            │     │
│  │  - nombre (texto)                                  │     │
│  │  - email (email)                                   │     │
│  │  - busqueda_local (texto con trigger)              │     │
│  │  - local (dropdown dinámico)                       │     │
│  └────────────────────────────────────────────────────┘     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Trigger: search_local
                 │ (mínimo 4 caracteres)
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend: Local Service Search                   │
│  - Busca en locales.json (LIKE case-insensitive)            │
│  - Retorna máximo 10 resultados                             │
│  - Actualiza dropdown con resultados                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Usuario selecciona local y continúa
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   INCIDENT_DETAILS                          │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Campos:                                            │     │
│  │  - incidencia (textarea, min 10 chars)             │     │
│  └────────────────────────────────────────────────────┘     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Data Exchange
                 │ (validación de datos)
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│               Backend: Validate & Format                     │
│  - Valida email, nombre, local, incidencia                  │
│  - Genera resúmenes formateados                             │
│  - Prepara datos para confirmación                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Navegación a CONFIRMATION
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     CONFIRMATION                            │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Vista:                                             │     │
│  │  - resumen_datos (nombre, email)                   │     │
│  │  - resumen_incidencia (local, descripción)         │     │
│  │  - Botón "Confirmar"                               │     │
│  └────────────────────────────────────────────────────┘     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Action: complete
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend: Save to DynamoDB                   │
│  - Genera UUID                                              │
│  - Crea registro con timestamp                              │
│  - Estado: "pendiente"                                      │
│  - Guarda en tabla "incidencias"                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Success Response
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                     WhatsApp Confirmación                   │
│  "✅ Incidencia reportada exitosamente"                     │
└─────────────────────────────────────────────────────────────┘
```

## Flujo de Cifrado/Descifrado

```
WhatsApp → Encrypted Request
           │
           ├─ encrypted_aes_key (RSA encrypted)
           ├─ initial_vector
           ├─ encrypted_flow_data (AES-GCM encrypted)
           └─ encrypted_flow_data_tag (auth tag)
           │
           ▼
Backend:   Decrypt AES key using RSA private key
           │
           ▼
           Decrypt flow data using AES-GCM
           │
           ▼
           Process flow logic
           │
           ▼
           Encrypt response using AES-GCM (flipped IV)
           │
           ▼
WhatsApp ← Encrypted Response
```

## Estructura de Datos - DynamoDB

### Tabla: incidencias

**Primary Key:**
- `id` (String) - UUID generado

**Attributes:**
- `nombre` (String) - Nombre del reportante
- `email` (String) - Email del reportante
- `local_id` (String) - ID del local
- `local_nombre` (String) - Nombre del local
- `incidencia` (String) - Descripción de la incidencia
- `fecha_creacion` (String) - ISO timestamp
- `estado` (String) - Estado (pendiente, en_proceso, resuelto)

**Global Secondary Index:**
- `local_id-fecha_creacion-index`
  - Hash Key: `local_id`
  - Range Key: `fecha_creacion`
  - Projection: ALL

**Patrones de Acceso:**

1. **Get por ID** (lectura directa)
   ```
   GetItem { id: "uuid" }
   ```

2. **Query por Local** (usando GSI)
   ```
   Query {
     IndexName: "local_id-fecha_creacion-index",
     KeyConditionExpression: "local_id = :local_id",
     ScanIndexForward: false
   }
   ```

3. **Update Estado**
   ```
   UpdateItem {
     Key: { id: "uuid" },
     UpdateExpression: "SET estado = :status"
   }
   ```

## Variables de Entorno

```
┌─────────────────────────────────────────────────────────┐
│ PORT                        → 3000                      │
│ AWS_REGION                  → us-east-1                 │
│ AWS_ACCESS_KEY_ID           → IAM credentials           │
│ AWS_SECRET_ACCESS_KEY       → IAM credentials           │
│ DYNAMODB_TABLE_INCIDENCIAS  → incidencias               │
│ NODE_ENV                    → development/production    │
│                                                           │
│ Archivo: private_key.pem    → RSA private key (PEM)     │
└─────────────────────────────────────────────────────────┘
```

## Endpoints API

### 1. POST /webhook/flow
**Propósito:** Endpoint principal para WhatsApp Flow
**Autenticación:** Cifrado WhatsApp
**Rate Limit:** Pendiente implementar

### 2. GET /webhook/health
**Propósito:** Health check del servicio
**Autenticación:** Ninguna
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-06T10:00:00.000Z",
  "service": "whatsapp-flow-incidencias"
}
```

### 3. GET /webhook/locales/count
**Propósito:** Verificar cantidad de locales cargados
**Autenticación:** Ninguna
**Response:**
```json
{
  "total": 210,
  "timestamp": "2025-12-06T10:00:00.000Z"
}
```

## Manejo de Errores

```
Error → Logged to console
        ├─ Development: Detailed error message
        └─ Production: Generic error message
        │
        ▼
        Response to WhatsApp
        {
          "version": "3.0",
          "data": {
            "error": true,
            "error_message": "..."
          }
        }
```

## Escalabilidad

### Horizontal Scaling
- Stateless design permite múltiples instancias
- Load balancer distribuye tráfico
- DynamoDB escala automáticamente

### Vertical Scaling
- Aumentar recursos de contenedor/VM
- Ajustar capacidad DynamoDB (RCU/WCU)

### Caching (futuro)
- Redis para búsquedas frecuentes
- Caché en memoria de locales.json

## Seguridad

### Capas de Seguridad

1. **Transporte**
   - HTTPS obligatorio en producción
   - TLS 1.2+

2. **Aplicación**
   - Validación de inputs
   - Sanitización de datos
   - Rate limiting (pendiente)

3. **Datos**
   - Cifrado WhatsApp (RSA + AES-GCM)
   - Credenciales en variables de entorno
   - IAM roles con mínimos privilegios

4. **Infraestructura**
   - Docker container isolation
   - Security groups AWS
   - VPC (recomendado para producción)

## Monitoreo (recomendaciones)

- **Logs:** CloudWatch Logs
- **Métricas:** CloudWatch Metrics
- **Alertas:** SNS notifications
- **Trazabilidad:** AWS X-Ray
- **Uptime:** Route 53 health checks

## Costos Estimados AWS

**Escenario: 1000 incidentes/mes**

| Servicio | Uso | Costo Mensual |
|----------|-----|---------------|
| DynamoDB | 5 RCU, 5 WCU | ~$2.50 |
| EC2 t3.micro | 24/7 | ~$7.50 |
| Data Transfer | <1GB | ~$0.10 |
| **TOTAL** | | **~$10.10** |

**Nota:** Usar Lambda + API Gateway puede reducir costos para bajo volumen.

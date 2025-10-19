# 🔐 Configuración de Parameter Store para WhatsApp

## Descripción

Los tokens y credenciales de WhatsApp se almacenan de forma segura en **AWS Systems Manager Parameter Store** como **SecureString** (encriptados con KMS).

## Parámetros Requeridos

| Parámetro | Ruta en SSM | Descripción |
|-----------|-------------|-------------|
| **TOKEN_WHATS** | `/whatsapp/bedrock-agent/token` | Token de acceso de WhatsApp Business API |
| **IPHONE_ID_WHATS** | `/whatsapp/bedrock-agent/phone-id` | ID del número de teléfono de WhatsApp |
| **VERIFY_TOKEN** | `/whatsapp/bedrock-agent/verify-token` | Token de verificación para webhook |

## Método 1: Script Automatizado (Recomendado)

### Windows (PowerShell)
```powershell
.\setup-whatsapp-parameters.ps1
```

### Linux/Mac (Bash)
```bash
chmod +x setup-whatsapp-parameters.sh
./setup-whatsapp-parameters.sh
```

El script te guiará paso a paso para crear los 3 parámetros necesarios.

## Método 2: AWS CLI Manual

### 1. Crear TOKEN_WHATS
```bash
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --value "YOUR_WHATSAPP_ACCESS_TOKEN" \
  --type SecureString \
  --description "WhatsApp Business API Access Token" \
  --region us-east-1
```

### 2. Crear IPHONE_ID_WHATS
```bash
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/phone-id" \
  --value "YOUR_PHONE_NUMBER_ID" \
  --type SecureString \
  --description "WhatsApp Business Phone Number ID" \
  --region us-east-1
```

### 3. Crear VERIFY_TOKEN
```bash
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/verify-token" \
  --value "mi_token_secreto_123" \
  --type SecureString \
  --description "WhatsApp Webhook Verification Token" \
  --region us-east-1
```

## Método 3: AWS Console

1. Ir a **AWS Console** → **Systems Manager** → **Parameter Store**
2. Click en **Create parameter**
3. Para cada parámetro:
   - **Name**: Usar la ruta exacta (ej: `/whatsapp/bedrock-agent/token`)
   - **Type**: `SecureString`
   - **KMS key**: `alias/aws/ssm` (default)
   - **Value**: El valor correspondiente
4. Click **Create parameter**

## Obtener Valores de WhatsApp

### TOKEN_WHATS
1. Ir a https://developers.facebook.com/
2. Seleccionar tu aplicación
3. WhatsApp → **API Setup**
4. Copiar el **Access Token** (temporal o permanente)

### IPHONE_ID_WHATS
1. En la misma página de **API Setup**
2. Buscar **Phone number ID**
3. Copiar el ID (número largo)

### VERIFY_TOKEN
- Puedes usar cualquier string seguro
- Ejemplo: `mi_token_secreto_123`
- Este mismo valor lo usarás en Meta Developer Console

## Verificar Parámetros Creados

```bash
# Listar todos los parámetros
aws ssm get-parameters-by-path \
  --path "/whatsapp/bedrock-agent/" \
  --with-decryption \
  --region us-east-1

# Ver un parámetro específico
aws ssm get-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --with-decryption \
  --region us-east-1
```

## Actualizar un Parámetro

```bash
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --value "NEW_TOKEN_VALUE" \
  --type SecureString \
  --overwrite \
  --region us-east-1
```

## Eliminar un Parámetro

```bash
aws ssm delete-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --region us-east-1
```

## Cómo Funciona en el Lambda

### 1. Configuración del Stack CDK
El stack configura las rutas de los parámetros como variables de entorno:

```python
environment={
    "PARAM_TOKEN_WHATS": "/whatsapp/bedrock-agent/token",
    "PARAM_IPHONE_ID": "/whatsapp/bedrock-agent/phone-id",
    "PARAM_VERIFY_TOKEN": "/whatsapp/bedrock-agent/verify-token"
}
```

### 2. Permisos IAM
El Lambda tiene permisos para leer estos parámetros:

```python
actions=[
    "ssm:GetParameter",
    "ssm:GetParameters"
]
```

### 3. Lectura en el Lambda
El código usa `ssmHelper.js` para leer los parámetros:

```javascript
const { getWhatsAppCredentials } = require('./ssmHelper');

// Obtener credenciales (con cache de 5 minutos)
const credentials = await getWhatsAppCredentials();

// Usar credenciales
const token = credentials.token;
const phoneId = credentials.phoneId;
const verifyToken = credentials.verifyToken;
```

### 4. Cache Automático
Los parámetros se cachean por 5 minutos para reducir llamadas a SSM y mejorar performance.

## Ventajas de usar Parameter Store

✅ **Seguridad**: Los valores están encriptados con KMS
✅ **Rotación**: Actualizar tokens sin redesplegar el Lambda
✅ **Auditoría**: CloudTrail registra accesos a parámetros
✅ **Versionado**: Historial de cambios en cada parámetro
✅ **Control de acceso**: IAM controla quién puede leer/escribir
✅ **Sin costos**: Hasta 10,000 parámetros gratis

## Permisos IAM Necesarios

Para ejecutar los scripts, tu usuario/rol de AWS necesita:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:PutParameter",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:DeleteParameter"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/whatsapp/bedrock-agent/*"
    }
  ]
}
```

## Troubleshooting

### Error: "ParameterNotFound"
**Causa**: El parámetro no existe en Parameter Store
**Solución**: Ejecutar el script de configuración o crearlo manualmente

### Error: "AccessDeniedException"
**Causa**: El Lambda no tiene permisos IAM para leer parámetros
**Solución**: Verificar que el stack CDK configuró los permisos correctamente

### Error: "InvalidKeyId"
**Causa**: Error con la KMS key
**Solución**: Usar la key por defecto `alias/aws/ssm`

### Cache no actualiza
**Causa**: El Lambda cachea los parámetros por 5 minutos
**Solución**: Esperar 5 minutos o reiniciar el Lambda

## Costos

- **Parameter Store Standard**: Gratis (hasta 10,000 parámetros)
- **KMS encriptación**: $0 (usando la key default de AWS)
- **API calls**: $0.05 por 10,000 llamadas (con cache, muy bajo)

## Migración desde Variables de Entorno

Si ya tenías los valores en variables de entorno:

1. Ejecuta el script de configuración
2. Los valores migrarán automáticamente a Parameter Store
3. El Lambda usará los nuevos parámetros encriptados
4. Las variables de entorno antiguas se ignorarán

## Referencias

- [AWS Parameter Store Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [WhatsApp Business API Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)

---
**Última actualización:** 2025-10-19
**Versión:** 1.0

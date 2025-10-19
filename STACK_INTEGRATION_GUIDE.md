# Guía de Integración de Stacks - WhatsApp Bedrock Agent

## 📋 Resumen de Cambios

Esta guía documenta la integración completa entre los stacks de Bedrock y Chat Lambda, incluyendo la automatización de la creación de parámetros en Parameter Store.

## 🏗️ Arquitectura de Dependencias

```
┌─────────────────────────────────────────────────────────┐
│ GenAiVirtualAssistantBedrockStack                       │
│                                                          │
│  ✓ Bedrock Agent (FH6HJUBIZQ)                          │
│  ✓ Agent Alias (LP1AND7OTN)                            │
│  ✓ Knowledge Base (NRSWGGNEXW)                         │
│  ✓ SSM Parameters (SecureString)                        │
│    - /whatsapp/bedrock-agent/token                      │
│    - /whatsapp/bedrock-agent/phone-id                   │
│    - /whatsapp/bedrock-agent/verify-token               │
│                                                          │
│  Exports: agent_id, agent_alias_id                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ depends on
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ ChatLambdaNodeStack                                      │
│                                                          │
│  Inputs: agent_id, agent_alias_id                       │
│                                                          │
│  ✓ Lambda Function (Node.js 22)                         │
│  ✓ API Gateway (REST)                                   │
│  ✓ WhatsApp Webhook Endpoints                           │
│  ✓ SSM Permissions                                       │
│  ✓ Bedrock Permissions                                   │
└─────────────────────────────────────────────────────────┘
```

## 🔧 Cambios Implementados

### 1. Stack de Bedrock (`stack_backend_bedrock.py`)

#### Nuevas Propiedades Públicas
```python
# Exponer Agent ID y Alias ID para uso en otros stacks
self.agent_id = agent.agent_id
self.agent_alias_id = agent_alias.alias_id
```

#### Nuevo Método: `_create_whatsapp_parameters()`
Crea automáticamente los parámetros de Parameter Store como SecureString:

```python
def _create_whatsapp_parameters(self):
    """
    Crea los parámetros de WhatsApp en AWS Parameter Store
    """
    # Token de acceso de WhatsApp
    token_param = ssm.StringParameter(
        self, "WhatsAppTokenParameter",
        parameter_name="/whatsapp/bedrock-agent/token",
        string_value="PLACEHOLDER_UPDATE_WITH_REAL_TOKEN",
        description="WhatsApp Business API Access Token",
        type=ssm.ParameterType.SECURE_STRING,
        tier=ssm.ParameterTier.STANDARD
    )
    
    # ID del teléfono de WhatsApp
    phone_param = ssm.StringParameter(
        self, "WhatsAppPhoneIdParameter",
        parameter_name="/whatsapp/bedrock-agent/phone-id",
        string_value="PLACEHOLDER_UPDATE_WITH_PHONE_ID",
        description="WhatsApp Business Phone Number ID",
        type=ssm.ParameterType.SECURE_STRING,
        tier=ssm.ParameterTier.STANDARD
    )
    
    # Token de verificación del webhook
    verify_param = ssm.StringParameter(
        self, "WhatsAppVerifyTokenParameter",
        parameter_name="/whatsapp/bedrock-agent/verify-token",
        string_value="mi_token_secreto_123",
        description="WhatsApp Webhook Verification Token",
        type=ssm.ParameterType.SECURE_STRING,
        tier=ssm.ParameterTier.STANDARD
    )
```

**Outputs Creados:**
- `WhatsAppTokenParameterName`
- `WhatsAppPhoneIdParameterName`
- `WhatsAppVerifyTokenParameterName`

### 2. Stack de Chat Lambda (`stack_chat_lambda.py`)

#### Constructor Actualizado
```python
def __init__(self, scope: Construct, construct_id: str, agent_id: str, agent_alias_id: str, **kwargs) -> None:
    super().__init__(scope, construct_id, **kwargs)
```

**Parámetros recibidos:**
- `agent_id`: ID del Bedrock Agent desde el stack de Bedrock
- `agent_alias_id`: ID del Alias desde el stack de Bedrock

#### Variables de Entorno del Lambda
```python
environment={
    "AGENT_ID": agent_id,           # Recibido desde bedrock_stack
    "AGENT_ALIAS_ID": agent_alias_id,  # Recibido desde bedrock_stack
    "PARAM_TOKEN_WHATS": "/whatsapp/bedrock-agent/token",
    "PARAM_IPHONE_ID": "/whatsapp/bedrock-agent/phone-id",
    "PARAM_VERIFY_TOKEN": "/whatsapp/bedrock-agent/verify-token"
}
```

### 3. Archivo Principal (`app.py`)

#### Instanciación del Chat Stack
```python
# Chat Lambda with API Gateway Stack
chat_stack = ChatLambdaNodeStack(app,
                                 "ChatLambdaNodeStack",
                                 agent_id=bedrock_stack.agent_id,          # Pasa agent_id
                                 agent_alias_id=bedrock_stack.agent_alias_id,  # Pasa alias_id
                                 env=env_aws_settings)
```

#### Dependencias Configuradas
```python
# Hard Dependencies
bedrock_stack.add_dependency(s3_stack)
etl_stack.add_dependency(s3_stack)
chat_stack.add_dependency(bedrock_stack)  # Chat depende de Bedrock
```

## 🚀 Pasos de Despliegue

### 1. Validar Sintaxis
```bash
cdk synth
```

### 2. Desplegar Todos los Stacks
```bash
cdk deploy --all
```

**Orden de Despliegue (automático por dependencias):**
1. `GenAiVirtualAssistantS3Stack`
2. `GenAiVirtualAssistantBedrockStack` (crea SSM parameters)
3. `ChatLambdaNodeStack` (usa agent_id y agent_alias_id)

### 3. Actualizar Valores de Parameter Store

**IMPORTANTE:** Los parámetros SSM se crean con valores placeholder que deben actualizarse:

#### Opción A: AWS Console
1. Ir a **AWS Systems Manager** > **Parameter Store**
2. Buscar `/whatsapp/bedrock-agent/token`
3. Click en **Edit** > Actualizar valor con el token real
4. Repetir para `phone-id` y `verify-token`

#### Opción B: AWS CLI
```bash
# Token de WhatsApp
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --value "TU_TOKEN_REAL_DE_WHATSAPP" \
  --type "SecureString" \
  --overwrite

# Phone ID
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/phone-id" \
  --value "TU_PHONE_ID_REAL" \
  --type "SecureString" \
  --overwrite

# Verify Token (opcional si ya tienes uno)
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/verify-token" \
  --value "tu_token_secreto_personalizado" \
  --type "SecureString" \
  --overwrite
```

### 4. Obtener URL del API Gateway

Después del despliegue, busca en los outputs:

```bash
ChatLambdaNodeStack.ChatApiUrl = https://XXXXXX.execute-api.us-east-1.amazonaws.com/prod/
```

### 5. Configurar Webhook en Meta Developer Console

1. Ir a **Meta for Developers** > Tu aplicación de WhatsApp
2. Configurar Webhook:
   - **Callback URL**: `https://XXXXXX.execute-api.us-east-1.amazonaws.com/prod/webhook`
   - **Verify Token**: El valor que configuraste en `/whatsapp/bedrock-agent/verify-token`
3. Suscribirse a eventos: `messages`

## ✅ Verificación Post-Despliegue

### 1. Verificar Parámetros SSM
```bash
# Listar parámetros
aws ssm describe-parameters --filters "Key=Name,Values=/whatsapp/bedrock-agent/"

# Ver valores (requiere permisos)
aws ssm get-parameter --name "/whatsapp/bedrock-agent/token" --with-decryption
```

### 2. Probar Endpoint de Chat
```bash
curl -X POST https://XXXXXX.execute-api.us-east-1.amazonaws.com/prod/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, ¿qué restaurantes tienen en el centro comercial?"}'
```

### 3. Verificar Logs de Lambda
```bash
aws logs tail /aws/lambda/ChatLambdaNodeStack-chatlambdafn... --follow
```

### 4. Probar Verificación de Webhook
```bash
curl "https://XXXXXX.execute-api.us-east-1.amazonaws.com/prod/webhook?hub.mode=subscribe&hub.verify_token=tu_token_secreto_personalizado&hub.challenge=test123"
```

Debería devolver: `test123`

## 🔒 Seguridad

### Parámetros Encriptados
Todos los parámetros se crean como **SecureString** usando la clave KMS predeterminada de AWS:
- `/whatsapp/bedrock-agent/token`
- `/whatsapp/bedrock-agent/phone-id`
- `/whatsapp/bedrock-agent/verify-token`

### Permisos IAM
El Lambda tiene permisos mínimos necesarios:
- `ssm:GetParameter` solo en los 3 parámetros específicos
- `bedrock:InvokeAgent` solo en el Agent específico
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### Caché de Parámetros
El archivo `ssmHelper.js` implementa caché de 5 minutos para reducir llamadas a SSM y mejorar performance.

## 📝 Notas Importantes

1. **Valores Placeholder**: Los parámetros SSM se crean con valores placeholder. **Debes actualizarlos antes de usar en producción**.

2. **Costo de SecureString**: Los parámetros SecureString tienen un costo mínimo ($0.05 por parámetro/mes en tier STANDARD).

3. **Rotación de Credenciales**: Para rotar tokens, simplemente actualiza el valor en Parameter Store. El Lambda lo detectará en la siguiente invocación (máximo 5 minutos de delay por caché).

4. **Dependencias de Stack**: El orden de despliegue es crítico. CDK gestiona esto automáticamente con `add_dependency()`.

5. **Outputs vs Propiedades**: Los outputs de CloudFormation son strings. Usamos propiedades de Python (`self.agent_id`) para pasar valores dinámicos entre stacks.

## 🐛 Troubleshooting

### Error: "Parameter not found"
```bash
# Verificar que los parámetros existen
aws ssm get-parameter --name "/whatsapp/bedrock-agent/token"
```

### Error: "AccessDeniedException" al invocar Agent
```bash
# Verificar permisos del rol de Lambda
aws iam get-role-policy --role-name ChatLambdaNodeStack-... --policy-name BedrockAgentPolicy
```

### Error: "Invalid verify token"
```bash
# Verificar el token en Parameter Store
aws ssm get-parameter --name "/whatsapp/bedrock-agent/verify-token" --with-decryption
```

## 📚 Referencias

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [Amazon Bedrock Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/)

---

**Última actualización**: Enero 2025  
**Versión CDK**: 2.x  
**Runtime Lambda**: Node.js 22.x

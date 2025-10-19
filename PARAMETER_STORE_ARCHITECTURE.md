# Arquitectura de Parameter Store - Desacoplamiento Completo

## 📋 Resumen

Esta arquitectura elimina la dependencia directa entre los stacks de Bedrock y ChatLambda, usando **AWS Systems Manager Parameter Store** como capa de configuración centralizada.

## 🏗️ Nueva Arquitectura (Desacoplada)

```
┌─────────────────────────────────────────────────────────┐
│ GenAiVirtualAssistantBedrockStack                       │
│                                                          │
│  ✓ Bedrock Agent                                        │
│  ✓ Agent Alias                                          │
│  ✓ Knowledge Base                                       │
│                                                          │
│  ✓ SSM Parameters (5 total):                            │
│    1. /whatsapp/bedrock-agent/agent-id                  │
│    2. /whatsapp/bedrock-agent/agent-alias-id            │
│    3. /whatsapp/bedrock-agent/token                     │
│    4. /whatsapp/bedrock-agent/phone-id                  │
│    5. /whatsapp/bedrock-agent/verify-token              │
└─────────────────────────────────────────────────────────┘
                   ▲
                   │ Lee parámetros en runtime
                   │ (NO hay dependencia de stack)
                   │
┌──────────────────┴──────────────────────────────────────┐
│ ChatLambdaNodeStack                                      │
│                                                          │
│  ✓ Lambda Function (Node.js 22)                         │
│  ✓ API Gateway (REST)                                   │
│  ✓ WhatsApp Webhook Endpoints                           │
│  ✓ SSM Read Permissions (5 parámetros)                  │
│  ✓ Bedrock Permissions                                   │
│                                                          │
│  Variables de entorno:                                   │
│    - PARAM_AGENT_ID                                      │
│    - PARAM_AGENT_ALIAS_ID                                │
│    - PARAM_TOKEN_WHATS                                   │
│    - PARAM_IPHONE_ID                                     │
│    - PARAM_VERIFY_TOKEN                                  │
└─────────────────────────────────────────────────────────┘
```

## 🔑 Parámetros en Parameter Store

### 1. Parámetros de Bedrock (Auto-creados)

| Parámetro | Path | Tipo | Descripción | Valor |
|-----------|------|------|-------------|-------|
| **Agent ID** | `/whatsapp/bedrock-agent/agent-id` | String | ID del Bedrock Agent | Auto (desde CDK) |
| **Alias ID** | `/whatsapp/bedrock-agent/agent-alias-id` | String | ID del Agent Alias | Auto (desde CDK) |

### 2. Parámetros de WhatsApp (Requieren actualización)

| Parámetro | Path | Tipo | Descripción | Valor Inicial |
|-----------|------|------|-------------|---------------|
| **Token** | `/whatsapp/bedrock-agent/token` | String | WhatsApp API Token | PLACEHOLDER |
| **Phone ID** | `/whatsapp/bedrock-agent/phone-id` | String | WhatsApp Phone Number ID | PLACEHOLDER |
| **Verify Token** | `/whatsapp/bedrock-agent/verify-token` | String | Webhook Verify Token | mi_token_secreto_123 |

## 📦 Cambios Implementados

### 1. Stack de Bedrock (`stack_backend_bedrock.py`)

#### Método `_create_whatsapp_parameters()` Actualizado

```python
def _create_whatsapp_parameters(self):
    """
    Crea 5 parámetros en Parameter Store:
    - 2 para Bedrock (agent-id, agent-alias-id) - valores automáticos
    - 3 para WhatsApp (token, phone-id, verify-token) - requieren actualización
    """
    
    # 1. Agent ID (valor automático desde self.agent_id)
    agent_id_param = ssm.StringParameter(
        self, "BedrockAgentIdParameter",
        parameter_name="/whatsapp/bedrock-agent/agent-id",
        string_value=self.agent_id,
        description="Bedrock Agent ID",
        type=ssm.ParameterType.STRING
    )
    
    # 2. Agent Alias ID (valor automático desde self.agent_alias_id)
    agent_alias_id_param = ssm.StringParameter(
        self, "BedrockAgentAliasIdParameter",
        parameter_name="/whatsapp/bedrock-agent/agent-alias-id",
        string_value=self.agent_alias_id,
        description="Bedrock Agent Alias ID",
        type=ssm.ParameterType.STRING
    )
    
    # 3-5. WhatsApp credentials (requieren actualización manual)
    # ... (token, phone-id, verify-token)
```

**Outputs CloudFormation:**
- `output-param-agent-id`
- `output-param-agent-alias-id`
- `output-param-token`
- `output-param-phone-id`
- `output-param-verify-token`

### 2. Stack de ChatLambda (`stack_chat_lambda.py`)

#### Constructor Simplificado

```python
def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
    # YA NO recibe agent_id ni agent_alias_id como parámetros
    
    # Paths de Parameter Store
    PARAM_AGENT_ID = "/whatsapp/bedrock-agent/agent-id"
    PARAM_AGENT_ALIAS_ID = "/whatsapp/bedrock-agent/agent-alias-id"
    PARAM_TOKEN_WHATS = "/whatsapp/bedrock-agent/token"
    PARAM_IPHONE_ID = "/whatsapp/bedrock-agent/phone-id"
    PARAM_VERIFY_TOKEN = "/whatsapp/bedrock-agent/verify-token"
    
    # Variables de entorno: solo paths, NO valores
    environment={
        "PARAM_AGENT_ID": PARAM_AGENT_ID,
        "PARAM_AGENT_ALIAS_ID": PARAM_AGENT_ALIAS_ID,
        "PARAM_TOKEN_WHATS": PARAM_TOKEN_WHATS,
        "PARAM_IPHONE_ID": PARAM_IPHONE_ID,
        "PARAM_VERIFY_TOKEN": PARAM_VERIFY_TOKEN
    }
```

#### Permisos SSM Actualizados

```python
def _configure_ssm_permissions(self, param_agent_id: str, param_agent_alias_id: str,
                               param_token: str, param_phone: str, param_verify: str):
    # Permisos para leer los 5 parámetros
    self.lambda_fn.add_to_role_policy(
        iam.PolicyStatement(
            actions=["ssm:GetParameter", "ssm:GetParameters"],
            resources=[
                f"arn:aws:ssm:{region}:{account}:parameter{param_agent_id}",
                f"arn:aws:ssm:{region}:{account}:parameter{param_agent_alias_id}",
                # ... otros 3 parámetros
            ]
        )
    )
```

### 3. Código Lambda (`getAgente.js`)

#### Lectura Dinámica de Agent IDs

```javascript
const { getParameter } = require('./ssmHelper');

async function getAgente(userId, question, messageId) {
    // Obtener Agent IDs desde Parameter Store en runtime
    const PARAM_AGENT_ID = process.env.PARAM_AGENT_ID || '/whatsapp/bedrock-agent/agent-id';
    const PARAM_AGENT_ALIAS_ID = process.env.PARAM_AGENT_ALIAS_ID || '/whatsapp/bedrock-agent/agent-alias-id';
    
    const AGENT_ID = await getParameter(PARAM_AGENT_ID, false);  // No encryption
    const AGENT_ALIAS_ID = await getParameter(PARAM_AGENT_ALIAS_ID, false);
    
    console.log(`🤖 Agent ID: ${AGENT_ID}, Alias: ${AGENT_ALIAS_ID}`);
    
    // Usar AGENT_ID y AGENT_ALIAS_ID dinámicos
    const command = new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId: `whatsapp-${userId}`,
        inputText: question
    });
    // ...
}
```

### 4. Archivo Principal (`app.py`)

#### SIN Dependencia entre Stacks

```python
# Bedrock Stack (independiente)
bedrock_stack = GenAiVirtualAssistantBedrockStack(...)

# Chat Stack (independiente, lee parámetros en runtime)
chat_stack = ChatLambdaNodeStack(app, "ChatLambdaNodeStack", env=env_aws_settings)

# NO hay chat_stack.add_dependency(bedrock_stack)
```

## 🚀 Proceso de Despliegue

### Orden Recomendado (aunque no es obligatorio)

```bash
# 1. Desplegar Bedrock stack primero (crea los parámetros)
cdk deploy GenAiVirtualAssistantBedrockStack --require-approval never

# 2. Actualizar valores en Parameter Store (WhatsApp credentials)
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --value "EAAXdHr..." \
  --type "String" \
  --overwrite

aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/phone-id" \
  --value "123456789" \
  --type "String" \
  --overwrite

# 3. Desplegar Chat Lambda stack
cdk deploy ChatLambdaNodeStack --require-approval never

# Alternativamente, desplegar todo de una vez:
cdk deploy --all --require-approval never
```

### Verificar Parámetros Creados

```bash
# Listar todos los parámetros de WhatsApp
aws ssm describe-parameters \
  --filters "Key=Name,Values=/whatsapp/bedrock-agent/"

# Ver valor de un parámetro específico
aws ssm get-parameter \
  --name "/whatsapp/bedrock-agent/agent-id"

aws ssm get-parameter \
  --name "/whatsapp/bedrock-agent/agent-alias-id"
```

## ✅ Ventajas de esta Arquitectura

### 1. **Desacoplamiento Total**
- ✅ No hay dependencia directa entre stacks
- ✅ Cada stack puede desplegarse independientemente
- ✅ Rollbacks más simples y seguros

### 2. **Configuración Centralizada**
- ✅ Todos los parámetros en un solo lugar (Parameter Store)
- ✅ Actualización de credenciales sin redespliegue
- ✅ Auditoría centralizada de cambios

### 3. **Flexibilidad**
- ✅ Cambiar Agent ID sin modificar código
- ✅ Rotar tokens sin tocar infraestructura
- ✅ Múltiples lambdas pueden usar los mismos parámetros

### 4. **Seguridad**
- ✅ Permisos IAM granulares por parámetro
- ✅ Valores sensibles en Parameter Store (no en código)
- ✅ Caché de 5 minutos reduce llamadas SSM

### 5. **Costo Optimizado**
- ✅ Parameter Store tier STANDARD: **GRATIS** hasta 10,000 parámetros
- ✅ Caché reduce llamadas API a SSM
- ✅ No hay recursos adicionales (DynamoDB, Secrets Manager)

## 🔄 Actualización de Configuración

### Cambiar Agent ID (sin redespliegue)

```bash
# 1. Obtener nuevo Agent ID del stack de Bedrock
NEW_AGENT_ID=$(aws cloudformation describe-stacks \
  --stack-name GenAiVirtualAssistantBedrockStack \
  --query 'Stacks[0].Outputs[?OutputKey==`output-agent-id`].OutputValue' \
  --output text)

# 2. Actualizar parámetro (el Lambda lo detectará automáticamente)
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/agent-id" \
  --value "$NEW_AGENT_ID" \
  --type "String" \
  --overwrite

# 3. Esperar hasta 5 minutos (caché) o forzar con:
# - Reiniciar Lambda
# - Invocar con nueva sesión
```

### Rotar WhatsApp Token

```bash
aws ssm put-parameter \
  --name "/whatsapp/bedrock-agent/token" \
  --value "NUEVO_TOKEN_WHATSAPP" \
  --type "String" \
  --overwrite

# El Lambda usará el nuevo token en la siguiente invocación (máx 5 min)
```

## 🐛 Troubleshooting

### Error: "Parameter /whatsapp/bedrock-agent/agent-id not found"

**Causa:** El stack de Bedrock no ha sido desplegado.

**Solución:**
```bash
cdk deploy GenAiVirtualAssistantBedrockStack --require-approval never
```

### Error: "AccessDeniedException: User is not authorized to perform ssm:GetParameter"

**Causa:** Permisos IAM incorrectos.

**Solución:** Verificar que `_configure_ssm_permissions()` incluye los 5 parámetros:
```bash
aws iam get-role-policy \
  --role-name ChatLambdaNodeStack-chatlambdafn... \
  --policy-name SSMParameterPolicy
```

### Lambda obtiene valores "PLACEHOLDER"

**Causa:** No se han actualizado los parámetros de WhatsApp.

**Solución:**
```bash
# Actualizar con valores reales
aws ssm put-parameter --name "/whatsapp/bedrock-agent/token" --value "REAL_TOKEN" --overwrite
aws ssm put-parameter --name "/whatsapp/bedrock-agent/phone-id" --value "REAL_PHONE_ID" --overwrite
```

### Caché devuelve valores antiguos

**Causa:** Caché de 5 minutos en `ssmHelper.js`.

**Solución:**
- Esperar 5 minutos
- Reiniciar Lambda: `aws lambda update-function-code ...`
- Limpiar caché manualmente (requiere modificar código)

## 📊 Diagrama de Flujo de Datos

```
┌──────────────┐
│   WhatsApp   │
│   Message    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────┐
│   API Gateway                        │
│   POST /webhook                      │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│   Lambda: index.handler              │
│   ┌──────────────────────────────┐   │
│   │ getAgente(userId, question)  │   │
│   └───────────┬──────────────────┘   │
│               │                      │
│               ▼                      │
│   ┌──────────────────────────────┐   │
│   │ ssmHelper.getParameter()     │   │
│   │ - agent-id                   │◄──┼─── Parameter Store
│   │ - agent-alias-id             │   │    /whatsapp/bedrock-agent/*
│   └───────────┬──────────────────┘   │
│               │                      │
│               ▼                      │
│   ┌──────────────────────────────┐   │
│   │ InvokeAgentCommand           │   │
│   │ agentId: <from SSM>          │   │
│   │ aliasId: <from SSM>          │───┼──► Bedrock Agent
│   └──────────────────────────────┘   │
└──────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   WhatsApp   │
│   Response   │
└──────────────┘
```

## 📝 Checklist de Despliegue

- [ ] Desplegar Bedrock Stack
- [ ] Verificar parámetros creados en Parameter Store
- [ ] Actualizar token de WhatsApp
- [ ] Actualizar phone-id de WhatsApp
- [ ] (Opcional) Actualizar verify-token
- [ ] Desplegar Chat Lambda Stack
- [ ] Verificar permisos IAM del Lambda
- [ ] Probar endpoint `/chat` con curl
- [ ] Configurar webhook en Meta Developer Console
- [ ] Probar verificación de webhook
- [ ] Enviar mensaje de prueba desde WhatsApp
- [ ] Verificar logs en CloudWatch

## 📚 Referencias

- [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [AWS CDK ssm Module](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_ssm.html)
- [Parameter Store Pricing](https://aws.amazon.com/systems-manager/pricing/) - Standard tier GRATIS
- [IAM Best Practices for Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-access.html)

---

**Última actualización:** Octubre 2025  
**Versión:** 2.0 (Desacoplamiento completo)  
**Stack CDK:** Python 3.x  
**Runtime Lambda:** Node.js 22.x

# Fix de Permisos para Bedrock Agent

## Problema Identificado
El agente de Bedrock no tenía permisos IAM configurados para:
- ✗ Invocar modelos de Bedrock (Amazon Nova Pro, Titan Embeddings)
- ✗ Acceder a la Knowledge Base
- ✗ Leer datos del bucket S3
- ✗ Aplicar Guardrails
- ✗ El Lambda de chat no tenía permisos para invocar el agente

## Cambios Realizados

### 1. `stack_backend_bedrock/stack_backend_bedrock.py`

#### Cambios principales:
- ✅ **Agregado método `_configure_agent_permissions()`**: Configura permisos IAM para el agente
- ✅ **Actualizado método `_configure_kb_permissions()`**: Agregados permisos de lectura S3 para Knowledge Base
- ✅ **Agregado método `_create_outputs()`**: Exporta Agent ID, Alias ID y Knowledge Base ID
- ✅ **Agregado import `CfnOutput`**: Para crear outputs de CloudFormation

#### Permisos agregados al Agente:
```python
# Permisos para invocar modelos
- bedrock:InvokeModel
- bedrock:InvokeModelWithResponseStream
- bedrock:GetFoundationModel
- bedrock:ListFoundationModels

# Permisos para Knowledge Base
- bedrock:Retrieve
- bedrock:RetrieveAndGenerate
- bedrock:GetKnowledgeBase
- bedrock:ListKnowledgeBases

# Permisos para Guardrails
- bedrock:ApplyGuardrail

# Permisos S3 (lectura)
- s3:GetObject
- s3:ListBucket
```

#### Permisos agregados a Knowledge Base:
```python
# Managed Policy
- AmazonBedrockFullAccess

# Custom permissions
- bedrock:InvokeModel
- bedrock:InvokeModelWithResponseStream
- bedrock:Retrieve
- bedrock:RetrieveAndGenerate

# S3 permissions
- s3:GetObject
- s3:ListBucket
```

### 2. `stack_chat_lambda_node/stack_chat_lambda.py`

#### Cambios principales:
- ✅ **Agregado import `aws_iam`**: Para configurar políticas IAM
- ✅ **Aumentado timeout a 60 segundos**: Para permitir llamadas a Bedrock
- ✅ **Aumentado memory_size a 512 MB**: Para mejor performance
- ✅ **Agregado método `_configure_lambda_permissions()`**: Configura permisos para invocar agente

#### Permisos agregados al Lambda:
```python
# Permisos para invocar agente
- bedrock:InvokeAgent
- bedrock:InvokeModel
- bedrock:InvokeModelWithResponseStream
- bedrock:GetAgent
- bedrock:ListAgents
- bedrock:GetAgentAlias
- bedrock:ListAgentAliases

# Permisos para Knowledge Base (acceso directo si necesario)
- bedrock:Retrieve
- bedrock:RetrieveAndGenerate
```

### 3. `app.py`
- ✅ Corrección de indentación en la creación del ChatLambdaNodeStack

## Recursos ARN Configurados

### Modelos de Bedrock:
```
arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0
arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0
```

### Recursos con wildcard (*):
- Knowledge Base ARN (se resuelve en runtime)
- Guardrails ARN (se resuelve en runtime)
- Operaciones de listado y consulta

## Outputs Exportados

El stack de Bedrock ahora exporta:
1. **Agent ID**: ID del agente de Bedrock
2. **Agent Alias ID**: ID del alias del agente
3. **Knowledge Base ID**: ID de la base de conocimiento

Estos outputs pueden ser importados por otros stacks usando:
```python
from aws_cdk import Fn

agent_id = Fn.import_value("GenAiVirtualAssistantBedrockStack-AgentId")
```

## Pasos para Desplegar

### 1. Validar el código
```bash
cdk synth
```

### 2. Ver los cambios que se aplicarán
```bash
cdk diff
```

### 3. Desplegar los cambios
```bash
# Desplegar todos los stacks
cdk deploy --all

# O desplegar stacks específicos
cdk deploy GenAiVirtualAssistantBedrockStack
cdk deploy ChatLambdaNodeStack
```

### 4. Verificar permisos en AWS Console

#### Para el Agente:
1. Ir a Amazon Bedrock Console
2. Agents → Seleccionar tu agente
3. Ir a la pestaña "Permissions"
4. Verificar que el rol tenga las políticas correctas

#### Para la Knowledge Base:
1. Ir a Amazon Bedrock Console
2. Knowledge bases → Seleccionar tu KB
3. Verificar rol IAM asociado
4. Confirmar permisos S3

#### Para el Lambda:
1. Ir a Lambda Console
2. Seleccionar `chat-lambda-fn`
3. Configuration → Permissions
4. Verificar políticas IAM adjuntas

## Pruebas Sugeridas

### 1. Probar el Agente directamente desde Bedrock Console
```bash
# En Bedrock Console → Agents → Test
Prompt: "¿Qué eventos hay esta semana?"
Prompt: "¿Dónde está la tienda Nike?"
Prompt: "Recomiéndame un restaurante italiano"
```

### 2. Probar el Lambda desde API Gateway
```bash
curl -X POST https://YOUR-API-ID.execute-api.REGION.amazonaws.com/prod \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Qué eventos hay hoy?"}'
```

### 3. Verificar CloudWatch Logs
```bash
# Para el agente
aws logs tail /aws/bedrock/agent/AGENT-ID --follow

# Para el lambda
aws logs tail /aws/lambda/chat-lambda-fn --follow
```

## Troubleshooting

### Si siguen los errores de permisos:

#### Error: "AccessDeniedException: User is not authorized to perform: bedrock:InvokeAgent"
**Solución**: Verificar que el Lambda tenga el permiso `bedrock:InvokeAgent`

#### Error: "AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel"
**Solución**: Verificar que el agente tenga acceso a los modelos específicos (Nova Pro, Titan)

#### Error: "ResourceNotFoundException: Knowledge base not found"
**Solución**: Verificar que la Knowledge Base esté sincronizada. Ejecutar sync manualmente si es necesario.

#### Error: "AccessDeniedException: Cannot access S3 bucket"
**Solución**: Verificar que el rol del agente/KB tenga `s3:GetObject` y `s3:ListBucket`

### Comandos útiles para debugging:

```bash
# Ver el rol IAM del agente
aws bedrock-agent get-agent --agent-id AGENT-ID

# Ver políticas del rol
aws iam get-role-policy --role-name ROLE-NAME --policy-name POLICY-NAME

# Listar modelos disponibles
aws bedrock list-foundation-models

# Ver estado de la Knowledge Base
aws bedrock-agent get-knowledge-base --knowledge-base-id KB-ID

# Sincronizar Knowledge Base manualmente
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id KB-ID \
  --data-source-id DS-ID
```

## Mejoras Implementadas

1. ✅ **Principio de mínimo privilegio**: Permisos específicos por recurso
2. ✅ **Separación de concerns**: Permisos separados para agente, KB y Lambda
3. ✅ **Outputs exportados**: IDs disponibles para otros stacks
4. ✅ **Timeouts adecuados**: 60 segundos para operaciones de Bedrock
5. ✅ **Memoria optimizada**: 512 MB para el Lambda

## Referencias

- [AWS Bedrock Agent Permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-permissions.html)
- [AWS Bedrock Knowledge Base IAM](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-permissions.html)
- [CDK Bedrock Constructs](https://github.com/awslabs/generative-ai-cdk-constructs)

## Notas Adicionales

- Los permisos usan `resources=["*"]` para Knowledge Base y Guardrails porque los ARNs se generan dinámicamente
- El agente necesita permisos tanto de invocación como de consulta de modelos
- La Knowledge Base necesita acceso de lectura al bucket S3
- El Lambda necesita permisos de invocación del agente para poder usarlo desde la API

---
**Fecha de actualización**: 2025-10-19
**Versión**: 1.0

python validate_bedrock_permissions.py --agent-id FH6HJUBIZQ --kb-id NRSWGGNEXW --region us-east-1
# Configuración de Pinecone Serverless para Knowledge Base

Este proyecto utiliza **Pinecone Serverless** como vector store para Amazon Bedrock Knowledge Base, proporcionando almacenamiento de vectores escalable y económico.

## Prerequisitos

1. Cuenta de Pinecone (crear en https://app.pinecone.io/)
2. AWS CLI configurado
3. Permisos en AWS para Secrets Manager y Bedrock

## Paso 1: Crear Índice de Pinecone

### Opción A: Vía Pinecone Console

1. Ir a [Pinecone Console](https://app.pinecone.io/)
2. Click en **"Create Index"**
3. Configurar:
   - **Name**: `agente-mut-kb` (o el nombre que prefieras)
   - **Dimensions**: `1024` ⚠️ CRÍTICO: Debe coincidir con Titan Embed V2
   - **Metric**: `cosine`
   - **Capacity Mode**: **Serverless**
   - **Cloud Provider**: `AWS`
   - **Region**: Elegir región cercana a tu deployment AWS (preferiblemente misma región)
4. Click **"Create Index"**
5. Copiar el **Index Host URL** (ej: `https://agente-xxxxx.svc.aws-region.pinecone.io`)

### Opción B: Vía Python SDK

```python
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key="YOUR_API_KEY")

pc.create_index(
    name="agente-mut-kb",
    dimension=1024,
    metric="cosine",
    spec=ServerlessSpec(
        cloud='aws',
        region='us-east-1'
    )
)
```

## Paso 2: Obtener API Key de Pinecone

1. En Pinecone Console → **API Keys**
2. Copiar tu API Key (formato: `pcsk_...`)
3. ⚠️ **IMPORTANTE**: Revocar cualquier API key que haya sido expuesta públicamente

## Paso 3: Almacenar API Key en AWS Secrets Manager

### Opción A: AWS CLI (Recomendado)

```bash
# Crear secret con formato requerido por Bedrock
aws secretsmanager create-secret \
  --name pinecone/mut-kb-api-key \
  --description "Pinecone API Key for Bedrock Knowledge Base" \
  --secret-string '{"apiKey":"TU_API_KEY_AQUI"}' \
  --region us-east-1

# Obtener el ARN del secret creado
aws secretsmanager describe-secret \
  --secret-id pinecone/mut-kb-api-key \
  --region us-east-1 \
  --query 'ARN' \
  --output text
```

### Opción B: AWS Console

1. AWS Console → Secrets Manager
2. **Store a new secret**
3. Secret type: **Other type of secret**
4. Key/value pairs:
   - Key: `apiKey`
   - Value: `<TU_PINECONE_API_KEY>`
5. Secret name: `pinecone/mut-kb-api-key`
6. Region: `us-east-1`
7. Copiar el **ARN** resultante

## Paso 4: Actualizar Configuración en el Código

Editar el archivo `stack_backend_bedrock/stack_backend_bedrock.py`:

```python
def _get_knowledge_base_config(self) -> KnowledgeBaseConfig:
    return KnowledgeBaseConfig(
        name="VirtualAssistantKnowledgeBase",
        description="Knowledge base con eventos, FAQs, tiendas y restaurantes",
        embedding_model_arn=f"arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
        embedding_dimensions=1024,
        pinecone_connection_string="<INDEX_HOST_URL>",  # Paso 1
        pinecone_secret_arn="<SECRET_ARN>",  # Paso 3
        pinecone_namespace="mut-kb-prod"
    )
```

Reemplazar:
- `<INDEX_HOST_URL>`: URL del índice de Pinecone (Paso 1)
- `<SECRET_ARN>`: ARN del secret en Secrets Manager (Paso 3)

## Paso 5: Verificar Configuración del Índice Pinecone

Asegúrate que el índice Pinecone:
- ✅ Está **vacío** (Bedrock requiere índice vacío para sincronizar)
- ✅ Tiene **1024 dimensiones** (match con Titan Embed V2)
- ✅ Usa métrica **cosine**
- ✅ Es tipo **Serverless**

Si el índice ya tiene datos, crea uno nuevo dedicado para Bedrock.

## Paso 6: Deploy del Stack

```bash
# Verificar cambios
cdk diff GenAiVirtualAssistantBedrockStack

# Deploy
cdk deploy GenAiVirtualAssistantBedrockStack

# Verificar outputs
cdk deploy GenAiVirtualAssistantBedrockStack --outputs-file outputs.json
```

## Paso 7: Sincronizar Data Sources

Una vez desplegado, sincronizar los data sources para cargar datos en Pinecone:

### Vía AWS Console
1. AWS Console → Bedrock → Knowledge Bases
2. Seleccionar **VirtualAssistantKnowledgeBase**
3. Tab **Data Sources**
4. Para cada data source (eventos, preguntas, stores, restaurantes):
   - Click **Sync**
   - Esperar a que el estado sea **Available**

### Vía AWS CLI
```bash
# Obtener Knowledge Base ID de los outputs
KB_ID=$(aws cloudformation describe-stacks \
  --stack-name GenAiVirtualAssistantBedrockStack \
  --query 'Stacks[0].Outputs[?OutputKey==`output-knowledge-base-id`].OutputValue' \
  --output text)

# Obtener IDs de los data sources
aws bedrock-agent list-data-sources \
  --knowledge-base-id $KB_ID \
  --region us-east-1

# Sincronizar cada data source
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id <DATA_SOURCE_ID> \
  --region us-east-1
```

## Paso 8: Verificar Vectores en Pinecone

1. Ir a Pinecone Console
2. Seleccionar tu índice
3. Verificar que los vectores se han cargado (ver **Vector Count**)
4. Probar queries en el **Query** tab

## Arquitectura

```
S3 Bucket (datasets/)
    ↓
Bedrock Knowledge Base
    ↓ (Titan Embed V2 - 1024 dims)
Pinecone Serverless Index
    ↓
Bedrock Agent (queries)
```

## Costos Estimados (Plan Starter - GRATIS)

Para el caso de uso actual:
- **Storage**: 0.4 GB → Gratis (incluye 2 GB)
- **Read Units**: 10K/mes → Gratis (incluye 1M/mes)
- **Write Units**: 5K/mes → Gratis (incluye 2M/mes)
- **Costo Total**: **$0/mes**

El plan Starter de Pinecone cubre completamente el caso de uso actual.

Para escalar a Plan Standard:
- **Mínimo mensual**: $50/mes
- Incluye almacenamiento ilimitado
- Read units: $16/millón
- Write units: $4/millón

## Troubleshooting

### Error: "Secret not found"
- Verificar que el secret existe en la región correcta (`us-east-1`)
- Verificar que el ARN es correcto en el código

### Error: "Dimensions mismatch"
- El índice Pinecone DEBE tener exactamente 1024 dimensiones
- Recrear el índice si tiene dimensiones diferentes

### Error: "Index not empty"
- Bedrock requiere un índice vacío
- Crear un nuevo índice dedicado para Bedrock

### Vectores no se cargan en Pinecone
- Verificar que la sincronización completó exitosamente
- Verificar permisos IAM del Knowledge Base role
- Revisar CloudWatch Logs para errores

### Agent no responde con información del KB
- Verificar que la asociación Agent-KB fue creada correctamente
- Verificar permisos del Agent para acceder al KB
- Probar query directamente en Bedrock Console → Knowledge Base → Test

## Seguridad

✅ **Buenas Prácticas**:
- API Keys almacenadas en AWS Secrets Manager
- Permisos IAM restrictivos (solo recursos necesarios)
- Secret ARN nunca expuesto en código público
- Rotación periódica de API keys recomendada

❌ **NUNCA**:
- Hardcodear API keys en el código
- Compartir API keys en chats, emails o repositorios públicos
- Subir archivos `.env` con credenciales a Git

## Recursos Adicionales

- [Documentación Pinecone Serverless](https://docs.pinecone.io/guides/indexes/understanding-indexes#serverless-indexes)
- [Bedrock Knowledge Base con Pinecone](https://docs.pinecone.io/integrations/amazon-bedrock)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
- [Pricing Pinecone](https://www.pinecone.io/pricing/)

## Soporte

Para problemas:
1. Revisar logs en CloudWatch
2. Verificar configuración en Pinecone Console
3. Consultar documentación oficial
4. Abrir ticket de soporte en Pinecone o AWS según corresponda

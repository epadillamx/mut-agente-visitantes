# 🚀 Guía de Despliegue - Pipeline Automático de Datos

## Prerequisitos

Antes de desplegar, asegúrate de tener:

1. ✅ AWS CLI configurado con credenciales
2. ✅ AWS CDK instalado (`npm install -g aws-cdk`)
3. ✅ Python 3.12 instalado
4. ✅ Node.js instalado
5. ✅ Los stacks anteriores desplegados (S3, Bedrock, etc.)

---

## Paso 1: Verificar Configuración

```bash
# Verificar AWS credentials
aws sts get-caller-identity

# Verificar CDK version
cdk --version

# Verificar Python version
python --version
```

---

## Paso 2: Bootstrap CDK (si no lo has hecho)

```bash
cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

---

## Paso 3: Sintetizar CloudFormation Templates

```bash
# Sintetizar todos los stacks
cdk synth

# O específicamente los nuevos stacks
cdk synth DataExtractionLambdaStack
cdk synth VectorialSyncLambdaStack
cdk synth DataPipelineOrchestratorStack
```

---

## Paso 4: Revisar Cambios

```bash
# Ver diferencias antes de desplegar
cdk diff DataExtractionLambdaStack
cdk diff VectorialSyncLambdaStack
cdk diff DataPipelineOrchestratorStack
```

---

## Paso 5: Desplegar Stacks

### Opción A: Deploy Individual (Recomendado para primera vez)

```bash
# 1. Deploy stack de extracción
cdk deploy DataExtractionLambdaStack --require-approval never

# 2. Deploy stack de sincronización
cdk deploy VectorialSyncLambdaStack --require-approval never

# 3. Deploy stack de orquestación
cdk deploy DataPipelineOrchestratorStack --require-approval never
```

### Opción B: Deploy en Conjunto

```bash
# Deploy los 3 stacks nuevos
cdk deploy DataExtractionLambdaStack VectorialSyncLambdaStack DataPipelineOrchestratorStack --require-approval never
```

### Opción C: Deploy Todo

```bash
# Deploy todos los stacks de la aplicación
cdk deploy --all --require-approval never
```

---

## Paso 6: Verificar Despliegue

### Verificar Lambdas

```bash
# Listar funciones Lambda
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `DataExtraction`) || starts_with(FunctionName, `VectorialSync`)].FunctionName'
```

### Verificar Step Functions

```bash
# Listar state machines
aws stepfunctions list-state-machines --query 'stateMachines[?starts_with(name, `DataPipeline`)].name'
```

### Verificar EventBridge Rule

```bash
# Listar reglas de EventBridge
aws events list-rules --query 'Rules[?starts_with(Name, `DailyExecution`)].Name'
```

---

## Paso 7: Prueba Manual (Opcional)

### Test del Lambda de Extracción

```bash
# Obtener nombre del Lambda
EXTRACTION_FUNCTION=$(aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `DataExtraction`)].FunctionName' --output text)

# Invocar Lambda
aws lambda invoke \
  --function-name $EXTRACTION_FUNCTION \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  extraction-response.json

# Ver resultado
cat extraction-response.json
```

### Test del Lambda de Sincronización

```bash
# Obtener nombre del Lambda
SYNC_FUNCTION=$(aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `VectorialSync`)].FunctionName' --output text)

# Invocar Lambda
aws lambda invoke \
  --function-name $SYNC_FUNCTION \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  sync-response.json

# Ver resultado
cat sync-response.json
```

### Test del Step Functions

```bash
# Obtener ARN de la State Machine
STATE_MACHINE_ARN=$(aws stepfunctions list-state-machines --query 'stateMachines[?starts_with(name, `DataPipeline`)].stateMachineArn' --output text)

# Iniciar ejecución
EXECUTION_ARN=$(aws stepfunctions start-execution \
  --state-machine-arn $STATE_MACHINE_ARN \
  --input '{}' \
  --query 'executionArn' \
  --output text)

echo "Execution started: $EXECUTION_ARN"

# Esperar y ver estado
aws stepfunctions describe-execution \
  --execution-arn $EXECUTION_ARN \
  --query 'status'
```

---

## Paso 8: Monitorear Primera Ejecución Automática

El pipeline se ejecutará automáticamente a las 12:00 AM hora Chile.

### Ver Logs en CloudWatch

```bash
# Logs del Lambda de extracción
aws logs tail /aws/lambda/DataExtractionLambdaStack-* --follow

# Logs del Lambda de sincronización
aws logs tail /aws/lambda/VectorialSyncLambdaStack-* --follow

# Logs del Step Functions (desde AWS Console)
```

### Verificar en AWS Console

1. **Step Functions**: https://console.aws.amazon.com/states/
   - Buscar "DataPipelineStateMachine"
   - Ver "Executions" para historial

2. **Lambda**: https://console.aws.amazon.com/lambda/
   - Buscar funciones "DataExtraction" y "VectorialSync"
   - Ver métricas y logs

3. **EventBridge**: https://console.aws.amazon.com/events/
   - Buscar "DailyExecutionRule"
   - Verificar que esté "Enabled"

4. **S3**: https://console.aws.amazon.com/s3/
   - Verificar bucket `raw-virtual-assistant-data-*`
   - Debe tener carpetas `raw/` y `vectorial/`

5. **Bedrock Knowledge Base**: https://console.aws.amazon.com/bedrock/
   - Knowledge Bases > Tu KB
   - Ver "Sync history" para ingestion jobs

---

## Comandos Útiles Post-Despliegue

### Ver Outputs de los Stacks

```bash
# Outputs del stack de extracción
aws cloudformation describe-stacks \
  --stack-name DataExtractionLambdaStack \
  --query 'Stacks[0].Outputs'

# Outputs del stack de sincronización
aws cloudformation describe-stacks \
  --stack-name VectorialSyncLambdaStack \
  --query 'Stacks[0].Outputs'

# Outputs del stack de orquestación
aws cloudformation describe-stacks \
  --stack-name DataPipelineOrchestratorStack \
  --query 'Stacks[0].Outputs'
```

### Deshabilitar Ejecución Automática (si necesario)

```bash
# Obtener nombre de la regla
RULE_NAME=$(aws events list-rules --query 'Rules[?starts_with(Name, `DataPipelineOrchestrator`)].Name' --output text)

# Deshabilitar regla
aws events disable-rule --name $RULE_NAME

# Habilitar nuevamente
aws events enable-rule --name $RULE_NAME
```

### Ver Archivos en S3

```bash
# Listar archivos raw
aws s3 ls s3://raw-virtual-assistant-data-$(aws sts get-caller-identity --query Account --output text)-us-east-1/raw/ --recursive

# Listar archivos vectoriales
aws s3 ls s3://raw-virtual-assistant-data-$(aws sts get-caller-identity --query Account --output text)-us-east-1/vectorial/ --recursive
```

---

## Troubleshooting

### ❌ Error: "Resource not found"

**Causa:** Los stacks de dependencia no están desplegados

**Solución:**
```bash
# Verificar que estos stacks existen
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Deploy stacks faltantes
cdk deploy GenAiVirtualAssistantS3Stack
cdk deploy GenAiVirtualAssistantBedrockStack
```

### ❌ Error: "Insufficient permissions"

**Causa:** El rol de ejecución no tiene permisos

**Solución:**
```bash
# Verificar permisos de tu usuario AWS
aws iam get-user

# Asegurarte de tener permisos de administrador o los permisos necesarios
```

### ❌ Error: Lambda timeout

**Causa:** El Lambda se queda sin tiempo

**Solución:** Editar el stack y aumentar timeout:

```python
timeout=Duration.seconds(900),  # Cambiar a valor mayor
memory_size=3008,  # Aumentar memoria también
```

### ❌ Error: "Cannot find module"

**Causa:** Dependencias no instaladas en el Lambda

**Solución:**
```bash
# Para extraction lambda
cd stack_lambda_extraction/lambda
pip install -r requirements.txt -t .
cd ../..

# Para sync lambda
cd stack_lambda_sync_vectorial/lambda
pip install -r requirements.txt -t .
cd ../..

# Re-deploy
cdk deploy DataExtractionLambdaStack VectorialSyncLambdaStack
```

---

## Rollback (si algo sale mal)

### Rollback de un Stack Específico

```bash
# Destruir stack de orquestación
cdk destroy DataPipelineOrchestratorStack

# Destruir stack de sincronización
cdk destroy VectorialSyncLambdaStack

# Destruir stack de extracción
cdk destroy DataExtractionLambdaStack
```

### Rollback Completo

```bash
# Destruir los 3 stacks nuevos
cdk destroy DataPipelineOrchestratorStack VectorialSyncLambdaStack DataExtractionLambdaStack
```

---

## Costos Estimados

**Ejecución diaria (12 AM):**

- **Lambda Extracción**: ~5 min x 2GB = ~$0.002
- **Lambda ETL**: ~2 min x 1GB = ~$0.001
- **Lambda Sync**: ~3 min x 2GB = ~$0.002
- **Step Functions**: 3 state transitions = ~$0.0001
- **Bedrock Ingestion**: Variable según volumen
- **S3 Storage**: ~$0.023/GB/mes
- **Pinecone**: Según plan

**Total estimado por mes:** ~$5-10 USD (sin contar Bedrock/Pinecone)

---

## Checklist Final

- [ ] Todos los stacks desplegados exitosamente
- [ ] Lambdas funcionando correctamente
- [ ] Step Functions ejecutándose sin errores
- [ ] EventBridge rule habilitada
- [ ] Archivos apareciendo en S3
- [ ] Knowledge Base recibiendo datos
- [ ] Agente respondiendo con datos actualizados
- [ ] Logs configurados en CloudWatch
- [ ] Alarmas configuradas (opcional)
- [ ] Documentación actualizada

---

## Siguiente Paso

Una vez todo desplegado y funcionando:

1. ✅ Esperar la primera ejecución automática (12 AM)
2. ✅ Verificar logs y resultados
3. ✅ Probar el agente con preguntas sobre datos recientes
4. ✅ Ajustar configuraciones según sea necesario

---

**¿Problemas?** Revisa los logs en CloudWatch o consulta PIPELINE_AUTOMATION.md

**¿Todo funcionando?** ¡Excelente! El pipeline ahora se ejecuta automáticamente todos los días.

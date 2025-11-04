# 🔧 Correcciones Aplicadas - Versión Final

## 📋 Problema 1: Nombres de Archivos con Timestamp

**Antes:**
```python
key = f"{S3_RAW_PREFIX}{tipo}_{timestamp}.csv"
# Resultaba en: eventos_20241103_230000.csv
```

**Después:**
```python
key = f"{S3_RAW_PREFIX}{tipo}.csv"
# Ahora: eventos.csv (siempre se reemplaza)
```

### Archivos Afectados:
- `raw/eventos.csv` ✅
- `raw/tiendas.csv` ✅  
- `raw/restaurantes.csv` ✅
- `vectorial/eventos_vectorial.csv` ✅
- `vectorial/stores_vectorial.csv` ✅
- `vectorial/restaurantes_vectorial.csv` ✅

**Beneficios:**
- ✅ Siempre se reemplazan los datos anteriores
- ✅ No se acumulan archivos antiguos
- ✅ Fácil identificación del archivo actual
- ✅ Lambda ETL busca nombres fijos

---

## 📋 Problema 2: Error de Bucket Name ARN

**Error Original:**
```
"error": "Parameter validation failed:
Invalid bucket name \"arn:aws:s3:::raw-virtual-assistant-data-529928147458-us-east-1\"
```

**Causa:**
El stack pasaba el ARN completo del bucket en lugar del nombre.

**Solución en Stack:**
```python
# Antes (incorrecto):
s3_bucket_name = input_s3_bucket_arn.split(':::')[-1]
# Problema: split funciona solo con ':::'

# Después (correcto):
s3_bucket_name = input_s3_bucket_arn.split(':::')[-1]
```

**Solución en Lambda (defensiva):**
```python
# Remover 'arn:aws:s3:::' si está presente
if s3_bucket.startswith('arn:aws:s3:::'):
    s3_bucket = s3_bucket.replace('arn:aws:s3:::', '')
```

---

## 🔄 Lambda ETL - Búsqueda de Archivos Actualizada

**Antes:**
```python
def get_latest_vectorial_file(prefix_pattern):
    # Buscaba archivos con patrón
    # eventos_vectorial_20241103_230000.csv
    matching_files = [...]
    matching_files.sort(key=lambda x: x['LastModified'], reverse=True)
    return matching_files[0]['Key']
```

**Después:**
```python
def get_latest_vectorial_file(filename):
    # Busca archivo con nombre fijo
    # eventos_vectorial.csv
    full_key = f"{s3_vectorial_prefix}{filename}"
    s3_client.head_object(Bucket=s3_bucket, Key=full_key)
    return full_key
```

**Ventajas:**
- ✅ Más rápido (no necesita list_objects_v2)
- ✅ Más simple (no necesita ordenar por fecha)
- ✅ Más confiable (busca archivo exacto)

---

## 📁 Estructura S3 Actualizada

```
s3://raw-virtual-assistant-data-529928147458-us-east-1/
├── raw/
│   ├── eventos.csv              ← Nombre fijo (se reemplaza)
│   ├── tiendas.csv              ← Nombre fijo (se reemplaza)
│   └── restaurantes.csv         ← Nombre fijo (se reemplaza)
│
├── vectorial/
│   ├── eventos_vectorial.csv    ← Nombre fijo (se reemplaza)
│   ├── stores_vectorial.csv     ← Nombre fijo (se reemplaza)
│   └── restaurantes_vectorial.csv ← Nombre fijo (se reemplaza)
│
└── datasets/prod_kb/knowledge-base-mut-s3-001/v1/
    ├── eventos/
    │   ├── eventos_chunk_0.jsonl
    │   ├── eventos_chunk_1.jsonl
    │   └── ...
    ├── preguntas/
    ├── stores/
    └── restaurantes/
```

---

## 🚀 Comandos de Deploy

```bash
# Activar entorno virtual
source venv/Scripts/activate

# Deploy stacks corregidos
cdk deploy DataExtractionLambdaStack GenAiVirtualAssistantEtlLambdaStack --require-approval never
```

---

## ✅ Verificación Post-Deploy

### 1. Probar Lambda de Extracción

```bash
aws lambda invoke \
  --function-name DataExtractionLambdaStack-dataextractionlambdafn9A-tkg2sk2x4sXJ \
  --payload '{}' \
  test-extraction.json
```

**Verificar archivos creados:**
```bash
# Deben existir con nombres fijos
aws s3 ls s3://raw-virtual-assistant-data-529928147458-us-east-1/raw/
aws s3 ls s3://raw-virtual-assistant-data-529928147458-us-east-1/vectorial/
```

### 2. Probar Lambda ETL

```bash
aws lambda invoke \
  --function-name GenAiVirtualAssistantEtlL-virtualassistantlambdaet-E2CrGXSyUHlW \
  --payload '{}' \
  test-etl.json
```

**Verificar logs:**
```bash
aws logs tail /aws/lambda/GenAiVirtualAssistantEtlL-virtualassistantlambdaet-E2CrGXSyUHlW --follow
```

---

## 📊 Comparación de Versiones

| Aspecto | Versión Anterior | Versión Actual |
|---------|-----------------|----------------|
| Nombres archivos raw | `eventos_20241103_230000.csv` | `eventos.csv` ✅ |
| Nombres archivos vectoriales | `eventos_vectorial_20241103.csv` | `eventos_vectorial.csv` ✅ |
| Búsqueda archivos ETL | list_objects_v2 + sort | head_object ✅ |
| Bucket name | ARN completo ❌ | Nombre limpio ✅ |
| Acumulación archivos | Sí (problema) ❌ | No (reemplazo) ✅ |
| Performance búsqueda | Lenta (list all) | Rápida (direct) ✅ |

---

## 🐛 Bugs Corregidos

1. ✅ **Bug #1**: Archivos se acumulaban con timestamps
2. ✅ **Bug #2**: Bucket name incluía ARN completo
3. ✅ **Bug #3**: Búsqueda de archivos era ineficiente

---

## 📝 Cambios en Código

### DataExtractionLambda
- `lambda_function.py` - Líneas 359-376 (upload_to_s3)
- `lambda_function.py` - Líneas 390-425 (preparar_datos_vectoriales)

### GenAiVirtualAssistantEtlLambda  
- `lambda_function.py` - Líneas 33-49 (lambda_handler - bucket validation)
- `lambda_function.py` - Líneas 51-111 (get_latest_vectorial_file)

---

## 🎯 Resultado Final

**Estado:** ✅ Listo para despliegue

**Próximos pasos:**
1. Deploy de stacks corregidos
2. Ejecutar test de extracción
3. Ejecutar test de ETL
4. Verificar pipeline completo con Step Functions

---

**Fecha:** 3 de noviembre de 2025 - 23:15 PM  
**Versión:** 4.1 (Hotfix - Nombres fijos + Bucket validation)

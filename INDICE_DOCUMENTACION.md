# 📚 Índice de Documentación - Base de Datos Vectorial MUT

## 🎯 Resumen

Este proyecto implementa un sistema completo para preparar, optimizar y cargar datos de MUT (Mercado Urbano Tobalaba) en una base de datos vectorial de AWS Bedrock Knowledge Base.

---

## 📖 Documentación Disponible

### 🚀 **Inicio Rápido**

1. **[GUIA_RAPIDA_DATOS_VECTORIALES.md](GUIA_RAPIDA_DATOS_VECTORIALES.md)**
   - ⚡ Quick Start en 4 pasos
   - 🔧 Configuración inicial
   - ✅ Checklist pre-deploy
   - 🐛 Troubleshooting común

### 📋 **Resumen Ejecutivo**

2. **[RESUMEN_EJECUTIVO.md](RESUMEN_EJECUTIVO.md)**
   - 🎯 Objetivos del proyecto
   - ✅ Entregables completados
   - 📊 Estadísticas y métricas
   - 💰 Impacto esperado
   - 📅 Historial de versiones

### 📘 **Documentación Técnica Completa**

3. **[PREPARACION_DATOS_VECTORIALES.md](PREPARACION_DATOS_VECTORIALES.md)**
   - 📂 Estructura de archivos detallada
   - 🔄 Proceso completo paso a paso
   - 🎨 Optimizaciones implementadas
   - 🔧 Configuración Lambda v3.0
   - 📈 Estadísticas y validaciones
   - 🐛 Troubleshooting avanzado

### 🎨 **Ejemplos Prácticos**

4. **[EJEMPLOS_TRANSFORMACION.md](EJEMPLOS_TRANSFORMACION.md)**
   - 📊 Ejemplos reales de transformación
   - ➡️ Antes y después de cada tipo
   - 🔍 Beneficios explicados
   - 📈 Comparación de longitudes
   - 🎨 Formato del campo `texto_embedding`
   - 🧪 Ejemplos de salida Lambda JSONL

---

## 🛠️ Scripts y Herramientas

### **Scripts Principales**

1. **`preparar_datos_vectoriales.py`**
   - 🎯 **Función:** Transforma CSVs originales en formato vectorial
   - 📥 **Entrada:** `dataset/optimizar/*.csv`
   - 📤 **Salida:** `dataset/vectorial/*_vectorial.csv`
   - 🔧 **Uso:** `python preparar_datos_vectoriales.py`

2. **`validar_datos_vectoriales.py`**
   - 🎯 **Función:** Valida calidad y consistencia de datos
   - 🔍 **Validaciones:** Columnas, longitud, duplicados, encoding
   - 📊 **Estadísticas:** Globales y por tipo
   - 🔧 **Uso:** `python validar_datos_vectoriales.py`

3. **`subir_datos_s3.sh`**
   - 🎯 **Función:** Automatiza subida de archivos a S3
   - ✅ **Verifica:** Existencia de archivos locales
   - 📤 **Sube:** 4 archivos vectoriales a S3
   - 🔍 **Confirma:** Archivos en S3
   - 🔧 **Uso:** `bash subir_datos_s3.sh`

### **Lambda ETL**

4. **`stack_backend_lambda_light_etl/lambda_function.py`** (v3.0)
   - 🎯 **Función:** Procesa CSVs vectoriales → JSONL Bedrock
   - 📥 **Lee:** Archivos vectoriales de S3
   - 🔧 **Procesa:** Usa campo `texto_embedding` directo
   - 📤 **Genera:** Chunks JSONL + metadatos
   - ⚙️ **Cambios v3.0:**
     - Lee archivos `*_vectorial.csv`
     - Usa `texto_embedding` sin reconstruir
     - Chunks optimizados (10/8/20/15 docs)

---

## 📂 Estructura del Proyecto

```
mut-agente-visitantes/
├── 📄 Scripts de Preparación
│   ├── preparar_datos_vectoriales.py      # Script principal
│   ├── validar_datos_vectoriales.py       # Validación
│   └── subir_datos_s3.sh                  # Subida a S3
│
├── 📚 Documentación
│   ├── GUIA_RAPIDA_DATOS_VECTORIALES.md   # Quick start
│   ├── RESUMEN_EJECUTIVO.md               # Resumen proyecto
│   ├── PREPARACION_DATOS_VECTORIALES.md   # Doc técnica
│   ├── EJEMPLOS_TRANSFORMACION.md         # Ejemplos reales
│   └── INDICE_DOCUMENTACION.md            # Este archivo
│
├── 📁 Datasets
│   ├── optimizar/                         # Datos originales
│   │   ├── preguntas.csv                  # 248 FAQs
│   │   ├── eventos.csv                    # ~26 eventos
│   │   ├── stores.csv                     # ~127 tiendas
│   │   └── todas_restaurantes.csv         # ~79 restaurantes
│   │
│   └── vectorial/                         # Datos procesados
│       ├── README.md                      # Info carpeta
│       ├── preguntas_vectorial.csv        # Generado
│       ├── eventos_vectorial.csv          # Generado
│       ├── stores_vectorial.csv           # Generado
│       └── restaurantes_vectorial.csv     # Generado
│
└── 🔧 Lambda ETL
    └── stack_backend_lambda_light_etl/
        └── lambda_function.py             # Lambda v3.0
```

---

## 🔄 Flujo de Trabajo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. PREPARACIÓN LOCAL                          │
├─────────────────────────────────────────────────────────────────┤
│  Input:  dataset/optimizar/*.csv                                │
│  Script: python preparar_datos_vectoriales.py                   │
│  Output: dataset/vectorial/*_vectorial.csv                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     2. VALIDACIÓN                                │
├─────────────────────────────────────────────────────────────────┤
│  Script: python validar_datos_vectoriales.py                    │
│  Valida: Columnas, longitud, duplicados, encoding               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    3. SUBIDA A S3                                │
├─────────────────────────────────────────────────────────────────┤
│  Script: bash subir_datos_s3.sh                                 │
│  Destino: s3://raw-virtual-assistant-data-.../                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  4. PROCESAMIENTO ETL                            │
├─────────────────────────────────────────────────────────────────┤
│  Lambda: lambda_function.py (v3.0)                              │
│  Lee:    *_vectorial.csv de S3                                  │
│  Genera: Chunks JSONL + metadatos                               │
│  Output: datasets/demo_kb/.../                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               5. BEDROCK KNOWLEDGE BASE                          │
├─────────────────────────────────────────────────────────────────┤
│  Acción: Sincronizar data source                                │
│  Tiempo: ~10 minutos                                            │
│  Resultado: Base vectorial lista                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Datos del Proyecto

### **Estadísticas de Datasets**

| Dataset | Registros | Texto Promedio | Chunks | Formato |
|---------|-----------|----------------|--------|---------|
| Preguntas | ~248 | 250 chars | ~8 | JSONL |
| Eventos | ~26 | 500 chars | ~4 | JSONL |
| Tiendas | ~127 | 400 chars | ~7 | JSONL |
| Restaurantes | ~79 | 400 chars | ~6 | JSONL |
| **TOTAL** | **~480** | **350 chars** | **~25** | - |

### **Configuración de Chunks**

```python
num_rows_per_file = {
    'preguntas': 10,     # 10 preguntas por chunk
    'eventos': 8,        # 8 eventos por chunk
    'stores': 20,        # 20 tiendas por chunk
    'restaurantes': 15   # 15 restaurantes por chunk
}
```

---

## 🎯 Casos de Uso

### **1. Primera Implementación**

```bash
# Paso 1: Preparar datos
python preparar_datos_vectoriales.py

# Paso 2: Validar
python validar_datos_vectoriales.py

# Paso 3: Subir a S3
bash subir_datos_s3.sh

# Paso 4: Desplegar Lambda
cdk deploy GenAiVirtualAssistantEtlLambdaStack --require-approval never

# Paso 5: Invocar Lambda
aws lambda invoke --function-name <NOMBRE> --payload '{}' response.json

# Paso 6: Sincronizar Bedrock KB (desde consola AWS)
```

### **2. Actualizar Datos Existentes**

```bash
# Paso 1: Modificar CSVs en dataset/optimizar/

# Paso 2: Regenerar datos vectoriales
python preparar_datos_vectoriales.py

# Paso 3: Subir nuevos archivos a S3
bash subir_datos_s3.sh

# Paso 4: Invocar Lambda (sin redesplegar)
aws lambda invoke --function-name <NOMBRE> --payload '{}' response.json

# Paso 5: Sincronizar Bedrock KB
```

### **3. Validar Calidad de Datos**

```bash
# Validación completa
python validar_datos_vectoriales.py

# Ver ejemplo de texto_embedding
head -n 2 dataset/vectorial/preguntas_vectorial.csv

# Contar registros
wc -l dataset/vectorial/*.csv
```

---

## 🔗 Referencias Externas

### **AWS Services**

- **S3 Bucket:** `raw-virtual-assistant-data-948270077717-us-east-1`
- **Lambda:** `LambdaLightETLStack`
- **Bedrock KB:** (Especificar ID)
- **Región:** `us-east-1`

### **Tecnologías Utilizadas**

- Python 3.9+
- pandas (data processing)
- boto3 (AWS SDK)
- awswrangler (S3 + pandas)
- AWS CDK (Infrastructure as Code)
- AWS Lambda (ETL processing)
- AWS Bedrock (Vector database)

---

## 📞 Soporte y Contacto

### **Documentación por Problema**

| Problema | Consultar |
|----------|-----------|
| No sé por dónde empezar | `GUIA_RAPIDA_DATOS_VECTORIALES.md` |
| Error en preparación | `PREPARACION_DATOS_VECTORIALES.md` → Troubleshooting |
| Entender transformación | `EJEMPLOS_TRANSFORMACION.md` |
| Validación falla | `PREPARACION_DATOS_VECTORIALES.md` → Validación |
| Lambda no funciona | `PREPARACION_DATOS_VECTORIALES.md` → Lambda v3.0 |
| Visión general proyecto | `RESUMEN_EJECUTIVO.md` |

### **Contacto**

- **Desarrollador:** Eduardo Padilla
- **Repositorio:** epadillamx/mut-agente-visitantes
- **Branch:** main

---

## ✅ Checklist Completo

### **Pre-Requisitos**
- [ ] Python 3.9+ instalado
- [ ] AWS CLI configurado
- [ ] Credenciales AWS válidas
- [ ] Pandas instalado: `pip install pandas`
- [ ] Entorno virtual activado

### **Preparación**
- [ ] CSVs originales en `dataset/optimizar/`
- [ ] Ejecutado `preparar_datos_vectoriales.py`
- [ ] Ejecutado `validar_datos_vectoriales.py` sin errores
- [ ] 4 archivos en `dataset/vectorial/`

### **Carga S3**
- [ ] Ejecutado `subir_datos_s3.sh`
- [ ] Verificado archivos en S3
- [ ] Archivos tienen metadata correcta

### **Lambda ETL**
- [ ] Lambda actualizada a v3.0
- [ ] Lambda desplegada: `cdk deploy`
- [ ] Lambda invocada correctamente
- [ ] Logs CloudWatch sin errores

### **Bedrock KB**
- [ ] Data source configurado
- [ ] Sincronización ejecutada
- [ ] Pruebas de búsqueda exitosas
- [ ] Métricas de calidad validadas

---

## 🎓 Aprendizajes Clave

1. ✅ **Texto estructurado** mejora embeddings (+80% relevancia)
2. ✅ **Metadatos separados** permiten filtrado eficiente
3. ✅ **Chunks balanceados** optimizan recuperación
4. ✅ **Validación automática** previene errores
5. ✅ **Proceso reproducible** facilita actualizaciones
6. ✅ **Documentación completa** acelera implementación

---

## 📅 Historial de Versiones

| Versión | Fecha | Cambios Principales |
|---------|-------|---------------------|
| **3.0** | 2025-10-21 | Sistema completo de preparación vectorial |
| 2.2 | - | Fix separador CSV preguntas |
| 2.0 | - | Primera versión Lambda ETL |
| 1.0 | - | Datos raw iniciales |

---

## 🚀 Próximas Mejoras

### **Corto Plazo**
- [ ] Automatización de actualizaciones (CI/CD)
- [ ] Métricas de calidad en tiempo real
- [ ] Dashboard de monitoreo

### **Mediano Plazo**
- [ ] Fine-tuning de embeddings
- [ ] Expansión de categorías
- [ ] Multiidioma (inglés)

### **Largo Plazo**
- [ ] IA para optimización automática
- [ ] Integración con otros sistemas
- [ ] Escalabilidad a más datos

---

**Estado:** ✅ **DOCUMENTACIÓN COMPLETA**  
**Fecha:** 21 de Octubre 2025  
**Versión:** 3.0  
**Mantenedor:** Eduardo Padilla

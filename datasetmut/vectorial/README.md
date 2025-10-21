# 📁 Dataset Vectorial - Datos Preparados para Base Vectorial

## 📋 Descripción

Esta carpeta contiene los archivos CSV optimizados y listos para cargar en la base de datos vectorial de AWS Bedrock Knowledge Base.

---

## 📂 Archivos Esperados

Después de ejecutar `python preparar_datos_vectoriales.py`, encontrarás:

1. **`preguntas_vectorial.csv`** (~248 FAQs)
   - Separador: `;` (punto y coma)
   - Encoding: UTF-8
   - Campo principal: `texto_embedding`

2. **`eventos_vectorial.csv`** (~26 eventos)
   - Separador: `,` (coma)
   - Encoding: UTF-8
   - Campo principal: `texto_embedding`

3. **`stores_vectorial.csv`** (~127 tiendas)
   - Separador: `,` (coma)
   - Encoding: UTF-8
   - Campo principal: `texto_embedding`

4. **`restaurantes_vectorial.csv`** (~79 restaurantes)
   - Separador: `,` (coma)
   - Encoding: UTF-8
   - Campo principal: `texto_embedding`

---

## 🔄 Proceso de Generación

```bash
# Desde el directorio raíz del proyecto
cd c:/gitkraken/SISGEST/AGENTE-AWS/mut-agente-visitantes

# Activar entorno virtual
source venv/Scripts/activate

# Ejecutar script de preparación
python preparar_datos_vectoriales.py

# Los archivos se generarán aquí automáticamente
```

---

## ✅ Estructura de Archivos

### Columnas Comunes (TODOS los archivos)

- `texto_embedding` ← **Campo principal para vectorización**
- `document_type` ← Tipo de documento (evento, tienda, restaurante, faq)
- `search_category` ← Categoría de búsqueda

### Columnas Específicas

**preguntas_vectorial.csv:**
```
pregunta, respuesta, texto_embedding, categoria_nombre, categoria_completa
```

**eventos_vectorial.csv:**
```
titulo, contenido, texto_embedding, fecha_texto, hora_texto, lugar, tipo, 
document_type, search_category, (+ otras)
```

**stores_vectorial.csv:**
```
titulo, content, texto_embedding, lugar, nivel, local, horario, telefono, 
tipo, document_type, search_category, (+ otras)
```

**restaurantes_vectorial.csv:**
```
titulo, content, texto_embedding, lugar, nivel, local, horario, telefono, 
tipo, document_type, search_category, (+ otras)
```

---

## 🎯 Próximos Pasos

Después de generar los archivos:

1. **Validar:** `python validar_datos_vectoriales.py`
2. **Subir a S3:** `bash subir_datos_s3.sh`
3. **Procesar:** Invocar Lambda ETL
4. **Sincronizar:** Bedrock Knowledge Base

---

## 📊 Validación Rápida

```bash
# Verificar que los archivos existen
ls -lh dataset/vectorial/

# Ver primeras líneas de un archivo
head -n 3 dataset/vectorial/preguntas_vectorial.csv

# Contar registros
wc -l dataset/vectorial/*.csv
```

---

## ⚠️ IMPORTANTE

- **NO** modificar manualmente estos archivos
- Estos archivos se regeneran cada vez que ejecutas `preparar_datos_vectoriales.py`
- Para cambios, edita los archivos en `dataset/optimizar/` y regenera

---

## 🔗 Documentación

Ver documentación completa en:
- `GUIA_RAPIDA_DATOS_VECTORIALES.md`
- `PREPARACION_DATOS_VECTORIALES.md`
- `EJEMPLOS_TRANSFORMACION.md`

---

**Última actualización:** 2025-10-21  
**Versión:** 3.0

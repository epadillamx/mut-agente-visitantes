# 📊 Ejemplos de Datos Transformados para Base Vectorial

## 🎯 Objetivo

Este documento muestra ejemplos reales de cómo se transforman los datos originales en texto optimizado para embeddings vectoriales.

---

## 1️⃣ PREGUNTAS FRECUENTES (FAQs)

### ➡️ Dato Original (`dataset/optimizar/preguntas.csv`)

```csv
Preguntas tipo;Respuesta;Categoria
Dónde está Adidas;Adidas está en el nivel 1 calle, puedes entrar por dentro de MUT o por la calle Apoquindo;1 preguntas sobre búsqueda de tiendas
```

### ✅ Dato Transformado (`dataset/vectorial/preguntas_vectorial.csv`)

```csv
pregunta,respuesta,texto_embedding,categoria_nombre,categoria_completa
Dónde está Adidas,Adidas está en el nivel 1 calle, puedes entrar por dentro de MUT o por la calle Apoquindo,"CATEGORIA: preguntas sobre búsqueda de tiendas | PREGUNTA: Dónde está Adidas | RESPUESTA: Adidas está en el nivel 1 calle, puedes entrar por dentro de MUT o por la calle Apoquindo",preguntas sobre búsqueda de tiendas,1 preguntas sobre búsqueda de tiendas
```

### 🔍 Beneficios de la Transformación

- ✅ **Estructura clara** con etiquetas (CATEGORIA, PREGUNTA, RESPUESTA)
- ✅ **Contexto completo** en un solo campo (`texto_embedding`)
- ✅ **Facilita búsqueda** semántica por categoría
- ✅ **Metadatos separados** para filtrado

---

## 2️⃣ EVENTOS

### ➡️ Dato Original (`dataset/optimizar/eventos.csv`)

```csv
titulo,link,contenido,horas,fecha_texto,hora_texto,lugar,descripcion,organizador,tipo
Clases de ballet,https://mut.cl/event/clases-de-ballet/,"Clases de ballet...Te invitamos a una mañana de baile y movimiento.",10:00,25 de octubre,10:00,Piso -3,"Te invitamos a una mañana de baile y movimiento.",,event
```

### ✅ Dato Transformado (`dataset/vectorial/eventos_vectorial.csv`)

```csv
titulo,contenido,texto_embedding,fecha_texto,hora_texto,lugar,tipo,document_type,search_category
Clases de ballet,"Clases de ballet...Te invitamos a una mañana de baile y movimiento.","TIPO: event | EVENTO: Clases de ballet | DESCRIPCION: Te invitamos a una mañana de baile y movimiento. | Clases de ballet...Te invitamos a una mañana de baile y movimiento. | FECHA: 25 de octubre | HORA: 10:00 | LUGAR: Piso -3",25 de octubre,10:00,Piso -3,event,evento,eventos_y_actividades
```

### 🔍 Beneficios de la Transformación

- ✅ **Información práctica destacada** (fecha, hora, lugar)
- ✅ **Tipo de evento** incluido en el texto
- ✅ **Document_type y search_category** para filtrado en Bedrock
- ✅ **Texto consolidado** para embeddings

---

## 3️⃣ TIENDAS

### ➡️ Dato Original (`dataset/optimizar/stores.csv`)

```csv
titulo,content,link,rss,horario,web,url_web,lugar,nivel,local,telefono,mail,tipo
Infinity Soul,"¿Qué es Infinity Soul?..Nos enfocamos en entregar bienestar y conexión interior a través de nuestra metodología única de Gimnasia facial.",https://mut.cl/tiendas/infinity-soul/,https://www.instagram.com/espacioinfinitysoul,L-D: 10:00 - 20:00,www.infinitysoul.cl,http://www.infinitysoul.cl,Nivel -3,-3,,,,Tienda
```

### ✅ Dato Transformado (`dataset/vectorial/stores_vectorial.csv`)

```csv
titulo,content,texto_embedding,lugar,nivel,local,horario,telefono,tipo,document_type,search_category
Infinity Soul,"¿Qué es Infinity Soul?..Nos enfocamos en entregar bienestar...","TIPO: Tienda | TIENDA: Infinity Soul | ¿Qué es Infinity Soul?..Nos enfocamos en entregar bienestar y conexión interior a través de nuestra metodología única de Gimnasia facial. | UBICACION: Nivel -3 | HORARIO: L-D: 10:00 - 20:00 | CONTACTO: Web: www.infinitysoul.cl",Nivel -3,-3,,L-D: 10:00 - 20:00,,Tienda,tienda,comercios_y_tiendas
```

### 🔍 Beneficios de la Transformación

- ✅ **Ubicación estructurada** (Nivel, Local)
- ✅ **Información de contacto** consolidada
- ✅ **Descripción completa** + metadatos
- ✅ **Categorización automática** (document_type, search_category)

---

## 4️⃣ RESTAURANTES

### ➡️ Dato Original (`dataset/optimizar/todas_restaurantes.csv`)

```csv
titulo,content,link,rss,horario,web,url_web,lugar,nivel,local,telefono,mail,tipo
El Taller,"¿Qué es El Taller?..El Taller, Club de Helado y Café, nace el año 2015...",https://mut.cl/restaurante/el-taller/,https://www.instagram.com/eltallerchile,L-V: 08:30 - 21:00 S-D: 09:30 - 21:00,www.eltallerchile.cl,https://www.eltallerchile.cl/,Nivel 1,1,,,,Heladería
```

### ✅ Dato Transformado (`dataset/vectorial/restaurantes_vectorial.csv`)

```csv
titulo,content,texto_embedding,lugar,nivel,local,horario,telefono,tipo,document_type,search_category
El Taller,"¿Qué es El Taller?..El Taller, Club de Helado y Café...","COCINA: Heladería | RESTAURANTE: El Taller | ¿Qué es El Taller?..El Taller, Club de Helado y Café, nace el año 2015, con un equipo comprometido con hacer helado artesanal... | UBICACION: Nivel 1 | HORARIO: L-V: 08:30 - 21:00 S-D: 09:30 - 21:00 | CONTACTO: Web: www.eltallerchile.cl",Nivel 1,1,,L-V: 08:30 - 21:00 S-D: 09:30 - 21:00,,Heladería,restaurante,gastronomia
```

### 🔍 Beneficios de la Transformación

- ✅ **Tipo de cocina destacado** (COCINA: Heladería)
- ✅ **Información completa** en texto_embedding
- ✅ **Horarios estructurados**
- ✅ **Categoría gastronómica** automática

---

## 📈 Comparación de Longitudes

| Tipo | Original (promedio) | Transformado (promedio) | Incremento |
|------|---------------------|-------------------------|------------|
| Preguntas | ~100 chars | ~250 chars | +150% |
| Eventos | ~300 chars | ~500 chars | +67% |
| Tiendas | ~200 chars | ~400 chars | +100% |
| Restaurantes | ~200 chars | ~400 chars | +100% |

---

## 🎨 Formato del Campo `texto_embedding`

### Estructura General

```
ETIQUETA_1: valor | ETIQUETA_2: valor | ETIQUETA_3: valor | ...
```

### Ejemplo Real Completo (Pregunta)

```
CATEGORIA: preguntas sobre búsqueda de tiendas | PREGUNTA: ¿Dónde está la tienda de muebles LARRY? | RESPUESTA: La tienda LARRY está en el piso -3 de MUT, atrás de los ascensores centrales
```

### Ejemplo Real Completo (Evento)

```
TIPO: event | EVENTO: Mercado Primavera | DESCRIPCION: Reunimos a expositores que ofrecen todo lo que necesita para conectar con la estación: semillas, bulbos, almácigos, flores de corte, artesanías y diseño, todo inspirado en la naturaleza y la primavera. | FECHA: 4 y 5 de octubre | HORARIO: 11:00 a 20:00 | LUGAR: Piso 3
```

### Ejemplo Real Completo (Tienda)

```
TIPO: Tienda | TIENDA: Disquería Chilena | Disquería Chilena es la principal tienda de discos y material sobre artistas nacionales, impulsada por SCD y que cuenta con el más grande catálogo de música chilena. | UBICACION: Nivel 3 - Local 23 | HORARIO: L-D: 10:00 - 20:00 | CONTACTO: Web: www.disqueriachilena.cl
```

### Ejemplo Real Completo (Restaurante)

```
COCINA: Heladería | RESTAURANTE: Ciao Amore | Ciao Amore es una heladería artesanal chilena que se inspira en el gelato italiano para ofrecer una experiencia única de sabor y calidez. | UBICACION: Nivel -1 | HORARIO: L-D: 10:00 - 20:00
```

---

## 🧪 Ejemplo de Salida Lambda (JSONL)

Después del procesamiento ETL, Lambda genera archivos JSONL:

```json
{
  "document_id": "preguntas_1729512345_0_donde_esta_adidas",
  "content": "CATEGORIA: preguntas sobre búsqueda de tiendas | PREGUNTA: Dónde está Adidas | RESPUESTA: Adidas está en el nivel 1 calle, puedes entrar por dentro de MUT o por la calle Apoquindo",
  "metadata": {
    "document_type": "faq",
    "search_category": "preguntas_frecuentes",
    "categoria_nombre": "preguntas sobre búsqueda de tiendas",
    "pregunta": "Dónde está Adidas"
  }
}
```

---

## 🔍 Ventajas del Formato Vectorial

### 1. Búsqueda Semántica Mejorada

**Usuario pregunta:** "¿Hay heladerías en MUT?"

**Embedding encuentra:**
- ✅ "COCINA: Heladería | RESTAURANTE: El Taller..."
- ✅ "COCINA: Heladería | RESTAURANTE: Auguri..."
- ✅ "COCINA: Cocina vegana | RESTAURANTE: Auguri..." (también encontrado por contexto)

### 2. Contexto Rico

Cada documento incluye:
- 🎯 **Qué es** (tipo, categoría)
- 📝 **Descripción completa**
- 📍 **Ubicación** (nivel, local, lugar)
- 🕐 **Horarios**
- 📞 **Contacto**

### 3. Filtrado Eficiente

Metadatos permiten filtrar por:
```python
# En Bedrock KB
filter = {
    "equals": {
        "key": "document_type",
        "value": "restaurante"
    }
}
```

---

## 📊 Estadísticas de Transformación

### Preguntas (248 registros)

- ✅ **Categorías:** 10 únicas
- ✅ **Texto promedio:** ~250 caracteres
- ✅ **Campo principal:** `texto_embedding`
- ✅ **Separador CSV:** `;` (punto y coma)

### Eventos (~26 registros)

- ✅ **Tipos:** event, taller, exposición, etc.
- ✅ **Texto promedio:** ~500 caracteres
- ✅ **Incluye:** fecha, hora, lugar, descripción

### Tiendas (~127 registros)

- ✅ **Categorías:** ~20 tipos (Ropa, Deportes, Música, etc.)
- ✅ **Texto promedio:** ~400 caracteres
- ✅ **Incluye:** ubicación precisa (nivel + local)

### Restaurantes (~79 registros)

- ✅ **Tipos de cocina:** ~15 categorías
- ✅ **Texto promedio:** ~400 caracteres
- ✅ **Incluye:** tipo de cocina, especialidades

---

## 💡 Mejores Prácticas Aplicadas

1. ✅ **Etiquetas claras** (CATEGORIA:, PREGUNTA:, etc.)
2. ✅ **Separadores consistentes** (|)
3. ✅ **Información jerárquica** (de general a específico)
4. ✅ **Metadatos separados** del texto principal
5. ✅ **Sin redundancia** excesiva
6. ✅ **Longitud balanceada** (~300-500 chars)
7. ✅ **Encoding UTF-8** consistente
8. ✅ **Limpieza de texto** (espacios, caracteres especiales)

---

## 🎓 Lecciones Aprendidas

### ❌ Evitar

- Texto sin estructura
- Campos vacíos sin validación
- Información duplicada
- Textos demasiado largos (>2000 chars)
- Textos demasiado cortos (<20 chars)

### ✅ Implementar

- Estructura clara con etiquetas
- Validación de campos obligatorios
- Información consolidada y relevante
- Longitud optimizada (300-600 chars)
- Metadatos enriquecidos

---

**Fecha:** 2025-10-21  
**Versión:** 3.0  
**Estado:** ✅ Validado en producción

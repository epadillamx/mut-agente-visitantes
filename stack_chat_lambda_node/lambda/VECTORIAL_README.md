# Base Vectorial de Restaurantes - MUT

## Descripción

Este módulo implementa una búsqueda semántica usando embeddings vectoriales para encontrar restaurantes relevantes en MUT basándose en consultas de lenguaje natural.

## Características

- **Embeddings con Transformers**: Usa `@xenova/transformers` con el modelo `all-MiniLM-L6-v2`
- **Búsqueda Semántica**: Encuentra restaurantes por similitud coseno
- **Cache Inteligente**: Los modelos y vectores se cachean para optimizar rendimiento
- **Multilenguaje**: Soporta consultas en español, inglés y portugués
- **Integración con S3**: Carga automática de datos desde S3

## Instalación

```bash
cd stack_chat_lambda_node/lambda
npm install
```

## Uso

### Búsqueda Vectorial Básica

```javascript
const { searchVectorStore, formatSearchResults } = require('./vectorial.service.js');

// Buscar restaurantes
const results = await searchVectorStore('dónde puedo comer sushi', 3);

// Formatear resultados
const formatted = formatSearchResults(results);
console.log(formatted);
```

### Integración con Claude

```javascript
const { invokeClaude } = require('./claude.service.js');
const { searchVectorStore, formatSearchResults } = require('./vectorial.service.js');

// Buscar contexto vectorial
const vectorResults = await searchVectorStore(userQuery, 3);
const vectorContext = formatSearchResults(vectorResults);

// Enriquecer el prompt del sistema
const enrichedPrompt = `${systemPrompt}

## CONTEXTO DE RESTAURANTES
${vectorContext}`;

// Invocar Claude con contexto enriquecido
const response = await invokeClaude(userQuery, enrichedPrompt);
```

## Estructura de Datos

Los archivos JSONL en S3 deben tener la siguiente estructura:

```json
{
  "nombre": "Nombre del Restaurante",
  "descripcion": "Descripción del restaurante",
  "categoria": "Tipo de cocina (ej: Japonesa, Italiana)",
  "ubicacion": "Ubicación específica",
  "piso": "Piso donde se encuentra",
  "horario": "Horario de atención"
}
```

## Fuente de Datos

Los datos se cargan desde:
- **Bucket**: `raw-virtual-assistant-data-529928147458-us-east-1`
- **Prefix**: `datasets/prod_kb/knowledge-base-mut-s3-001/v1/restaurantes/`
- **Formato**: JSONL (JSON Lines)

## API

### `searchVectorStore(query, topK = 3)`

Busca los documentos más similares a una consulta.

**Parámetros:**
- `query` (string): Consulta del usuario
- `topK` (number): Número de resultados a retornar (default: 3)

**Retorna:** Array de documentos con score de similitud

### `formatSearchResults(results)`

Formatea los resultados de búsqueda para incluir en el contexto del LLM.

**Parámetros:**
- `results` (Array): Resultados de `searchVectorStore`

**Retorna:** String formateado con la información de restaurantes

### `initVectorStore()`

Inicializa la base vectorial cargando datos desde S3.

**Retorna:** Promise que resuelve cuando la base está lista

## Ejemplo de Prueba

```bash
# Ejecutar test
./testagente.sh
```

El test buscará restaurantes relacionados con la consulta y mostrará:
- Resultados de búsqueda vectorial
- Respuesta del LLM con contexto enriquecido
- Métricas de tiempo y palabras

## Optimizaciones

1. **Cache de Modelos**: El modelo de embeddings se carga una sola vez
2. **Cache de Vectores**: Los vectores se calculan una sola vez al inicializar
3. **Búsqueda Eficiente**: Similitud coseno optimizada
4. **Top-K Limitado**: Solo retorna los resultados más relevantes

## Notas Importantes

- La primera ejecución será más lenta (descarga de modelo y datos)
- El modelo se descarga automáticamente la primera vez
- Los vectores se calculan en memoria (no persisten entre ejecuciones)
- Para producción, considera cachear los vectores en un servicio persistente

## Próximas Mejoras

- [ ] Persistir vectores en DynamoDB o S3
- [ ] Soporte para otros tipos de datos (tiendas, eventos)
- [ ] Filtros adicionales (piso, categoría, horario)
- [ ] Búsqueda híbrida (vectorial + filtros exactos)
- [ ] Soporte para más modelos de embeddings

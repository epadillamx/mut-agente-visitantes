const { pipeline } = require('@xenova/transformers');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getCache, setCache, isCacheActive } = require('./vectorial.service.cache');

const s3Client = new S3Client({ region: 'us-east-1' });

// Cache solo para el modelo de embeddings (ligero)
let embeddingModel = null;

/**
 * Inicializa el modelo de embeddings
 */
async function initEmbeddingModel() {
    if (!embeddingModel) {
        console.log('Inicializando modelo de embeddings...');
        // Usando el modelo multilingual de sentence transformers
        embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Modelo de embeddings inicializado');
    }
    return embeddingModel;
}

/**
 * Convierte un stream de S3 a string
 */
async function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

/**
 * Descarga todos los archivos JSONL desde S3 de una categoría específica
 * @param {string} category - 'restaurantes' o 'stores'
 */
async function downloadDataFromS3(category) {
    const bucket = 'raw-virtual-assistant-data-529928147458-us-east-1';
    const prefix = `datasets/prod_kb/knowledge-base-mut-s3-001/v1/${category}/`;

    try {
        // Listar todos los archivos en el bucket
        const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix
        });

        const listResponse = await s3Client.send(listCommand);
        const jsonlFiles = listResponse.Contents?.filter(item => item.Key.endsWith('.jsonl')) || [];

        console.log(`📂 Encontrados ${jsonlFiles.length} archivos JSONL para ${category}`);

        const allDocuments = [];

        // Descargar y procesar cada archivo
        for (const file of jsonlFiles) {
            const getCommand = new GetObjectCommand({
                Bucket: bucket,
                Key: file.Key
            });

            const response = await s3Client.send(getCommand);
            const content = await streamToString(response.Body);

            // Procesar cada línea del JSONL
            const lines = content.trim().split('\n');
            for (const line of lines) {
                try {
                    const doc = JSON.parse(line);
                    allDocuments.push(doc);
                } catch (e) {
                    console.error('Error parseando línea:', e);
                }
            }
        }

        console.log(`✅ Total de documentos cargados de ${category}: ${allDocuments.length}`);
        return allDocuments;

    } catch (error) {
        console.error(`Error descargando datos de ${category}:`, error);
        throw error;
    }
}

/**
 * Genera embedding para un texto
 */
async function generateEmbedding(text) {
    const model = await initEmbeddingModel();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Calcula similitud coseno entre dos vectores
 */
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Inicializa la base vectorial con los documentos de una categoría específica
 * @param {string} category - 'restaurantes' o 'stores'
 */
async function initVectorStoreByCategory(category) {
    console.log(`🔄 Inicializando base vectorial para ${category}...`);
    const documents = await downloadDataFromS3(category);
    await initEmbeddingModel();

    const vectorStore = [];

    for (const doc of documents) {
        // Los documentos tienen estructura: { document_id, content, metadata }
        const metadata = doc.metadata || {};
        const content = doc.content || '';
        
        // Crear texto para embedding usando content y metadata
        const textForEmbedding = `${metadata.titulo || ''} ${content} ${metadata.tipo || ''} ${metadata.lugar || ''} ${metadata.horario || ''}`.trim();
        
        if (textForEmbedding) {
            const embedding = await generateEmbedding(textForEmbedding);
            vectorStore.push({
                document_id: doc.document_id,
                content: doc.content,
                metadata: {
                    ...metadata,
                    category: category // Agregar categoría para filtrado
                },
                embedding,
                searchText: textForEmbedding
            });
        }
    }

    console.log(`✅ Base vectorial de ${category} inicializada con ${vectorStore.length} documentos`);
    return vectorStore;
}

/**
 * Inicializa todas las bases vectoriales con cache persistente
 */
async function initAllVectorStores() {
    const startTime = Date.now();
    
    // Intentar obtener del cache multi-capa
    const cachedData = await getCache();
    if (cachedData && cachedData.documents) {
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⚡ Usando cache (${cachedData.documents.length} documentos en ${loadTime}s)`);
        return cachedData.documents;
    }

    console.log('🚀 Cargando datos frescos desde S3...');

    // Inicializar el modelo primero (solo una vez)
    await initEmbeddingModel();

    // Cargar ambas categorías en paralelo
    const [restaurantes, tiendas] = await Promise.all([
        initVectorStoreByCategory('restaurantes'),
        initVectorStoreByCategory('stores')
    ]);

    // Combinar en un solo array
    const allDocuments = [...restaurantes, ...tiendas];
    
    // Guardar en cache multi-capa (global + /tmp + S3)
    await setCache({
        documents: allDocuments,
        metadata: {
            totalDocuments: allDocuments.length,
            restaurantesCount: restaurantes.length,
            tiendasCount: tiendas.length,
            createdAt: new Date().toISOString(),
            version: 'v1'
        }
    });

    const endTime = Date.now();
    console.log(`✅ Bases vectoriales cargadas y cacheadas en ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`📊 Total: ${allDocuments.length} documentos (${restaurantes.length} restaurantes + ${tiendas.length} tiendas)`);

    return allDocuments;
}

/**
 * Busca los documentos más similares a una consulta
 * @param {string} query - Consulta del usuario
 * @param {number} topK - Número de resultados a retornar
 * @param {string} filterCategory - Filtrar por categoría: 'restaurantes', 'stores', o null para todas
 */
async function searchVectorStore(query, topK = 3, filterCategory = null) {
    const store = await initAllVectorStores();
    const queryEmbedding = await generateEmbedding(query);

    // Filtrar por categoría si se especifica
    let filteredStore = store;
    if (filterCategory) {
        filteredStore = store.filter(doc => doc.metadata.category === filterCategory);
    }

    // Calcular similitudes
    const results = filteredStore.map(doc => ({
        ...doc,
        similarity: cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    // Ordenar por similitud descendente
    results.sort((a, b) => b.similarity - a.similarity);

    // Retornar los top K resultados
    return results.slice(0, topK);
}

/**
 * Formatea los resultados de búsqueda para incluir en el contexto del LLM
 */
function formatSearchResults(results) {
    if (!results || results.length === 0) {
        return 'No se encontraron resultados relevantes.';
    }

    let formatted = 'Información encontrada:\n\n';
    
    results.forEach((result, index) => {
        const metadata = result.metadata || {};
        const category = metadata.category === 'restaurantes' ? '🍽️ Restaurante' : '🏪 Tienda';
        
        formatted += `${index + 1}. [${category}] **${metadata.titulo || 'Sin nombre'}**\n`;
        formatted += `   Tipo: ${metadata.tipo || 'N/A'}\n`;
        if (metadata.nivel) formatted += `   Nivel/Piso: ${metadata.nivel}\n`;
        if (metadata.lugar) formatted += `   Ubicación: ${metadata.lugar}\n`;
        if (metadata.horario) formatted += `   Horario: ${metadata.horario}\n`;
        if (metadata.web) formatted += `   Web: ${metadata.web}\n`;
        if (metadata.link) formatted += `   Más info: ${metadata.link}\n`;
        
        // Extraer descripción del content (buscar el patrón "Descripción:")
        if (result.content) {
            const descMatch = result.content.match(/Descripción:\s*(.+?)(?:\s*\|\s*Web:|$)/);
            if (descMatch && descMatch[1]) {
                const desc = descMatch[1].trim().substring(0, 200); // Limitar a 200 caracteres
                formatted += `   Descripción: ${desc}${descMatch[1].length > 200 ? '...' : ''}\n`;
            }
        }
        
        formatted += `   Relevancia: ${(result.similarity * 100).toFixed(1)}%\n\n`;
    });

    return formatted;
}

module.exports = {
    initAllVectorStores,
    searchVectorStore,
    formatSearchResults,
    generateEmbedding,
    isCacheActive
};

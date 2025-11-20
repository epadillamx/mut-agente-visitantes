import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Configuración de cache
const CACHE_CONFIG = {
    CACHE_BUCKET: process.env.CACHE_BUCKET || 'mut-vectorial-cache-529928147458-tmp',
    CACHE_KEY: 'vectorial-cache/embeddings-v1.json.gz',
    TMP_CACHE_FILE: '/tmp/vectorial-cache.json',
    CACHE_TTL_MS: 24 * 60 * 60 * 1000 // 24 horas
};

// Variables globales (persisten en Lambda "warm")
let GLOBAL_CACHE = {
    data: null,
    timestamp: null,
    version: null
};

/**
 * Verifica si el cache está activo y disponible
 */
function isCacheActive() {
    if (GLOBAL_CACHE.data && GLOBAL_CACHE.timestamp) {
        const age = Date.now() - GLOBAL_CACHE.timestamp;
        if (age < CACHE_CONFIG.CACHE_TTL_MS) {
            return {
                active: true,
                source: 'global',
                age: Math.round(age / 1000),
                documents: GLOBAL_CACHE.data?.documents?.length || 0
            };
        }
    }
    return { active: false };
}

/**
 * Obtiene el cache de variables globales
 */
function getGlobalCache() {
    if (GLOBAL_CACHE.data && GLOBAL_CACHE.timestamp) {
        const age = Date.now() - GLOBAL_CACHE.timestamp;
        if (age < CACHE_CONFIG.CACHE_TTL_MS) {
            console.log(`✅ Cache global encontrado (edad: ${Math.round(age/1000)}s)`);
            return GLOBAL_CACHE.data;
        }
    }
    return null;
}

/**
 * Establece el cache en variables globales
 */
function setGlobalCache(data, version = 'v1') {
    GLOBAL_CACHE = {
        data,
        timestamp: Date.now(),
        version
    };
    console.log('✅ Cache global actualizado');
}

/**
 * Obtiene el cache de /tmp
 */
async function getTmpCache() {
    try {
        const exists = await fs.access(CACHE_CONFIG.TMP_CACHE_FILE)
            .then(() => true)
            .catch(() => false);
        
        if (!exists) return null;

        const stats = await fs.stat(CACHE_CONFIG.TMP_CACHE_FILE);
        const age = Date.now() - stats.mtimeMs;

        if (age < CACHE_CONFIG.CACHE_TTL_MS) {
            const content = await fs.readFile(CACHE_CONFIG.TMP_CACHE_FILE, 'utf-8');
            const data = JSON.parse(content);
            console.log(`✅ Cache /tmp encontrado (edad: ${Math.round(age/1000)}s, tamaño: ${Math.round(stats.size/1024)}KB)`);
            return data;
        }
    } catch (error) {
        console.log('⚠️ Error leyendo cache /tmp:', error.message);
    }
    return null;
}

/**
 * Guarda el cache en /tmp
 */
async function setTmpCache(data) {
    try {
        const content = JSON.stringify(data);
        await fs.writeFile(CACHE_CONFIG.TMP_CACHE_FILE, content, 'utf-8');
        const stats = await fs.stat(CACHE_CONFIG.TMP_CACHE_FILE);
        console.log(`✅ Cache /tmp guardado (tamaño: ${Math.round(stats.size/1024)}KB)`);
    } catch (error) {
        console.error('❌ Error guardando cache /tmp:', error);
    }
}

/**
 * Helper para convertir stream a buffer
 */
async function streamToBuffer(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

/**
 * Obtiene el cache de S3
 */
async function getS3Cache() {
    try {
        const command = new GetObjectCommand({
            Bucket: CACHE_CONFIG.CACHE_BUCKET,
            Key: CACHE_CONFIG.CACHE_KEY
        });

        const response = await s3Client.send(command);
        const compressed = await streamToBuffer(response.Body);
        const decompressed = await gunzip(compressed);
        const data = JSON.parse(decompressed.toString('utf-8'));

        const metadata = response.Metadata || {};
        const cacheAge = metadata.timestamp 
            ? Date.now() - parseInt(metadata.timestamp) 
            : Infinity;

        if (cacheAge < CACHE_CONFIG.CACHE_TTL_MS) {
            console.log(`✅ Cache S3 encontrado (edad: ${Math.round(cacheAge/1000)}s, tamaño: ${Math.round(compressed.length/1024)}KB)`);
            return data;
        } else {
            console.log(`⏰ Cache S3 expirado (edad: ${Math.round(cacheAge/1000)}s)`);
        }
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            console.log('📦 Cache S3 no existe aún');
        } else {
            console.error('❌ Error leyendo cache S3:', error.message);
        }
    }
    return null;
}

/**
 * Guarda el cache en S3
 */
async function setS3Cache(data, version = 'v1') {
    try {
        const content = JSON.stringify(data);
        const compressed = await gzip(content);

        const command = new PutObjectCommand({
            Bucket: CACHE_CONFIG.CACHE_BUCKET,
            Key: CACHE_CONFIG.CACHE_KEY,
            Body: compressed,
            ContentType: 'application/json',
            ContentEncoding: 'gzip',
            Metadata: {
                timestamp: Date.now().toString(),
                version: version,
                uncompressedSize: content.length.toString(),
                compressedSize: compressed.length.toString()
            }
        });

        await s3Client.send(command);
        const ratio = ((1 - compressed.length / content.length) * 100).toFixed(1);
        console.log(`✅ Cache S3 guardado (${Math.round(content.length/1024)}KB → ${Math.round(compressed.length/1024)}KB, ${ratio}% compresión)`);
    } catch (error) {
        console.error('❌ Error guardando cache S3:', error);
    }
}

/**
 * Obtiene el cache usando todas las estrategias
 */
async function getCache() {
    console.log('🔍 Buscando cache...');
    
    // Estrategia 1: Variables globales
    let cache = getGlobalCache();
    if (cache) return cache;

    // Estrategia 2: /tmp
    cache = await getTmpCache();
    if (cache) {
        setGlobalCache(cache);
        return cache;
    }

    // Estrategia 3: S3
    cache = await getS3Cache();
    if (cache) {
        setGlobalCache(cache);
        await setTmpCache(cache);
        return cache;
    }

    console.log('❌ No se encontró cache válido');
    return null;
}

/**
 * Guarda el cache en todas las estrategias
 */
async function setCache(data, version = 'v1') {
    console.log('💾 Guardando cache en todas las capas...');
    
    setGlobalCache(data, version);
    await Promise.all([
        setTmpCache(data),
        setS3Cache(data, version)
    ]);
    
    console.log('✅ Cache guardado en todas las capas');
}

/**
 * Invalida todo el cache
 */
async function invalidateCache() {
    console.log('🗑️ Invalidando cache...');
    
    GLOBAL_CACHE = { data: null, timestamp: null, version: null };
    
    try {
        await fs.unlink(CACHE_CONFIG.TMP_CACHE_FILE);
    } catch (error) {
        // Archivo no existe, ignorar
    }
    
    console.log('✅ Cache invalidado');
}

export {
    getCache,
    setCache,
    invalidateCache,
    isCacheActive,
    CACHE_CONFIG
};

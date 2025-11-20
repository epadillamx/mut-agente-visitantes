import { promises as fs } from 'fs';
import logger from './logger.js';

// Configuración de cache
const CACHE_CONFIG = {
    TMP_CACHE_FILE: '/tmp/vectorial-cache.json',
    CACHE_TTL_MS: 365 * 24 * 60 * 60 * 1000 // 365 días (1 año)
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
            logger.cache(`Cache global encontrado (edad: ${Math.round(age/1000)}s)`);
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
    logger.cache('Cache global actualizado');
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
            logger.cache(`Cache /tmp encontrado (edad: ${Math.round(age/1000)}s, tamaño: ${Math.round(stats.size/1024)}KB)`);
            return data;
        } else {
            logger.debug(`Cache /tmp expirado (edad: ${Math.round(age/1000)}s)`);
        }
    } catch (error) {
        logger.warn('Error leyendo cache /tmp:', error.message);
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
        logger.cache(`Cache /tmp guardado (tamaño: ${Math.round(stats.size/1024)}KB)`);
    } catch (error) {
        logger.error('Error guardando cache /tmp:', error);
    }
}

/**
 * Obtiene el cache usando estrategia dual
 */
async function getCache() {
    logger.debug('Buscando cache...');
    
    // Estrategia 1: Variables globales (más rápido)
    let cache = getGlobalCache();
    if (cache) return cache;

    // Estrategia 2: /tmp (persiste entre invocaciones warm)
    cache = await getTmpCache();
    if (cache) {
        setGlobalCache(cache);
        return cache;
    }

    logger.debug('No se encontró cache válido');
    return null;
}

/**
 * Guarda el cache en ambas capas
 */
async function setCache(data, version = 'v1') {
    logger.debug('Guardando cache...');
    
    setGlobalCache(data, version);
    await setTmpCache(data);
    
    logger.cache('Cache guardado');
}

/**
 * Invalida todo el cache
 */
async function invalidateCache() {
    logger.debug('Invalidando cache...');
    
    GLOBAL_CACHE = { data: null, timestamp: null, version: null };
    
    try {
        await fs.unlink(CACHE_CONFIG.TMP_CACHE_FILE);
        logger.cache('Cache /tmp eliminado');
    } catch (error) {
        // Archivo no existe, ignorar
    }
    
    logger.cache('Cache invalidado');
}

export {
    getCache,
    setCache,
    invalidateCache,
    isCacheActive,
    CACHE_CONFIG
};

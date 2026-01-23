/**
 * Servicio de Eventos MUT - Filtrado Semántico con LLM
 * 
 * Este servicio:
 * 1. Llama a la API de MUT para obtener todos los eventos
 * 2. Cachea los resultados por 15 minutos
 * 3. Transforma los datos al formato necesario para el LLM
 * 
 * El LLM se encarga de:
 * - Filtrar semánticamente qué eventos aplican a la pregunta del usuario
 * - Generar la respuesta final para WhatsApp
 */

import logger from './logger.js';

// ============================================================
// CONFIGURACIÓN
// ============================================================
const EVENTOS_API_URL = 'https://mut.cl/wp-json/wp/v2/event';
const EVENTOS_PER_PAGE = 100;
const EVENTOS_TTL_MS = 15 * 60 * 1000; // 15 minutos

// Cache en memoria
let eventosCache = {
    data: null,
    timestamp: 0
};

// ============================================================
// UTILIDADES
// ============================================================

/**
 * Obtiene la fecha actual en Chile (America/Santiago)
 * @returns {Object} { fechaYYYYMMDD, fechaISO, fechaLegible, diaSemana, horaActual }
 */
function getAhoraChile() {
    const ahora = new Date();
    const opcionesFecha = { timeZone: 'America/Santiago' };
    
    // Obtener componentes en zona horaria de Chile
    const año = ahora.toLocaleString('en-CA', { ...opcionesFecha, year: 'numeric' });
    const mes = ahora.toLocaleString('en-CA', { ...opcionesFecha, month: '2-digit' });
    const dia = ahora.toLocaleString('en-CA', { ...opcionesFecha, day: '2-digit' });
    
    const fechaYYYYMMDD = `${año}${mes}${dia}`;
    const fechaISO = `${año}-${mes}-${dia}`;
    
    // Hora actual en formato HH:MM
    const horaActual = ahora.toLocaleString('es-CL', {
        ...opcionesFecha,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    // Fecha legible en español
    const fechaLegible = ahora.toLocaleDateString('es-CL', {
        ...opcionesFecha,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Día de la semana
    const diaSemana = ahora.toLocaleDateString('es-CL', {
        ...opcionesFecha,
        weekday: 'long'
    });
    
    return { fechaYYYYMMDD, fechaISO, fechaLegible, diaSemana, horaActual };
}

/**
 * Limpia texto HTML y caracteres especiales
 */
function limpiarTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#8230;/g, '...')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrae la fecha de creación del post de WordPress (para inferir año)
 */
function extraerFechaCreacion(dateString) {
    if (!dateString) return null;
    // Formato: "2026-01-20T10:30:27"
    const fecha = new Date(dateString);
    if (isNaN(fecha.getTime())) return null;
    return fecha.toISOString().split('T')[0]; // "2026-01-20"
}

// ============================================================
// API Y CACHE
// ============================================================

/**
 * Llama a la API de MUT y obtiene todos los eventos (paginando si es necesario)
 */
async function fetchEventosFromAPI() {
    const startTime = Date.now();
    let todosLosEventos = [];
    let page = 1;
    let hasMore = true;
    
    logger.info(`📡 Fetching eventos desde API MUT...`);
    
    while (hasMore) {
        const url = `${EVENTOS_API_URL}?per_page=${EVENTOS_PER_PAGE}&page=${page}`;
        logger.debug(`   Página ${page}: ${url}`);
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 400) {
                    // No hay más páginas
                    hasMore = false;
                    break;
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            const eventos = await response.json();
            
            if (!eventos || eventos.length === 0) {
                hasMore = false;
            } else {
                todosLosEventos = todosLosEventos.concat(eventos);
                logger.debug(`   Página ${page}: ${eventos.length} eventos (total: ${todosLosEventos.length})`);
                page++;
                
                // Límite de seguridad
                if (page > 10) {
                    logger.warn('⚠️ Límite de páginas alcanzado (10)');
                    hasMore = false;
                }
            }
        } catch (error) {
            logger.error(`❌ Error fetching page ${page}:`, error.message);
            hasMore = false;
        }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.success(`✅ API: ${todosLosEventos.length} eventos en ${elapsed}s`);
    
    return todosLosEventos;
}

/**
 * Transforma un evento de la API al formato para el LLM
 */
function transformarEvento(eventoAPI, index) {
    const acf = eventoAPI.acf || {};
    const infoDestacada = acf.informacion_destacada || {};
    const infoTienda = acf.informacion_tienda || [];
    
    // Extraer datos de cards si existen
    let cardData = {};
    if (infoTienda.length > 0 && infoTienda[0].cards && infoTienda[0].cards.length > 0) {
        cardData = infoTienda[0].cards[0].data || {};
    }
    
    // Hora: priorizar cards.data.hour, luego informacion_destacada.hours
    let hora = cardData.hour || '';
    if (!hora && infoDestacada.hours && infoDestacada.hours.length > 0) {
        hora = infoDestacada.hours.map(h => h.hour).join(', ');
    }
    
    // Event date en formato YYYYMMDD o null
    const eventDate = infoDestacada.event_date || null;
    
    // Fecha de creación del post (para inferir año si no hay event_date)
    const fechaCreacion = extraerFechaCreacion(eventoAPI.date);
    
    return {
        id: `evt_${String(index + 1).padStart(3, '0')}`,
        titulo: limpiarTexto(eventoAPI.title?.rendered || 'Sin título'),
        event_date: eventDate,
        creado: fechaCreacion,
        fecha: limpiarTexto(cardData.date || ''),
        hora: limpiarTexto(hora),
        lugar: limpiarTexto(cardData.place || ''),
        descripcion: limpiarTexto(cardData.description || ''),
        organizador: limpiarTexto(infoDestacada.organizer || ''),
        link: eventoAPI.link || ''
    };
}

/**
 * Obtiene todos los eventos (con cache)
 */
async function getEventos() {
    const ahora = Date.now();
    
    // Verificar si el cache es válido
    if (eventosCache.data && (ahora - eventosCache.timestamp) < EVENTOS_TTL_MS) {
        const edad = Math.round((ahora - eventosCache.timestamp) / 1000);
        const ttlRestante = Math.round((EVENTOS_TTL_MS - (ahora - eventosCache.timestamp)) / 1000);
        logger.cache(`📦 CACHE HIT: ${eventosCache.data.length} eventos, edad: ${edad}s, TTL restante: ${ttlRestante}s`);
        return eventosCache.data;
    }
    
    logger.info('📦 CACHE MISS - Fetching desde API...');
    
    // Fetch desde API
    const eventosAPI = await fetchEventosFromAPI();
    
    // Transformar al formato para LLM
    const eventosTransformados = eventosAPI.map((e, i) => transformarEvento(e, i));
    
    // Log de algunos eventos para debug
    logger.debug('📋 Primeros 3 eventos transformados:');
    eventosTransformados.slice(0, 3).forEach(e => {
        logger.debug(`   [${e.id}] ${e.titulo} | event_date:${e.event_date || 'null'} | fecha:"${e.fecha}"`);
    });
    
    // Actualizar cache
    eventosCache = {
        data: eventosTransformados,
        timestamp: ahora
    };
    
    logger.success(`📦 Cache actualizado: ${eventosTransformados.length} eventos (TTL: ${EVENTOS_TTL_MS/1000}s)`);
    
    return eventosTransformados;
}

// ============================================================
// FORMATEO PARA LLM
// ============================================================

/**
 * Formatea los eventos para enviar al LLM
 * Incluye todos los campos necesarios para filtrado semántico
 */
function formatEventosForLLM(eventos) {
    return eventos.map(e => {
        // Formato compacto pero con toda la info necesaria
        let linea = `[${e.id}] ${e.titulo}`;
        
        if (e.event_date) {
            linea += ` | event_date:${e.event_date}`;
        }
        if (e.creado) {
            linea += ` | creado:${e.creado}`;
        }
        if (e.fecha) {
            linea += ` | fecha:"${e.fecha}"`;
        }
        if (e.hora) {
            linea += ` | hora:"${e.hora}"`;
        }
        if (e.lugar) {
            linea += ` | lugar:"${e.lugar}"`;
        }
        if (e.descripcion) {
            // Truncar descripción a 100 caracteres
            const desc = e.descripcion.length > 100 
                ? e.descripcion.substring(0, 100) + '...' 
                : e.descripcion;
            linea += ` | desc:"${desc}"`;
        }
        if (e.link) {
            linea += ` | link:${e.link}`;
        }
        
        return linea;
    }).join('\n');
}

/**
 * Filtra eventos que ya pasaron (basándose en event_date)
 * Los eventos recurrentes (sin event_date específico) se mantienen
 * @param {Array} eventos - Lista de eventos
 * @param {string} fechaActualYYYYMMDD - Fecha actual en formato YYYYMMDD
 * @returns {Array} Eventos vigentes
 */
function filtrarEventosVigentes(eventos, fechaActualYYYYMMDD) {
    const fechaActualNum = parseInt(fechaActualYYYYMMDD, 10);
    
    return eventos.filter(evento => {
        // Si no tiene event_date, es un evento recurrente o sin fecha específica
        // Lo mantenemos y dejamos que el LLM decida
        if (!evento.event_date) {
            return true;
        }
        
        // Convertir event_date a número para comparar
        const eventDateNum = parseInt(evento.event_date, 10);
        
        // Si event_date es inválido, mantener el evento
        if (isNaN(eventDateNum)) {
            return true;
        }
        
        // IMPORTANTE: event_date puede ser la fecha de INICIO de un rango
        // Ejemplo: event_date=20260115, fecha="15 de enero al 28 de febrero"
        // En este caso, necesitamos verificar si el campo "fecha" indica un rango
        
        // Si event_date ya pasó pero el campo fecha tiene "al" o "hasta" o "-", 
        // podría ser un rango que aún está vigente
        if (eventDateNum < fechaActualNum) {
            const fechaTexto = (evento.fecha || '').toLowerCase();
            
            // Detectar si es un rango de fechas
            const esRango = fechaTexto.includes(' al ') || 
                           fechaTexto.includes(' hasta ') ||
                           fechaTexto.includes(' - ') ||
                           fechaTexto.includes('vigente');
            
            if (esRango) {
                // Es un rango, intentar extraer fecha final
                // Patrones: "15 de enero al 28 de febrero", "hasta 28 de febrero"
                const matchFebrero = fechaTexto.match(/(\d{1,2})\s*de\s*febrero/);
                const matchMarzo = fechaTexto.match(/(\d{1,2})\s*de\s*marzo/);
                const matchEnero = fechaTexto.match(/al\s*(\d{1,2})\s*de\s*enero/);
                
                // Si termina en febrero 2026 y estamos en enero 2026, está vigente
                if (matchFebrero) {
                    const diaFin = parseInt(matchFebrero[1], 10);
                    const fechaFinNum = 20260200 + diaFin; // febrero 2026
                    if (fechaActualNum <= fechaFinNum) {
                        logger.debug(`   ✅ Evento "${evento.titulo}" vigente por rango (hasta febrero)`);
                        return true;
                    }
                }
                if (matchMarzo) {
                    const diaFin = parseInt(matchMarzo[1], 10);
                    const fechaFinNum = 20260300 + diaFin; // marzo 2026
                    if (fechaActualNum <= fechaFinNum) {
                        logger.debug(`   ✅ Evento "${evento.titulo}" vigente por rango (hasta marzo)`);
                        return true;
                    }
                }
            }
            
            // event_date pasó y no es un rango vigente
            logger.debug(`   ❌ Evento "${evento.titulo}" EXCLUIDO (event_date:${evento.event_date} < ${fechaActualYYYYMMDD})`);
            return false;
        }
        
        // event_date es hoy o futuro
        return true;
    });
}

/**
 * Obtiene el contexto de eventos para el LLM
 * @returns {Object} { fechaActual, eventos, eventosFormateados }
 */
async function getEventosContexto() {
    const ahora = getAhoraChile();
    const todosLosEventos = await getEventos();
    
    // Filtrar eventos pasados ANTES de enviar al LLM
    const eventosVigentes = filtrarEventosVigentes(todosLosEventos, ahora.fechaYYYYMMDD);
    
    logger.info(`📅 Eventos: ${todosLosEventos.length} total → ${eventosVigentes.length} vigentes (filtrados ${todosLosEventos.length - eventosVigentes.length} pasados)`);
    
    const eventosFormateados = formatEventosForLLM(eventosVigentes);
    
    return {
        fechaActual: ahora,
        eventosCount: eventosVigentes.length,
        eventosFormateados
    };
}

// ============================================================
// EXPORTS
// ============================================================

export {
    getEventos,
    getEventosContexto,
    getAhoraChile,
    formatEventosForLLM
};

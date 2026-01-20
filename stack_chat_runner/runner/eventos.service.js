import logger from './logger.js';

/**
 * Cache en memoria para eventos
 * TTL de 15 minutos - los eventos no cambian frecuentemente
 */
let EVENTOS_CACHE = {
    data: null,
    timestamp: null
};

const EVENTOS_TTL_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Limpia texto HTML y caracteres especiales
 */
function limpiarTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/<[^>]*>/g, '') // Remover tags HTML
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8230;/g, '...')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\xa0/g, ' ')
        .trim();
}

/**
 * Obtiene fecha y hora actual en Chile
 * @returns {{ fechaYYYYMMDD: string, horaHHMM: string, timestamp: Date }}
 */
function getAhoraChile() {
    const now = new Date();
    const chileTimeStr = now.toLocaleString('en-US', { timeZone: 'America/Santiago' });
    const chileTime = new Date(chileTimeStr);
    
    const year = chileTime.getFullYear();
    const month = String(chileTime.getMonth() + 1).padStart(2, '0');
    const day = String(chileTime.getDate()).padStart(2, '0');
    const hours = String(chileTime.getHours()).padStart(2, '0');
    const minutes = String(chileTime.getMinutes()).padStart(2, '0');
    
    return {
        fechaYYYYMMDD: `${year}${month}${day}`,
        horaHHMM: `${hours}:${minutes}`,
        horaDecimal: chileTime.getHours() + chileTime.getMinutes() / 60,
        timestamp: chileTime
    };
}

/**
 * Parsea fecha de formato YYYYMMDD a objeto Date
 */
function parsearEventDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length !== 8) {
        return null;
    }
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return null;
    }
    
    return new Date(year, month, day);
}

/**
 * Formatea fecha de YYYYMMDD a texto legible
 */
function formatearFechaLegible(dateStr) {
    const date = parsearEventDate(dateStr);
    if (!date) return '';
    
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Extrae la hora de finalización de un string de horario
 * Ejemplos: "10:00 a 20:00" → 20.0, "21:00" → 21.0, "7:45 hrs" → 7.75
 * @returns {number|null} Hora en formato decimal (ej: 20.5 = 20:30)
 */
function extraerHoraFin(horaStr) {
    if (!horaStr) return null;
    
    const limpio = limpiarTexto(horaStr);
    
    // Buscar patrón "X a Y" o "X - Y" para obtener hora final
    const rangoMatch = limpio.match(/(\d{1,2}[:\.]?\d{0,2})\s*(?:a|hasta|-)\s*(\d{1,2})[:\.]?(\d{0,2})/i);
    if (rangoMatch) {
        const horas = parseInt(rangoMatch[2]);
        const minutos = rangoMatch[3] ? parseInt(rangoMatch[3]) : 0;
        return horas + minutos / 60;
    }
    
    // Si no hay rango, buscar la última hora mencionada
    const horasMatch = limpio.match(/(\d{1,2})[:\.](\d{2})/g);
    if (horasMatch && horasMatch.length > 0) {
        const ultimaHora = horasMatch[horasMatch.length - 1];
        const [h, m] = ultimaHora.split(/[:.]/);
        return parseInt(h) + parseInt(m) / 60;
    }
    
    // Buscar hora simple sin minutos
    const simpleMatch = limpio.match(/(\d{1,2})\s*(?:hrs?|horas?)?/i);
    if (simpleMatch) {
        return parseInt(simpleMatch[1]);
    }
    
    return null;
}

/**
 * Intenta extraer UNA fecha de un texto (para eventos sin event_date)
 * @param {string} textoFecha - Texto con la fecha
 * @param {string} fechaHoy - Fecha actual YYYYMMDD
 * @returns {string|null} Fecha en formato YYYYMMDD o null
 */
function extraerFechaDeTexto(textoFecha, fechaHoy) {
    if (!textoFecha) return null;
    
    const mesesMap = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    
    const limpio = limpiarTexto(textoFecha.toLowerCase());
    const añoActual = parseInt(fechaHoy.substring(0, 4));
    
    // Buscar patrón "N de MES" (ej: "22 de Junio", "21 de septiembre")
    const fechaSimpleMatch = limpio.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
    if (fechaSimpleMatch) {
        const dia = fechaSimpleMatch[1].padStart(2, '0');
        const mes = mesesMap[fechaSimpleMatch[2]];
        // Sin año especificado, asumir año actual
        return `${añoActual}${mes}${dia}`;
    }
    
    return null;
}

/**
 * Intenta extraer fecha final de un rango de texto
 * Ejemplos: "15 de enero al 28 de febrero" → fecha del 28 feb
 *           "9 al 24 de diciembre" → fecha del 24 dic
 * @param {string} textoFecha - Texto con la fecha
 * @param {number} añoEventDate - Año del event_date para referencia
 * @param {string} fechaHoy - Fecha actual en formato YYYYMMDD
 * @returns {string|null} Fecha en formato YYYYMMDD o null
 */
function extraerFechaFinDeRango(textoFecha, añoEventDate, fechaHoy) {
    if (!textoFecha) return null;
    
    const mesesMap = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    
    const limpio = limpiarTexto(textoFecha.toLowerCase());
    const añoActual = parseInt(fechaHoy.substring(0, 4));
    
    // Estrategia: Buscar TODAS las fechas "N de MES" y quedarse con la ÚLTIMA (más probable fecha fin)
    const meses = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
    const todasLasFechas = [...limpio.matchAll(new RegExp(`(\\d{1,2})\\s+de\\s+(${meses})`, 'gi'))];
    
    if (todasLasFechas.length > 1) {
        // Si hay múltiples fechas, la última es probablemente la fecha fin
        const ultimaFecha = todasLasFechas[todasLasFechas.length - 1];
        const dia = ultimaFecha[1].padStart(2, '0');
        const mes = mesesMap[ultimaFecha[2].toLowerCase()];
        const año = añoEventDate || añoActual;
        return `${año}${mes}${dia}`;
    }
    
    // Patrón: "X al/y Y de MES" (ej: "9 al 24 de diciembre", "5, 6 y 7 de diciembre")
    // Captura el último número antes de "de MES"
    const rangoMatch = limpio.match(/(?:al|y|-|,)\s*(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
    if (rangoMatch) {
        const dia = rangoMatch[1].padStart(2, '0');
        const mes = mesesMap[rangoMatch[2]];
        const año = añoEventDate || añoActual;
        return `${año}${mes}${dia}`;
    }
    
    return null;
}

/**
 * Determina si un evento ya pasó completamente
 * REGLA: Si event_date ya pasó, el evento pasó (event_date es la fuente de verdad del año)
 * Para eventos SIN event_date, solo mantenemos los recurrentes (sin fecha específica)
 * @returns {{ pasado: boolean, motivo: string }} 
 */
function eventoYaPaso(eventDate, fechaTexto, horaTexto, ahora) {
    const { fechaYYYYMMDD, horaDecimal } = ahora;
    
    // Si tiene event_date, usarlo como fuente principal
    if (eventDate) {
        // Si event_date es futuro, el evento NO ha pasado
        if (eventDate > fechaYYYYMMDD) {
            return { pasado: false, motivo: 'event_date futuro' };
        }
        
        // Si event_date es pasado, verificar si hay rango con fecha final
        if (eventDate < fechaYYYYMMDD) {
            // Intentar obtener fecha final del rango usando el año del event_date
            const añoEventDate = parseInt(eventDate.substring(0, 4));
            const fechaFinRango = extraerFechaFinDeRango(fechaTexto, añoEventDate, fechaYYYYMMDD);
            
            // Si hay fecha fin de rango y es futura, el evento sigue vigente
            if (fechaFinRango && fechaFinRango >= fechaYYYYMMDD) {
                // Pero si la fecha fin es HOY, verificar hora
                if (fechaFinRango === fechaYYYYMMDD) {
                    const horaFin = extraerHoraFin(horaTexto);
                    if (horaFin !== null && horaDecimal > horaFin) {
                        return { pasado: true, motivo: 'terminó hoy (hora pasada)' };
                    }
                }
                return { pasado: false, motivo: 'rango vigente' };
            }
            
            // event_date pasado y sin rango futuro válido = evento pasado
            return { pasado: true, motivo: 'event_date pasado' };
        }
        
        // event_date es HOY - verificar hora
        const horaFin = extraerHoraFin(horaTexto);
        if (horaFin !== null && horaDecimal > horaFin) {
            return { pasado: true, motivo: 'terminó hoy (hora pasada)' };
        }
        return { pasado: false, motivo: 'event_date es hoy' };
    }
    
    // ========================================================
    // SIN event_date - Solo mantener eventos RECURRENTES
    // ========================================================
    const textoLower = (fechaTexto || '').toLowerCase();
    
    // Detectar si es evento recurrente (sin fecha específica de mes)
    const tieneFechaEspecifica = textoLower.match(/\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
    
    const esRecurrente = (
        textoLower.includes('todos los') ||
        textoLower.includes('cada') ||
        textoLower.includes('lunes a viernes') ||
        textoLower.includes('lunes a domingo')
    ) && !tieneFechaEspecifica;
    
    if (esRecurrente) {
        return { pasado: false, motivo: 'evento recurrente' };
    }
    
    // Si tiene fecha específica pero NO tiene event_date, descartarlo
    // porque no podemos determinar el año con certeza
    if (tieneFechaEspecifica) {
        return { pasado: true, motivo: 'sin event_date + fecha específica (año indeterminado)' };
    }
    
    // Sin fecha identificable - incluir por precaución
    return { pasado: false, motivo: 'sin fecha específica' };
}

/**
 * Obtiene eventos de la API de mut.cl con paginación automática
 * Filtra eventos pasados (considerando rangos de fecha y hora) y ordena por fecha
 * @returns {Promise<Array>} Array de eventos procesados y ordenados
 */
async function fetchEventosFromAPI() {
    const todosEventos = [];
    let page = 1;
    const maxPages = 10; // Límite de seguridad
    const ahora = getAhoraChile();
    let eventosDescartados = 0;
    
    logger.info(`Iniciando carga de eventos desde API mut.cl... (Chile: ${ahora.fechaYYYYMMDD} ${ahora.horaHHMM})`);
    
    while (page <= maxPages) {
        const url = `https://mut.cl/wp-json/wp/v2/event?per_page=100&page=${page}`;
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                logger.warn(`API respondió ${response.status} en página ${page}`);
                break;
            }
            
            const data = await response.json();
            
            // Si no hay datos, terminamos
            if (!data || data.length === 0) {
                logger.debug(`No hay más eventos en página ${page}`);
                break;
            }
            
            logger.debug(`Procesando página ${page} con ${data.length} eventos`);
            
            // Procesar cada evento
            for (const item of data) {
                const acf = item.acf || {};
                const infoDestacada = acf.informacion_destacada || {};
                const infoTienda = acf.informacion_tienda || [];
                
                // Obtener event_date del campo ACF (formato YYYYMMDD)
                const eventDate = infoDestacada.event_date || null;
                
                // Extraer horas de info_destacada
                const hoursList = infoDestacada.hours || [];
                const horas = hoursList
                    .map(h => limpiarTexto(h.hour || ''))
                    .filter(h => h)
                    .join(', ');
                
                // Extraer información del primer card si existe
                let fechaTexto = '';
                let horaTexto = '';
                let lugar = '';
                let descripcion = '';
                
                if (infoTienda[0]?.cards?.[0]?.data) {
                    const cardData = infoTienda[0].cards[0].data;
                    fechaTexto = cardData.date || '';
                    horaTexto = limpiarTexto(cardData.hour || '');
                    lugar = cardData.place || '';
                    descripcion = cardData.description || '';
                }
                
                // Si no hay hora del card, usar la de info_destacada
                if (!horaTexto && horas) {
                    horaTexto = horas;
                }
                
                // FILTRAR: Verificar si el evento ya pasó (considerando rangos y hora)
                const resultado = eventoYaPaso(eventDate, fechaTexto, horaTexto, ahora);
                if (resultado.pasado) {
                    logger.debug(`Descartado: ${item.title?.rendered?.substring(0, 40)} - ${resultado.motivo}`);
                    eventosDescartados++;
                    continue;
                }
                
                // Usar fecha legible basada en event_date si no hay fechaTexto
                const fechaLegible = eventDate ? formatearFechaLegible(eventDate) : '';
                if (!fechaTexto && fechaLegible) {
                    fechaTexto = fechaLegible;
                }
                
                // Limpiar y agregar evento
                const evento = {
                    titulo: limpiarTexto(item.title?.rendered || ''),
                    eventDate: eventDate, // Para ordenar
                    fecha: fechaTexto,
                    fechaExacta: fechaLegible,
                    hora: horaTexto,
                    lugar: lugar,
                    descripcion: limpiarTexto(descripcion).substring(0, 200),
                    organizador: infoDestacada.organizer || '',
                    link: item.link || ''
                };
                
                // Solo agregar si tiene título
                if (evento.titulo) {
                    todosEventos.push(evento);
                }
            }
            
            page++;
            
        } catch (error) {
            logger.error(`Error en página ${page}:`, error.message);
            break;
        }
    }
    
    // Ordenar eventos: primero los que tienen fecha (más cercanos primero), luego sin fecha
    todosEventos.sort((a, b) => {
        if (a.eventDate && b.eventDate) {
            return a.eventDate.localeCompare(b.eventDate);
        }
        if (a.eventDate && !b.eventDate) return -1;
        if (!a.eventDate && b.eventDate) return 1;
        return 0;
    });
    
    logger.success(`Eventos cargados: ${todosEventos.length} vigentes, ${eventosDescartados} descartados (pasados)`);
    
    // Log detallado de eventos candidatos
    if (todosEventos.length > 0) {
        logger.info('📅 EVENTOS CANDIDATOS:');
        todosEventos.forEach((e, i) => {
            logger.info(`   ${i+1}. ${e.titulo}`);
            logger.info(`      ├─ event_date: ${e.eventDate || 'N/A'}`);
            logger.info(`      ├─ fecha texto: ${e.fecha || 'N/A'}`);
            logger.info(`      └─ hora: ${e.hora || 'N/A'}`);
        });
    }
    
    return todosEventos;
}

/**
 * Obtiene eventos (de cache o API)
 * @returns {Promise<Array>} Array de eventos
 */
async function getEventos() {
    const now = Date.now();
    
    // Verificar si el cache es válido
    if (EVENTOS_CACHE.data && EVENTOS_CACHE.timestamp) {
        const edad = now - EVENTOS_CACHE.timestamp;
        
        if (edad < EVENTOS_TTL_MS) {
            const edadSegundos = Math.round(edad / 1000);
            logger.cache(`Eventos desde cache (${EVENTOS_CACHE.data.length} eventos, edad: ${edadSegundos}s)`);
            return EVENTOS_CACHE.data;
        } else {
            logger.debug('Cache de eventos expirado, refrescando...');
        }
    }
    
    // Cargar desde API
    const startTime = Date.now();
    const eventos = await fetchEventosFromAPI();
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Guardar en cache
    EVENTOS_CACHE = {
        data: eventos,
        timestamp: now
    };
    
    logger.success(`Eventos cacheados: ${eventos.length} en ${loadTime}s`);
    return eventos;
}

/**
 * Formatea los eventos para incluir en el contexto del LLM
 * @param {Array} eventos - Array de eventos
 * @returns {string} Eventos formateados como texto
 */
function formatEventosForLLM(eventos) {
    if (!eventos || eventos.length === 0) {
        return 'No hay eventos disponibles actualmente.';
    }
    
    // Formato compacto para reducir tokens
    return eventos.map((e, i) => {
        const partes = [`${i + 1}. ${e.titulo}`];
        if (e.fecha) partes.push(`F:${e.fecha}`);
        if (e.hora) partes.push(`H:${e.hora}`);
        if (e.lugar) partes.push(`L:${e.lugar}`);
        if (e.link) partes.push(`URL:${e.link}`);
        return partes.join(' | ');
    }).join('\n');
}

/**
 * Verifica el estado del cache de eventos
 * @returns {Object} Estado del cache
 */
function getEventosCacheStatus() {
    if (EVENTOS_CACHE.data && EVENTOS_CACHE.timestamp) {
        const edad = Date.now() - EVENTOS_CACHE.timestamp;
        return {
            active: edad < EVENTOS_TTL_MS,
            eventos: EVENTOS_CACHE.data?.length || 0,
            age: Math.round(edad / 1000),
            ttl: Math.round((EVENTOS_TTL_MS - edad) / 1000)
        };
    }
    return { active: false, eventos: 0 };
}

/**
 * Invalida el cache de eventos (fuerza recarga)
 */
function invalidateEventosCache() {
    EVENTOS_CACHE = { data: null, timestamp: null };
    logger.info('Cache de eventos invalidado');
}

export { 
    getEventos, 
    formatEventosForLLM, 
    getEventosCacheStatus, 
    invalidateEventosCache 
};

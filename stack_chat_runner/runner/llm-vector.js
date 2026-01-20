import { invokeClaude } from './bedrock/claude.service.js';
import { PROMPT_TEMPLATES } from './plantillas/prompts.js';
import { searchVectorStore, formatSearchResults, isCacheActive, initAllVectorStores } from './vectorial.service.js';
import { getEventos, formatEventosForLLM } from './eventos.service.js';
import logger from './logger.js';

// Detectar saludos simples sin llamar al LLM
function isSimpleGreeting(text) {
    const greetingPatterns = /^(hola|hi|hello|hey|buenos días|buenas tardes|buenas noches|good morning|good afternoon|good evening|oi|olá|bom dia|boa tarde|boa noite)[\s!.?]*$/i;
    return greetingPatterns.test(text.trim());
}

// Mensaje de bienvenida
function getWelcomeMessage() {
    return `MENU_BIENVENIDA`;
}

async function invokeQuestions(inputTextuser) {
    logger.info('🔍 Llamando Claude para CLASIFICACIÓN...');
    const datos = (await invokeClaude(inputTextuser, PROMPT_TEMPLATES.extractInfo.system)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);
    return resultlocalerroneo;
}

async function vectorial(inputTextuser) {
    // Buscar en base vectorial de restaurantes
    const vectorResults = await searchVectorStore(inputTextuser, 3);
    const vectorContext = formatSearchResults(vectorResults);

    // Combinar el contexto vectorial con el system prompt
    const enrichedSystemPrompt = `${PROMPT_TEMPLATES.extractRestaurante.system}

## CONTEXTO DE RESTAURANTES y TIENDAS (Base Vectorial)
${vectorContext}

Usa esta información de restaurantes cuando sea relevante para la pregunta del usuario.`;

    logger.info('🏪 Llamando Claude para RESTAURANTES/TIENDAS...');
    const datos = (await invokeClaude(inputTextuser, enrichedSystemPrompt)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);

    return resultlocalerroneo;
}

/**
 * Consulta eventos desde la API de mut.cl
 * @param {string} inputTextuser - Pregunta del usuario sobre eventos
 * @returns {Object} Respuesta con eventos encontrados
 */
async function consultarEventos(inputTextuser) {
    logger.info('Consultando eventos...');
    
    // Obtener eventos (de cache o API)
    const eventos = await getEventos();
    const eventosContext = formatEventosForLLM(eventos);
    
    // Obtener fecha actual para contexto
    const fechaActual = new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // User prompt con fecha y eventos (dinámico)
    const userPrompt = `Hoy: ${fechaActual}

EVENTOS:\n${eventosContext}\n\nPREGUNTA: ${inputTextuser}`;

    logger.info('📅 Llamando Claude para EVENTOS...');
    const rawResponse = await invokeClaude(userPrompt, PROMPT_TEMPLATES.extractEventos.system);
    
    // Limpiar respuesta de Claude
    let datos = rawResponse
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
    
    // Intentar extraer JSON si hay texto extra
    const jsonMatch = datos.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        datos = jsonMatch[0];
    }
    
    logger.debug(`📝 Claude raw (eventos): ${datos.substring(0, 200)}...`);
    
    let resultado;
    try {
        resultado = JSON.parse(datos);
    } catch (parseError) {
        // Intentar arreglar comillas no escapadas dentro de strings
        // Patrón: buscar comillas dentro de valores de "respuesta"
        try {
            // Reemplazar comillas dobles dentro de texto por comillas simples
            const fixedDatos = datos.replace(
                /("respuesta"\s*:\s*")([^"]*?)(")/g,
                (match, prefix, content, suffix) => {
                    // No tocar, buscar de otra forma
                    return match;
                }
            );
            
            // Estrategia: extraer manualmente los campos
            const respuestaMatch = datos.match(/"respuesta"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"isEncontrada)/);
            const isEncontradaMatch = datos.match(/"isEncontrada"\s*:\s*(true|false)/);
            const eventosMatch = datos.match(/"eventosEncontrados"\s*:\s*(\d+)/);
            
            if (respuestaMatch && isEncontradaMatch) {
                resultado = {
                    respuesta: respuestaMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                    isEncontrada: isEncontradaMatch[1] === 'true',
                    eventosEncontrados: eventosMatch ? parseInt(eventosMatch[1]) : 1
                };
                logger.info('✅ JSON recuperado con regex');
            } else {
                throw new Error('No se pudo extraer respuesta');
            }
        } catch (regexError) {
            logger.warn(`⚠️ JSON inválido de Claude, usando fallback`);
            logger.debug(`Raw completo: ${datos}`);
            // Fallback: no se encontraron eventos
            resultado = {
                respuesta: '📅 Puedes ver los eventos actuales en *mut.cl/eventos*',
                isEncontrada: false,
                eventosEncontrados: 0
            };
        }
    }
    
    logger.info(`Eventos encontrados: ${resultado.eventosEncontrados || 0}`);
    
    return resultado;
}

async function inputLlm(inputTextuser) {
    let startTime = Date.now();
    
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`📩 PREGUNTA RECIBIDA: "${inputTextuser}"`);
    logger.info('═══════════════════════════════════════════════════════════');

    // Validar si el cache está activo antes de procesar
    let cacheStatus = isCacheActive();
    if (cacheStatus.active) {
        logger.cache(`Cache activo (${cacheStatus.source}): ${cacheStatus.documents} documentos, edad: ${cacheStatus.age}s`);
    } else {
        logger.warn('Cache no activo - precargando...');
        // Precargar el cache de forma proactiva
        await initAllVectorStores();
        cacheStatus = isCacheActive();
        if (cacheStatus.active) {
            logger.success(`Cache precargado: ${cacheStatus.documents} documentos`);
        }
    }

    let respuestaFinal = "";
    
    // OPTIMIZACIÓN: Detectar saludos simples SIN llamar al LLM
    if (isSimpleGreeting(inputTextuser)) {
        respuestaFinal = getWelcomeMessage();
        logger.info('Respuesta de saludo automático enviada');
        logger.debug('Contenido:', respuestaFinal);
        let wordCount = respuestaFinal.split(/\s+/).length;
        logger.time(`Tiempo de respuesta: ${((Date.now() - startTime) / 1000)}s, Palabras: ${wordCount}`);
        return respuestaFinal;
    }

    // OPTIMIZACIÓN: Una sola llamada inicial para clasificar
    const messagePreguntas = await invokeQuestions(inputTextuser);
    
    logger.info('───────────────────────────────────────────────────────────');
    logger.info(`🤖 CLASIFICACIÓN IA:`);
    logger.info(`   ├─ Tipo: ${messagePreguntas.typeQuestions || 'N/A'}`);
    logger.info(`   ├─ Encontrada: ${messagePreguntas.isEncontrada}`);
    if (messagePreguntas.respuesta) {
        logger.info(`   └─ Respuesta directa: ${messagePreguntas.respuesta.substring(0, 80)}...`);
    }
    logger.info('───────────────────────────────────────────────────────────');
    
    if (messagePreguntas.isEncontrada) {
        respuestaFinal = messagePreguntas.respuesta;
    } else if (messagePreguntas.typeQuestions === 'eventos') {
        // NUEVO: Flujo de eventos - consulta API en tiempo real
        try {
            const messageEventos = await consultarEventos(inputTextuser);
            if (messageEventos.isEncontrada) {
                respuestaFinal = messageEventos.respuesta;
            } else {
                respuestaFinal = '📅 No encontré eventos que coincidan con tu búsqueda. Puedes ver todos los eventos en *mut.cl/eventos* o preguntar de otra forma 😊';
            }
        } catch (error) {
            logger.error('Error consultando eventos:', error);
            respuestaFinal = '📅 Puedes ver los eventos actuales en *mut.cl/eventos* o acercarte a *Servicio al Cliente* en *Piso -3*';
        }
    } else if (messagePreguntas.typeQuestions !== 'otros') {
        // Solo llamar a búsqueda vectorial si es restaurante/tienda
        const messageStore = await vectorial(inputTextuser);
        if (messageStore.isEncontrada) {
            respuestaFinal = messageStore.respuesta;
        } else {
            respuestaFinal = 'Para esa consulta específica, puedes visitar nuestro *SAC* 📍 en *Piso -3* al fondo, junto a *Pastelería Jo* y *Farmacias Ahumada*';
        }
    } else {
        respuestaFinal = 'El equipo de *Servicio al Cliente* en *Piso -3* te puede ayudar mejor con eso. Están al fondo, al lado de *Pastelería Jo* 😊';
    }

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`📤 RESPUESTA FINAL:`);
    logger.info(`   ${respuestaFinal}`);
    logger.info('═══════════════════════════════════════════════════════════');
    let wordCount = respuestaFinal.split(/\s+/).length;
    let endTime = Date.now();
    logger.time(`⏱️  Tiempo: ${((endTime - startTime) / 1000)}s | Palabras: ${wordCount}`);
    
    return respuestaFinal;
}
async function main() {
    console.log('\n\n\n\n🧪)');
    let inputTextuser = `Hola`;
    await inputLlm(inputTextuser);

    console.log('\n\n\n\n🧪');
    inputTextuser = `¿Por que calle entro al estacionamiento de MUT?`;
    await inputLlm(inputTextuser);

     console.log('\n\n\n\n🧪');
    inputTextuser = `Como llego al estacionamiento de autos MUT caminando?`;
    await inputLlm(inputTextuser);

    process.exit(0);
}

//main()
export { inputLlm };
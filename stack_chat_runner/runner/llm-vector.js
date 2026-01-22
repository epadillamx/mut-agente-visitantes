import { invokeClaude } from './bedrock/claude.service.js';
import { PROMPT_TEMPLATES } from './plantillas/prompts.js';
import { searchVectorStore, formatSearchResults, isCacheActive, initAllVectorStores } from './vectorial.service.js';
import { getEventosContexto } from './eventos.service.js';
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
    const datos = (await invokeClaude(inputTextuser, PROMPT_TEMPLATES.extractInfo.system)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);
    return resultlocalerroneo;
}

/**
 * Consulta eventos usando filtrado semántico con LLM
 * El LLM recibe TODOS los eventos y filtra semánticamente según la pregunta
 */
async function consultarEventos(inputTextuser) {
    const startTime = Date.now();
    
    logger.info('📅 ====== INICIO FLUJO EVENTOS ======');
    
    // Obtener contexto de eventos (con cache)
    const fetchStart = Date.now();
    const contexto = await getEventosContexto();
    const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(2);
    
    logger.info(`📡 API/Cache: ${contexto.eventosCount} eventos en ${fetchTime}s`);
    logger.info(`🕐 Fecha actual Chile: ${contexto.fechaActual.fechaLegible}`);
    logger.info(`🕐 Hora actual Chile: ${contexto.fechaActual.horaActual}`);
    logger.info(`📩 Pregunta usuario: "${inputTextuser}"`);
    
    // Construir el prompt con la fecha actual y todos los eventos
    const userPrompt = `## FECHA Y HORA ACTUAL (Chile)
Hoy es ${contexto.fechaActual.fechaLegible} (${contexto.fechaActual.diaSemana})
Hora actual: ${contexto.fechaActual.horaActual}
Fecha en formato YYYYMMDD: ${contexto.fechaActual.fechaYYYYMMDD}

## PREGUNTA DEL USUARIO
${inputTextuser}

## LISTA DE EVENTOS (${contexto.eventosCount} total)
${contexto.eventosFormateados}`;
    
    // Log del tamaño del prompt
    const promptTokensEstimado = Math.round(userPrompt.length / 4);
    logger.debug(`📝 Prompt size: ~${promptTokensEstimado} tokens estimados`);
    
    // Llamar al LLM para filtrado semántico + redacción
    const llmStart = Date.now();
    logger.info('🤖 Enviando a Claude para filtrado semántico...');
    
    const respuesta = await invokeClaude(userPrompt, PROMPT_TEMPLATES.extractEventos.system);
    
    const llmTime = ((Date.now() - llmStart) / 1000).toFixed(2);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info(`⚡ Claude respondió en ${llmTime}s`);
    logger.info(`📤 Respuesta (${respuesta.trim().length} chars):`);
    logger.debug(respuesta.trim());
    logger.info(`✅ FLUJO EVENTOS COMPLETADO en ${totalTime}s (fetch:${fetchTime}s + llm:${llmTime}s)`);
    logger.info('📅 ====== FIN FLUJO EVENTOS ======');
    
    return respuesta.trim();
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

    const datos = (await invokeClaude(inputTextuser, enrichedSystemPrompt)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);

    return resultlocalerroneo;
}

async function inputLlm(inputTextuser) {
    let startTime = Date.now();
    
    logger.info('');
    logger.info('🚀 ============================================');
    logger.info(`📩 INPUT: "${inputTextuser}"`);
    logger.info('🚀 ============================================');

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
        logger.info('👋 Saludo detectado - respuesta automática');
        let wordCount = respuestaFinal.split(/\s+/).length;
        logger.time(`⏱️ Tiempo total: ${((Date.now() - startTime) / 1000).toFixed(2)}s, Palabras: ${wordCount}`);
        return respuestaFinal;
    }

    // OPTIMIZACIÓN: Una sola llamada inicial para clasificar
    const classifyStart = Date.now();
    logger.info('🔍 Clasificando pregunta...');
    const messagePreguntas = await invokeQuestions(inputTextuser);
    const classifyTime = ((Date.now() - classifyStart) / 1000).toFixed(2);
    
    logger.info(`🤖 Clasificación (${classifyTime}s): tipo="${messagePreguntas.typeQuestions}", encontrada=${messagePreguntas.isEncontrada}`);
    
    // Manejar según el tipo de pregunta
    if (messagePreguntas.typeQuestions === 'eventos') {
        // Flujo de eventos: filtrado semántico con LLM
        respuestaFinal = await consultarEventos(inputTextuser);
    } else if (messagePreguntas.isEncontrada) {
        logger.info('✅ Respuesta encontrada en clasificación');
        respuestaFinal = messagePreguntas.respuesta;
    } else if (messagePreguntas.typeQuestions !== 'otros') {
        // Solo llamar a búsqueda vectorial si es restaurante/tienda
        logger.info(`🔎 Buscando en base vectorial (tipo: ${messagePreguntas.typeQuestions})...`);
        const messageStore = await vectorial(inputTextuser);
        if (messageStore.isEncontrada) {
            respuestaFinal = messageStore.respuesta;
        } else {
            respuestaFinal = 'Para esa consulta específica, puedes visitar nuestro *SAC* 📍 en *Piso -3* al fondo, junto a *Pastelería Jo* y *Farmacias Ahumada*';
        }
    } else {
        logger.info('❓ Tipo "otros" - derivando a SAC');
        respuestaFinal = 'El equipo de *Servicio al Cliente* en *Piso -3* te puede ayudar mejor con eso. Están al fondo, al lado de *Pastelería Jo* 😊';
    }

    let wordCount = respuestaFinal.split(/\s+/).length;
    let totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('');
    logger.info('📤 ============================================');
    logger.info(`📤 OUTPUT (${wordCount} palabras):`);
    logger.info(respuestaFinal);
    logger.info('📤 ============================================');
    logger.time(`⏱️ TIEMPO TOTAL: ${totalTime}s`);
    logger.info('');
    
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
import { invokeClaude } from './bedrock/claude.service.js';
import { PROMPT_TEMPLATES } from './plantillas/prompts.js';
import { searchVectorStore, formatSearchResults, isCacheActive, initAllVectorStores } from './vectorial.service.js';
import { getEventosContexto } from './eventos.service.js';
import { ConversationService } from './conversationService.js';
import logger from './logger.js';

// Ventana de memoria conversacional: cuántos turnos previos pasarle al LLM
const MEMORY_WINDOW = 5;
// Cuántos turnos pedir a DynamoDB (más grande que la ventana para tener margen
// después de filtrar MENU_BIENVENIDA y turnos del bot de incidencias)
const MEMORY_FETCH_LIMIT = 12;

// Preguntas sobre datos físicos cerrados (baños, SAC, estacionamiento) NO deben
// usar el contexto conversacional para evitar que el LLM "adapte" ubicaciones al
// piso del que se venía hablando. Cuando detectamos estas keywords, se omite
// el bloque de CONVERSACIÓN PREVIA al pasarle el input al LLM.
const CLOSED_DATA_PATTERNS = /\b(baño|baños|bathroom|toilet|wc|servicios sanitarios)\b/i;

function shouldBypassMemory(text) {
    return CLOSED_DATA_PATTERNS.test(text);
}

/**
 * Lee el historial reciente del usuario desde DynamoDB y lo formatea como
 * bloque de contexto para inyectar al LLM. Falla blanda: si algo sale mal,
 * devuelve string vacío y el bot sigue funcionando sin memoria.
 *
 * Filtros aplicados:
 *  - chat_type === 'visitantes'  (la tabla la comparte con el bot de incidencias)
 *  - agent_response !== 'MENU_BIENVENIDA' (no aporta como contexto)
 */
async function loadConversationContext(userId) {
    if (!userId) return '';
    try {
        const cs = new ConversationService();
        const history = await cs.getConversationHistory(userId, MEMORY_FETCH_LIMIT);
        const useful = (history || [])
            .filter(m => m && m.chat_type === 'visitantes')
            .filter(m => m.agent_response && m.agent_response !== 'MENU_BIENVENIDA')
            .filter(m => m.user_message && m.user_message.trim())
            .slice(-MEMORY_WINDOW);

        if (useful.length === 0) return '';

        const turns = useful.map(m =>
            `Usuario: ${m.user_message}\nBot: ${m.agent_response}`
        ).join('\n---\n');

        return `\n## CONVERSACIÓN PREVIA RECIENTE\n${turns}\n## FIN CONVERSACIÓN PREVIA\n`;
    } catch (err) {
        logger.warn(`No se pudo cargar historial para ${userId}: ${err.message}`);
        return '';
    }
}

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

async function inputLlm(inputTextuser, userId = null) {
    let startTime = Date.now();

    logger.info('');
    logger.info('🚀 ============================================');
    logger.info(`📩 INPUT: "${inputTextuser}" (userId=${userId || 'n/a'})`);
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

    // OPTIMIZACIÓN: Detectar saludos simples SIN llamar al LLM (ni leer historial)
    if (isSimpleGreeting(inputTextuser)) {
        respuestaFinal = getWelcomeMessage();
        logger.info('👋 Saludo detectado - respuesta automática');
        let wordCount = respuestaFinal.split(/\s+/).length;
        logger.time(`⏱️ Tiempo total: ${((Date.now() - startTime) / 1000).toFixed(2)}s, Palabras: ${wordCount}`);
        return respuestaFinal;
    }

    // Cargar historial conversacional y construir input enriquecido
    // (en paralelo con la clasificación no se puede porque enrichedInput la alimenta)
    const memStart = Date.now();
    const conversationContext = await loadConversationContext(userId);
    const memTime = ((Date.now() - memStart) / 1000).toFixed(2);
    const turnos = conversationContext ? conversationContext.split('---').length : 0;
    logger.info(`🧠 Contexto cargado (${memTime}s): ${turnos} turnos previos`);

    // Bypass: si la pregunta es sobre datos físicos cerrados (baños, etc.) no
    // pasamos el contexto previo para evitar que el LLM "adapte" la respuesta
    // al piso del que se venía hablando (caso real: contexto "Rock My Love P-3"
    // hace que el LLM agregue "Piso -3" a la lista de baños, que es incorrecto).
    const bypassMemory = shouldBypassMemory(inputTextuser);
    if (bypassMemory && conversationContext) {
        logger.info('🚫 Bypass de memoria: pregunta sobre datos cerrados (baños/servicios)');
    }

    const enrichedInput = (conversationContext && !bypassMemory)
        ? `${conversationContext}\n## MENSAJE ACTUAL DEL USUARIO\n${inputTextuser}`
        : inputTextuser;

    // OPTIMIZACIÓN: Una sola llamada inicial para clasificar
    const classifyStart = Date.now();
    logger.info('🔍 Clasificando pregunta...');
    const messagePreguntas = await invokeQuestions(enrichedInput);
    const classifyTime = ((Date.now() - classifyStart) / 1000).toFixed(2);

    logger.info(`🤖 Clasificación (${classifyTime}s): tipo="${messagePreguntas.typeQuestions}", encontrada=${messagePreguntas.isEncontrada}`);

    // Manejar según el tipo de pregunta
    if (messagePreguntas.typeQuestions === 'eventos') {
        // Flujo de eventos: filtrado semántico con LLM (mantiene input original; los
        // eventos no se ciclan como tiendas, no hace falta inyectar memoria aquí)
        respuestaFinal = await consultarEventos(inputTextuser);
    } else if (messagePreguntas.isEncontrada) {
        logger.info('✅ Respuesta encontrada en clasificación');
        respuestaFinal = messagePreguntas.respuesta;
    } else if (messagePreguntas.typeQuestions !== 'otros') {
        // Solo llamar a búsqueda vectorial si es restaurante/tienda
        logger.info(`🔎 Buscando en base vectorial (tipo: ${messagePreguntas.typeQuestions})...`);
        const messageStore = await vectorial(enrichedInput);
        if (messageStore.respuesta && messageStore.respuesta.trim()) {
            // Confiamos en la respuesta del LLM (esté isEncontrada o no): el prompt
            // extractRestaurante ya genera un texto personalizado cuando no encuentra
            respuestaFinal = messageStore.respuesta;
        } else {
            respuestaFinal = 'Para esa consulta específica, puedes visitar nuestro *SAC* 📍 en *Piso -3* al fondo, junto a *Pastelería Jo* y *Farmacias Ahumada*';
        }
    } else {
        // Tipo "otros": confiar en la respuesta del LLM si trae una personalizada
        // (cuando el usuario menciona un nombre concreto que no existe, extractInfo
        // ya genera una respuesta personalizada con el nombre). Fallback solo si viene vacía.
        if (messagePreguntas.respuesta && messagePreguntas.respuesta.trim()) {
            logger.info('❓ Tipo "otros" - usando respuesta personalizada del LLM');
            respuestaFinal = messagePreguntas.respuesta;
        } else {
            logger.info('❓ Tipo "otros" sin respuesta - fallback SAC');
            respuestaFinal = 'El equipo de *Servicio al Cliente* en *Piso -3* te puede ayudar mejor con eso. Están al fondo, al lado de *Pastelería Jo* 😊';
        }
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
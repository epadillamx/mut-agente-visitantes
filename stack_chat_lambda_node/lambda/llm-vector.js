import { invokeClaude } from './bedrock/claude.service.js';
import { PROMPT_TEMPLATES } from './plantillas/prompts.js';
import { searchVectorStore, formatSearchResults, isCacheActive, initAllVectorStores } from './vectorial.service.js';

// Detectar saludos simples sin llamar al LLM
function isSimpleGreeting(text) {
    const greetingPatterns = /^(hola|hi|hello|hey|buenos días|buenas tardes|buenas noches|good morning|good afternoon|good evening|oi|olá|bom dia|boa tarde|boa noite)[\s!.?]*$/i;
    return greetingPatterns.test(text.trim());
}

// Mensaje de bienvenida
function getWelcomeMessage() {
    return `¡Bienvenid@ a MUT! Soy tu asistente virtual durante tu visita a MUT.
A continuación, selecciona el tipo de ayuda que necesitas:

1️⃣ Búsqueda de tiendas  
2️⃣ Ubicación de baños
3️⃣ Búsqueda de sectores para sentarse a comer
4️⃣ Jardín de MUT
5️⃣ Cómo llegar al metro desde MUT
6️⃣ Salidas de MUT
7️⃣ Ubicación de oficinas MUT
8️⃣ Estacionamientos
9️⃣ Bicihub MUT
🔟 Emergencias
1️⃣1️⃣ Otras preguntas`;
}

async function invokeQuestions(inputTextuser) {
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

    const datos = (await invokeClaude(inputTextuser, enrichedSystemPrompt)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);

    return resultlocalerroneo;
}

async function inputLlm(inputTextuser) {
    let startTime = Date.now();

    // Validar si el cache está activo antes de procesar
    let cacheStatus = isCacheActive();
    if (cacheStatus.active) {
        console.log(`📦 Cache activo (${cacheStatus.source}): ${cacheStatus.documents} documentos, edad: ${cacheStatus.age}s`);
    } else {
        console.log('⚠️ Cache no activo - precargando...');
        // Precargar el cache de forma proactiva
        await initAllVectorStores();
        cacheStatus = isCacheActive();
        if (cacheStatus.active) {
            console.log(`✅ Cache precargado: ${cacheStatus.documents} documentos`);
        }
    }

    let respuestaFinal = "";
    
    // OPTIMIZACIÓN: Detectar saludos simples SIN llamar al LLM
    if (isSimpleGreeting(inputTextuser)) {
        respuestaFinal = getWelcomeMessage();
        console.log('\n=== RESPUESTA FINAL ===');
        console.log(respuestaFinal);
        console.log('\n=== MÉTRICAS ===');
        let wordCount = respuestaFinal.split(/\s+/).length;
        console.log("Número de palabras en la respuesta:", wordCount);
        let endTime = Date.now();
        console.log("Tiempo de respuesta (s):", (endTime - startTime) / 1000);
        return respuestaFinal;
    }

    // OPTIMIZACIÓN: Una sola llamada inicial para clasificar
    const messagePreguntas = await invokeQuestions(inputTextuser);
    
    if (messagePreguntas.isEncontrada) {
        respuestaFinal = messagePreguntas.respuesta;
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

    console.log('\n=== RESPUESTA FINAL ===');
    console.log(respuestaFinal);
    console.log('\n=== MÉTRICAS ===');
    let wordCount = respuestaFinal.split(/\s+/).length;
    console.log("Número de palabras en la respuesta:", wordCount);
    let endTime = Date.now();
    console.log("Tiempo de respuesta (s):", (endTime - startTime) / 1000);
    
    return respuestaFinal;
}
async function main() {
    console.log('\n\n🧪 TEST 3: Tercera consulta (validar cache persiste)');
    let inputTextuser = `Hola`;
    await inputLlm(inputTextuser);

    console.log('\n🧪 TEST 1: Primera consulta (sin cache)');
    inputTextuser = `Dónde está The Greek?`;
    await inputLlm(inputTextuser);

    console.log('\n\n🧪 TEST 2: Segunda consulta (con cache activo)');
    inputTextuser = `Quiero comer un rico helado`;
    await inputLlm(inputTextuser);

    console.log('\n\n🧪 TEST 3: Tercera consulta (validar cache persiste)');
    inputTextuser = `cual es la salida mas cercana`;
    await inputLlm(inputTextuser);

    console.log('\n\n🧪 TEST 3: Tercera consulta (validar cache persiste)');
    inputTextuser = `Quiero comprar un vuelo de avion para mexico`;
    await inputLlm(inputTextuser);

    process.exit(0);
}

export { inputLlm };
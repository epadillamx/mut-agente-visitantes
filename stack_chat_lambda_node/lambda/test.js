const { invokeClaude } = require('./bedrock/claude.service.js');
const { PROMPT_TEMPLATES } = require('./plantillas/prompts.js');
const { searchVectorStore, formatSearchResults, isCacheActive, initAllVectorStores } = require('./vectorial.service.js');


async function invokeSaludar(inputTextuser) {
    const datos = (await invokeClaude(inputTextuser, PROMPT_TEMPLATES.extrasaludo.system)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);
    return resultlocalerroneo;

}
async function invokeQuestions(inputTextuser) {

    const datos = (await invokeClaude(inputTextuser, PROMPT_TEMPLATES.extractInfo.system)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);

    return resultlocalerroneo;

}

async function vectorial(inputTextuser) {
    // Buscar en base vectorial de restaurantes
    //console.log('Buscando en base vectorial...');
    const vectorResults = await searchVectorStore(inputTextuser, 3);
    const vectorContext = formatSearchResults(vectorResults);

    //console.log('Resultados vectoriales:', vectorContext);

    // Combinar el contexto vectorial con el system prompt
    const enrichedSystemPrompt = `${PROMPT_TEMPLATES.extractRestaurante.system}

## CONTEXTO DE RESTAURANTES y TIENDAS (Base Vectorial)
${vectorContext}

Usa esta información de restaurantes cuando sea relevante para la pregunta del usuario.`;

    const datos = (await invokeClaude(inputTextuser, enrichedSystemPrompt)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);

    return resultlocalerroneo.respuesta;
}
async function input(inputTextuser) {
    let startTime = Date.now();
    //console.log('\n=== INPUT DEL USUARIO ===');
    //console.log(inputTextuser);

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

    let message = await invokeSaludar(inputTextuser);
    let respuestaFinal = "";
    //console.log("xxxxx")
    //console.log(JSON.stringify(message, null, 2));
    //console.log("xxxxx")
    if (message.isOnlySaludo) {
        respuestaFinal = message.respuesta;
    } else {
        const messagePreguntas = await invokeQuestions(inputTextuser);
        if (messagePreguntas.isEncontrada) {
            respuestaFinal = messagePreguntas.respuesta;
        }
        else if (!messagePreguntas.isEncontrada && messagePreguntas.typeQuestions !== 'otros') {
            const messageStore = await vectorial(inputTextuser);
            if (messageStore.isEncontrada) {
                respuestaFinal = messageStore.respuesta;
            } else {
                respuestaFinal = 'Para esa consulta específica, puedes visitar nuestro *SAC* 📍 en *Piso -3* al fondo, junto a *Pastelería Jo* y *Farmacias Ahumada*';
            }

        } else {
            respuestaFinal = 'El equipo de *Servicio al Cliente* en *Piso -3* te puede ayudar mejor con eso. Están al fondo, al lado de *Pastelería Jo* 😊';

        }

    }
    console.log('\n=== RESPUESTA FINAL ===');
    console.log(respuestaFinal);
    console.log('\n=== MÉTRICAS ===');
    let wordCount = respuestaFinal.split(/\s+/).length;
    console.log("Número de palabras en la respuesta:", wordCount);
    let endTime = Date.now();
    console.log("Tiempo de respuesta (s):", (endTime - startTime) / 1000);


}
async function main() {
    console.log('\n\n🧪 TEST 3: Tercera consulta (validar cache persiste)');
    let inputTextuser = `Hola`;
    await input(inputTextuser);

    console.log('\n🧪 TEST 1: Primera consulta (sin cache)');
    inputTextuser = `Dónde está The Greek?`;
    await input(inputTextuser);

    console.log('\n\n🧪 TEST 2: Segunda consulta (con cache activo)');
    inputTextuser = `Quiero comer un rico helado`;
    await input(inputTextuser);

    console.log('\n\n🧪 TEST 3: Tercera consulta (validar cache persiste)');
    inputTextuser = `cual es la salida mas cercana`;
    await input(inputTextuser);

    console.log('\n\n🧪 TEST 3: Tercera consulta (validar cache persiste)');
    inputTextuser = `Quiero comprar un vuelo de avion para mexico`;
    await input(inputTextuser);

    process.exit(0);
}

main();
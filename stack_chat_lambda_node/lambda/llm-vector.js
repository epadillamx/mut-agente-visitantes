import { invokeClaude } from './bedrock/claude.service.js';
import { PROMPT_TEMPLATES } from './plantillas/prompts.js';
import logger from './logger.js';




async function invokeQuestions(inputTextuser) {
    const datos = (await invokeClaude(inputTextuser, PROMPT_TEMPLATES.extractInfo.system)).replace("```json", "").replace("```", "").trim();
    const resultlocalerroneo = JSON.parse(datos);
    return resultlocalerroneo;
}

async function inputLlm(inputTextuser) {
    let startTime = Date.now();
    let respuestaFinal = "";

    // Clasificar y responder según el tipo de pregunta
    const messagePreguntas = await invokeQuestions(inputTextuser);

    if (messagePreguntas.isEncontrada) {
        respuestaFinal = messagePreguntas.respuesta;
        
    } else {
        // Para preguntas no encontradas, redirigir al SAC
        respuestaFinal = 'Para esa consulta específica, puedes visitar nuestro *SAC* 📍 en *Piso -3* al fondo, junto a *Pastelería Jo* y *Farmacias Ahumada*';
    }

    logger.info('Respuesta final generada');
    logger.debug('Contenido:', respuestaFinal);
    let wordCount = respuestaFinal.split(/\s+/).length;
    let endTime = Date.now();
    logger.time(`Tiempo de respuesta: ${((endTime - startTime) / 1000)}s, Palabras: ${wordCount}`);

    return respuestaFinal;
}

export { inputLlm };
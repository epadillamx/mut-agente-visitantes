const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Modelo Claude 3 Sonnet
const MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

/**
 * Invoca Claude con un mensaje de usuario y sistema
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} systemMessage - Mensaje del sistema (prompt)
 * @returns {Promise<string>} Respuesta de Claude
 */
async function invokeClaude(userMessage, systemMessage) {
    try {
        const payload = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 1024,
            system: systemMessage,
            messages: [
                {
                    role: 'user',
                    content: userMessage
                }
            ]
        };

        const command = new InvokeModelCommand({
            modelId: MODEL_ID,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(payload)
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        return responseBody.content[0].text;
    } catch (error) {
        console.error('[BEDROCK] Error invoking Claude:', error);
        throw error;
    }
}

// Prompts para clasificación de incidencias
const CLASSIFICATION_PROMPTS = {
    system: `Eres un clasificador de texto especializado con validación estricta y lógica de fallback.

OBJETIVO: Clasificar texto basándose en coincidencias exactas con opciones predefinidas.

REGLAS DE CLASIFICACION:
1. ANALIZAR UNICAMENTE: nombre_nivel_3 y descripcion_nivel_3 de las opciones disponibles
2. BUSCAR coincidencias por:
   - Palabras clave exactas o parciales
   - Conceptos semanticamente relacionados
   - Sinonimos o terminos equivalentes
3. CRITERIOS de coincidencia valida:
   - Coincidencia directa de palabras (>=70% similitud)
   - Relacion semantica clara y evidente
   - Contexto que indique claramente la categoria

LOGICA DE DECISION:
1. SI existe coincidencia clara -> Retornar la opcion correspondiente
2. SI hay multiples coincidencias -> Seleccionar la mas especifica/relevante
3. SI NO hay coincidencia clara -> OBLIGATORIO retornar la opcion "Otros"

VALIDACION ESTRICTA:
- NO inferir informacion inexistente
- NO forzar coincidencias debiles
- NO dejar respuestas vacias o null
- SIEMPRE retornar un objeto valido`,

    user: `Clasifica el siguiente texto: "{message}"

OPCIONES DISPONIBLES:
{availableOptions}

PROCESO DE ANALISIS:
1. Extrae palabras clave del mensaje
2. Compara con nombre_nivel_3 y descripcion_nivel_3 de cada opcion
3. Evalua similitud semantica y contextual
4. Aplica criterios de coincidencia

CRITERIOS DE SELECCION:
[SI] SELECCIONAR opcion especifica SI:
   - Hay coincidencia directa de terminos (>=70%)
   - El contexto indica claramente la categoria
   - Existe relacion semantica evidente

[NO] SELECCIONAR "Otros" SI:
   - No hay coincidencias claras
   - Multiples opciones son igualmente validas
   - El mensaje es ambiguo o generico
   - La similitud es menor al 70%

FORMATO DE RESPUESTA OBLIGATORIO:
{
    "nombre_nivel_3": "[nombre_exacto_de_la_opcion_o_Otros]",
    "nombre_nivel_2": "[nombre_nivel_2_correspondiente]",
    "nombre_nivel_1": "[nombre_nivel_1_correspondiente]"
}

IMPORTANTE:
- SIEMPRE retorna un objeto JSON valido
- NUNCA retornes null o respuestas vacias
- Si dudas, usa "Otros"
- Responde SOLO con el JSON, sin explicaciones adicionales`
};

/**
 * Clasifica una incidencia usando Bedrock Claude
 * @param {string} incidencia - Descripción de la incidencia
 * @param {string} categoriasJson - JSON con las categorías disponibles de fracttal_clasificacion
 * @returns {Promise<object>} Clasificación { nombre_nivel_1, nombre_nivel_2, nombre_nivel_3 }
 */
async function clasificarIncidencia(incidencia, categoriasJson) {
    console.log('[BEDROCK] ========== INICIANDO CLASIFICACION ==========');
    console.log('[BEDROCK] Incidencia a clasificar:', incidencia);
    
    const categorias = JSON.parse(categoriasJson);
    console.log('[BEDROCK] Total categorias disponibles:', categorias.length);
    
    try {
        const userMessage = CLASSIFICATION_PROMPTS.user
            .replace('{message}', incidencia)
            .replace('{availableOptions}', categoriasJson);

        console.log('[BEDROCK] Enviando solicitud a Claude...');
        const response = await invokeClaude(userMessage, CLASSIFICATION_PROMPTS.system);
        
        console.log('[BEDROCK] Respuesta cruda de Claude:', response);
        
        // Parsear respuesta JSON
        const clasificacion = JSON.parse(response.trim());
        
        console.log('[BEDROCK] ========== CLASIFICACION RESULTADO ==========');
        console.log('[BEDROCK] Nivel 1 (Principal):', clasificacion.nombre_nivel_1);
        console.log('[BEDROCK] Nivel 2 (Intermedio):', clasificacion.nombre_nivel_2);
        console.log('[BEDROCK] Nivel 3 (Especifico):', clasificacion.nombre_nivel_3);
        console.log('[BEDROCK] ================================================');
        
        return clasificacion;
    } catch (error) {
        console.error('[BEDROCK] ERROR en clasificacion:', error.message);
        console.error('[BEDROCK] Stack:', error.stack);
        
        // Fallback: retornar "Otros" si hay error
        const fallback = {
            nombre_nivel_1: 'Otros',
            nombre_nivel_2: 'Otros',
            nombre_nivel_3: 'Otros'
        };
        console.log('[BEDROCK] Usando clasificacion fallback:', fallback);
        return fallback;
    }
}

module.exports = {
    invokeClaude,
    clasificarIncidencia,
    CLASSIFICATION_PROMPTS
};

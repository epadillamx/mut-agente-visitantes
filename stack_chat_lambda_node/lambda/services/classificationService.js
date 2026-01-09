/**
 * Servicio de clasificación de incidencias usando Bedrock Claude
 * Para clasificar incidencias en categorías de Fracttal
 */
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrockRuntimeClient } from '../bedrock/bedrock.js';
import logger from '../logger.js';

// Modelo Claude 3 Sonnet para clasificación
const MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

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

        const response = await bedrockRuntimeClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        return responseBody.content[0].text;
    } catch (error) {
        logger.error('[CLASSIFICATION] Error invoking Claude:', error);
        throw error;
    }
}

/**
 * Clasifica una incidencia usando Bedrock Claude
 * @param {string} incidencia - Descripción de la incidencia
 * @param {string} categoriasJson - JSON con las categorías disponibles de fracttal_clasificacion
 * @returns {Promise<object>} Clasificación { nombre_nivel_1, nombre_nivel_2, nombre_nivel_3 }
 */
async function clasificarIncidencia(incidencia, categoriasJson) {
    logger.info('[CLASSIFICATION] ========== INICIANDO CLASIFICACION ==========');
    logger.info('[CLASSIFICATION] Incidencia a clasificar:', incidencia);
    
    const categorias = JSON.parse(categoriasJson);
    logger.info(`[CLASSIFICATION] Total categorias disponibles: ${categorias.length}`);
    
    try {
        const userMessage = CLASSIFICATION_PROMPTS.user
            .replace('{message}', incidencia)
            .replace('{availableOptions}', categoriasJson);

        logger.info('[CLASSIFICATION] Enviando solicitud a Claude...');
        const response = await invokeClaude(userMessage, CLASSIFICATION_PROMPTS.system);
        
        logger.info('[CLASSIFICATION] Respuesta cruda de Claude:', response);
        
        // Parsear respuesta JSON
        const clasificacion = JSON.parse(response.trim());
        
        logger.info('[CLASSIFICATION] ========== CLASIFICACION RESULTADO ==========');
        logger.info('[CLASSIFICATION] Nivel 1 (Principal):', clasificacion.nombre_nivel_1);
        logger.info('[CLASSIFICATION] Nivel 2 (Intermedio):', clasificacion.nombre_nivel_2);
        logger.info('[CLASSIFICATION] Nivel 3 (Especifico):', clasificacion.nombre_nivel_3);
        logger.info('[CLASSIFICATION] ================================================');
        
        return clasificacion;
    } catch (error) {
        logger.error('[CLASSIFICATION] ERROR en clasificacion:', error.message);
        
        // Fallback: retornar "Otros" si hay error
        const fallback = {
            nombre_nivel_1: 'Otros',
            nombre_nivel_2: 'Otros',
            nombre_nivel_3: 'Otros'
        };
        logger.info('[CLASSIFICATION] Usando clasificacion fallback:', fallback);
        return fallback;
    }
}

// Prompt para clasificación de urgencia (similar a mut-agent-back)
const URGENCY_PROMPTS = {
    system: `Eres un clasificador de urgencia para incidencias en un centro comercial.
Tu tarea es determinar el nivel de urgencia de una incidencia basándote en su descripción.

NIVELES DE URGENCIA:
- "Urgente": Emergencias, situaciones peligrosas, riesgos para personas, incendios, inundaciones graves, fallas eléctricas peligrosas, accidentes
- "Media": Problemas que afectan operaciones pero están controlados, fallas de equipos no críticos, problemas que necesitan atención pronto pero no inmediata
- "Normal": Solicitudes de servicio regulares, mantenimiento preventivo, consultas, retiro de basura/reciclaje, limpieza rutinaria

CRITERIOS DE DECISIÓN:
1. Si hay riesgo para personas o propiedades -> Urgente
2. Si afecta operaciones del negocio pero está controlado -> Media
3. Si es una solicitud de servicio rutinaria -> Normal

SIEMPRE responde con uno de estos tres valores exactos: "Urgente", "Media" o "Normal"`,

    user: `Clasifica la urgencia de la siguiente incidencia:
"{incidencia}"

Responde ÚNICAMENTE con el JSON:
{
    "urgencia": "Normal|Media|Urgente"
}`
};

/**
 * Clasifica la urgencia de una incidencia usando Bedrock Claude
 * @param {string} incidencia - Descripción de la incidencia
 * @returns {Promise<string>} Nivel de urgencia: "Normal", "Media" o "Urgente"
 */
async function clasificarUrgencia(incidencia) {
    logger.info('[URGENCY] ========== CLASIFICANDO URGENCIA ==========');
    logger.info('[URGENCY] Incidencia:', incidencia);
    
    try {
        const userMessage = URGENCY_PROMPTS.user.replace('{incidencia}', incidencia);
        
        const response = await invokeClaude(userMessage, URGENCY_PROMPTS.system);
        logger.info('[URGENCY] Respuesta de Claude:', response);
        
        // Parsear respuesta JSON
        const resultado = JSON.parse(response.trim());
        const urgencia = resultado.urgencia;
        
        // Validar que sea un valor válido
        const validValues = ['Normal', 'Media', 'Urgente'];
        if (!validValues.includes(urgencia)) {
            logger.warn(`[URGENCY] Valor inválido "${urgencia}", usando "Normal"`);
            return 'Normal';
        }
        
        logger.info('[URGENCY] Urgencia clasificada:', urgencia);
        logger.info('[URGENCY] ================================================');
        
        return urgencia;
    } catch (error) {
        logger.error('[URGENCY] Error clasificando urgencia:', error.message);
        return 'Normal'; // Fallback
    }
}

// Prompt para clasificación de tipo (Zendesk vs Fracttal)
// Tags EXACTOS del portal de locatarios (abrir-ticket-sac.component.ts)
const TYPECLASS_PROMPTS = {
    system: `Eres un asistente especializado en clasificar incidencias y consultas de trabajadores de locales comerciales en un centro comercial.

OBJETIVO: Clasificar cada mensaje en UNA de las siguientes categorías para determinar el sistema de destino.

CATEGORÍAS - TAGS (igual que el portal de locatarios):

=== TIPO: question (Pregunta) ===
• "Informacion_General": Consultas sobre horarios, ubicaciones, procedimientos, normativas, información general, dudas.

=== TIPO: incident (Incidente/Problema) ===
• "Reclamos": Quejas formales sobre servicios deficientes, problemas con atención, inconformidades con la gestión.
• "Denuncia_de_Objetos": Reportes de objetos perdidos, encontrados, abandonados o sospechosos.
• "Robo": Reportes de robos, hurtos, sustracción de objetos o dinero.
• "Accidente": Reportes de accidentes, lesiones, caídas, emergencias médicas.
• "Servicios_Internos": Solicitudes de procesos administrativos, permisos de ingreso de material, facturación, trámites operativos.
• "Sugerencias": Propuestas de mejora, ideas, comentarios constructivos.

FRACTTAL (mantenimiento e infraestructura):
• "incidencia": Problemas técnicos de infraestructura que requieren mantenimiento: filtraciones, fallas eléctricas, aire acondicionado, iluminación, plagas, etc.
• "operacional": Tareas operativas rutinarias: retiro de basura, enrolamiento de personal, suministros, limpieza, contenedores.

CRITERIOS DE DECISIÓN:
1. Si es una CONSULTA o PREGUNTA de información → "Informacion_General" (question)
2. Si es una QUEJA o RECLAMO → "Reclamos" (incident)
3. Si es sobre OBJETOS perdidos/encontrados → "Denuncia_de_Objetos" (incident)
4. Si es un ROBO o hurto → "Robo" (incident)
5. Si es un ACCIDENTE o emergencia médica → "Accidente" (incident)
6. Si es un TRÁMITE administrativo o permiso → "Servicios_Internos" (incident)
7. Si es una SUGERENCIA o propuesta → "Sugerencias" (incident)
8. Si es un PROBLEMA TÉCNICO de infraestructura → "incidencia" (fracttal)
9. Si es una SOLICITUD de servicio operativo rutinario → "operacional" (fracttal)

IMPORTANTE: En caso de duda entre Zendesk y Fracttal, prioriza "incidencia" (Fracttal).`,

    user: `Clasifica el siguiente mensaje de un trabajador de local comercial:

MENSAJE: "{incidencia}"

Responde ÚNICAMENTE con el JSON:
{
    "typeclass": "[Informacion_General|Reclamos|Denuncia_de_Objetos|Robo|Accidente|Servicios_Internos|Sugerencias|incidencia|operacional]",
    "destino": "[zendesk|fracttal]",
    "tipo": "[question|incident]",
    "confianza": "[Alta|Media|Baja]"
}`
};

// Categorías que van a Zendesk (Tags exactos del portal de locatarios)
// question: Informacion_General
// incident: Reclamos, Denuncia_de_Objetos, Robo, Accidente, Servicios_Internos, Sugerencias
const ZENDESK_CATEGORIES = ['Informacion_General', 'Reclamos', 'Denuncia_de_Objetos', 'Robo', 'Accidente', 'Servicios_Internos', 'Sugerencias'];
// Categorías que van a Fracttal
const FRACTTAL_CATEGORIES = ['incidencia', 'operacional'];

// Mapeo de tag a tipo (question/incident)
const TAG_TO_TYPE = {
    'Informacion_General': 'question',
    'Reclamos': 'incident',
    'Denuncia_de_Objetos': 'incident',
    'Robo': 'incident',
    'Accidente': 'incident',
    'Servicios_Internos': 'incident',
    'Sugerencias': 'incident'
};

/**
 * Clasifica el tipo de incidencia para determinar si va a Zendesk o Fracttal
 * @param {string} incidencia - Descripción de la incidencia
 * @returns {Promise<object>} { typeclass, destino, confianza }
 */
async function clasificarTipo(incidencia) {
    logger.info('[TYPECLASS] ========== CLASIFICANDO TIPO ==========');
    logger.info('[TYPECLASS] Incidencia:', incidencia);
    
    try {
        const userMessage = TYPECLASS_PROMPTS.user.replace('{incidencia}', incidencia);
        
        const response = await invokeClaude(userMessage, TYPECLASS_PROMPTS.system);
        logger.info('[TYPECLASS] Respuesta de Claude:', response);
        
        // Parsear respuesta JSON
        const resultado = JSON.parse(response.trim());
        
        // Validar typeclass
        const validTypes = [...ZENDESK_CATEGORIES, ...FRACTTAL_CATEGORIES];
        if (!validTypes.includes(resultado.typeclass)) {
            logger.warn(`[TYPECLASS] Tipo inválido "${resultado.typeclass}", usando "incidencia"`);
            resultado.typeclass = 'incidencia';
            resultado.destino = 'fracttal';
            resultado.tipo = 'incident';
        }
        
        // Asegurar destino correcto basado en typeclass
        resultado.destino = ZENDESK_CATEGORIES.includes(resultado.typeclass) ? 'zendesk' : 'fracttal';
        
        // Asegurar tipo correcto (question/incident) basado en tag
        if (ZENDESK_CATEGORIES.includes(resultado.typeclass)) {
            resultado.tipo = TAG_TO_TYPE[resultado.typeclass] || 'incident';
        } else {
            resultado.tipo = 'incident'; // Fracttal siempre es incident
        }
        
        logger.info('[TYPECLASS] ========== RESULTADO ==========');
        logger.info('[TYPECLASS] Tipo:', resultado.typeclass);
        logger.info('[TYPECLASS] Destino:', resultado.destino);
        logger.info('[TYPECLASS] Confianza:', resultado.confianza);
        logger.info('[TYPECLASS] ================================');
        
        return resultado;
    } catch (error) {
        logger.error('[TYPECLASS] Error clasificando tipo:', error.message);
        // Fallback: enviar a Fracttal como incidencia
        return {
            typeclass: 'incidencia',
            destino: 'fracttal',
            confianza: 'Baja'
        };
    }
}

export {
    invokeClaude,
    clasificarIncidencia,
    clasificarUrgencia,
    clasificarTipo,
    CLASSIFICATION_PROMPTS,
    URGENCY_PROMPTS,
    TYPECLASS_PROMPTS,
    ZENDESK_CATEGORIES,
    FRACTTAL_CATEGORIES,
    TAG_TO_TYPE
};

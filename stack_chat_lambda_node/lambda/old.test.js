const { getAgente } = require('./getAgente');
const { v4: uuidv4 } = require('uuid');
const { invokeClaude } = require('./claude.service.js');
const { PROMPT_TEMPLATES } = require('./plantillas/prompts.js');
//const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

//const s3Client = new S3Client({ region: 'us-east-1' });

/**
 * Lee un archivo CSV desde S3
 * @param {string} bucket - Nombre del bucket
 * @param {string} key - Key del archivo en S3
 * @returns {Promise<string>} - Contenido del archivo CSV
 */
async function readCSVFromS3(bucket, key) {
    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });

        const response = await s3Client.send(command);
        const csvContent = await streamToString(response.Body);
        return csvContent;
    } catch (error) {
        console.error('Error leyendo CSV desde S3:', error);
        throw error;
    }
}

/**
 * Convierte un stream a string
 * @param {Stream} stream - Stream de datos
 * @returns {Promise<string>} - Contenido como string
 */
async function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

async function handleWebhookVerification() {
    //quiero ver cuando tiempo se tarda en responder el agente que sea en segyundos y generar el UUID del mensaje    
    const startTime = Date.now();
    const datos = await getAgente("56933982544", "Disqueria y Música", uuidv4());

    //contar el nuemro de palabras de la respuesta
    const wordCount = datos.split(/\s+/).length;
    console.log("RE::", datos);
    const endTime = Date.now();
    console.log("Número de palabras en la respuesta:", wordCount);
    console.log("Tiempo de respuesta (s):", (endTime - startTime) / 1000);
    process.exit(0);
}
async function invokeClaudeExample() {
    const startTime = Date.now();

    

    const buenvenido = ` ## BIENVENIDA (Solo al saludar)
            "¡Bienvenid@ a MUT! Soy tu asistente virtual durante tu visita a MUT.
            A continuación, selecciona el tipo de ayuda que necesitas:

            1️.- Búsqueda de tiendas  
            2️.- Ubicación de baños
            3️.- Búsqueda de sectores para sentarse a comer
            4️.- Jardín de MUT
            5️.- Cómo llegar al metro desde MUT
            6️.- Salidas de MUT
            7️.- Ubicación de oficinas MUT
            8️.- Estacionamientos
            9️.- Bicihub MUT
            10.- Emergencias
            1️1.- Otras preguntas`
    const user = `Esta la tienda Acrobatics`
    const datos = (await invokeClaude(user, PROMPT_TEMPLATES.extractNombre.system)).replace("```json", "").replace("```", "").trim();
    console.log("========================");
    console.log(datos);

    console.log("========================");
    const resultlocalerroneo = JSON.parse(datos);

    console.log("extractLocal", JSON.stringify(resultlocalerroneo, null, 2));
    const wordCount = resultlocalerroneo.respuesta.split(/\s+/).length;
    console.log("RE::", resultlocalerroneo.respuesta);
    console.log("Número de palabras en la respuesta:", wordCount);
    const endTime = Date.now();
    console.log("Tiempo de respuesta (s):", (endTime - startTime) / 1000);
    process.exit(0);
}

//handleWebhookVerification();
invokeClaudeExample();
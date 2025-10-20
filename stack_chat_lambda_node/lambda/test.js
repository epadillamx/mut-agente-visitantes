const { getAgente } = require('./getAgente');

/**
 * Función de prueba para getAgente
 */
async function testGetAgente() {
    try {
        console.log('🧪 Iniciando prueba de getAgente...\n');
        
        const userId = "569339825687";
        const question = "Dame locales para desayunar";
        const messageId = "test-message-" + Date.now();
        
        console.log(`📞 Usuario: ${userId}`);
        console.log(`💬 Pregunta: ${question}`);
        console.log(`🆔 Message ID: ${messageId}\n`);
        
        const agentResponse = await getAgente(userId, question, messageId);
        
        console.log("\n" + "=".repeat(50));
        console.log("🤖 AGENTE RESPONDE:");
        console.log("=".repeat(50));
        console.log(agentResponse);
        console.log("=".repeat(50));
        
    } catch (error) {
        console.error('\n❌ Error en la prueba:', error);
        process.exit(1);
    }
}

// Ejecutar la prueba
testGetAgente();
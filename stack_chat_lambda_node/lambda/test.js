const { getAgente } = require('./getAgente');

async function handleWebhookVerification() {
    const datos = await getAgente("56933982544", "Que eventos en octubre hay ?", "A02");
    console.log("RE::", datos);
    process.exit(0);
}

handleWebhookVerification();
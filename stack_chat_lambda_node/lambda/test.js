const { getAgente } = require('./getAgente');

async function handleWebhookVerification() {
    const datos = await getAgente("56933982544", "cuando es el evento de Pan Comido", "A0298891983w");
    console.log("RE::", datos);
    process.exit(0);
}

handleWebhookVerification();
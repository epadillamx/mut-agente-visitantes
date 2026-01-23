
const PROMPT_TEMPLATES = {
    extractInfo: {
        system: `Eres el asistente virtual de MUT. Tu ÚNICA función es analizar consultas y responder EXCLUSIVAMENTE en formato JSON válido.
            
            
            `
    },
    extractRestaurante: {
        system: `Eres el asistente virtual de MUT. Tu ÚNICA función es analizar consultas y responder EXCLUSIVAMENTE en formato JSON válido.
            
           

            ## RECORDATORIO FINAL
                Tu respuesta DEBE ser únicamente el objeto JSON. Sin texto adicional. Sin explicaciones. Solo JSON.
            `
    }
};

export { PROMPT_TEMPLATES };
const messageQueue = new Map();
const typingTimers = new Map();
const userResolvers = new Map();
const processedUsers = new Set(); // 🔥 NUEVO: Evitar procesamiento múltiple

async function accumulateMessage(userId, messageText) {

    
    if (userResolvers.has(userId)) {

        
        messageQueue.get(userId).push({
            text: messageText,
            timestamp: Date.now()
        });
        
        // Reiniciar timer
        clearTimeout(typingTimers.get(userId).timer);
        const timer = setTimeout(() => finishUser(userId), 3000);
        
        typingTimers.set(userId, { 
            timer, 
            promise: typingTimers.get(userId).promise 
        });
        
        return null;
    }


    
    messageQueue.set(userId, [{
        text: messageText,
        timestamp: Date.now()
    }]);

    let resolveFunction;
    const promise = new Promise((resolve) => {
        resolveFunction = resolve;
    });
    
    userResolvers.set(userId, resolveFunction);
    
    const timer = setTimeout(() => finishUser(userId), 3000);
    
    typingTimers.set(userId, { timer, promise });
    

    return promise; 
}

// Función para finalizar procesamiento
function finishUser(userId) {

    
    if (processedUsers.has(userId)) {

        return;
    }
    
    const userMessages = messageQueue.get(userId);
    const resolveFunction = userResolvers.get(userId);
    
    if (!userMessages || userMessages.length === 0) {

        cleanup(userId);
        if (resolveFunction) resolveFunction('');
        return '';
    }

    const combinedMessage = userMessages.map(msg => msg.text).join(' ');

    processedUsers.add(userId);
    
    if (resolveFunction) {

        resolveFunction(combinedMessage);
    }
    
    cleanup(userId);
    
    return combinedMessage;
}

// Limpiar datos
function cleanup(userId) {

    
    messageQueue.delete(userId);
    userResolvers.delete(userId);
    
    if (typingTimers.has(userId)) {
        clearTimeout(typingTimers.get(userId).timer);
        typingTimers.delete(userId);
    }
    
    // 🔥 Limpiar marca de procesado después de un tiempo
    setTimeout(() => {
        processedUsers.delete(userId);

    }, 1000); // 1 segundo de "cooldown"
}

// Debug: ver estado
function getQueueStatus() {
    const status = {};
    messageQueue.forEach((messages, userId) => {
        status[userId] = {
            messageCount: messages.length,
            messages: messages.map(m => m.text),
            hasTimer: typingTimers.has(userId),
            hasResolver: userResolvers.has(userId)
        };
    });
    return status;
}

// Forzar procesamiento
function forceProcess(userId) {
    if (typingTimers.has(userId)) {
        clearTimeout(typingTimers.get(userId).timer);
        return finishUser(userId);
    }
    return null;
}

module.exports = { accumulateMessage, getQueueStatus, forceProcess };
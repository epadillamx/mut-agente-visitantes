/**
 * Sistema de logging con niveles configurables
 * En producción muestra WARN y ERROR, en desarrollo muestra todos los niveles
 */

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

class Logger {
    constructor() {
        // Detectar ambiente: solo usar NODE_ENV, no AWS_EXECUTION_ENV
        // Si NODE_ENV no está definido, por defecto usar production
        const nodeEnv = process.env.NODE_ENV || 'production';
        const isProduction = nodeEnv === 'production';
        
        // En producción WARN y ERROR (1), en desarrollo DEBUG (3)
        this.currentLevel = isProduction ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;
        this.isProduction = isProduction;
        
        console.log(`🔧 Logger inicializado - NODE_ENV: ${nodeEnv}, Ambiente: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}, Nivel: ${this.getLevelName()}`);
    }

    getLevelName() {
        const levels = Object.entries(LOG_LEVELS);
        const found = levels.find(([_, value]) => value === this.currentLevel);
        return found ? found[0] : 'UNKNOWN';
    }

    error(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.ERROR) {
            console.error(`❌ [ERROR]`, message, ...args);
        }
    }

    warn(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.WARN) {
            console.warn(`⚠️ [WARN]`, message, ...args);
        }
    }

    info(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.INFO) {
            console.log(`ℹ️ [INFO]`, message, ...args);
        }
    }

    debug(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.DEBUG) {
            console.log(`🔍 [DEBUG]`, message, ...args);
        }
    }

    // Métodos de conveniencia con emojis
    success(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.INFO) {
            console.log(`✅ [SUCCESS]`, message, ...args);
        }
    }

    processing(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.INFO) {
            console.log(`⚙️ [PROCESSING]`, message, ...args);
        }
    }

    time(label, ...args) {
        if (this.currentLevel >= LOG_LEVELS.INFO) {
            console.log(`⏱️ [TIME]`, label, ...args);
        }
    }

    cache(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.DEBUG) {
            console.log(`💾 [CACHE]`, message, ...args);
        }
    }

    webhook(message, ...args) {
        if (this.currentLevel >= LOG_LEVELS.DEBUG) {
            console.log(`📨 [WEBHOOK]`, message, ...args);
        }
    }

    // Método para cambiar el nivel de log manualmente (útil para testing)
    setLevel(levelName) {
        if (LOG_LEVELS[levelName] !== undefined) {
            this.currentLevel = LOG_LEVELS[levelName];
            console.log(`🔧 Nivel de log cambiado a: ${levelName}`);
        }
    }
}

// Exportar instancia singleton
export const logger = new Logger();
export default logger;

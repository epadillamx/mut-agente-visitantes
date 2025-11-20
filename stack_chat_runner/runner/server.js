import express from 'express';
import { handler } from './index.js';
import logger from './logger.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware para parsear JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para logging de requests
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

/**
 * Convierte una request de Express a un evento de API Gateway Lambda
 */
function convertToLambdaEvent(req) {
    return {
        httpMethod: req.method,
        path: req.path,
        queryStringParameters: req.query,
        headers: req.headers,
        body: req.body ? JSON.stringify(req.body) : null,
        requestContext: {
            http: {
                method: req.method,
                path: req.path
            }
        }
    };
}

/**
 * Middleware para convertir requests de Express a eventos Lambda
 */
async function handleRequest(req, res) {
    try {
        const lambdaEvent = convertToLambdaEvent(req);
        const lambdaResponse = await handler(lambdaEvent);

        // Enviar respuesta
        const statusCode = lambdaResponse.statusCode || 200;
        const headers = lambdaResponse.headers || {};

        // Establecer headers
        Object.keys(headers).forEach(key => {
            res.setHeader(key, headers[key]);
        });

        // Manejar diferentes tipos de respuestas
        if (typeof lambdaResponse.body === 'string') {
            // Si es text/plain, enviar como string directo
            if (headers['Content-Type'] === 'text/plain') {
                res.status(statusCode).send(lambdaResponse.body);
            } else {
                // Intentar parsear como JSON, si falla enviarlo como string
                try {
                    const body = JSON.parse(lambdaResponse.body);
                    res.status(statusCode).json(body);
                } catch (e) {
                    // Si no es JSON válido, enviarlo como texto
                    res.status(statusCode).send(lambdaResponse.body);
                }
            }
        } else {
            // Si ya es un objeto, enviarlo como JSON
            res.status(statusCode).json(lambdaResponse.body);
        }
    } catch (error) {
        logger.error('Error en handleRequest:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}

/**
 * Health check endpoint
 */
app.get('/', handleRequest);

/**
 * WhatsApp webhook verification (GET)
 */
app.get('/webhook', handleRequest);

/**
 * WhatsApp webhook messages (POST)
 */
app.post('/webhook', handleRequest);

/**
 * Direct chat endpoint for testing (POST)
 */
app.post('/chat', handleRequest);

/**
 * Get conversation history (GET)
 */
app.get('/history', handleRequest);

/**
 * Get user statistics (GET)
 */
app.get('/stats', handleRequest);

/**
 * Catch-all para rutas no encontradas
 */
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method,
        message: 'Endpoint not found'
    });
});

/**
 * Error handler global
 */
app.use((err, req, res, next) => {
    logger.error('Error no controlado:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

/**
 * Iniciar el servidor
 */
app.listen(PORT, '0.0.0.0', () => {
    logger.success(`🚀 Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Available endpoints:`);
    logger.info(`  GET  /          - Health check`);
    logger.info(`  GET  /webhook   - WhatsApp verification`);
    logger.info(`  POST /webhook   - WhatsApp messages`);
    logger.info(`  POST /chat      - Direct chat testing`);
    logger.info(`  GET  /history   - Conversation history`);
    logger.info(`  GET  /stats     - User statistics`);
});

/**
 * Manejo de señales para shutdown graceful
 */
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    process.exit(0);
});

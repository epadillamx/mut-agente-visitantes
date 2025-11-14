# Mounjaro Chatbot - Demo con Node.js y Express

Chatbot de demostración para información sobre Mounjaro utilizando AWS Bedrock Agent API con Node.js y Express.

## 🚀 Características

- ⚡ **Node.js**: Runtime JavaScript estable y robusto
- 🎯 **Express**: Framework web minimalista y popular
- 🤖 **AWS Bedrock Agent**: Integración con agente de IA para Mounjaro
- 💬 **Interfaz de Chat**: UI moderna y responsive
- 📚 **Citations**: Muestra referencias de la base de conocimiento
- 💾 **Sesiones**: Manejo de conversaciones por usuario

## 📋 Requisitos Previos

1. **Node.js instalado** (versión 16+)
   ```bash
   node --version
   npm --version
   ```

2. **Credenciales de AWS configuradas**
   - AWS CLI configurado o variables de entorno
   - Permisos para invocar Bedrock Agent

3. **Agente de Bedrock desplegado**
   - Agent ID y Agent Alias ID del stack desplegado

## 🛠️ Instalación

1. **Navegar a la carpeta del chatbot:**
   ```bash
   cd chatbot
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   
   Crear archivo `.env` en la carpeta `chatbot/`:
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env` con tus valores:
   ```bash
   AGENT_ID=tu-agent-id-aqui
   AGENT_ALIAS_ID=tu-agent-alias-id-aqui
   AWS_REGION=us-east-1
   PORT=3000
   ```

## 🏃 Ejecución

### Modo desarrollo (con nodemon - auto-reload):
```bash
npm run dev
```

### Modo producción:
```bash
npm start
```

El servidor estará disponible en: **http://localhost:3000**

## 📡 API Endpoints

### POST `/api/chat`
Enviar un mensaje al chatbot

**Request:**
```json
{
  "userId": "user_123",
  "message": "¿Cada cuánto debo ponerme Mounjaro?"
}
```

**Response:**
```json
{
  "userId": "user_123",
  "response": "Mounjaro se aplica 1 vez a la semana...",
  "citations": [
    "s3://bucket/preguntas/faq001.txt"
  ]
}
```

### GET `/api/chat/:userId`
Obtener historial de conversación

**Response:**
```json
{
  "messages": [
    { "role": "user", "content": "¿Cómo debo guardar Mounjaro?" },
    { "role": "assistant", "content": "Las plumas deben mantenerse..." }
  ]
}
```

### DELETE `/api/chat/:userId`
Limpiar sesión de usuario

**Response:**
```json
{
  "message": "Sesión eliminada correctamente"
}
```

### GET `/api/health`
Health check del servicio

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-13T...",
  "agent": {
    "id": "9VEMPEULVZ",
    "alias": "AEEB0GXHSK",
    "region": "us-east-1"
  }
}
```

## 🎨 Interfaz de Usuario

La interfaz incluye:
- 💬 Chat en tiempo real
- 🎯 Indicador de escritura
- 📚 Visualización de referencias/citations
- 🗑️ Botón para limpiar conversación
- 📱 Diseño responsive
- ✨ Animaciones suaves

## 🔧 Estructura del Proyecto

```
chatbot/
├── server.js              # Servidor Express con API
├── package.json           # Dependencias y scripts
├── .env                   # Variables de entorno (crear)
├── .env.example           # Ejemplo de configuración
├── public/
│   └── index.html        # Interfaz de chat
└── README.md             # Esta documentación
```

## 🧪 Pruebas

### Probar el health check:
```bash
curl http://localhost:3000/api/health
```

### Probar envío de mensaje:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"test_user","message":"¿Cada cuánto debo aplicarme Mounjaro?"}'
```

### Probar obtener historial:
```bash
curl http://localhost:3000/api/chat/test_user
```

## ⚙️ Configuración de AWS

### Opción 1: AWS CLI
```bash
aws configure
```

### Opción 2: Variables de entorno
```bash
export AWS_ACCESS_KEY_ID=tu-access-key
export AWS_SECRET_ACCESS_KEY=tu-secret-key
export AWS_REGION=us-east-1
```

### Opción 3: IAM Role (para EC2/ECS/Lambda)
El rol debe tener permisos:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeAgent"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🐛 Troubleshooting

### Error: "Cannot find module 'express'"
```bash
npm install
```

### Error: "EADDRINUSE: address already in use"
El puerto 3000 está ocupado. Cambiar PORT en `.env` o detener el proceso:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### Error: "AccessDeniedException"
- Verificar credenciales de AWS
- Verificar permisos del IAM role/user
- Verificar que el Agent ID y Alias ID sean correctos

### Error: "ResourceNotFoundException"
- Verificar que el Agent ID existe en AWS
- Verificar que el Agent Alias ID está desplegado
- Verificar la región de AWS

### El servidor no inicia
- Verificar que Node.js esté instalado: `node --version`
- Verificar que las dependencias estén instaladas: `npm install`
- Revisar los logs de error en la consola

## 📚 Referencias

- [Node.js Documentation](https://nodejs.org/docs/)
- [Express Documentation](https://expressjs.com/)
- [AWS Bedrock Agent Runtime](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html)

## 🔒 Seguridad

⚠️ **Importante**: Esta es una aplicación de demostración.

Para producción:
- Implementar autenticación de usuarios
- Usar variables de entorno seguras
- Implementar rate limiting
- Usar HTTPS
- Almacenar sesiones en DynamoDB/Redis
- Implementar logging y monitoring

## 📝 Licencia

Este proyecto es una demostración para propósitos educativos.

## 👥 Soporte

Para consultas sobre Mounjaro, contacta: **1-833-807-MJRO**

Para problemas técnicos del chatbot, revisa los logs del servidor.

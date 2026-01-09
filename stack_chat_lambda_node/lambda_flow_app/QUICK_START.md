# Quick Start Guide

## Configuración Rápida (5 minutos)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
```

Edite `.env` con sus credenciales:
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY

Y copie el archivo `private_key.pem` a la raíz del proyecto.

### 3. Crear tabla DynamoDB
```bash
node scripts/create-dynamodb-table.js create
```

### 4. Iniciar servidor
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## Verificación Rápida

### 1. Health Check
```bash
curl http://localhost:3000/webhook/health
```

### 2. Verificar locales cargados
```bash
curl http://localhost:3000/webhook/locales/count
```

### 3. Test de búsqueda (modo desarrollo)
```bash
curl -X POST http://localhost:3000/webhook/flow \
  -H "Content-Type: application/json" \
  -d '{
    "action": "data_exchange",
    "screen": "INCIDENT_FORM",
    "data": {
      "trigger": "search_local",
      "busqueda_local": "bogota"
    }
  }'
```

## Despliegue con Docker

```bash
# Construir y ejecutar
docker-compose up --build

# En background
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

## Estructura de Archivos Creados

```
whatsapp-flow/
├── src/
│   ├── index.js                    ✅ Servidor Express
│   ├── routes/webhook.js           ✅ Rutas API
│   ├── controllers/flowController.js ✅ Lógica del flow
│   ├── services/
│   │   ├── dynamoService.js        ✅ Operaciones DynamoDB
│   │   └── localService.js         ✅ Búsqueda de locales
│   ├── data/locales.json           ✅ 210 locales
│   └── utils/crypto.js             ✅ Cifrado WhatsApp
├── scripts/
│   └── create-dynamodb-table.js    ✅ Script DynamoDB
├── Dockerfile                       ✅ Imagen Docker
├── docker-compose.yml              ✅ Orquestación
├── package.json                    ✅ Dependencias
├── .env.example                    ✅ Template variables
└── README.md                       ✅ Documentación completa
```

## Próximos Pasos

1. Configure su WhatsApp Flow en WhatsApp Business Manager
2. Apunte el webhook a su servidor
3. Configure un dominio con HTTPS para producción
4. Implemente rate limiting y autenticación adicional

## Soporte

Consulte [README.md](README.md) para documentación completa.

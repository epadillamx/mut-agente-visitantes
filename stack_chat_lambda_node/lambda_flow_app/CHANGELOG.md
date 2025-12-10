# Changelog

## [1.1.0] - 2025-12-06

### Changed
- **BREAKING**: Migrado de AWS SDK v2 a AWS SDK v3 (última versión estable)
  - Actualizado `aws-sdk` a `@aws-sdk/client-dynamodb@3.699.0`
  - Actualizado a `@aws-sdk/lib-dynamodb@3.699.0`
  - Refactorizado `dynamoService.js` para usar comandos del SDK v3
  - Refactorizado `create-dynamodb-table.js` para usar comandos del SDK v3

### Benefits del SDK v3
- ✅ **Modular**: Solo importa los servicios que necesitas (menor tamaño de bundle)
- ✅ **Mejor rendimiento**: Código optimizado y más rápido
- ✅ **TypeScript nativo**: Mejor soporte de tipos
- ✅ **Menor tamaño**: Reduce el tamaño del bundle hasta 50%
- ✅ **Soporte oficial**: AWS recomienda v3 para nuevos proyectos
- ✅ **Mantenimiento activo**: Recibe actualizaciones y nuevas features

### Migration Guide

Si tienes código existente con AWS SDK v2, aquí están los cambios principales:

**Antes (v2):**
```javascript
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-1'
});

await dynamodb.put({ TableName: 'table', Item: {} }).promise();
```

**Después (v3):**
```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

await dynamodb.send(new PutCommand({
  TableName: 'table',
  Item: {}
}));
```

### Installation

Actualiza las dependencias:
```bash
npm install
```

No hay cambios necesarios en las variables de entorno ni en la configuración.

---

## [1.0.0] - 2025-12-06

### Added
- Implementación inicial del backend WhatsApp Flow
- Soporte para 3 pantallas del flow (INCIDENT_FORM, INCIDENT_DETAILS, CONFIRMATION)
- Búsqueda dinámica de locales (210+ locales)
- Integración con DynamoDB
- Cifrado/descifrado de mensajes WhatsApp
- Soporte Docker y Docker Compose
- Scripts de gestión de tabla DynamoDB
- Documentación completa
- Tests manuales

# Guía de Consultas - Tabla mut-whatsapp-tickets

## 📋 Resumen

La tabla `mut-whatsapp-tickets` tiene **2 índices secundarios globales (GSI)** para consultas eficientes:

1. **`date-index`** → Para consultar todos los tickets del día actual
2. **`ticket-id-index`** → Para buscar un ticket específico por su ID

---

## 🔍 Escenarios de Consulta

### Escenario 1: Sin filtros - Mostrar todos los tickets del día

**Cuándo usarlo:** El usuario NO proporciona ningún ID de ticket.

**GSI a usar:** `date-index`

**Código:**
```javascript
const hoy = new Date().toISOString().split('T')[0]; // "2025-12-18"

const params = {
  TableName: 'mut-whatsapp-tickets',
  IndexName: 'date-index',
  KeyConditionExpression: 'date_partition = :fecha',
  ExpressionAttributeValues: {
    ':fecha': hoy
  },
  ScanIndexForward: false  // Más recientes primero
};

const result = await docClient.query(params);
console.log(`Tickets de hoy: ${result.Items.length}`);
```

**Resultado:** Todos los tickets creados en el día actual.

---

### Escenario 2: Con filtro - Buscar un ticket específico por ID

**Cuándo usarlo:** El usuario proporciona un ID de ticket (ej: "260", "12345").

**GSI a usar:** `ticket-id-index`

**Código:**
```javascript
const ticketId = "260"; // ID del ticket (sin prefijo)

const params = {
  TableName: 'mut-whatsapp-tickets',
  IndexName: 'ticket-id-index',
  KeyConditionExpression: 'ticket_id = :ticketId',
  ExpressionAttributeValues: {
    ':ticketId': ticketId
  }
};

const result = await docClient.query(params);

if (result.Items.length > 0) {
  console.log('Ticket encontrado:', result.Items[0]);
} else {
  console.log('Ticket no encontrado');
}
```

**Resultado:** El ticket específico (sin importar la fecha de creación).

---

## 📊 Estructura de los Índices

### GSI: `date-index`
- **Partition Key:** `date_partition` (STRING) - Formato: "2025-12-18"
- **Sort Key:** `created_at` (NUMBER) - Timestamp en milisegundos
- **Uso:** Paginación de tickets por fecha

### GSI: `ticket-id-index`
- **Partition Key:** `ticket_id` (STRING) - Formato: "260", "12345"
- **Uso:** Búsqueda directa por ID de ticket

---

## 🎯 Flujo de Decisión

```
┌─────────────────────────────┐
│ Usuario hace una consulta   │
└──────────┬──────────────────┘
           │
           ▼
     ┌─────────────┐
     │ ¿Tiene ID?  │
     └──────┬──────┘
            │
       ┌────┴────┐
       │         │
      SÍ        NO
       │         │
       ▼         ▼
 ┌──────────┐  ┌──────────┐
 │ ticket-  │  │  date-   │
 │ id-index │  │  index   │
 └────┬─────┘  └────┬─────┘
      │             │
      ▼             ▼
 Retorna       Retorna todos
 1 ticket      los del día
```

---

## 💾 Estructura del Campo `ticket_id`

El campo `ticket_id` se genera automáticamente al crear un ticket:

```javascript
// En dynamoDbWriteService.js
let ticket_id = null;
if (idfracttal) {
  ticket_id = String(idfracttal);  // "260"
} else if (idzendesk) {
  ticket_id = String(idzendesk);   // "12345"
}
```

**Ejemplos de tickets:**

```javascript
// Ticket de Fracttal
{
  id: "bc9f3044-8712-4c5e-8143-4867dc6f1f89",
  ticket_id: "260",           // ← Buscar por esto
  idfracttal: 260,            // ← Mantiene compatibilidad
  idzendesk: null,
  destino: "fracttal",
  date_partition: "2025-12-17"
}

// Ticket de Zendesk
{
  id: "a1b2c3d4-...",
  ticket_id: "12345",         // ← Buscar por esto
  idfracttal: null,
  idzendesk: 12345,           // ← Mantiene compatibilidad
  destino: "zendesk",
  date_partition: "2025-12-17"
}
```

---

## ⚡ Ejemplo Completo - Función de Consulta

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Consultar tickets con o sin filtro de ID
 * @param {string|null} ticketId - ID del ticket (opcional)
 * @returns {Promise<Array>} Lista de tickets
 */
async function getTickets(ticketId = null) {
  let params;
  
  if (ticketId) {
    // CASO 1: Buscar por ticket_id específico
    console.log(`🔍 Buscando ticket ID: ${ticketId}`);
    
    params = {
      TableName: 'mut-whatsapp-tickets',
      IndexName: 'ticket-id-index',
      KeyConditionExpression: 'ticket_id = :ticketId',
      ExpressionAttributeValues: {
        ':ticketId': ticketId
      }
    };
  } else {
    // CASO 2: Buscar todos los tickets del día actual
    const hoy = new Date().toISOString().split('T')[0];
    console.log(`📅 Buscando tickets del día: ${hoy}`);
    
    params = {
      TableName: 'mut-whatsapp-tickets',
      IndexName: 'date-index',
      KeyConditionExpression: 'date_partition = :fecha',
      ExpressionAttributeValues: {
        ':fecha': hoy
      },
      ScanIndexForward: false  // Más recientes primero
    };
  }
  
  const result = await docClient.send(new QueryCommand(params));
  return result.Items || [];
}

// Ejemplos de uso:

// 1. Obtener todos los tickets de hoy
const ticketsHoy = await getTickets();
console.log(`Total tickets hoy: ${ticketsHoy.length}`);

// 2. Buscar ticket específico
const ticket = await getTickets("260");
if (ticket.length > 0) {
  console.log('Ticket encontrado:', ticket[0]);
}
```

---

## ⚠️ Notas Importantes

1. **Sin prefijos:** El campo `ticket_id` NO tiene prefijos (FRACT-, ZD-). Solo el número como string.

2. **Campos existentes:** Los campos `idfracttal` e `idzendesk` se mantienen para compatibilidad con sistemas legacy.

3. **TTL:** Los tickets tienen TTL de 20 días. Después se eliminan automáticamente.

4. **Campo `destino`:** Identifica el sistema origen:
   - `"fracttal"` → Ticket creado en Fracttal
   - `"zendesk"` → Ticket creado en Zendesk

5. **Eficiencia:** 
   - `ticket-id-index` → Búsqueda O(1) - ultra rápida
   - `date-index` → Query eficiente por fecha - sin escaneo completo

---

## 📝 Resumen de Campos Clave

| Campo | Tipo | Propósito |
|-------|------|-----------|
| `ticket_id` | STRING | **ID unificado para búsqueda** (GSI) |
| `idfracttal` | NUMBER | ID original de Fracttal (compatibilidad) |
| `idzendesk` | NUMBER | ID original de Zendesk (compatibilidad) |
| `destino` | STRING | Sistema de origen ("fracttal" o "zendesk") |
| `date_partition` | STRING | Fecha para GSI date-index ("2025-12-18") |
| `created_at` | NUMBER | Timestamp en milisegundos |

---

## 🚀 Conclusión

- **Sin ID:** Usa `date-index` → Todos los tickets del día
- **Con ID:** Usa `ticket-id-index` → Ticket específico
- **Ambos índices** evitan escaneos completos de la tabla (eficiencia máxima)

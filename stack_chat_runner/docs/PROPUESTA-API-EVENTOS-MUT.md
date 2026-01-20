# Propuesta: Mejoras API de Eventos MUT

**Fecha:** 19 de enero de 2026

---

## Resumen

| Problema actual | Impacto | Solución |
|-----------------|---------|----------|
| `event_date` vacío | Eventos descartados del chatbot | Campo obligatorio |
| No existe fecha de fin | Parseamos texto (frágil, puede fallar) | Usar `event_occurrences` |
| Múltiples bloques de fechas | No procesable | Usar `event_occurrences` |
| Eventos recurrentes sin fecha fin | No sabemos cuándo dejar de mostrar | Usar `days` + `date_end` |

---

## Problemas actuales (ejemplos reales)

### Problema 1: Sin `event_date`

**Evento:** [Intervenciones lumínicas](https://mut.cl/event/intervenciones-luminicas/)

```json
{
  "event_date": null,
  "date": "4 al 6, 11 al 13 y 18 al 20 de diciembre"
}
```

**Problema:** ¿Diciembre 2025 o 2026? No podemos saberlo → **Evento descartado**.

---

### Problema 2: Sin fecha de fin

**Evento:** [Concurso de fotografía](https://mut.cl/blog/concurso-de-fotografia-las-formas-de-la-luz/)

```json
{
  "event_date": "20260115",
  "date": "15 de enero al 28 de febrero"
}
```

**Problema:** La fecha fin (28 febrero) solo está en texto. Parseamos con regex, pero si cambian la redacción, falla.

---

### Problema 3: Múltiples bloques de fechas

**Evento:** [Intervenciones lumínicas](https://mut.cl/event/intervenciones-luminicas/)

```json
{
  "date": "4 al 6, 11 al 13 y 18 al 20 de diciembre",
  "hour": "21:00 a 23:30 hrs"
}
```

**Problema:** No hay estructura para múltiples bloques. Si cada bloque tuviera horario diferente, no podríamos saberlo.

---

### Problema 4: Eventos recurrentes

**Evento:** Clases de yoga

```json
{
  "event_date": null,
  "date": "Lunes a viernes"
}
```

**Por qué funciona hoy:** Si el texto NO menciona un mes (enero, diciembre), asumimos que es recurrente y lo mostramos.

**Por qué es frágil:**

| Redacción | ¿Funciona? |
|-----------|------------|
| "Lunes a viernes" | ✅ Sí |
| "L-V" | ❌ No |
| "Días hábiles" | ❌ No |

---

## Solución: Campo `event_occurrences`

```
informacion_destacada:
  └── event_occurrences (OBLIGATORIO)
        ├── date_start (YYYYMMDD)
        ├── date_end (YYYYMMDD o null)
        ├── time_start (HH:MM)
        ├── time_end (HH:MM)
        └── days (opcional)
```

---

## Formato de campos

| Campo | Formato | Ejemplo |
|-------|---------|---------|
| `date_start` | YYYYMMDD | `20261204` |
| `date_end` | YYYYMMDD o `null` | `20261206` |
| `time_start` | HH:MM (24h) | `21:00` |
| `time_end` | HH:MM (24h) | `23:30` |
| `days` | Array | `["lunes", "viernes"]` |

**Timezone:** Chile (America/Santiago) implícito.

**Valores de `days`:** `lunes`, `martes`, `miércoles`, `jueves`, `viernes`, `sábado`, `domingo`

---

## Reglas de interpretación

| `days` | `date_end` | Significado |
|--------|------------|-------------|
| null | Fecha | Todos los días del rango |
| null | null | ❌ Inválido |
| Array | Fecha | Solo esos días, hasta fecha fin |
| Array | null | Solo esos días, indefinido |

---

## Ejemplos

### 1. Evento un día, una función

```json
"event_occurrences": [
  {"date_start": "20261204", "date_end": "20261204", "time_start": "20:00", "time_end": "21:30"}
]
```

---

### 2. Dos funciones el mismo día

```json
"event_occurrences": [
  {"date_start": "20261204", "date_end": "20261204", "time_start": "15:00", "time_end": "16:30"},
  {"date_start": "20261204", "date_end": "20261204", "time_start": "20:00", "time_end": "21:30"}
]
```

---

### 3. Varios días consecutivos

Del 4 al 6 de diciembre, 20:00 a 21:30:

```json
"event_occurrences": [
  {"date_start": "20261204", "date_end": "20261206", "time_start": "20:00", "time_end": "21:30"}
]
```

---

### 4. Días salteados

4-6, 11-13 y 18-20 de diciembre:

```json
"event_occurrences": [
  {"date_start": "20261204", "date_end": "20261206", "time_start": "21:00", "time_end": "23:30"},
  {"date_start": "20261211", "date_end": "20261213", "time_start": "21:00", "time_end": "23:30"},
  {"date_start": "20261218", "date_end": "20261220", "time_start": "21:00", "time_end": "23:30"}
]
```

---

### 5. Concurso / Convocatoria (sin hora específica)

Abierto del 15 enero al 28 febrero:

```json
"event_occurrences": [
  {"date_start": "20260115", "date_end": "20260228", "time_start": "00:00", "time_end": "23:59"}
]
```

---

### 6. Recurrente con fecha fin

Yoga lunes a viernes, enero a febrero:

```json
"event_occurrences": [
  {
    "date_start": "20260101",
    "date_end": "20260228",
    "time_start": "10:00",
    "time_end": "11:00",
    "days": ["lunes", "martes", "miércoles", "jueves", "viernes"]
  }
]
```

---

### 7. Recurrente indefinido

Yoga lunes a viernes, sin fecha de término:

```json
"event_occurrences": [
  {
    "date_start": "20260101",
    "date_end": null,
    "time_start": "10:00",
    "time_end": "11:00",
    "days": ["lunes", "martes", "miércoles", "jueves", "viernes"]
  }
]
```

---

### 8. Solo sábados

Mercado los sábados, enero a marzo:

```json
"event_occurrences": [
  {
    "date_start": "20260101",
    "date_end": "20260331",
    "time_start": "10:00",
    "time_end": "18:00",
    "days": ["sábado"]
  }
]
```

---

## Validaciones

| Regla | Descripción |
|-------|-------------|
| Mínimo 1 ocurrencia | Siempre debe haber al menos una |
| `date_start` ≤ `date_end` | Inicio antes o igual que fin |
| `time_start` < `time_end` | Hora inicio antes que hora fin |
| `date_end` = `null` | Solo válido con `days` |

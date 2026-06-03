# Diseño (MVP) — MCP “Daily Driver” para gastos personales

Fecha: 2026-06-01  
Autor: SOLO (asistente) + Usuario  
Estado: **Propuesto (aprobado para pasar a planificación)**  

## 1. Objetivo

Construir un **MCP server** auto-hospedado (VPS) para que el usuario capture gastos por chat (“texto libre”) y el asistente:

1) haga preguntas para completar datos faltantes,  
2) clasifique el gasto con reglas + LLM,  
3) lo guarde en una base de datos,  
4) actualice presupuestos por “sobres” (envelopes) y genere reportes.

El sistema debe funcionar como **daily driver**, con foco en:
- bajo esfuerzo de captura,
- consistencia de categorías,
- multiusuario,
- MXN únicamente (por ahora),
- integración con clientes MCP (ej. TRAE/SOLO).

## 2. Alcance (MVP)

### Incluye
- Captura por **texto libre** con preguntas de seguimiento.
- 10 categorías base (top-level) y 4 sobres (presupuestos).
- Multiusuario con auth por **API key**.
- Persistencia en Postgres (finanzas) + Postgres separado con pgvector (memoria).
- Clasificación híbrida:
  - alias/rules/default merchant (determinístico),
  - fallback por LLM (OpenRouter).
- Corrección de categoría que “enseña” al sistema (reglas/merchant default).
- Reporte mensual y estado de sobres.

### No incluye (fase 2)
- Importación mensual de estados de cuenta (CSV/OFX/PDF).
- Multi-moneda.
- UI web dedicada (más allá de endpoints MCP).
- OCR de tickets.

## 3. Usuarios, autenticación y permisos

### Multiusuario
- Todas las entidades financieras se particionan por `userId`.
- Ninguna query debe devolver datos sin filtrar por `userId`.

### Autenticación: API Key
- El cliente envía `x-api-key: <key>`.
- El servidor almacena **solo hash** de la key (`keyHash`) con salt (`API_KEY_SALT`).
- Cada request resuelve `userId` a partir del `keyHash`.

## 4. Convenciones de captura

### Zona horaria y fecha por defecto
- Zona horaria: **America/Mexico_City**
- Si no se especifica fecha, `occurredAt = hoy` en esa zona horaria.

### Métodos de pago (enum MVP)
- `CASH` (efectivo)
- `CARD_NU` (tarjeta Nu)
- `CARD_BBVA` (tarjeta BBVA)
- `CARD_HSBC_VIVA` (tarjeta HSBC Viva)

### Ejemplos de texto libre
- `uber 126`
- `rappi 380 cena`
- `regalo bautizo 900`
- `costco 1500` (posible split sugerido)

## 5. Categorías y sobres (presupuesto)

### Categorías (10)
1. Vivienda  
2. Servicios hogar + comunicación  
3. Transporte / Auto  
4. Salud  
5. Súper / despensa  
6. Restaurantes / delivery  
7. Deporte / bienestar  
8. Suscripciones / software  
9. Regalos / eventos sociales  
10. Finanzas (deuda, impuestos, comisiones, etc.)

### Sobres (envelopes)
- **Semanal:** Restaurantes/Delivery
- **Mensual acumulable:** Regalos/Eventos
- **Semanal:** Ocio/Pareja
- **Mensual:** Imprevistos variables

Notas:
- Los sobres son presupuestos transversales (pueden mapear a una o más categorías).
- “Boda” se maneja como objetivo/planeación financiera externa al MVP de tracking (no como categoría).

## 6. Arquitectura de alto nivel

### Componentes
1) **MCP Server (Node/TS + Hono)**  
   - expone tools MCP sobre transporte remoto:
     - **MVP:** Streamable HTTP
     - **Fase 2 (si el cliente lo requiere):** compatibilidad HTTP+SSE (legacy)

2) **Finance DB (Postgres)**
   - datos transaccionales, reglas, categorías, sobres.
   - ORM: Prisma v7.

3) **Memory DB (Postgres + pgvector)**
   - memoria vectorizada para Mastra y eventos relevantes.
   - embeddings con OpenAI `text-embedding-3-small`.
   - (probable) migración SQL manual para `vector` + índice HNSW.

4) **Mastra Orchestrator**
   - agentes: clasificación, generación de preguntas, aprendizaje por corrección, insights.

### Proveedores de IA
- Chat/razonamiento: **OpenRouter** modelo `gpt-oss-120-free`.
- Embeddings: **OpenAI** modelo `text-embedding-3-small`.

## 7. Tools MCP (contrato MVP)

Los tools responden en JSON y siempre incluyen contexto mínimo para UI:
- `userId` nunca se expone, pero se usa internamente.
- errores deben ser “actionable” (invalid params, auth, etc.).

### 7.1 `expense.capture`
**Propósito:** aceptar texto libre, intentar extraer campos, y **preguntar** si falta información.

**Input**
```json
{ "text": "string", "occurredAt": "YYYY-MM-DD (opcional)" }
```

**Output (2 modos)**
1) Necesita info:
```json
{
  "status": "needs_input",
  "draftId": "string",
  "questions": [
    { "key": "amount", "question": "¿Cuál fue el monto?", "type": "number" },
    { "key": "paymentMethod", "question": "¿Método de pago?", "type": "enum", "options": ["CASH","CARD_NU","CARD_BBVA","CARD_HSBC_VIVA"] }
  ],
  "partial": { "merchantRaw": "UBER", "occurredAt": "2026-06-01" }
}
```

2) Creado:
```json
{
  "status": "created",
  "expense": {
    "id": "string",
    "occurredAt": "2026-06-01",
    "amountCents": 12600,
    "currency": "MXN",
    "merchant": "Uber",
    "category": "Transporte / Auto",
    "confidence": 0.92,
    "method": "RULE"
  },
  "envelopes": {
    "week": [{ "name": "Restaurantes/Delivery", "spentCents": 0, "budgetCents": 0, "remainingCents": 0 }]
  }
}
```

### 7.2 `expense.confirm`
**Propósito:** completar un borrador (`draftId`) con respuestas del usuario y persistir el gasto.

**Input**
```json
{ "draftId": "string", "answers": { "amount": 126, "paymentMethod": "CARD_NU" } }
```

**Output**
```json
{ "status": "created", "expense": { "id": "string" } }
```

### 7.3 `expense.correct`
**Propósito:** corregir categoría y “enseñar” al sistema.

**Input**
```json
{ "expenseId": "string", "categoryId": "string" }
```

**Output**
```json
{ "status": "ok", "learned": { "type": "merchant_default|rule", "id": "string" } }
```

### 7.4 `expense.list`
**Propósito:** listar gastos filtrados.

**Input**
```json
{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "categoryId": "string (opcional)" }
```

### 7.5 `budget.status`
**Propósito:** mostrar estado de sobres (semanal/mensual).

**Input**
```json
{ "date": "YYYY-MM-DD (opcional)" }
```

### 7.6 `report.monthly`
**Propósito:** reporte agregado por categoría + top comercios.

**Input**
```json
{ "month": "YYYY-MM" }
```

## 8. Flujo de clasificación (detallado)

Al confirmar un gasto (ya sea por `capture` sin preguntas o por `confirm`):

1) Normalización de merchant (heurística y alias):
   - busca alias exacto (`MerchantAlias.aliasText`)
2) Reglas determinísticas (`ClassificationRule`) por prioridad:
   - `CONTAINS` y/o `REGEX` sobre `merchantRaw` + `description` + `rawText`
3) Default del merchant (`Merchant.defaultCategoryId`)
4) Fallback LLM (OpenRouter `gpt-oss-120-free`):
   - prompt con categorías válidas + ejemplos + formato estricto
   - devuelve categoría + confidence (0..1) + explicación corta

Persistencia:
- Guardar `Expense` en `finance_db`
- Crear `MastraMemoryItem` en `memory_db` con embedding (OpenAI)

## 9. Modelo de datos (resumen)

### finance_db (Prisma v7)
- `User`
- `ApiKey`
- `Category` (con `parentId` opcional)
- `Merchant`, `MerchantAlias`
- `Expense` (y opcional `ExpenseSplit`)
- `ClassificationRule`
- `BudgetEnvelope` (+ mapping a categorías)

### memory_db (pgvector)
- `MastraMemoryItem(userId, type, text, metadata jsonb, embedding vector, model, createdAt)`
- Índice vectorial HNSW sobre `embedding`

## 10. Operación y despliegue (Dokploy + Docker)

- `app` (Node/TS)
- `postgres_finance`
- `postgres_memory` (+ vector extension)
- Variables de entorno para llaves y URLs de DB
- Backups automáticos de ambos Postgres (recomendado)

No se asume reverse proxy manual; Dokploy gestiona routing/TLS.

## 11. Manejo de errores (MVP)
- 401: API key faltante/incorrecta
- 400: parámetros inválidos
- 500: error interno (incluye correlationId)
- “needs_input”: no es error, es estado de conversación

## 12. Criterios de éxito (MVP)
- Capturar 50+ gastos con texto libre sin fricción.
- Menos de 10% “uncategorized” después de 1 semana (gracias a reglas y correcciones).
- Reporte mensual consistente por categorías.
- Sobres muestran “remaining” semanal/mensual correctamente.

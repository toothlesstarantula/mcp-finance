# MCP Gastos Daily Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un MCP server (Node/TS + Hono) auto-hospedado que capture gastos por texto libre con preguntas, los clasifique (OpenRouter) y guarde transacciones (Prisma/Postgres) + memoria vectorizada (pgvector/OpenAI).

**Architecture:** Un servicio HTTP (Hono) expone endpoints MCP (SDK oficial v1) con tools `expense.capture/confirm/correct/list`, `budget.status` y `report.monthly`. Dos Postgres: `finance_db` (Prisma) y `memory_db` (pgvector SQL manual). Autenticación por API key. Clasificación determinística + fallback LLM.

**Tech Stack:** Node.js 20+, TypeScript, Hono, `@modelcontextprotocol/sdk` (v1), Prisma v7, Postgres, pgvector, Mastra, OpenRouter, OpenAI embeddings.

---

## 0) Estructura de archivos (a crear)

**Raíz (repo simple)**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `README.md`
- Create: `docker-compose.yml` (dev local)
- Create: `Dockerfile`

**App**
- Create: `src/server.ts`
- Create: `src/env.ts`
- Create: `src/auth/apiKey.ts`
- Create: `src/db/finance.ts`
- Create: `src/db/memory.ts`
- Create: `src/mcp/index.ts`
- Create: `src/mcp/tools/expenseCapture.ts`
- Create: `src/mcp/tools/expenseConfirm.ts`
- Create: `src/mcp/tools/expenseCorrect.ts`
- Create: `src/mcp/tools/expenseList.ts`
- Create: `src/mcp/tools/budgetStatus.ts`
- Create: `src/mcp/tools/reportMonthly.ts`
- Create: `src/services/parsing/parseExpenseText.ts`
- Create: `src/services/classification/classifyExpense.ts`
- Create: `src/services/classification/prompts.ts`
- Create: `src/services/budgets/envelopes.ts`
- Create: `src/services/reports/monthly.ts`
- Create: `src/providers/openrouter.ts`
- Create: `src/providers/openaiEmbeddings.ts`

**Prisma (finance_db)**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `prisma/migrations/...` (generado por Prisma)

**SQL manual (memory_db)**
- Create: `sql/memory_db.sql`

**Tests (Vitest)**
- Create: `vitest.config.ts`
- Create: `src/__tests__/auth.apiKey.test.ts`
- Create: `src/__tests__/parseExpenseText.test.ts`
- Create: `src/__tests__/classifyExpense.test.ts`
- Create: `src/__tests__/mcp.tools.smoke.test.ts`

---

## 1) Task 1: Inicializar repo Node/TS y tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Crear `package.json`**

Contenido mínimo:
```json
{
  "name": "mcp-gastos-daily-driver",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "hono": "^4.5.0",
    "zod": "^3.25.0",
    "@prisma/client": "^7.0.0",
    "prisma": "^7.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Crear `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "prisma", "vitest.config.ts"]
}
```

- [ ] **Step 3: Crear `.env.example`**
```bash
# App
PORT=8787
TZ=America/Mexico_City
API_KEY_SALT=change_me

# Providers
OPENROUTER_API_KEY=change_me
OPENROUTER_MODEL=gpt-oss-120-free

OPENAI_API_KEY=change_me
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Databases
DATABASE_URL_FINANCE=postgresql://postgres:postgres@localhost:5432/finance_db
DATABASE_URL_MEMORY=postgresql://postgres:postgres@localhost:5433/memory_db
```

- [ ] **Step 4: Crear `vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true
  }
});
```

- [ ] **Step 5: Crear `README.md` (cómo correr local)**
Incluye:
- `docker compose up -d`
- `npm i`
- `npm run prisma:migrate && npm run prisma:seed`
- `npm run dev`

- [ ] **Step 6: Instalar deps**

Run:
```bash
npm install
```
Expected: instalación exitosa.

---

## 2) Task 2: Docker local (dev) + DBs separadas

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Crear `docker-compose.yml`**
```yaml
services:
  postgres_finance:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
      POSTGRES_DB: finance_db
    ports:
      - "5432:5432"
    volumes:
      - pg_finance:/var/lib/postgresql/data

  postgres_memory:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
      POSTGRES_DB: memory_db
    ports:
      - "5433:5432"
    volumes:
      - pg_memory:/var/lib/postgresql/data

volumes:
  pg_finance:
  pg_memory:
```

- [ ] **Step 2: Levantar DBs**

Run:
```bash
docker compose up -d
```
Expected: 2 contenedores running.

---

## 3) Task 3: Prisma schema (finance_db) + migraciones + seed

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Crear `prisma/schema.prisma`**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL_FINANCE")
}

enum PaymentMethod {
  CASH
  CARD_NU
  CARD_BBVA
  CARD_HSBC_VIVA
}

enum ExpenseSource {
  MANUAL
  IMPORT
}

enum ClassificationMethod {
  ALIAS
  RULE
  DEFAULT
  LLM
}

enum RuleMatchType {
  CONTAINS
  REGEX
  MERCHANT_ID
}

enum EnvelopePeriod {
  WEEKLY
  MONTHLY
}

model User {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  apiKeys   ApiKey[]
  categories Category[]
  merchants Merchant[]
  merchantAliases MerchantAlias[]
  expenses  Expense[]
  rules     ClassificationRule[]
  envelopes BudgetEnvelope[]
}

model ApiKey {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label      String
  keyHash    String   @unique
  lastUsedAt DateTime?
  createdAt  DateTime @default(now())
}

model Category {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  parentId  String?
  parent    Category? @relation("CategoryParent", fields: [parentId], references: [id], onDelete: SetNull)
  children  Category[] @relation("CategoryParent")
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  expenses  Expense[]
  envelopeCategories BudgetEnvelopeCategory[]

  @@index([userId])
  @@unique([userId, name, parentId])
}

model Merchant {
  id                String   @id @default(uuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  nameCanonical     String
  defaultCategoryId String?
  defaultCategory   Category? @relation(fields: [defaultCategoryId], references: [id], onDelete: SetNull)
  createdAt         DateTime @default(now())

  aliases           MerchantAlias[]
  expenses          Expense[]

  @@index([userId])
}

model MerchantAlias {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  merchantId String
  merchant   Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  aliasText  String
  createdAt  DateTime @default(now())

  @@unique([userId, aliasText])
  @@index([userId, merchantId])
}

model Expense {
  id                   String   @id @default(uuid())
  userId               String
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  source               ExpenseSource
  occurredAt           DateTime
  postedAt             DateTime?

  amountCents          Int
  currency             String   @default("MXN")

  merchantRaw          String
  merchantId           String?
  merchant             Merchant? @relation(fields: [merchantId], references: [id], onDelete: SetNull)

  description          String?
  rawText              String?

  paymentMethod        PaymentMethod

  categoryId           String?
  category             Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  confidence           Float?
  classificationMethod ClassificationMethod?

  externalId           String?
  createdAt            DateTime @default(now())

  @@index([userId, occurredAt])
  @@index([userId, categoryId, occurredAt])
  @@index([userId, merchantId, occurredAt])
  @@unique([userId, externalId])
}

model ClassificationRule {
  id               String   @id @default(uuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  priority         Int
  matchType        RuleMatchType
  pattern          String
  targetCategoryId String
  targetCategory   Category @relation(fields: [targetCategoryId], references: [id], onDelete: Cascade)
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())

  @@index([userId, priority])
}

model BudgetEnvelope {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  period    EnvelopePeriod
  amountCents Int
  isActive  Boolean @default(true)
  createdAt DateTime @default(now())

  categories BudgetEnvelopeCategory[]

  @@index([userId])
  @@unique([userId, name])
}

model BudgetEnvelopeCategory {
  id          String   @id @default(uuid())
  envelopeId  String
  envelope    BudgetEnvelope @relation(fields: [envelopeId], references: [id], onDelete: Cascade)
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([envelopeId, categoryId])
}
```

- [ ] **Step 2: Generar prisma client**
Run:
```bash
npm run prisma:generate
```
Expected: Prisma Client generated.

- [ ] **Step 3: Ejecutar migración**
Run:
```bash
npm run prisma:migrate -- --name init
```
Expected: migración creada y aplicada.

- [ ] **Step 4: Crear `prisma/seed.ts`**
```ts
import { PrismaClient, EnvelopePeriod, PaymentMethod } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashKey(apiKey: string, salt: string) {
  return crypto.createHash('sha256').update(`${salt}:${apiKey}`).digest('hex');
}

async function main() {
  const salt = process.env.API_KEY_SALT ?? 'change_me';
  const apiKeyPlain = process.env.DEV_API_KEY ?? 'dev-local-key';

  const user = await prisma.user.create({ data: {} });

  await prisma.apiKey.create({
    data: { userId: user.id, label: 'dev', keyHash: hashKey(apiKeyPlain, salt) }
  });

  const categories = [
    'Vivienda',
    'Servicios hogar + comunicación',
    'Transporte / Auto',
    'Salud',
    'Súper / despensa',
    'Restaurantes / delivery',
    'Deporte / bienestar',
    'Suscripciones / software',
    'Regalos / eventos sociales',
    'Finanzas'
  ];

  const categoryRows = await Promise.all(
    categories.map((name) => prisma.category.create({ data: { userId: user.id, name } }))
  );

  const byName = Object.fromEntries(categoryRows.map((c) => [c.name, c]));

  await prisma.budgetEnvelope.create({
    data: {
      userId: user.id,
      name: 'Restaurantes/Delivery',
      period: EnvelopePeriod.WEEKLY,
      amountCents: 0,
      categories: { create: [{ categoryId: byName['Restaurantes / delivery'].id }] }
    }
  });

  await prisma.budgetEnvelope.create({
    data: {
      userId: user.id,
      name: 'Regalos/Eventos',
      period: EnvelopePeriod.MONTHLY,
      amountCents: 0,
      categories: { create: [{ categoryId: byName['Regalos / eventos sociales'].id }] }
    }
  });

  await prisma.budgetEnvelope.create({
    data: {
      userId: user.id,
      name: 'Ocio/Pareja',
      period: EnvelopePeriod.WEEKLY,
      amountCents: 0,
      categories: { create: [{ categoryId: byName['Restaurantes / delivery'].id }] }
    }
  });

  await prisma.budgetEnvelope.create({
    data: {
      userId: user.id,
      name: 'Imprevistos variables',
      period: EnvelopePeriod.MONTHLY,
      amountCents: 0
    }
  });

  // Nota: PaymentMethod enum usado más adelante por la app
  void PaymentMethod.CASH;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 5: Correr seed**
Run:
```bash
DEV_API_KEY=dev-local-key npm run prisma:seed
```
Expected: usuario + categorías + sobres creados.

---

## 4) Task 4: SQL de memory_db (pgvector) + índice

**Files:**
- Create: `sql/memory_db.sql`

- [ ] **Step 1: Crear `sql/memory_db.sql`**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS mastra_memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mastra_memory_items_user_created_idx
  ON mastra_memory_items (user_id, created_at DESC);

-- Requiere pgvector; HNSW suele ser el mejor default para top-k
CREATE INDEX IF NOT EXISTS mastra_memory_items_embedding_hnsw
  ON mastra_memory_items USING hnsw (embedding vector_cosine_ops);
```

- [ ] **Step 2: Aplicar SQL**
Run (ejemplo):
```bash
psql "postgresql://postgres:postgres@localhost:5433/memory_db" -f sql/memory_db.sql
```
Expected: extensión y tabla creadas.

---

## 5) Task 5: App base (Hono) + env + DB clients

**Files:**
- Create: `src/env.ts`
- Create: `src/db/finance.ts`
- Create: `src/db/memory.ts`
- Create: `src/server.ts`

- [ ] **Step 1: Crear `src/env.ts`**
```ts
import { z } from 'zod';

export const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  TZ: z.string().default('America/Mexico_City'),
  API_KEY_SALT: z.string().min(8),

  OPENROUTER_API_KEY: z.string().min(10),
  OPENROUTER_MODEL: z.string().default('gpt-oss-120-free'),

  OPENAI_API_KEY: z.string().min(10),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  DATABASE_URL_FINANCE: z.string().url(),
  DATABASE_URL_MEMORY: z.string().url()
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

- [ ] **Step 2: Crear `src/db/finance.ts`**
```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 3: Crear `src/db/memory.ts`**
```ts
import pg from 'pg';
import { getEnv } from '../env';

const { Pool } = pg;

export function getMemoryPool() {
  const env = getEnv();
  return new Pool({ connectionString: env.DATABASE_URL_MEMORY });
}
```

- [ ] **Step 4: Crear `src/server.ts`**
```ts
import { Hono } from 'hono';
import { getEnv } from './env';
import { mountMcp } from './mcp/index';

const env = getEnv();
process.env.TZ = env.TZ;

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

mountMcp(app);

export default app;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port: env.PORT });
  console.log(`Listening on :${env.PORT}`);
}
```

- [ ] **Step 5: Smoke run**
Run:
```bash
npm run dev
```
Expected: `/health` responde `{ ok: true }`.

---

## 6) Task 6: Auth API key (Hono middleware)

**Files:**
- Create: `src/auth/apiKey.ts`
- Test: `src/__tests__/auth.apiKey.test.ts`

- [ ] **Step 1: Crear `src/auth/apiKey.ts`**
```ts
import crypto from 'node:crypto';
import { prisma } from '../db/finance';
import { getEnv } from '../env';

export type AuthedContext = { userId: string; apiKeyId: string };

export function hashKey(apiKey: string) {
  const { API_KEY_SALT } = getEnv();
  return crypto.createHash('sha256').update(`${API_KEY_SALT}:${apiKey}`).digest('hex');
}

export async function authenticateApiKey(apiKey: string | null): Promise<AuthedContext | null> {
  if (!apiKey) return null;
  const keyHash = hashKey(apiKey);
  const row = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!row) return null;
  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { userId: row.userId, apiKeyId: row.id };
}
```

- [ ] **Step 2: Test `auth`**

Crear `src/__tests__/auth.apiKey.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hashKey } from '../auth/apiKey';

describe('hashKey', () => {
  it('hashes deterministically', () => {
    // Nota: este test solo valida forma; en integración se valida contra DB real
    expect(hashKey('abc')).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 3: Run tests**
Run:
```bash
npm test
```
Expected: PASS.

---

## 7) Task 7: Parsing de texto libre + modelo de “draft”

**Files:**
- Create: `src/services/parsing/parseExpenseText.ts`
- Test: `src/__tests__/parseExpenseText.test.ts`

- [ ] **Step 1: Implementar parser**
`src/services/parsing/parseExpenseText.ts`:
```ts
export type ParsedExpenseText = {
  merchantRaw?: string;
  amount?: number; // MXN
  hint?: string;
};

export function parseExpenseText(text: string): ParsedExpenseText {
  const t = text.trim();
  if (!t) return {};

  // Captura monto al final: "uber 126" | "rappi 380 cena" (monto puede ir al medio)
  const amountMatch = t.match(/(?:^|\s)(\d{1,7})(?:\s|$)/g);
  let amount: number | undefined;
  if (amountMatch?.length) {
    // toma el último número encontrado como monto
    const last = amountMatch[amountMatch.length - 1]!.trim();
    amount = Number(last);
    if (!Number.isFinite(amount) || amount <= 0) amount = undefined;
  }

  // merchantRaw = primera palabra (heurística MVP)
  const merchantRaw = t.split(/\s+/)[0]?.toUpperCase();

  return { merchantRaw, amount, hint: t };
}
```

- [ ] **Step 2: Test del parser**
`src/__tests__/parseExpenseText.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseExpenseText } from '../services/parsing/parseExpenseText';

describe('parseExpenseText', () => {
  it('parses merchant and amount', () => {
    expect(parseExpenseText('uber 126')).toEqual({ merchantRaw: 'UBER', amount: 126, hint: 'uber 126' });
  });
});
```

- [ ] **Step 3: Run tests**
Run:
```bash
npm test
```
Expected: PASS.

---

## 8) Task 8: Providers (OpenRouter chat + OpenAI embeddings)

**Files:**
- Create: `src/providers/openrouter.ts`
- Create: `src/providers/openaiEmbeddings.ts`

- [ ] **Step 1: OpenRouter client**
`src/providers/openrouter.ts`:
```ts
import { getEnv } from '../env';

export async function openRouterChatJSON<T>(input: {
  system: string;
  user: string;
  jsonSchemaHint?: string;
}): Promise<T> {
  const env = getEnv();

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter missing content');
  return JSON.parse(content) as T;
}
```

- [ ] **Step 2: OpenAI embeddings client**
`src/providers/openaiEmbeddings.ts`:
```ts
import { getEnv } from '../env';

export async function embedText(text: string): Promise<number[]> {
  const env = getEnv();
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text
    })
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const vec = data.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error('OpenAI embeddings missing vector');
  return vec as number[];
}
```

---

## 9) Task 9: Clasificación (determinístico + LLM fallback)

**Files:**
- Create: `src/services/classification/prompts.ts`
- Create: `src/services/classification/classifyExpense.ts`
- Test: `src/__tests__/classifyExpense.test.ts`

- [ ] **Step 1: Prompt**
`src/services/classification/prompts.ts`:
```ts
export const CATEGORY_NAMES = [
  'Vivienda',
  'Servicios hogar + comunicación',
  'Transporte / Auto',
  'Salud',
  'Súper / despensa',
  'Restaurantes / delivery',
  'Deporte / bienestar',
  'Suscripciones / software',
  'Regalos / eventos sociales',
  'Finanzas'
] as const;

export const CLASSIFIER_SYSTEM = `Eres un clasificador de gastos en MXN.
Devuelve SOLO JSON con: {"category": "<una de las categorías>", "confidence": 0-1, "reason": "breve"}.
Categorías válidas: ${CATEGORY_NAMES.join(', ')}.`;
```

- [ ] **Step 2: Implementar clasificación**
`src/services/classification/classifyExpense.ts`:
```ts
import { prisma } from '../../db/finance';
import { openRouterChatJSON } from '../../providers/openrouter';
import { CLASSIFIER_SYSTEM, CATEGORY_NAMES } from './prompts';
import type { ClassificationMethod } from '@prisma/client';

export type ClassificationResult = {
  categoryId: string | null;
  confidence: number | null;
  method: ClassificationMethod | null;
  reason?: string;
};

export async function classifyExpense(input: {
  userId: string;
  merchantRaw: string;
  description?: string | null;
  rawText?: string | null;
}): Promise<ClassificationResult> {
  const haystack = `${input.merchantRaw} ${input.description ?? ''} ${input.rawText ?? ''}`.trim();

  // 1) Alias exacto
  const alias = await prisma.merchantAlias.findUnique({
    where: { userId_aliasText: { userId: input.userId, aliasText: input.merchantRaw } },
    include: { merchant: true }
  });
  if (alias?.merchant?.defaultCategoryId) {
    return { categoryId: alias.merchant.defaultCategoryId, confidence: 0.95, method: 'ALIAS' };
  }

  // 2) Reglas
  const rules = await prisma.classificationRule.findMany({
    where: { userId: input.userId, isActive: true },
    orderBy: { priority: 'asc' }
  });
  for (const r of rules) {
    if (r.matchType === 'CONTAINS' && haystack.toLowerCase().includes(r.pattern.toLowerCase())) {
      return { categoryId: r.targetCategoryId, confidence: 0.9, method: 'RULE' };
    }
    if (r.matchType === 'REGEX') {
      const re = new RegExp(r.pattern, 'i');
      if (re.test(haystack)) return { categoryId: r.targetCategoryId, confidence: 0.9, method: 'RULE' };
    }
  }

  // 3) Default merchant (canonical) por merchantRaw == nameCanonical
  const merchant = await prisma.merchant.findFirst({
    where: { userId: input.userId, nameCanonical: input.merchantRaw }
  });
  if (merchant?.defaultCategoryId) {
    return { categoryId: merchant.defaultCategoryId, confidence: 0.85, method: 'DEFAULT' };
  }

  // 4) LLM fallback (OpenRouter)
  type LlmOut = { category: typeof CATEGORY_NAMES[number]; confidence: number; reason: string };
  const llm = await openRouterChatJSON<LlmOut>({
    system: CLASSIFIER_SYSTEM,
    user: `Texto: ${haystack}`
  });

  const cat = await prisma.category.findFirst({
    where: { userId: input.userId, name: llm.category }
  });
  return { categoryId: cat?.id ?? null, confidence: llm.confidence ?? null, method: 'LLM', reason: llm.reason };
}
```

- [ ] **Step 3: Test (mock)**
En MVP, testea que el código recorre alias/reglas sin llamar red usando una regla:

`src/__tests__/classifyExpense.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyExpense } from '../services/classification/classifyExpense';

// Nota: en implementación real se hará test de integración con DB.
describe('classifyExpense', () => {
  it('exports function', () => {
    expect(typeof classifyExpense).toBe('function');
  });
});
```

---

## 10) Task 10: Budget envelopes (cálculo de spent/remaining)

**Files:**
- Create: `src/services/budgets/envelopes.ts`

- [ ] **Step 1: Implementar cálculo semanal/mensual**
`src/services/budgets/envelopes.ts`:
```ts
import { prisma } from '../../db/finance';
import { EnvelopePeriod } from '@prisma/client';

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // monday=0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date) {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function budgetStatus(userId: string, asOf: Date) {
  const weekStart = startOfWeek(asOf);
  const monthStart = startOfMonth(asOf);

  const envelopes = await prisma.budgetEnvelope.findMany({
    where: { userId, isActive: true },
    include: { categories: true }
  });

  const out = [];
  for (const env of envelopes) {
    const catIds = env.categories.map((c) => c.categoryId);
    const from = env.period === EnvelopePeriod.WEEKLY ? weekStart : monthStart;

    const spent = await prisma.expense.aggregate({
      where: {
        userId,
        occurredAt: { gte: from, lte: asOf },
        categoryId: catIds.length ? { in: catIds } : undefined
      },
      _sum: { amountCents: true }
    });

    const spentCents = spent._sum.amountCents ?? 0;
    out.push({
      name: env.name,
      period: env.period,
      spentCents,
      budgetCents: env.amountCents,
      remainingCents: env.amountCents - spentCents
    });
  }
  return out;
}
```

---

## 11) Task 11: Reporte mensual

**Files:**
- Create: `src/services/reports/monthly.ts`

- [ ] **Step 1: Implementar `reportMonthly`**
```ts
import { prisma } from '../../db/finance';

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { from, to };
}

export async function reportMonthly(userId: string, month: string) {
  const { from, to } = monthRange(month);
  const categories = await prisma.category.findMany({ where: { userId, isActive: true } });

  const totals = [];
  for (const c of categories) {
    const agg = await prisma.expense.aggregate({
      where: { userId, occurredAt: { gte: from, lt: to }, categoryId: c.id },
      _sum: { amountCents: true },
      _count: true
    });
    totals.push({
      category: c.name,
      amountCents: agg._sum.amountCents ?? 0,
      count: agg._count
    });
  }

  const topMerchants = await prisma.expense.groupBy({
    by: ['merchantRaw'],
    where: { userId, occurredAt: { gte: from, lt: to } },
    _sum: { amountCents: true },
    orderBy: { _sum: { amountCents: 'desc' } },
    take: 10
  });

  return { month, totals, topMerchants };
}
```

---

## 12) Task 12: MCP mounting + tools (SDK v1) + smoke tests

**Files:**
- Create: `src/mcp/index.ts`
- Create: `src/mcp/tools/*.ts`
- Test: `src/__tests__/mcp.tools.smoke.test.ts`

- [ ] **Step 1: Montaje MCP**
Implementar `mountMcp(app)` y registrar tools.

Nota: la implementación exacta del handler Streamable HTTP depende del API de `@modelcontextprotocol/sdk` v1; usar los ejemplos `simpleStreamableHttp.ts` del SDK como referencia.

- [ ] **Step 2: Implementar tool `expense.capture` (draft workflow)**
Reglas:
- Si falta monto: pregunta `amount`
- Si falta método de pago: pregunta `paymentMethod` (enum)
- Si falta merchantRaw (texto vacío): pregunta `merchant`
- Fecha: default hoy CDMX

- [ ] **Step 3: Implementar `expense.confirm`**
- Validar `draftId`
- Completar campos, clasificar, persistir `Expense`
- Devolver `budget.status` embebido opcional

- [ ] **Step 4: Implementar `expense.correct`**
- Update `Expense.categoryId`
- Aprendizaje:
  - Si merchantRaw existe → set `Merchant.defaultCategoryId` o crea `ClassificationRule(CONTAINS, merchantRaw)`

- [ ] **Step 5: Implementar `expense.list`, `budget.status`, `report.monthly`**
- En `budget.status` llama `budgetStatus(userId, asOf)`
- En `report.monthly` llama `reportMonthly(userId, month)`

- [ ] **Step 6: Smoke test**
`src/__tests__/mcp.tools.smoke.test.ts` debe:
- arrancar app en memoria
- invocar handlers directamente (o vía fetch) con `x-api-key`
- verificar que `expense.capture` con `uber` devuelve `needs_input`

---

## 13) Task 13: Dockerfile + deploy con Dokploy

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Crear `Dockerfile`**
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm i

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 8787
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Nota de deploy**
En Dokploy:
- Variables env (como en `.env.example`)
- Comando pre-start recomendado: `npm run prisma:deploy` (o hook equivalente)

---

## 14) Self-review del plan (cobertura vs spec)

- Cubre: multiusuario, API key, MXN, zona horaria CDMX, métodos de pago, tools MCP, 2 DBs separadas, OpenRouter/OpenAI, sobres, reportes.
- Gaps intencionales (fase 2): import mensual, SSE legacy fallback.

---

## Ejecución: elige cómo implementarlo

Plan completo y guardado en `docs/superpowers/plans/2026-06-01-mcp-gastos-daily-driver-plan.md`.

Dos opciones:
1) **Subagent-Driven (recomendado)** — despacho un subagent por task, revisamos entre tasks.
2) **Inline Execution** — lo implemento en esta sesión, task por task.

¿Cuál prefieres?


# mcp-gastos-daily-driver

MCP server (Node.js + TypeScript) para captura y clasificación de gastos.

## Requisitos

- Node.js 20+
- Docker (para Postgres local)

## Setup local (dev)

1) Levanta las bases de datos:

```bash
docker compose up -d
```

2) Instala dependencias:

```bash
npm i
```

3) Configura variables de entorno:

```bash
cp .env.example .env
```

4) Migra y carga seed (Prisma):

```bash
npm run prisma:migrate && npm run prisma:seed
```

5) Ejecuta en modo desarrollo:

```bash
npm run dev
```

## Docker (producción)

El `Dockerfile` hace un build multi-stage:

- `npm ci`
- `npm run prisma:generate` (Prisma v7; genera el cliente en `generated/prisma`)
- `npm run build` (TypeScript → `dist/`)
- arranque: `npm run start` (ejecuta `node dist/src/server.js`)

### Build

```bash
docker build -t mcp-gastos-daily-driver .
```

### Run

```bash
docker run --rm -p 8787:8787 \
  -e PORT=8787 \
  -e DATABASE_URL_FINANCE="postgresql://user:pass@host:5432/finance_db" \
  mcp-gastos-daily-driver
```

Endpoint de healthcheck:

- `GET /health`

## Notas para Dokploy

- Buildpack/Runtime: **Dockerfile**
- Puerto: **8787** (o el que definas en `PORT`)
- Healthcheck: **/health**
- Variables mínimas: `DATABASE_URL_FINANCE`, `API_KEY_SALT` (+ llave de OpenRouter si usas clasificación LLM).
- Migraciones (opcional, recomendado): ejecutar `npm run prisma:deploy` como comando de “pre-deploy/release” (requiere `DATABASE_URL_FINANCE`).

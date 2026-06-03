# syntax=docker/dockerfile:1.7
#
# Producción: build multi-stage (Node 20 Alpine)
#
# Flujo:
#  1) instalar deps
#  2) prisma migrate deploy contra Postgres efímero (BuildKit service)
#  3) prisma generate
#  4) compilar TypeScript -> dist/
#  5) ejecutar servidor desde dist (npm run start => node dist/src/server.js)
#

FROM node:20-alpine AS deps
WORKDIR /app

# Prisma en Alpine suele requerir OpenSSL y compat de glibc.
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
RUN npm ci


FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time: aplicar migraciones contra un Postgres efímero.
# BuildKit levanta `postgres:16-alpine` como servicio accesible en `db:5432`,
# corre `migrate deploy` (idempotente), y destruye el contenedor al terminar.
# Esto valida que las migraciones son sanas y deja el client alineado al último schema.
RUN --mount=type=service,target=db,source=postgres:16-alpine \
    --mount=type=cache,target=/root/.npm \
    DATABASE_URL="postgresql://postgres:postgres@db:5432/build_db?schema=public" \
    npx prisma migrate deploy

# Genera el cliente en ./generated/prisma (ver prisma/schema.prisma)
RUN npm run prisma:generate

# Compila TS a ./dist (ver tsconfig.json). El entrypoint esperado es dist/src/server.js
RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 8787
CMD ["npm","run","start"]

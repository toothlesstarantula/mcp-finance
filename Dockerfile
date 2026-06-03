FROM node:24-slim AS builder
WORKDIR /app

#instalar bun
RUN npm install -g bun

# Prisma 7 ya intenta autodetectar, pero en node:24-slim no encuentra
# libssl/openssl y cae al default. Lo instalamos explícitamente.
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY . .
RUN bun install
# prisma:generate no necesita DB; las migraciones se ejecutan en runtime
RUN bun prisma:generate
RUN bun run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g bun

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 8787
# En runtime Dokploy ya inyecta DATABASE_URL real, así que migrate deploy funciona
CMD ["sh", "-c", "bun prisma:deploy && bun start"]

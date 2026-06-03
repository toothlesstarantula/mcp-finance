FROM node:24-slim AS builder
WORKDIR /app

# Dokploy debe inyectar este build-arg
ARG DATABASE_URL

RUN npm install -g bun

# Prisma 7 + node:24-slim necesita libssl/openssl detectable
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY . .
RUN bun install --production=false

ENV DATABASE_URL=${DATABASE_URL}
RUN bun prisma:deploy
RUN bun prisma:generate

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g bun

# Bun ejecuta TS y resuelve imports sin extensión, así que no hace falta tsc
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
# Si tu server importa archivos fuera de src (config, etc.), agregalos aquí

EXPOSE 8787
CMD ["bun", "src/server.ts"]

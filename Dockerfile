FROM node:24-slim AS builder
WORKDIR /app

# Dokploy debe inyectar este build-arg (misma key que la env de runtime)
ARG DATABASE_URL

#instalar bun
RUN npm install -g bun

# Prisma 7 ya intenta autodetectar, pero en node:24-slim no encuentra
# libssl/openssl y cae al default. Lo instalamos explícitamente.
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY . .
RUN bun install

# Hacemos visible la URL para los procesos siguientes del build
ENV DATABASE_URL=${DATABASE_URL}

RUN bun prisma:deploy
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
CMD ["bun","start"]

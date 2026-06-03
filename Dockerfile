FROM node:24-slim AS builder
WORKDIR /app

#instalar bun
RUN npm install -g bun

COPY . .
RUN bun install
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

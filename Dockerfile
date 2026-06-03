FROM node:24-slim AS deps
WORKDIR /app

#instalar bun
RUN npm install -g bun

COPY package.json ./
RUN bun install


FROM node:24-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun prisma:deploy
RUN bun prisma:generate
RUN bun run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 8787
CMD ["bun","start"]

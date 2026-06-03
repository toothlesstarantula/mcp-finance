import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    // Prisma ORM v7 requiere que el URL exista al cargar el config.
    // Permitimos fallback para que `prisma generate` funcione sin .env local.
    url:
      process.env.DATABASE_URL ??
      process.env.DATABASE_URL_FINANCE ??
      'postgresql://postgres:postgres@localhost:5432/finance_db'
  }
});

import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../env.js';

declare global {
  // eslint-disable-next-line no-var
  var __financePrisma: PrismaClient | undefined;
}

export const financeDb =
  globalThis.__financePrisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL_FINANCE
    })
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__financePrisma = financeDb;
}

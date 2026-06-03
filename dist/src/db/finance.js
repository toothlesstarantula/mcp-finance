import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../env.js';
export const financeDb = globalThis.__financePrisma ??
    new PrismaClient({
        adapter: new PrismaPg({
            connectionString: env.DATABASE_URL_FINANCE
        })
    });
if (process.env.NODE_ENV !== 'production') {
    globalThis.__financePrisma = financeDb;
}

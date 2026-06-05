import "dotenv/config";
import {
  PrismaClient,
  EnvelopePeriod,
  PaymentMethod,
} from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL_FINANCE ??
      "postgresql://postgres:postgres@localhost:5432/finance_db",
  }),
});

function hashKey(apiKey: string, salt: string) {
  return createHash("sha256").update(`${salt}:${apiKey}`).digest("hex");
}

/**
 * Encuentra el primer usuario existente o crea uno nuevo. Esto evita
 * generar un User nuevo en cada corrida del seed (que luego rompería
 * los `@@unique([userId, ...])` en Category, BudgetEnvelope, etc.).
 */
async function getOrCreateSeedUser() {
  const existing = await prisma.user.findFirst({ select: { id: true } });
  if (existing) return existing;
  return prisma.user.create({ data: {} });
}

async function upsertApiKey(userId: string, label: string, keyHash: string) {
  // No hay @@unique compuesto útil (solo keyHash @unique), así que
  // hacemos findFirst + create/update manualmente.
  const existing = await prisma.apiKey.findFirst({
    where: { keyHash },
    select: { id: true },
  });
  if (existing) {
    return prisma.apiKey.update({
      where: { id: existing.id },
      data: { label, userId },
    });
  }
  return prisma.apiKey.create({
    data: { userId, label, keyHash },
  });
}

async function upsertCategory(userId: string, name: string) {
  const existing = await prisma.category.findFirst({
    where: { userId, name, parentId: null },
    select: { id: true },
  });
  if (existing) return { id: existing.id, name };
  const created = await prisma.category.create({
    data: { userId, name },
    select: { id: true, name: true },
  });
  return { id: created.id, name: created.name };
}

async function upsertEnvelope(
  userId: string,
  name: string,
  period: EnvelopePeriod,
  amountCents: number,
) {
  const existing = await prisma.budgetEnvelope.findFirst({
    where: { userId, name },
    select: { id: true },
  });
  if (existing) {
    return prisma.budgetEnvelope.update({
      where: { id: existing.id },
      data: { period, amountCents, isActive: true },
      select: { id: true, name: true },
    });
  }
  return prisma.budgetEnvelope.create({
    data: { userId, name, period, amountCents, isActive: true },
    select: { id: true, name: true },
  });
}

async function linkEnvelopeToCategory(envelopeId: string, categoryId: string) {
  await prisma.budgetEnvelopeCategory.upsert({
    where: { envelopeId_categoryId: { envelopeId, categoryId } },
    create: { envelopeId, categoryId },
    update: {},
  });
}

async function main() {
  const salt = process.env.API_KEY_SALT ?? "change_me";
  const apiKeyPlain = process.env.DEV_API_KEY ?? "dev-local-key";

  // 1) User + API key (idempotente).
  const user = await getOrCreateSeedUser();
  const apiKey = await upsertApiKey(user.id, "dev", hashKey(apiKeyPlain, salt));

  console.log(`✓ User: ${user.id}`);
  console.log(`✓ ApiKey: ${apiKey.id} (label=${apiKey.label})`);

  // 2) Categorías.
  const categoryNames = [
    "Vivienda",
    "Servicios hogar + comunicación",
    "Transporte / Auto",
    "Salud",
    "Súper / despensa",
    "Restaurantes / delivery",
    "Deporte / bienestar",
    "Suscripciones / software",
    "Regalos / eventos sociales",
    "Finanzas",
  ];

  const byName: Record<string, { id: string; name: string }> = {};
  for (const name of categoryNames) {
    byName[name] = await upsertCategory(user.id, name);
  }
  console.log(`✓ Categorías: ${categoryNames.length}`);

  // 3) Envelopes + links a categorías (idempotente).
  const envelopes: Array<{
    name: string;
    period: EnvelopePeriod;
    amountCents: number;
    categoryName?: keyof typeof byName;
  }> = [
    {
      name: "Restaurantes/Delivery",
      period: EnvelopePeriod.WEEKLY,
      amountCents: 0,
      categoryName: "Restaurantes / delivery",
    },
    {
      name: "Regalos/Eventos",
      period: EnvelopePeriod.MONTHLY,
      amountCents: 0,
      categoryName: "Regalos / eventos sociales",
    },
    {
      name: "Ocio/Pareja",
      period: EnvelopePeriod.WEEKLY,
      amountCents: 0,
      categoryName: "Restaurantes / delivery",
    },
    {
      name: "Imprevistos variables",
      period: EnvelopePeriod.MONTHLY,
      amountCents: 0,
    },
  ];

  for (const e of envelopes) {
    const env = await upsertEnvelope(user.id, e.name, e.period, e.amountCents);
    if (e.categoryName && byName[e.categoryName]) {
      await linkEnvelopeToCategory(env.id, byName[e.categoryName].id);
    }
  }
  console.log(`✓ Envelopes: ${envelopes.length}`);

  // PaymentMethod import-side effect.
  void PaymentMethod.CASH;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

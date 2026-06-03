import "dotenv/config";
import { PrismaClient, EnvelopePeriod, PaymentMethod, } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL_FINANCE ??
            "postgresql://postgres:postgres@localhost:5432/finance_db",
    }),
});
function hashKey(apiKey, salt) {
    return createHash("sha256").update(`${salt}:${apiKey}`).digest("hex");
}
async function main() {
    const salt = process.env.API_KEY_SALT ?? "change_me";
    const apiKeyPlain = process.env.DEV_API_KEY ?? "dev-local-key";
    const user = await prisma.user.create({ data: {} });
    await prisma.apiKey.create({
        data: {
            userId: user.id,
            label: "dev",
            keyHash: hashKey(apiKeyPlain, salt),
        },
    });
    const categories = [
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
    const categoryRows = await Promise.all(categories.map((name) => prisma.category.create({ data: { userId: user.id, name } })));
    const byName = Object.fromEntries(categoryRows.map((c) => [c.name, c]));
    await prisma.budgetEnvelope.create({
        data: {
            userId: user.id,
            name: "Restaurantes/Delivery",
            period: EnvelopePeriod.WEEKLY,
            amountCents: 0,
            categories: {
                create: [{ categoryId: byName["Restaurantes / delivery"].id }],
            },
        },
    });
    await prisma.budgetEnvelope.create({
        data: {
            userId: user.id,
            name: "Regalos/Eventos",
            period: EnvelopePeriod.MONTHLY,
            amountCents: 0,
            categories: {
                create: [{ categoryId: byName["Regalos / eventos sociales"].id }],
            },
        },
    });
    await prisma.budgetEnvelope.create({
        data: {
            userId: user.id,
            name: "Ocio/Pareja",
            period: EnvelopePeriod.WEEKLY,
            amountCents: 0,
            categories: {
                create: [{ categoryId: byName["Restaurantes / delivery"].id }],
            },
        },
    });
    await prisma.budgetEnvelope.create({
        data: {
            userId: user.id,
            name: "Imprevistos variables",
            period: EnvelopePeriod.MONTHLY,
            amountCents: 0,
        },
    });
    // Nota: PaymentMethod enum usado más adelante por la app
    void PaymentMethod.CASH;
}
main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});

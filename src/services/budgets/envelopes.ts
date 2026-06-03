import { financeDb } from '../../db/finance.js';
import { EnvelopePeriod } from '../../../generated/prisma/client.js';

function isValidDate(d: Date): boolean {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // monday=0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date): Date {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export type BudgetEnvelopeStatus = {
  name: string;
  period: EnvelopePeriod;
  spentCents: number;
  budgetCents: number;
  remainingCents: number;
};

/**
 * Calcula spent/remaining por envelope.
 *
 * Regla importante:
 * - Si un envelope NO tiene mapeos (0 categories), se interpreta como "solo no categorizado",
 *   es decir: Expense.categoryId IS NULL.
 * - Si sí hay mapeos, se incluyen únicamente los gastos con categoryId en esa lista.
 */
export async function budgetStatus(userId: string, asOf: Date): Promise<BudgetEnvelopeStatus[]> {
  const trimmedUserId = (userId ?? '').trim();
  if (!trimmedUserId) throw new Error('budgetStatus: userId requerido');
  if (!isValidDate(asOf)) throw new Error('budgetStatus: asOf inválido');

  const weekStart = startOfWeek(asOf);
  const monthStart = startOfMonth(asOf);

  const envelopes = await financeDb.budgetEnvelope.findMany({
    where: { userId: trimmedUserId, isActive: true },
    include: { categories: true }
  });

  const out: BudgetEnvelopeStatus[] = [];
  for (const env of envelopes) {
    const catIds = env.categories.map((c) => c.categoryId);
    const from = env.period === EnvelopePeriod.WEEKLY ? weekStart : monthStart;

    const spent = await financeDb.expense.aggregate({
      where: {
        userId: trimmedUserId,
        occurredAt: { gte: from, lte: asOf },
        categoryId: catIds.length ? { in: catIds } : null
      },
      _sum: { amountCents: true }
    });

    const spentCents = spent._sum.amountCents ?? 0;
    out.push({
      name: env.name,
      period: env.period,
      spentCents,
      budgetCents: env.amountCents,
      remainingCents: env.amountCents - spentCents
    });
  }

  return out;
}


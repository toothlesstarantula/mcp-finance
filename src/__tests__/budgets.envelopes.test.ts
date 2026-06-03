import { beforeEach, describe, expect, it, vi } from 'vitest';

const { financeDbMock } = vi.hoisted(() => {
  const financeDbMock = {
    budgetEnvelope: { findMany: vi.fn() },
    expense: { aggregate: vi.fn() }
  };
  return { financeDbMock };
});

vi.mock('../db/finance.js', () => ({
  financeDb: financeDbMock
}));

import { EnvelopePeriod } from '../../generated/prisma/client.js';
import { budgetStatus } from '../services/budgets/envelopes.js';

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

describe('services/budgets/envelopes budgetStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('usa rango semanal/mensual correcto y aplica regla de envelope sin mapeos => categoryId NULL', async () => {
    const asOf = new Date('2026-06-04T12:34:56.000Z');
    const weekStart = startOfWeek(asOf);
    const monthStart = startOfMonth(asOf);

    financeDbMock.budgetEnvelope.findMany.mockResolvedValue([
      {
        id: 'e_week',
        userId: 'u1',
        name: 'Semana - Transporte',
        period: EnvelopePeriod.WEEKLY,
        amountCents: 10_000,
        isActive: true,
        categories: [{ categoryId: 'cat_transport' }, { categoryId: 'cat_taxis' }]
      },
      {
        id: 'e_month_uncat',
        userId: 'u1',
        name: 'Mes - Sin categoría',
        period: EnvelopePeriod.MONTHLY,
        amountCents: 50_000,
        isActive: true,
        categories: []
      }
    ]);

    financeDbMock.expense.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 2500 } })
      .mockResolvedValueOnce({ _sum: { amountCents: 1234 } });

    const res = await budgetStatus('u1', asOf);

    expect(financeDbMock.budgetEnvelope.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isActive: true },
      include: { categories: true }
    });

    expect(financeDbMock.expense.aggregate).toHaveBeenCalledTimes(2);

    expect(financeDbMock.expense.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'u1',
        occurredAt: { gte: weekStart, lte: asOf },
        categoryId: { in: ['cat_transport', 'cat_taxis'] }
      },
      _sum: { amountCents: true }
    });

    expect(financeDbMock.expense.aggregate).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'u1',
        occurredAt: { gte: monthStart, lte: asOf },
        categoryId: null
      },
      _sum: { amountCents: true }
    });

    expect(res).toEqual([
      {
        name: 'Semana - Transporte',
        period: EnvelopePeriod.WEEKLY,
        spentCents: 2500,
        budgetCents: 10_000,
        remainingCents: 7500
      },
      {
        name: 'Mes - Sin categoría',
        period: EnvelopePeriod.MONTHLY,
        spentCents: 1234,
        budgetCents: 50_000,
        remainingCents: 48_766
      }
    ]);
  });

  it('valida argumentos requeridos', async () => {
    await expect(budgetStatus('   ', new Date())).rejects.toThrow(/userId requerido/i);
    // @ts-expect-error - test de runtime
    await expect(budgetStatus('u1', new Date('invalid'))).rejects.toThrow(/asOf inválido/i);
  });
});


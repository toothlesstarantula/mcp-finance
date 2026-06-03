import { beforeEach, describe, expect, it, vi } from 'vitest';

const { financeDbMock } = vi.hoisted(() => {
  const financeDbMock = {
    expense: { groupBy: vi.fn() }
  };
  return { financeDbMock };
});

vi.mock('../db/finance.js', () => ({
  financeDb: financeDbMock
}));

import { reportMonthly } from '../services/reports/monthly.js';

describe('services/reports/monthly reportMonthly', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('consulta el rango del mes correcto y regresa output con forma esperada', async () => {
    financeDbMock.expense.groupBy
      .mockResolvedValueOnce([
        { categoryId: 'cat_food', _sum: { amountCents: 12345 } },
        { categoryId: null, _sum: { amountCents: 999 } }
      ])
      .mockResolvedValueOnce([
        { merchantId: 'm_oxxo', merchantRaw: 'OXXO', _sum: { amountCents: 8000 } },
        { merchantId: null, merchantRaw: 'UBER TRIP', _sum: { amountCents: 3000 } }
      ]);

    const res = await reportMonthly('u1', '2026-06');

    const start = new Date('2026-06-01T00:00:00.000Z');
    const end = new Date('2026-07-01T00:00:00.000Z');

    expect(financeDbMock.expense.groupBy).toHaveBeenCalledTimes(2);

    expect(financeDbMock.expense.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['categoryId'],
      where: { userId: 'u1', occurredAt: { gte: start, lt: end } },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } }
    });

    expect(financeDbMock.expense.groupBy).toHaveBeenNthCalledWith(2, {
      by: ['merchantId', 'merchantRaw'],
      where: { userId: 'u1', occurredAt: { gte: start, lt: end } },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } },
      take: 10
    });

    expect(res).toEqual({
      month: '2026-06',
      range: { start, end },
      totalsByCategory: [
        { categoryId: 'cat_food', totalCents: 12345 },
        { categoryId: null, totalCents: 999 }
      ],
      topMerchants: [
        { merchantId: 'm_oxxo', merchantRaw: 'OXXO', totalCents: 8000 },
        { merchantId: null, merchantRaw: 'UBER TRIP', totalCents: 3000 }
      ]
    });
  });

  it('valida argumentos requeridos', async () => {
    await expect(reportMonthly('   ', '2026-06')).rejects.toThrow(/userId requerido/i);
    await expect(reportMonthly('u1', '2026-13')).rejects.toThrow(/month inválido/i);
    // @ts-expect-error - test de runtime
    await expect(reportMonthly('u1', new Date('invalid'))).rejects.toThrow(/month inválido/i);
  });
});


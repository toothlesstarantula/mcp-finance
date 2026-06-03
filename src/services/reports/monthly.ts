import { financeDb } from '../../db/finance.js';

function isValidDate(d: Date): boolean {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function parseMonth(month: string | Date): { year: number; monthIndex0: number; label: string } {
  if (month instanceof Date) {
    if (!isValidDate(month)) throw new Error('reportMonthly: month inválido');
    const year = month.getUTCFullYear();
    const monthIndex0 = month.getUTCMonth(); // 0-11
    const label = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;
    return { year, monthIndex0, label };
  }

  const trimmed = (month ?? '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!m) throw new Error('reportMonthly: month inválido');

  const year = Number(m[1]);
  const monthNum = Number(m[2]); // 1-12
  if (!Number.isInteger(year) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error('reportMonthly: month inválido');
  }

  return { year, monthIndex0: monthNum - 1, label: trimmed };
}

export type MonthlyCategoryTotal = {
  categoryId: string | null;
  totalCents: number;
};

export type MonthlyMerchantTotal = {
  merchantId: string | null;
  merchantRaw: string;
  totalCents: number;
};

export type MonthlyReport = {
  month: string; // YYYY-MM
  range: { start: Date; end: Date }; // [start, end)
  totalsByCategory: MonthlyCategoryTotal[];
  topMerchants: MonthlyMerchantTotal[];
};

export async function reportMonthly(userId: string, month: string | Date): Promise<MonthlyReport> {
  const trimmedUserId = (userId ?? '').trim();
  if (!trimmedUserId) throw new Error('reportMonthly: userId requerido');

  const { year, monthIndex0, label } = parseMonth(month);
  const start = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 1, 0, 0, 0, 0));

  const [byCategory, byMerchant] = await Promise.all([
    financeDb.expense.groupBy({
      by: ['categoryId'],
      where: { userId: trimmedUserId, occurredAt: { gte: start, lt: end } },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } }
    }),
    financeDb.expense.groupBy({
      by: ['merchantId', 'merchantRaw'],
      where: { userId: trimmedUserId, occurredAt: { gte: start, lt: end } },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } },
      take: 10
    })
  ]);

  return {
    month: label,
    range: { start, end },
    totalsByCategory: byCategory.map((row) => ({
      categoryId: row.categoryId,
      totalCents: row._sum.amountCents ?? 0
    })),
    topMerchants: byMerchant.map((row) => ({
      merchantId: row.merchantId,
      merchantRaw: row.merchantRaw,
      totalCents: row._sum.amountCents ?? 0
    }))
  };
}


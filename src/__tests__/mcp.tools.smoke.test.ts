import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  financeDbMock,
  classifyExpenseMock,
  budgetStatusMock,
  reportMonthlyMock,
} = vi.hoisted(() => {
  const financeDbMock = {
    expense: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    expenseDraft: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    merchant: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    classificationRule: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
  };

  const classifyExpenseMock = vi.fn();
  const budgetStatusMock = vi.fn();
  const reportMonthlyMock = vi.fn();

  return {
    financeDbMock,
    classifyExpenseMock,
    budgetStatusMock,
    reportMonthlyMock,
  };
});

vi.mock("../db/finance.js", () => ({
  financeDb: financeDbMock,
}));

vi.mock("../services/classification/classifyExpense.js", () => ({
  classifyExpense: classifyExpenseMock,
}));

vi.mock("../services/budgets/envelopes.js", () => ({
  budgetStatus: budgetStatusMock,
}));

vi.mock("../services/reports/monthly.js", () => ({
  reportMonthly: reportMonthlyMock,
}));

import { createMcpServerForUser } from "../mcp/index.js";

describe("mcp tools (smoke)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("expense.capture -> expense.confirm (persist)", async () => {
    classifyExpenseMock.mockResolvedValue({
      categoryId: "cat_1",
      confidence: 0.9,
      method: "RULE",
      reason: "mock",
    });

    financeDbMock.expense.create.mockResolvedValue({ id: "exp_1" });

    budgetStatusMock.mockResolvedValue([
      {
        name: "Comida",
        period: "WEEKLY",
        spentCents: 1000,
        budgetCents: 5000,
        remainingCents: 4000,
      },
    ]);

    // Stub del draft store: simulamos upsert + findUnique devolviendo la fila
    // recién guardada, y delete idempotente.
    const draftStore = new Map<string, Record<string, unknown>>();
    financeDbMock.expenseDraft.upsert.mockImplementation(
      async ({ where, create, update }: any) => {
        const id = where.id;
        const next = { ...(draftStore.get(id) ?? {}), ...update, ...create };
        draftStore.set(id, next);
        return { id, ...next };
      },
    );
    financeDbMock.expenseDraft.findUnique.mockImplementation(
      async ({ where }: any) => draftStore.get(where.id) ?? null,
    );
    financeDbMock.expenseDraft.delete.mockImplementation(
      async ({ where }: any) => {
        draftStore.delete(where.id);
        return { id: where.id };
      },
    );

    const server = createMcpServerForUser("u1");
    const capture = (server as any)._registeredTools["expense.capture"].handler;
    const confirm = (server as any)._registeredTools["expense.confirm"].handler;

    const capRes = await capture({
      text: "uber 100",
      paymentMethod: "CASH",
    });

    expect(capRes.structuredContent.draftId).toBeTruthy();
    expect(capRes.structuredContent.questions).toEqual([]);
    // El draftId debe quedar visible en el text para que el LLM lo capture.
    expect(capRes.content[0].text).toContain(capRes.structuredContent.draftId);

    const confRes = await confirm({
      draftId: capRes.structuredContent.draftId,
    });

    expect(confRes.structuredContent.expenseId).toBe("exp_1");
    expect(confRes.structuredContent.classification).toMatchObject({
      categoryId: "cat_1",
      method: "RULE",
    });

    expect(financeDbMock.expense.create).toHaveBeenCalledTimes(1);
    expect(financeDbMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          merchantRaw: "UBER",
          amountCents: 10000,
          paymentMethod: "CASH",
          categoryId: "cat_1",
        }),
      }),
    );
  });

  it("expense.list", async () => {
    financeDbMock.expense.findMany.mockResolvedValue([
      {
        id: "exp_1",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        amountCents: 12345,
        currency: "MXN",
        merchantRaw: "OXXO",
        paymentMethod: "CASH",
        categoryId: null,
        description: null,
      },
    ]);

    const server = createMcpServerForUser("u1");
    const list = (server as any)._registeredTools["expense.list"].handler;

    const res = await list({ limit: 10 });
    expect(res.structuredContent.expenses).toHaveLength(1);
    expect(res.structuredContent.expenses[0]).toMatchObject({
      id: "exp_1",
      amountCents: 12345,
      merchantRaw: "OXXO",
      categoryId: null,
    });

    expect(financeDbMock.expense.findMany).toHaveBeenCalledTimes(1);
  });

  it("budget.status y report.monthly", async () => {
    budgetStatusMock.mockResolvedValue([
      {
        name: "Comida",
        period: "MONTHLY",
        spentCents: 10,
        budgetCents: 20,
        remainingCents: 10,
      },
    ]);

    reportMonthlyMock.mockResolvedValue({
      month: "2026-01",
      range: {
        start: new Date("2026-01-01T00:00:00.000Z"),
        end: new Date("2026-02-01T00:00:00.000Z"),
      },
      totalsByCategory: [{ categoryId: null, totalCents: 100 }],
      topMerchants: [
        { merchantId: null, merchantRaw: "OXXO", totalCents: 100 },
      ],
    });

    const server = createMcpServerForUser("u1");
    const budgetTool = (server as any)._registeredTools["budget.status"]
      .handler;
    const reportTool = (server as any)._registeredTools["report.monthly"]
      .handler;

    const b = await budgetTool({ asOf: "2026-01-15T00:00:00.000Z" });
    expect(b.structuredContent.envelopes).toHaveLength(1);

    const r = await reportTool({ month: "2026-01" });
    expect(r.structuredContent.month).toBe("2026-01");
    expect(r.structuredContent.range.start).toBe("2026-01-01T00:00:00.000Z");
  });

  it("expense.correct (persist + learning merchant default)", async () => {
    financeDbMock.expense.findFirst.mockResolvedValue({
      id: "exp_1",
      userId: "u1",
      merchantId: "m_1",
      merchantRaw: "UBER",
    });
    financeDbMock.category.findFirst.mockResolvedValue({ id: "cat_food" });
    financeDbMock.expense.update.mockResolvedValue({ id: "exp_1" });

    financeDbMock.merchant.findFirst.mockResolvedValue({ id: "m_1" });
    financeDbMock.merchant.update.mockResolvedValue({ id: "m_1" });

    const server = createMcpServerForUser("u1");
    const correct = (server as any)._registeredTools["expense.correct"].handler;

    const res = await correct({ expenseId: "exp_1", categoryId: "cat_food" });

    expect(res.structuredContent).toMatchObject({
      expenseId: "exp_1",
      categoryId: "cat_food",
      learned: { type: "MERCHANT_DEFAULT", merchantId: "m_1" },
    });

    expect(financeDbMock.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exp_1" },
        data: { categoryId: "cat_food" },
      }),
    );
    expect(financeDbMock.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m_1" },
        data: { defaultCategoryId: "cat_food" },
      }),
    );
  });

  it("expense.correct (persist + learning rule contains)", async () => {
    financeDbMock.expense.findFirst.mockResolvedValue({
      id: "exp_2",
      userId: "u1",
      merchantId: null,
      merchantRaw: "PUESTO DE TACOS",
    });
    financeDbMock.category.findFirst.mockResolvedValue({ id: "cat_food" });
    financeDbMock.expense.update.mockResolvedValue({ id: "exp_2" });

    financeDbMock.merchant.findFirst.mockResolvedValue(null);
    financeDbMock.classificationRule.aggregate.mockResolvedValue({
      _min: { priority: 3 },
    });
    financeDbMock.classificationRule.create.mockResolvedValue({
      id: "r_1",
      priority: 2,
      pattern: "PUESTO DE TACOS",
    });

    const server = createMcpServerForUser("u1");
    const correct = (server as any)._registeredTools["expense.correct"].handler;

    const res = await correct({ expenseId: "exp_2", categoryId: "cat_food" });

    expect(res.structuredContent).toMatchObject({
      expenseId: "exp_2",
      categoryId: "cat_food",
      learned: {
        type: "RULE_CONTAINS",
        ruleId: "r_1",
        priority: 2,
        pattern: "PUESTO DE TACOS",
      },
    });

    expect(financeDbMock.classificationRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          matchType: "CONTAINS",
          pattern: "PUESTO DE TACOS",
          targetCategoryId: "cat_food",
          priority: 2,
        }),
      }),
    );
  });
});

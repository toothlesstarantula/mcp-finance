import { beforeEach, describe, expect, it, vi } from 'vitest';

const { financeDbMock, openrouterChatJsonMock } = vi.hoisted(() => {
  const financeDbMock = {
    merchantAlias: { findFirst: vi.fn() },
    classificationRule: { findMany: vi.fn() },
    merchant: { findUnique: vi.fn(), findFirst: vi.fn() },
    category: { findMany: vi.fn(), findFirst: vi.fn() }
  };

  const openrouterChatJsonMock = vi.fn();

  return { financeDbMock, openrouterChatJsonMock };
});

vi.mock('../db/finance.js', () => ({
  financeDb: financeDbMock
}));

vi.mock('../providers/openrouter.js', () => ({
  openrouterChatJson: openrouterChatJsonMock
}));

import { classifyExpense } from '../services/classification/classifyExpense.js';

describe('services/classification/classifyExpense', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prioriza ALIAS sobre RULE/DEFAULT/LLM', async () => {
    financeDbMock.merchantAlias.findFirst.mockResolvedValue({
      aliasText: 'UBER',
      merchantId: 'm1',
      merchant: { id: 'm1', nameCanonical: 'UBER', defaultCategoryId: 'cat_alias' }
    });

    // Si se llamaran, deberían NO afectar el resultado.
    financeDbMock.classificationRule.findMany.mockResolvedValue([
      {
        id: 'r1',
        priority: 1,
        matchType: 'CONTAINS',
        pattern: 'uber',
        targetCategoryId: 'cat_rule'
      }
    ]);
    financeDbMock.merchant.findFirst.mockResolvedValue({
      id: 'm1',
      nameCanonical: 'UBER',
      defaultCategoryId: 'cat_default'
    });
    financeDbMock.category.findMany.mockResolvedValue([{ id: 'c1', name: 'Salud' }]);
    financeDbMock.category.findFirst.mockResolvedValue({ id: 'c1', name: 'Salud' });
    openrouterChatJsonMock.mockResolvedValue({ category: 'Salud' });

    const res = await classifyExpense({
      userId: 'u1',
      merchantRaw: 'uber',
      description: 'viaje',
      rawText: 'uber 123'
    });

    expect(res).toMatchObject({
      categoryId: 'cat_alias',
      method: 'ALIAS'
    });

    expect(financeDbMock.classificationRule.findMany).not.toHaveBeenCalled();
    expect(financeDbMock.merchant.findFirst).not.toHaveBeenCalled();
    expect(financeDbMock.merchant.findUnique).not.toHaveBeenCalled();
    expect(financeDbMock.category.findMany).not.toHaveBeenCalled();
    expect(openrouterChatJsonMock).not.toHaveBeenCalled();
  });

  it('prioriza RULE sobre DEFAULT/LLM cuando no hay alias', async () => {
    financeDbMock.merchantAlias.findFirst.mockResolvedValue(null);
    financeDbMock.classificationRule.findMany.mockResolvedValue([
      {
        id: 'r1',
        priority: 1,
        matchType: 'CONTAINS',
        pattern: 'uber',
        targetCategoryId: 'cat_rule'
      }
    ]);

    financeDbMock.merchant.findFirst.mockResolvedValue({
      id: 'm1',
      nameCanonical: 'UBER',
      defaultCategoryId: 'cat_default'
    });
    financeDbMock.category.findMany.mockResolvedValue([{ id: 'c1', name: 'Salud' }]);
    openrouterChatJsonMock.mockResolvedValue({ category: 'Salud' });

    const res = await classifyExpense({
      userId: 'u1',
      merchantRaw: 'uber',
      description: 'viaje',
      rawText: 'uber 123'
    });

    expect(res).toMatchObject({
      categoryId: 'cat_rule',
      method: 'RULE'
    });

    expect(financeDbMock.merchant.findFirst).not.toHaveBeenCalled();
    expect(financeDbMock.category.findMany).not.toHaveBeenCalled();
    expect(openrouterChatJsonMock).not.toHaveBeenCalled();
  });

  it('prioriza DEFAULT sobre LLM cuando no hay alias ni regla', async () => {
    financeDbMock.merchantAlias.findFirst.mockResolvedValue(null);
    financeDbMock.classificationRule.findMany.mockResolvedValue([]);
    financeDbMock.merchant.findFirst.mockResolvedValue({
      id: 'm1',
      nameCanonical: 'UBER',
      defaultCategoryId: 'cat_default'
    });
    financeDbMock.category.findMany.mockResolvedValue([{ id: 'c1', name: 'Salud' }]);
    openrouterChatJsonMock.mockResolvedValue({ category: 'Salud' });

    const res = await classifyExpense({
      userId: 'u1',
      merchantRaw: 'uber'
    });

    expect(res).toMatchObject({
      categoryId: 'cat_default',
      method: 'DEFAULT'
    });

    expect(financeDbMock.category.findMany).not.toHaveBeenCalled();
    expect(openrouterChatJsonMock).not.toHaveBeenCalled();
  });

  it('usa LLM como fallback y mapea nombre -> Category.id', async () => {
    financeDbMock.merchantAlias.findFirst.mockResolvedValue(null);
    financeDbMock.classificationRule.findMany.mockResolvedValue([]);
    financeDbMock.merchant.findFirst.mockResolvedValue(null);

    financeDbMock.category.findMany.mockResolvedValue([
      { id: 'c1', name: 'Salud' },
      { id: 'c2', name: 'Transporte / Auto' }
    ]);

    openrouterChatJsonMock.mockResolvedValue({
      category: 'Salud',
      reason: 'farmacia',
      confidence: 0.8
    });

    financeDbMock.category.findFirst.mockResolvedValue({ id: 'c1', name: 'Salud' });

    const res = await classifyExpense({
      userId: 'u1',
      merchantRaw: 'farmacias guadalajara',
      description: 'medicina',
      rawText: 'farmacias 200'
    });

    expect(res).toEqual({
      categoryId: 'c1',
      confidence: 0.8,
      method: 'LLM',
      reason: 'farmacia'
    });

    expect(openrouterChatJsonMock).toHaveBeenCalledTimes(1);
    expect(financeDbMock.category.findMany).toHaveBeenCalledTimes(1);
    expect(financeDbMock.category.findFirst).toHaveBeenCalledTimes(1);
  });
});


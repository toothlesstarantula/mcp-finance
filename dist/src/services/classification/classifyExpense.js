import { financeDb } from '../../db/finance.js';
import { openrouterChatJson } from '../../providers/openrouter.js';
import { buildExpenseClassificationMessages } from './prompts.js';
function normalizeText(s) {
    return s.trim();
}
function buildHaystack(input) {
    return [input.merchantRaw, input.description ?? '', input.rawText ?? '']
        .join(' ')
        .trim();
}
function matchesRule(matchType, pattern, haystack) {
    if (!pattern)
        return false;
    if (matchType === 'CONTAINS') {
        return haystack.toLowerCase().includes(pattern.toLowerCase());
    }
    if (matchType === 'REGEX') {
        try {
            const re = new RegExp(pattern, 'i');
            return re.test(haystack);
        }
        catch {
            return false;
        }
    }
    return false;
}
/**
 * Clasifica un gasto (por merchantRaw/description/rawText) siguiendo el orden:
 * 1) Alias exact match (MerchantAlias.aliasText) -> Merchant.defaultCategoryId
 * 2) Reglas activas (CONTAINS/REGEX)
 * 3) Merchant.defaultCategoryId (si se resuelve merchant)
 * 4) Fallback LLM (OpenRouter) devolviendo NOMBRE de categoría y mapeando a Category.id
 */
export async function classifyExpense(input) {
    const userId = normalizeText(input.userId);
    const merchantRaw = normalizeText(input.merchantRaw);
    if (!userId)
        throw new Error('classifyExpense: userId requerido');
    if (!merchantRaw)
        throw new Error('classifyExpense: merchantRaw requerido');
    const haystack = buildHaystack({ ...input, merchantRaw });
    // 1) Alias exact match
    const alias = await financeDb.merchantAlias.findFirst({
        where: {
            userId,
            aliasText: { equals: merchantRaw, mode: 'insensitive' }
        },
        select: {
            aliasText: true,
            merchantId: true,
            merchant: { select: { id: true, nameCanonical: true, defaultCategoryId: true } }
        }
    });
    let resolvedMerchantId = input.merchantId ?? null;
    if (alias?.merchantId)
        resolvedMerchantId = alias.merchantId;
    if (alias?.merchant?.defaultCategoryId) {
        return {
            categoryId: alias.merchant.defaultCategoryId,
            confidence: 0.95,
            method: 'ALIAS',
            reason: `Alias "${alias.aliasText}" -> merchant "${alias.merchant.nameCanonical ?? alias.merchantId}" con categoría default`
        };
    }
    // 2) Rules (CONTAINS / REGEX)
    const rules = await financeDb.classificationRule.findMany({
        where: {
            userId,
            isActive: true,
            matchType: { in: ['CONTAINS', 'REGEX'] }
        },
        orderBy: [{ priority: 'asc' }],
        select: { id: true, priority: true, matchType: true, pattern: true, targetCategoryId: true }
    });
    for (const rule of rules) {
        if (matchesRule(rule.matchType, rule.pattern, haystack)) {
            return {
                categoryId: rule.targetCategoryId,
                confidence: 0.9,
                method: 'RULE',
                reason: `Regla ${rule.id} (priority=${rule.priority}, ${rule.matchType}="${rule.pattern}") hizo match`
            };
        }
    }
    // 3) Merchant default
    let merchant = null;
    if (resolvedMerchantId) {
        merchant = await financeDb.merchant.findUnique({
            where: { id: resolvedMerchantId },
            select: { id: true, nameCanonical: true, defaultCategoryId: true }
        });
    }
    else {
        // Búsqueda "best effort" por nameCanonical == merchantRaw
        merchant = await financeDb.merchant.findFirst({
            where: { userId, nameCanonical: { equals: merchantRaw, mode: 'insensitive' } },
            select: { id: true, nameCanonical: true, defaultCategoryId: true }
        });
        if (merchant?.id)
            resolvedMerchantId = merchant.id;
    }
    if (merchant?.defaultCategoryId) {
        return {
            categoryId: merchant.defaultCategoryId,
            confidence: 0.7,
            method: 'DEFAULT',
            reason: `Merchant "${merchant.nameCanonical}" tiene categoría default`
        };
    }
    // 4) OpenRouter fallback (devuelve nombre de categoría)
    const categories = await financeDb.category.findMany({
        where: { userId, isActive: true },
        select: { id: true, name: true }
    });
    if (!categories.length) {
        throw new Error('classifyExpense: no hay categorías activas para el usuario');
    }
    const messages = buildExpenseClassificationMessages({
        merchantRaw,
        description: input.description,
        rawText: input.rawText,
        categories: categories.map((c) => c.name)
    });
    const llm = await openrouterChatJson(messages, {
        signal: input.signal
    });
    const suggestedName = typeof llm?.category === 'string' ? llm.category.trim() : '';
    if (!suggestedName) {
        throw new Error('classifyExpense: OpenRouter no devolvió "category" válida');
    }
    const mapped = await financeDb.category.findFirst({
        where: { userId, name: { equals: suggestedName, mode: 'insensitive' }, isActive: true },
        select: { id: true, name: true }
    });
    if (!mapped) {
        throw new Error(`classifyExpense: categoría no encontrada en DB: "${suggestedName}"`);
    }
    const confidence = typeof llm.confidence === 'number' && Number.isFinite(llm.confidence)
        ? Math.max(0, Math.min(1, llm.confidence))
        : 0.5;
    return {
        categoryId: mapped.id,
        confidence,
        method: 'LLM',
        reason: llm.reason?.trim() || `LLM sugirió "${mapped.name}"`
    };
}

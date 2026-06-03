import { z } from 'zod';
import { financeDb } from '../../db/finance.js';
import { toolError, toolOk } from './utils.js';
export function registerExpenseCorrectTool(server, userId) {
    server.registerTool('expense.correct', {
        title: 'Corregir gasto (persistido)',
        description: 'Actualiza la categoría (categoryId) de un Expense ya persistido y aprende una heurística (Merchant.defaultCategoryId o ClassificationRule).',
        inputSchema: z.object({
            expenseId: z.string(),
            categoryId: z.string()
        }),
        outputSchema: z.object({
            expenseId: z.string(),
            categoryId: z.string(),
            learned: z.object({
                type: z.enum(['MERCHANT_DEFAULT', 'RULE_CONTAINS']),
                merchantId: z.string().nullable(),
                ruleId: z.string().nullable(),
                priority: z.number().int().nullable(),
                pattern: z.string().nullable()
            })
        })
    }, async (args) => {
        // 1) Validaciones básicas (pertenencia por userId).
        const expense = await financeDb.expense.findFirst({
            where: { id: args.expenseId, userId },
            select: { id: true, userId: true, merchantId: true, merchantRaw: true }
        });
        if (!expense)
            return toolError(`No existe expenseId=${args.expenseId} para este usuario`);
        const category = await financeDb.category.findFirst({
            where: { id: args.categoryId, userId, isActive: true },
            select: { id: true }
        });
        if (!category)
            return toolError(`No existe categoryId=${args.categoryId} (activa) para este usuario`);
        // 2) Persistir corrección.
        await financeDb.expense.update({
            where: { id: expense.id },
            data: { categoryId: category.id }
        });
        // 3) Heurística de aprendizaje:
        //    - Si se puede resolver Merchant por merchantId o nameCanonical == merchantRaw:
        //        set Merchant.defaultCategoryId
        //    - Si no:
        //        create ClassificationRule(CONTAINS) pattern=merchantRaw, priority=min(priority)-1 (o 0 si no hay)
        // 3a) Resolver merchant
        const merchant = expense.merchantId
            ? await financeDb.merchant.findFirst({
                where: { id: expense.merchantId, userId },
                select: { id: true }
            })
            : await financeDb.merchant.findFirst({
                where: { userId, nameCanonical: { equals: expense.merchantRaw, mode: 'insensitive' } },
                select: { id: true }
            });
        if (merchant?.id) {
            await financeDb.merchant.update({
                where: { id: merchant.id },
                data: { defaultCategoryId: category.id }
            });
            return toolOk({
                structuredContent: {
                    expenseId: expense.id,
                    categoryId: category.id,
                    learned: {
                        type: 'MERCHANT_DEFAULT',
                        merchantId: merchant.id,
                        ruleId: null,
                        priority: null,
                        pattern: null
                    }
                },
                text: 'Gasto corregido y merchant aprendido (defaultCategoryId).'
            });
        }
        // 3b) Si no hay merchant, crear regla CONTAINS con prioridad "mejor" (más baja).
        const agg = await financeDb.classificationRule.aggregate({
            where: { userId },
            _min: { priority: true }
        });
        const minPriority = agg._min.priority;
        const priority = typeof minPriority === 'number' ? minPriority - 1 : 0;
        const createdRule = await financeDb.classificationRule.create({
            data: {
                userId,
                priority,
                matchType: 'CONTAINS',
                pattern: expense.merchantRaw,
                targetCategoryId: category.id,
                isActive: true
            },
            select: { id: true, priority: true, pattern: true }
        });
        return toolOk({
            structuredContent: {
                expenseId: expense.id,
                categoryId: category.id,
                learned: {
                    type: 'RULE_CONTAINS',
                    merchantId: null,
                    ruleId: createdRule.id,
                    priority: createdRule.priority,
                    pattern: createdRule.pattern
                }
            },
            text: 'Gasto corregido y regla aprendida (CONTAINS).'
        });
    });
}

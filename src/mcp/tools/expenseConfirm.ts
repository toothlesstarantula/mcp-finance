import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { financeDb } from '../../db/finance.js';
import { classifyExpense } from '../../services/classification/classifyExpense.js';
import { budgetStatus } from '../../services/budgets/envelopes.js';
import { deleteDraft, getDraft, saveDraft } from './expenseDraftStore.js';
import { buildDraftQuestions, toolError, toolOk } from './utils.js';
import type { ExpenseSource, PaymentMethod } from '../../../generated/prisma/client.js';

const PaymentMethodSchema = z.enum(['CASH', 'CARD_NU', 'CARD_BBVA', 'CARD_HSBC_VIVA']);

export function registerExpenseConfirmTool(server: McpServer, userId: string) {
  server.registerTool(
    'expense.confirm',
    {
      title: 'Confirmar gasto (persistir)',
      description:
        'Valida y persiste un borrador como Expense. Clasifica y devuelve estatus de sobres (envelopes).',
      inputSchema: z.object({
        draftId: z.string(),
        merchantRaw: z.string().optional(),
        amount: z.number().positive().optional().describe('Monto en MXN (pesos)'),
        occurredAt: z.string().datetime().optional(),
        paymentMethod: PaymentMethodSchema.optional(),
        description: z.string().nullable().optional(),
        rawText: z.string().nullable().optional(),
        currency: z.string().optional()
      }),
      outputSchema: z.object({
        expenseId: z.string(),
        classification: z.object({
          categoryId: z.string(),
          confidence: z.number(),
          method: z.string(),
          reason: z.string()
        }),
        budget: z.array(
          z.object({
            name: z.string(),
            period: z.string(),
            spentCents: z.number().int(),
            budgetCents: z.number().int(),
            remainingCents: z.number().int()
          })
        )
      })
    },
    async (args) => {
      const draft = getDraft(userId, args.draftId);
      if (!draft) return toolError(`No existe borrador draftId=${args.draftId}`);

      // Aplicar overrides (similar a expense.correct)
      if (typeof args.merchantRaw === 'string') {
        const t = args.merchantRaw.trim();
        draft.merchantRaw = t || undefined;
      }
      if (typeof args.amount === 'number') {
        draft.amountCents = Math.round(args.amount * 100);
      }
      if (typeof args.occurredAt === 'string') {
        draft.occurredAt = new Date(args.occurredAt);
      }
      if (typeof args.paymentMethod === 'string') {
        draft.paymentMethod = args.paymentMethod;
      }
      if (typeof args.description !== 'undefined') {
        draft.description = args.description;
      }
      if (typeof args.rawText !== 'undefined') {
        draft.rawText = args.rawText;
      }
      if (typeof args.currency === 'string') {
        const t = args.currency.trim();
        if (t) draft.currency = t;
      }

      saveDraft(draft);

      const questions = buildDraftQuestions(draft);
      if (questions.length) {
        return toolError(`No se puede confirmar: faltan datos. ${questions.join(' ')}`);
      }

      const occurredAt = draft.occurredAt ?? new Date();
      const merchantRaw = draft.merchantRaw!;
      const amountCents = draft.amountCents!;
      const paymentMethod = draft.paymentMethod as PaymentMethod;

      const classification = await classifyExpense({
        userId,
        merchantRaw,
        description: draft.description ?? undefined,
        rawText: draft.rawText ?? undefined
      });

      const created = await financeDb.expense.create({
        data: {
          userId,
          source: 'MANUAL' as ExpenseSource,
          occurredAt,
          amountCents,
          currency: draft.currency,
          merchantRaw,
          description: draft.description ?? undefined,
          rawText: draft.rawText ?? undefined,
          paymentMethod,
          categoryId: classification.categoryId,
          confidence: classification.confidence,
          classificationMethod: classification.method
        },
        select: { id: true }
      });

      const budget = await budgetStatus(userId, occurredAt);

      deleteDraft(userId, args.draftId);

      return toolOk({
        structuredContent: {
          expenseId: created.id,
          classification: {
            categoryId: classification.categoryId,
            confidence: classification.confidence,
            method: classification.method,
            reason: classification.reason
          },
          budget
        },
        text: 'Gasto confirmado.'
      });
    }
  );
}


import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseExpenseText } from '../../services/parsing/parseExpenseText.js';
import { buildDraftQuestions, toolOk } from './utils.js';
import { newDraftId, saveDraft, type ExpenseDraft } from './expenseDraftStore.js';

const PaymentMethodSchema = z.enum(['CASH', 'CARD_NU', 'CARD_BBVA', 'CARD_HSBC_VIVA']);

export function registerExpenseCaptureTool(server: McpServer, userId: string) {
  server.registerTool(
    'expense.capture',
    {
      title: 'Capturar gasto (borrador)',
      description:
        'Crea un borrador de gasto y devuelve preguntas faltantes para poder confirmarlo.',
      inputSchema: z.object({
        text: z.string().optional().describe('Texto libre (ej: "uber 126")'),
        merchantRaw: z.string().optional().describe('Nombre del comercio tal cual'),
        amount: z.number().positive().optional().describe('Monto en MXN (pesos)'),
        occurredAt: z.string().datetime().optional().describe('Fecha/hora ISO-8601'),
        paymentMethod: PaymentMethodSchema.optional(),
        description: z.string().optional(),
        currency: z.string().optional().default('MXN')
      }),
      outputSchema: z.object({
        draftId: z.string(),
        draft: z.object({
          merchantRaw: z.string().optional(),
          amountCents: z.number().int().optional(),
          currency: z.string(),
          occurredAt: z.string().optional(),
          paymentMethod: z.string().optional(),
          description: z.string().nullable().optional(),
          rawText: z.string().nullable().optional()
        }),
        questions: z.array(z.string())
      })
    },
    async (args) => {
      const parsed = args.text ? parseExpenseText(args.text) : {};

      const draft: ExpenseDraft = {
        draftId: newDraftId(),
        userId,
        merchantRaw: (args.merchantRaw ?? parsed.merchantRaw)?.trim() || undefined,
        amountCents:
          typeof args.amount === 'number'
            ? Math.round(args.amount * 100)
            : typeof parsed.amount === 'number'
              ? Math.round(parsed.amount * 100)
              : undefined,
        currency: (args.currency ?? 'MXN').trim() || 'MXN',
        occurredAt: args.occurredAt ? new Date(args.occurredAt) : new Date(),
        paymentMethod: args.paymentMethod,
        description: args.description ?? null,
        rawText: args.text ?? null
      };

      await saveDraft(draft);

      const questions = buildDraftQuestions(draft);
      return toolOk({
        structuredContent: {
          draftId: draft.draftId,
          draft: {
            merchantRaw: draft.merchantRaw,
            amountCents: draft.amountCents,
            currency: draft.currency,
            occurredAt: draft.occurredAt?.toISOString(),
            paymentMethod: draft.paymentMethod,
            description: draft.description ?? null,
            rawText: draft.rawText ?? null
          },
          questions
        },
        text: questions.length
          ? `Borrador ${draft.draftId} creado; faltan datos: ${questions.join(' ')}`
          : `Borrador ${draft.draftId} creado.`
      });
    }
  );
}


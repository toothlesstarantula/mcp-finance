import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { financeDb } from '../../db/finance.js';
import { toolOk } from './utils.js';

export function registerExpenseListTool(server: McpServer, userId: string) {
  server.registerTool(
    'expense.list',
    {
      title: 'Listar gastos',
      description: 'Lista los gastos del usuario (rango opcional por fecha).',
      inputSchema: z.object({
        from: z.string().datetime().optional().describe('ISO datetime (incluyente)'),
        to: z.string().datetime().optional().describe('ISO datetime (incluyente)'),
        limit: z.number().int().positive().max(100).optional().default(20)
      }),
      outputSchema: z.object({
        expenses: z.array(
          z.object({
            id: z.string(),
            occurredAt: z.string(),
            amountCents: z.number().int(),
            currency: z.string(),
            merchantRaw: z.string(),
            paymentMethod: z.string(),
            categoryId: z.string().nullable().optional(),
            description: z.string().nullable().optional()
          })
        )
      })
    },
    async (args) => {
      const where: Record<string, unknown> = { userId };

      if (args.from || args.to) {
        where.occurredAt = {
          ...(args.from ? { gte: new Date(args.from) } : {}),
          ...(args.to ? { lte: new Date(args.to) } : {})
        };
      }

      const rows = await financeDb.expense.findMany({
        where: where as never,
        orderBy: { occurredAt: 'desc' },
        take: args.limit,
        select: {
          id: true,
          occurredAt: true,
          amountCents: true,
          currency: true,
          merchantRaw: true,
          paymentMethod: true,
          categoryId: true,
          description: true
        }
      });

      return toolOk({
        structuredContent: {
          expenses: rows.map((e) => ({
            id: e.id,
            occurredAt: e.occurredAt.toISOString(),
            amountCents: e.amountCents,
            currency: e.currency,
            merchantRaw: e.merchantRaw,
            paymentMethod: String(e.paymentMethod),
            categoryId: e.categoryId ?? null,
            description: e.description ?? null
          }))
        },
        text: `Se encontraron ${rows.length} gastos.`
      });
    }
  );
}


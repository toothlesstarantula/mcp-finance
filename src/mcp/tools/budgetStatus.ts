import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { budgetStatus } from '../../services/budgets/envelopes.js';
import { toolOk } from './utils.js';

export function registerBudgetStatusTool(server: McpServer, userId: string) {
  server.registerTool(
    'budget.status',
    {
      title: 'Estatus de presupuestos (envelopes)',
      description: 'Devuelve spent/budget/remaining por sobre al día indicado.',
      inputSchema: z.object({
        asOf: z.string().datetime().optional().describe('ISO datetime; default=now')
      }),
      outputSchema: z.object({
        asOf: z.string(),
        envelopes: z.array(
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
      const asOf = args.asOf ? new Date(args.asOf) : new Date();
      const envelopes = await budgetStatus(userId, asOf);
      return toolOk({
        structuredContent: {
          asOf: asOf.toISOString(),
          envelopes
        },
        text: `Sobres: ${envelopes.length}`
      });
    }
  );
}


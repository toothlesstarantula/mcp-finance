import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { reportMonthly } from '../../services/reports/monthly.js';
import { toolOk } from './utils.js';

export function registerReportMonthlyTool(server: McpServer, userId: string) {
  server.registerTool(
    'report.monthly',
    {
      title: 'Reporte mensual',
      description: 'Totales por categoría y top merchants para un mes YYYY-MM.',
      inputSchema: z.object({
        month: z.string().describe('Mes en formato YYYY-MM')
      }),
      outputSchema: z.object({
        month: z.string(),
        range: z.object({ start: z.string(), end: z.string() }),
        totalsByCategory: z.array(
          z.object({
            categoryId: z.string().nullable(),
            totalCents: z.number().int()
          })
        ),
        topMerchants: z.array(
          z.object({
            merchantId: z.string().nullable(),
            merchantRaw: z.string(),
            totalCents: z.number().int()
          })
        )
      })
    },
    async (args) => {
      const rep = await reportMonthly(userId, args.month);
      return toolOk({
        structuredContent: {
          month: rep.month,
          range: { start: rep.range.start.toISOString(), end: rep.range.end.toISOString() },
          totalsByCategory: rep.totalsByCategory,
          topMerchants: rep.topMerchants
        },
        text: `Reporte ${rep.month}`
      });
    }
  );
}


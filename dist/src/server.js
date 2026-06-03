import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env.js';
import { mountMcp } from './mcp/index.js';
export const app = new Hono();
app.get('/health', (c) => c.json({
    ok: true,
    service: 'mcp-gastos-daily-driver'
}));
mountMcp(app);
if (import.meta.url === `file://${process.argv[1]}`) {
    serve({
        fetch: app.fetch,
        port: env.PORT
    });
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://localhost:${env.PORT}`);
}

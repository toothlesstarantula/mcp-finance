import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { mountMcp } from "./mcp/index.js";
import {
  handleSseGet,
  handleSsePost,
  handleSseOptions,
} from "./mcp/sse.js";

export const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "mcp-gastos-daily-driver"
  })
);

mountMcp(app);

/**
 * Router de bajo nivel: separa los endpoints del transporte SSE legacy
 * (necesitan Node req/res crudo) del resto, que pasa por Hono.
 *
 * /mcp/sse       → SSE  (abre stream, devuelve sessionId)
 * /mcp/messages  → POST (recibe mensajes JSON-RPC de la sesión SSE)
 * /mcp           → Streamable HTTP (manejado por mountMcp dentro de Hono)
 * *              → Hono
 */
function routeRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (url === "/mcp/sse" || url.startsWith("/mcp/sse?")) {
    if (method === "OPTIONS") {
      handleSseOptions(req, res);
      return;
    }
    if (method === "GET") {
      void handleSseGet(req, res);
      return;
    }
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  if (url.startsWith("/mcp/messages")) {
    if (method === "OPTIONS") {
      handleSseOptions(req, res);
      return;
    }
    if (method === "POST") {
      void handleSsePost(req, res);
      return;
    }
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }

  honoListener(req, res);
}

const honoListener = getRequestListener(app.fetch);

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer(routeRequest);
  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://localhost:${env.PORT}`);
  });
}

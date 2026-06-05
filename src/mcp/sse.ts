/**
 * Legacy SSE transport (Streamable HTTP fallback).
 *
 * Algunos clientes MCP (TRAE Solo Desktop, mcp-remote) intentan primero
 * Streamable HTTP en `/mcp`. Si falla, caen al transporte SSE legacy
 * probando `/mcp/sse`. Para no romper esos clientes exponemos ambos:
 *
 *   GET  /mcp/sse         → abre stream SSE y devuelve `event: endpoint`
 *                            con la URL relativa de POST (incluye sessionId)
 *   POST /mcp/messages    → recibe mensajes JSON-RPC del cliente y los
 *                            rutea al transport de la sesión correcta
 *
 * El sessionId se genera en el constructor de SSEServerTransport (UUID v4).
 * Lo guardamos en `sessions` para rutear los POST al transport correcto.
 *
 * Refs:
 *   - https://modelcontextprotocol.io/specification/2024-11-05/architecture/transports
 *   - SDK: @modelcontextprotocol/sdk/server/sse.js (deprecated pero funcional)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authenticateApiKey } from "../auth/apiKey.js";
import { createMcpServerForUser } from "./index.js";

interface SseSession {
  transport: SSEServerTransport;
  server: McpServer;
}

const sessions = new Map<string, SseSession>();

function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version, x-api-key",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "mcp-session-id, mcp-protocol-version",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, { "Content-Type": "text/plain" });
  res.end("Unauthorized");
}

export function handleSseOptions(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  applyCors(res);
  res.writeHead(204);
  res.end();
}

export async function handleSseGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  applyCors(res);

  const apiKeyPlain = (req.headers["x-api-key"] as string | undefined) ?? "";
  const auth = await authenticateApiKey(apiKeyPlain);
  if (!auth) return unauthorized(res);

  // SSEServerTransport crea el sessionId en su constructor.
  const transport = new SSEServerTransport("/mcp/messages", res);
  const server = createMcpServerForUser(auth.userId);

  sessions.set(transport.sessionId, { transport, server });

  const cleanup = () => {
    sessions.delete(transport.sessionId);
  };
  transport.onclose = cleanup;
  res.on("close", cleanup);

  // `server.connect(transport)` llama a `transport.start()` automáticamente
  // y este último hace `res.writeHead(200, { Content-Type: text/event-stream })`
  // y emite el `event: endpoint` con la URL relativa de POST.
  await server.connect(transport);
}

export async function handleSsePost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  applyCors(res);

  const apiKeyPlain = (req.headers["x-api-key"] as string | undefined) ?? "";
  const auth = await authenticateApiKey(apiKeyPlain);
  if (!auth) return unauthorized(res);

  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing sessionId");
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Session not found or expired");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (err) {
    // No podemos responder si los headers ya se enviaron (SSE stream activo).
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal error");
    }
    // eslint-disable-next-line no-console
    console.error("[sse] handlePostMessage error", err);
  }
}

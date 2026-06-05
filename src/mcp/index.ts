import type { Hono } from "hono";
import { cors } from "hono/cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey } from "../auth/apiKey.js";
import { registerExpenseCaptureTool } from "./tools/expenseCapture.js";
import { registerExpenseCorrectTool } from "./tools/expenseCorrect.js";
import { registerExpenseConfirmTool } from "./tools/expenseConfirm.js";
import { registerExpenseListTool } from "./tools/expenseList.js";
import { registerBudgetStatusTool } from "./tools/budgetStatus.js";
import { registerReportMonthlyTool } from "./tools/reportMonthly.js";

export function createMcpServerForUser(userId: string): McpServer {
  const server = new McpServer({
    name: "mcp-gastos-daily-driver",
    version: "1.0.0",
  });

  registerExpenseCaptureTool(server, userId);
  registerExpenseCorrectTool(server, userId);
  registerExpenseConfirmTool(server, userId);
  registerExpenseListTool(server, userId);
  registerBudgetStatusTool(server, userId);
  registerReportMonthlyTool(server, userId);

  return server;
}

interface McpInstance {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

/**
 * Cache de (McpServer + transport) por userId.
 *
 * El transport se crea en STATELESS mode (sessionIdGenerator: undefined):
 * - No se genera ni requiere `mcp-session-id`.
 * - Cada request es independiente → compatible con clientes que no
 *   propagan el session ID (TRAE, Claude Desktop, etc.).
 * - El userId ya viene en cada request vía el header `x-api-key`, así que
 *   no necesitamos estado de sesión.
 *
 * El McpServer se cachea por userId para no re-registrar tools en cada request.
 */
const instances = new Map<string, McpInstance>();

function getOrCreateInstance(userId: string): McpInstance {
  const cached = instances.get(userId);
  if (cached) return cached;

  const transport = new WebStandardStreamableHTTPServerTransport({
    // STATELESS: sin sessionIdGenerator. El server no emite ni exige
    // el header `mcp-session-id`.
    sessionIdGenerator: undefined,
  });

  const server = createMcpServerForUser(userId);
  // Conectar server ↔ transport (idempotente en stateless mode).
  server.connect(transport);

  const instance: McpInstance = { server, transport };
  instances.set(userId, instance);
  return instance;
}

export function mountMcp(app: Hono) {
  // CORS: requerido por clientes MCP HTTP (browser-based y Electron).
  // Nota: en stateless mode no exponemos `mcp-session-id`, pero lo dejamos
  // por compatibilidad con clientes stateful que aún lo envíen.
  const mcpCors = cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "mcp-session-id",
      "Last-Event-ID",
      "mcp-protocol-version",
      "x-api-key",
    ],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  });
  app.use("/mcp", mcpCors);
  app.use("/mcp/*", mcpCors);

  app.all("/mcp", async (c) => {
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    const apiKeyPlain = c.req.header("x-api-key") ?? "";
    const auth = await authenticateApiKey(apiKeyPlain);
    if (!auth) return c.text("Unauthorized", 401);

    const instance = getOrCreateInstance(auth.userId);
    return instance.transport.handleRequest(c.req.raw);
  });
}

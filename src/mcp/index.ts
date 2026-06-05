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

export function mountMcp(app: Hono) {
  // CORS: requerido por clientes MCP HTTP (browser-based y Electron).
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

    // STATELESS MODE:
    // El SDK exige transport NUEVO por request cuando sessionIdGenerator
    // es undefined ("Stateless transport cannot be reused across requests.
    // Create a new transport per request."). Por seguridad creamos también
    // un McpServer nuevo cada vez — el costo de registrar 6 tools es
    // despreciable y evitamos estado compartido entre requests.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createMcpServerForUser(auth.userId);
    await server.connect(transport);

    return transport.handleRequest(c.req.raw);
  });
}

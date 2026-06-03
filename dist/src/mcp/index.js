import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey } from "../auth/apiKey.js";
import { registerExpenseCaptureTool } from "./tools/expenseCapture.js";
import { registerExpenseCorrectTool } from "./tools/expenseCorrect.js";
import { registerExpenseConfirmTool } from "./tools/expenseConfirm.js";
import { registerExpenseListTool } from "./tools/expenseList.js";
import { registerBudgetStatusTool } from "./tools/budgetStatus.js";
import { registerReportMonthlyTool } from "./tools/reportMonthly.js";
export function createMcpServerForUser(userId) {
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
const sessions = new Map();
export function mountMcp(app) {
    // CORS: requerido por clientes MCP HTTP (headers de sesión/protocolo).
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
        if (!auth)
            return c.text("Unauthorized", 401);
        const incomingSessionId = c.req.header("mcp-session-id");
        let session = incomingSessionId
            ? sessions.get(incomingSessionId)
            : undefined;
        if (!session) {
            const transport = new WebStandardStreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (id) => {
                    sessions.set(id, { transport });
                },
                onsessionclosed: (id) => {
                    sessions.delete(id);
                },
            });
            const server = createMcpServerForUser(auth.userId);
            await server.connect(transport);
            session = { transport };
        }
        return session.transport.handleRequest(c.req.raw);
    });
}

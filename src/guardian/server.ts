import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { RagMcpClient } from "./rag-client.js";
import { runGuardianPreflight } from "./tools/preflight.js";

const config = getConfig();
const ragClient = new RagMcpClient(config);

function createServer(): McpServer {
  const server = new McpServer({
    name: "scarlett-guardian-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "guardian_memory_preflight",
    {
      title: "Guardian Memory Preflight",
      description: [
        "Mandatory external Guardian preflight for Scarlett & Benjamin RP.",
        "Call this before any in-character Scarlett prose.",
        "The Guardian enforces retrieve_story_context first plus search_story_memory before prose, detects high-risk continuity triggers, and returns a structured report.",
        "If proceed_recommendation is do_not_proceed, do not write in-character prose; stop OOC and repair retrieval.",
        "Never use narrative flow, emotional momentum, or apparent continuity as a reason to skip this tool."
      ].join(" "),
      inputSchema: z.object({
        user_message: z.string().min(1).describe("Raw latest Benjamin/user message that Scarlett would respond to."),
        recent_context: z.string().optional().describe("Optional compact recap of the immediately preceding exchange."),
        force_full_retrieval: z.boolean().default(false).describe("If true, run broader targeted memory searches for high-risk or diagnostic turns.")
      })
    },
    async (args) => {
      const report = await runGuardianPreflight(args, ragClient, config);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(report, null, 2)
        }]
      };
    }
  );

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "scarlett-guardian-mcp",
    version: "0.1.0"
  });
});

app.post("/mcp", async (req, res) => {
  if (config.GUARDIAN_MCP_BEARER_TOKEN) {
    const expected = `Bearer ${config.GUARDIAN_MCP_BEARER_TOKEN}`;
    if (req.header("authorization") !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: "Guardian MCP request failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

app.listen(config.GUARDIAN_PORT, config.GUARDIAN_HOST, () => {
  console.log(`Scarlett Guardian MCP listening on http://${config.GUARDIAN_HOST}:${config.GUARDIAN_PORT}/mcp`);
  console.log(`Forwarding retrieval calls to ${config.RAG_MCP_URL}`);
});

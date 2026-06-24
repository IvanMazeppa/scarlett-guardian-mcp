import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { RagMcpClient } from "./rag-client.js";
import { runGuardianOocConsult } from "./tools/ooc-consult.js";
import { runGuardianPreflight } from "./tools/preflight.js";

const config = getConfig();
const ragClient = new RagMcpClient(config);

const PreflightInputSchema = z.object({
  user_message: z.string().min(1).describe("Raw latest Benjamin/user message that Scarlett would respond to."),
  recent_context: z.string().optional().describe("Optional compact recap of the immediately preceding exchange."),
  force_full_retrieval: z.boolean().default(false).describe("If true, run broader targeted memory searches for high-risk or diagnostic turns.")
});

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
      inputSchema: PreflightInputSchema
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

  server.registerTool(
    "guardian_ooc_consult",
    {
      title: "Guardian OOC Consult",
      description: [
        "Ask Guardian an out-of-character continuity, fact-checking, scene-planning, or memory-update question.",
        "Guardian retrieves story memory, optionally verifies exact facts, and returns OOC guidance.",
        "This tool must not write Scarlett prose. It is for support, review, and planning."
      ].join(" "),
      inputSchema: z.object({
        question: z.string().min(3).describe("The OOC Guardian question to answer."),
        latest_user_message: z.string().optional().describe("Optional latest Benjamin/user message to review."),
        recent_context: z.string().optional().describe("Optional compact context from the current thread."),
        mode: z.enum(["continuity_review", "fact_check", "scene_planning", "memory_update_review"]).default("continuity_review"),
        force_full_retrieval: z.boolean().default(false)
      })
    },
    async (args) => {
      const report = await runGuardianOocConsult(args, ragClient, config);
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

// Basic CORS to prevent browser bridge blocks
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "scarlett-guardian-mcp",
    version: "0.1.0"
  });
});

function hasValidBearerToken(req: express.Request): boolean {
  if (config.GUARDIAN_MCP_BEARER_TOKEN) {
    const expected = `Bearer ${config.GUARDIAN_MCP_BEARER_TOKEN}`;
    return req.header("authorization") === expected;
  }

  return true;
}

function requireGuardianAuth(req: express.Request, res: express.Response): boolean {
  if (!hasValidBearerToken(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

app.post("/preflight", async (req, res) => {
  if (!requireGuardianAuth(req, res)) return;

  const parsed = PreflightInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid preflight request",
      issues: parsed.error.issues
    });
    return;
  }

  try {
    const report = await runGuardianPreflight(parsed.data, ragClient, config);
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: "Guardian preflight failed",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/mcp", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;

  res.json({
    ok: true,
    name: "scarlett-guardian-mcp",
    version: "0.1.0",
    message: "Guardian MCP is running. Send MCP JSON-RPC requests with POST."
  });
});

app.post("/mcp", async (req, res) => {
  if (!requireGuardianAuth(req, res)) return;

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

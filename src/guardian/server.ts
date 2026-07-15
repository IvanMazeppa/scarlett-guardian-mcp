import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getConfig } from "./config.js";
import { RagMcpClient } from "./rag-client.js";
import { compileGrokBrief } from "./report/compile-grok-brief.js";
import {
  loadTelemetryEvents,
  summarizeTelemetryEvents,
  telemetryHealth
} from "./telemetry-aggregate.js";
import { runGuardianOocConsult } from "./tools/ooc-consult.js";
import { runGuardianPreflight } from "./tools/preflight.js";

const config = getConfig();
const ragClient = new RagMcpClient(config);

const PreflightInputSchema = z.object({
  // Duplex field listed first so models attend to it when building tool args.
  scarlett_previous_message: z
    .string()
    .optional()
    .describe(
      [
        "CRITICAL MANDATORY FIELD for full-duplex Guardian audit (except the very first Scarlett turn of a brand-new thread).",
        "You MUST copy your EXACT previous in-character Scarlett reply (the full prior Scarlett message you wrote) and paste it here as plain text.",
        "Do not summarize, truncate to one sentence, or invent a stand-in.",
        "If you skip this field, Director's Correction cannot run and continuity quality drops.",
        "Only omit when Scarlett has never spoken yet in this thread."
      ].join(" ")
    ),
  user_message: z.string().min(1).describe("Raw latest Benjamin/user message that Scarlett would respond to."),
  recent_context: z
    .string()
    .optional()
    .describe(
      "Compact recap of the live scene (where/when/who/mood). Prefer real continuity language; never pass placeholders like 'None yet, establishing scene'."
    ),
  force_full_retrieval: z
    .boolean()
    .default(false)
    .describe("If true, run broader targeted memory searches (up to 3) for high-risk or diagnostic turns.")
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
        "Call this BEFORE any in-character Scarlett prose every turn.",
        "ARGUMENT CHECKLIST (fill all that apply):",
        "(1) scarlett_previous_message = CRITICAL: paste your EXACT previous Scarlett IC reply in full (mandatory after Scarlett has spoken once).",
        "(2) user_message = Benjamin's latest raw turn (required).",
        "(3) recent_context = short live where/when/who/mood recap (recommended).",
        "(4) force_full_retrieval = true only for arc-critical/diagnostic turns.",
        "Guardian retrieves story memory, may expand/verify, and returns one prose-facing continuity brief.",
        "If proceed_recommendation is do_not_proceed, do not write IC prose.",
        "Never skip this tool for narrative flow or momentum."
      ].join(" "),
      inputSchema: PreflightInputSchema
    },
    async (args) => {
      const report = await runGuardianPreflight(args, ragClient, config);
      // Prose-facing brief only — no tool_calls, no RAG meta dialect.
      const markdownReport = compileGrokBrief(report);

      // Save report to disk for user review
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const reportDir = path.join(process.cwd(), "docs", "guardian-reports");
        await fs.mkdir(reportDir, { recursive: true });

        // Full debug JSON (includes tool_calls)
        await fs.writeFile(path.join(reportDir, `preflight-full-${timestamp}.json`), JSON.stringify(report, null, 2), "utf8");

        // Streamlined markdown Grok actually sees
        await fs.writeFile(path.join(reportDir, `preflight-streamlined-${timestamp}.md`), markdownReport, "utf8");
      } catch (err) {
        console.error("Failed to save Guardian report to disk:", err);
      }

      return {
        content: [{
          type: "text",
          text: markdownReport
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
      const { tool_calls, ...grokReport } = report;
      return {
        content: [{
          type: "text",
          text: JSON.stringify(grokReport, null, 2)
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

// Static dashboard (WP-1.7) — same auth as other Guardian routes when bearer set
const publicDir = path.join(process.cwd(), "public");
app.use(express.static(publicDir, { index: false }));

app.get("/dashboard", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/telemetry/api/health", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  try {
    res.json(telemetryHealth());
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/telemetry/api/summary", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days ?? 7) || 7));
    const events = loadTelemetryEvents({ days });
    res.json(summarizeTelemetryEvents(events, { days }));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/telemetry/api/recent", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days ?? 7) || 7));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20) || 20));
    const events = loadTelemetryEvents({ days, limit });
    res.json({ days, limit, events });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
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

app.get("/mcp-v2", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;

  res.json({
    ok: true,
    name: "rag-proxy",
    message: "Proxy to RAG MCP is running. Send MCP JSON-RPC requests with POST."
  });
});

app.post("/mcp-v2", async (req, res) => {
  if (!requireGuardianAuth(req, res)) return;

  try {
    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (req.headers.accept) {
      proxyHeaders["Accept"] = req.headers.accept as string;
    }

    if (config.RAG_MCP_BEARER_TOKEN) {
      proxyHeaders["Authorization"] = `Bearer ${config.RAG_MCP_BEARER_TOKEN}`;
    }

    const response = await fetch(config.RAG_MCP_URL, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify(req.body)
    });
    
    // Pass headers
    response.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });
    
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: "RAG proxy request failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

app.listen(config.GUARDIAN_PORT, config.GUARDIAN_HOST, () => {
  console.log(`Scarlett Guardian MCP listening on http://${config.GUARDIAN_HOST}:${config.GUARDIAN_PORT}/mcp`);
  console.log(`Dashboard: http://${config.GUARDIAN_HOST}:${config.GUARDIAN_PORT}/dashboard`);
  console.log(`Forwarding retrieval calls to ${config.RAG_MCP_URL}`);
});

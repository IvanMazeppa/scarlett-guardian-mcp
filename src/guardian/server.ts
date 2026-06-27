import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
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
      
      // Strip raw tool_calls before sending to Grok to save token budget
      const { tool_calls, ...grokReport } = report;

      // Convert to Markdown template requested by Grok
      const statusText = grokReport.proceed_recommendation === 'proceed' ? 'Proceed' : 
                         grokReport.proceed_recommendation === 'proceed_with_caution' ? 'Proceed with Caution' : 'Do Not Proceed';
      
      let markdownReport = `**Status:** ${statusText} (Confidence: ${grokReport.confidence_score}%)\n`;
      markdownReport += `**Scene Summary:** ${grokReport.current_state_summary}\n\n`;
      
      markdownReport += `**Recent Emotional & Relational Context:**\n`;
      markdownReport += `- ${grokReport.emotional_tone_guidance}\n\n`;

      markdownReport += `**Key Facts to Ground In:**\n`;
      const flags = grokReport.hard_flags.slice(0, 6);
      if (flags.length > 0) {
        flags.forEach(flag => markdownReport += `- ${flag}\n`);
      } else {
        markdownReport += `- No hard flags detected.\n`;
      }
      markdownReport += `\n`;

      markdownReport += `**Relevant Precedents:**\n`;
      const precedents = grokReport.critical_precedents.slice(0, 2);
      if (precedents.length > 0) {
        precedents.forEach((p, i) => {
          markdownReport += `${i + 1}. **${p.topic}:** ${p.details.substring(0, 1000)}\n`;
        });
      } else {
        markdownReport += `None triggered.\n`;
      }
      markdownReport += `\n`;

      markdownReport += `**Things to Avoid:**\n`;
      grokReport.things_to_avoid.forEach(avoid => markdownReport += `- ${avoid}\n`);
      markdownReport += `\n`;

      markdownReport += `**Open Threads / Notes:**\n`;
      const threads = grokReport.open_threads.slice(0, 3);
      if (threads.length > 0) {
        threads.forEach(t => markdownReport += `- ${t}\n`);
      } else {
        markdownReport += `- No active open threads flagged.\n`;
      }
      markdownReport += `\n`;

      if (grokReport.expanded_contexts && grokReport.expanded_contexts.length > 0) {
        markdownReport += `**Optional Deep Context:**\n`;
        grokReport.expanded_contexts.slice(0, 1).forEach(ctx => {
          if (ctx.expanded_results && ctx.expanded_results.length > 0) {
            markdownReport += `- *${ctx.expanded_results[0].section}:* ${ctx.expanded_results[0].text.substring(0, 1000)}\n`;
          }
        });
      }

      // Save report to disk for user review
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const reportDir = path.join(process.cwd(), "docs", "guardian-reports");
        await fs.mkdir(reportDir, { recursive: true });
        
        // Save the massive full debug report
        await fs.writeFile(path.join(reportDir, `preflight-full-${timestamp}.json`), JSON.stringify(report, null, 2), "utf8");
        
        // Save the tiny markdown version that actually gets sent to Grok
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
  console.log(`Forwarding retrieval calls to ${config.RAG_MCP_URL}`);
});

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
  summarizeNarrativeTelemetry,
  telemetryHealth
} from "./telemetry-aggregate.js";
import {
  isLorePackId,
  isSceneModeId,
  readMissionControlState,
  writeMissionControlState
} from "./mission-control.js";
import { listLorePacks } from "./lore-packs.js";
import { readLocationProgress } from "./location-progress.js";
import { readLiveBeatFromDisk } from "./live-beat-snapshot.js";
import { runGuardianOocConsult } from "./tools/ooc-consult.js";
import { runGuardianPreflight } from "./tools/preflight.js";
import {
  DEFAULT_DUPLEX_MIN_CHARS,
  duplexCache,
  isSubstantialDuplexMessage,
  storeDuplexMessage
} from "./duplex-cache.js";

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
        "Only omit when Scarlett has never spoken yet in this thread.",
        "Optional automation: the browser shadow bridge may POST Scarlett's last reply to /duplex-cache; if this field is empty, Guardian fills it from that cache."
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
    .describe("If true, run broader targeted memory searches (up to 3) for high-risk or diagnostic turns."),
  thread_key: z
    .string()
    .optional()
    .describe(
      "Optional conversation/thread id for duplex cache disambiguation when multiple Grok threads are active."
    )
});

const DuplexCacheBodySchema = z.object({
  scarlett_message: z
    .string()
    .min(1)
    .describe("Full Scarlett IC reply scraped from the browser (WP-R1: substantial narrative only)."),
  thread_key: z.string().optional().describe("Grok conversation id or 'default'."),
  content_hash: z.string().optional().describe("Optional sha256 of normalized text (server recomputes if omitted)."),
  captured_at: z.number().int().optional().describe("Optional epoch ms capture time.")
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

// Mission Control dashboard — authenticated routes only (no world-readable static leak).
const publicDir = path.join(process.cwd(), "public");

app.get("/dashboard", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/dashboard.js", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  res.type("application/javascript");
  res.sendFile(path.join(publicDir, "dashboard.js"));
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
    // WP-R3: default live-only; ?sources=all|live,eval,backfill
    const sourcesRaw = typeof req.query.sources === "string" ? req.query.sources : "live";
    const sources =
      sourcesRaw === "all"
        ? ("all" as const)
        : (sourcesRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s === "live" || s === "eval" || s === "backfill") as Array<
            "live" | "eval" | "backfill"
          >);
    res.json(
      summarizeTelemetryEvents(events, {
        days,
        sources: sources.length ? sources : ["live"]
      })
    );
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/telemetry/api/narrative", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days ?? 7) || 7));
    const events = loadTelemetryEvents({ days });
    const sourcesRaw = typeof req.query.sources === "string" ? req.query.sources : "live";
    const sources =
      sourcesRaw === "all"
        ? ("all" as const)
        : (sourcesRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s === "live" || s === "eval" || s === "backfill") as Array<
            "live" | "eval" | "backfill"
          >);
    res.json(
      summarizeNarrativeTelemetry(events, {
        days,
        sources: sources.length ? sources : ["live"]
      })
    );
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

const ControlStateBodySchema = z.object({
  sceneMode: z.string().optional(),
  lorePack: z.string().optional()
});

app.get("/control/state", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  try {
    const state = readMissionControlState();
    const loc = readLocationProgress();
    const liveBeat = readLiveBeatFromDisk();
    res.json({
      ok: true,
      ...state,
      /**
       * Story calendar — from current-state.md LIVE BEAT only.
       * Never use wall-clock / real-world "today" for narrative time.
       */
      live_beat: {
        story_clock: liveBeat.storyClock,
        time_in_story: liveBeat.timeLine,
        last_updated: liveBeat.lastUpdated,
        location: liveBeat.locationLine,
        present: liveBeat.presentCast,
        source_path: liveBeat.sourcePath
          ? path.relative(process.cwd(), liveBeat.sourcePath)
          : null
      },
      location: loc
        ? {
            fingerprint: loc.fingerprint,
            consecutiveTurns: loc.consecutiveTurns,
            locationLine: loc.locationLine,
            /** Wall-clock when the streak sidecar was written (ops only). */
            updatedAt: loc.updatedAt
          }
        : null
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/control/state", async (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  const parsed = ControlStateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid control state", issues: parsed.error.issues });
    return;
  }
  if (parsed.data.sceneMode != null && !isSceneModeId(parsed.data.sceneMode)) {
    res.status(400).json({ error: `Invalid sceneMode: ${parsed.data.sceneMode}` });
    return;
  }
  if (parsed.data.lorePack != null && !isLorePackId(parsed.data.lorePack)) {
    res.status(400).json({ error: `Invalid lorePack: ${parsed.data.lorePack}` });
    return;
  }
  try {
    const next = await writeMissionControlState({
      ...(parsed.data.sceneMode ? { sceneMode: parsed.data.sceneMode } : {}),
      ...(parsed.data.lorePack ? { lorePack: parsed.data.lorePack } : {})
    });
    console.log(
      `${Date.now()} Mission Control state: mode=${next.sceneMode} lore=${next.lorePack}`
    );
    res.json({ ok: true, ...next });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/control/lore-packs", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  res.json({
    ok: true,
    packs: listLorePacks().map((p) => ({ id: p.id, label: p.label }))
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

/**
 * WP-3.1 shadow sidecar: browser bridge POSTs Scarlett's last reply here.
 * Preflight merges from cache when scarlett_previous_message is omitted (caller wins).
 */
app.post("/duplex-cache", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;

  const parsed = DuplexCacheBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid duplex-cache request",
      issues: parsed.error.issues
    });
    return;
  }

  // WP-R1: early structure check so clients get a clear 422 (not a generic 400).
  const floor = isSubstantialDuplexMessage(parsed.data.scarlett_message, DEFAULT_DUPLEX_MIN_CHARS);
  if (!floor.ok) {
    console.warn(
      `${Date.now()} Duplex cache reject: ${floor.reason} chars=${parsed.data.scarlett_message.trim().length}`
    );
    res.status(422).json({
      ok: false,
      error: "scarlett_message rejected (WP-R1 substantial floor)",
      reason: floor.reason,
      min_chars: DEFAULT_DUPLEX_MIN_CHARS
    });
    return;
  }

  try {
    const entry = storeDuplexMessage({
      scarlettMessage: parsed.data.scarlett_message,
      threadKey: parsed.data.thread_key,
      contentHash: parsed.data.content_hash,
      nowMs: parsed.data.captured_at,
      minChars: DEFAULT_DUPLEX_MIN_CHARS,
      requireStructure: true
    });
    console.log(
      `${Date.now()} Duplex cache set: thread=${entry.threadKey} chars=${entry.scarlettMessage.length} hash=${entry.contentHash.slice(0, 12)}`
    );
    res.json({
      ok: true,
      thread_key: entry.threadKey,
      chars: entry.scarlettMessage.length,
      hash: entry.contentHash,
      ttl_ms: config.GUARDIAN_DUPLEX_CACHE_TTL_MS
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/** Observability only — no message bodies. */
app.get("/duplex-cache", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  res.json({
    ok: true,
    entries: duplexCache.size(),
    ttl_ms: config.GUARDIAN_DUPLEX_CACHE_TTL_MS,
    threads: duplexCache.stats(),
    note: "MCP preflight with no thread_key uses newest fresh entry (capturedAt DESC)."
  });
});

/**
 * Clear duplex cache (WP-3.4 ops). Optional ?thread_key= to drop one thread only.
 * DELETE /duplex-cache  or  DELETE /duplex-cache?thread_key=...
 */
app.delete("/duplex-cache", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  const threadKey =
    typeof req.query.thread_key === "string"
      ? req.query.thread_key
      : typeof req.body?.thread_key === "string"
        ? req.body.thread_key
        : undefined;
  const removed = duplexCache.clear(threadKey);
  console.log(
    `${Date.now()} Duplex cache clear: removed=${removed}${threadKey ? ` thread=${threadKey}` : " (all)"}`
  );
  res.json({
    ok: true,
    removed,
    scope: threadKey ? "thread" : "all",
    thread_key: threadKey ?? null,
    entries_remaining: duplexCache.size()
  });
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

const httpServer = app.listen(config.GUARDIAN_PORT, config.GUARDIAN_HOST, () => {
  console.log(`Scarlett Guardian MCP listening on http://${config.GUARDIAN_HOST}:${config.GUARDIAN_PORT}/mcp`);
  console.log(`Mission Control: http://${config.GUARDIAN_HOST}:${config.GUARDIAN_PORT}/dashboard`);
  console.log(`Forwarding retrieval calls to ${config.RAG_MCP_URL}`);
  console.log("(leave this terminal open — Ctrl+C to stop)");
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${config.GUARDIAN_PORT} is already in use — another Guardian (or process) is bound there.`
    );
    console.error("That is why the shell prompt returns immediately instead of staying attached.");
    console.error("Free the port, then run npm run dev again:\n");
    console.error(`  fuser -k ${config.GUARDIAN_PORT}/tcp`);
    console.error(`  # or: ss -tlnp | rg ${config.GUARDIAN_PORT}`);
    console.error(`  # or: pkill -f 'tsx src/guardian/server.ts'\n`);
    process.exit(1);
  }
  console.error("Guardian HTTP server failed to start:", err);
  process.exit(1);
});

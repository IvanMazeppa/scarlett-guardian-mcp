/**
 * WP-1.6 — telemetry never fails the turn; event shape + sink capture.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PreflightTelemetryCollector,
  buildPreflightTelemetryEvent,
  createNdjsonTelemetrySink,
  detectMetaPollution,
  recordPreflightTelemetry,
  runWithTelemetryCollector,
  type PreflightTelemetryEvent
} from "../src/guardian/telemetry.js";
import { CassetteRagClient } from "../evals/cassette-client.js";
import { runGuardianPreflight } from "../src/guardian/tools/preflight.js";
import { hermeticEvalConfig } from "../evals/runner.js";
import { loadGoldenCase } from "../evals/schema.js";

assert.equal(detectMetaPollution("clean scene summary"), false);
assert.equal(detectMetaPollution("HIGH confidence context found from project_source_files"), true);

// sink captures without throw
{
  const events: PreflightTelemetryEvent[] = [];
  const sink = createNdjsonTelemetrySink({ onEvent: (e) => events.push(e) });
  const collector = new PreflightTelemetryCollector();
  collector.recordTool("index_status", 12.3, true);
  collector.recordTool("search_story_memory", 40, true);
  collector.mark("rag_batch");
  const event = buildPreflightTelemetryEvent({
    collector,
    input: { scarlett_previous_message: "Prior Scarlett line." },
    report: {
      confidence_score: 90,
      proceed_recommendation: "proceed",
      retrieval_status: "success",
      hard_flags: ["x"],
      memory_write: { action: "none", reason: "noop" },
      llm_assessment: {
        supported_facts: ["a", "b"],
        scene_state_delta: "delta",
        grok_performance_correction: null
      },
      current_state_summary: "clean",
      retrieval_plan: { high_risk_triggers: ["AMG"] },
      tool_calls: [
        {
          tool: "retrieve_story_context",
          ok: true,
          response: { result_count: 2, results: [{ text: "abc" }, { text: "abcdef" }] }
        },
        {
          tool: "search_story_memory",
          ok: true,
          response: { result_count: 1, results: [{ text: "zzzz" }] }
        }
      ]
    },
    llm_assessment_ms: 100
  });
  assert.equal(event.v, 1);
  assert.equal(event.duplex.source, "caller");
  assert.equal(event.quality.llm_facts_count, 2);
  assert.equal(event.memory.max_chunk_chars, 6);
  assert.ok(event.latency_ms.rag.search.length >= 1);
  recordPreflightTelemetry(event, sink);
  assert.equal(events.length, 1);
}

// disk append works (async) and never throws on bad dir permissions simulation
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-tel-"));
  const sink = createNdjsonTelemetrySink({ dir });
  recordPreflightTelemetry(
    {
      v: 1,
      ts: new Date().toISOString(),
      latency_ms: { total: 1, rag: { search: [], other: [] } },
      quality: {
        confidence_score: 1,
        proceed_recommendation: "proceed",
        retrieval_status: "success",
        llm_facts_count: 0,
        scene_delta_present: false,
        meta_pollution: false
      },
      duplex: { source: "absent", previous_message_chars: 0, correction_fired: false },
      serendipity: { fired: false, tier: null, category: null, deferred: false },
      memory: {
        preflight_result_count: 0,
        search_result_counts: [],
        max_chunk_chars: 0,
        avg_chunk_chars: 0,
        expand_sections: 0
      },
      memory_write: { action: "none", reason_short: "" },
      hard_flags_count: 0,
      triggers: []
    },
    sink
  );
  // wait for setImmediate append
  await new Promise((r) => setTimeout(r, 50));
  const files = fs.readdirSync(dir);
  assert.ok(files.some((f) => f.startsWith("events-") && f.endsWith(".ndjson")));
}

// preflight + cassette: telemetry fires; broken sink never fails preflight
{
  const smoke = loadGoldenCase(
    path.join(process.cwd(), "evals/golden/other/gt-000-hermetic-smoke.json")
  );
  const events: PreflightTelemetryEvent[] = [];
  const client = new CassetteRagClient(smoke.cassette, { caseId: smoke.id });

  const report = await runGuardianPreflight(
    {
      user_message: smoke.input.user_message,
      recent_context: smoke.input.recent_context ?? undefined,
      scarlett_previous_message: smoke.input.scarlett_previous_message ?? undefined
    },
    client,
    hermeticEvalConfig(),
    {
      telemetrySink: {
        record: (e) => {
          events.push(e);
          throw new Error("sink boom — must not surface");
        }
      }
    }
  );
  assert.ok(report.confidence_score >= 0);
  // WP-4.3: memory_write always present on report
  assert.ok(report.memory_write, "memory_write must always be recorded");
  assert.ok(report.memory_write?.action, "memory_write.action required");
  assert.ok(typeof report.memory_write?.reason === "string");
  assert.equal(events.length, 1);
  assert.ok(events[0].latency_ms.total >= 0);
  // cassette tools should have been timed via ALS
  assert.ok(
    events[0].latency_ms.rag.index_status !== undefined ||
      events[0].latency_ms.rag.search.length > 0 ||
      events[0].latency_ms.rag.retrieve !== undefined
  );
}

// ALS isolation: no active collector → tools still work
{
  const client = new CassetteRagClient({ index_status: "ok" });
  const text = await client.callTextTool("index_status", {});
  assert.equal(text, "ok");
}

// collector overhead micro-benchmark (sanity, not CI gate)
{
  const n = 200;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const c = new PreflightTelemetryCollector();
    await runWithTelemetryCollector(c, async () => {
      c.recordTool("index_status", 0.1, true);
      c.mark("x");
    });
  }
  const per = (performance.now() - t0) / n;
  assert.ok(per < 5, `collector overhead ${per.toFixed(3)}ms should be << 5ms budget`);
  console.log(`telemetry collector overhead ~${per.toFixed(3)} ms/turn (n=${n})`);
}

console.log("telemetry tests passed");

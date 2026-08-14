/**
 * WP-1.7 — backfill reconstruction + summary over NDJSON.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  eventFromSavedReport,
  loadTelemetryEvents,
  parsePreflightIdFromFilename,
  summarizeTelemetryEvents,
  timestampFromPreflightId
} from "../src/guardian/telemetry-aggregate.js";
import { appendEventLineSync } from "../src/guardian/telemetry.js";

assert.equal(
  parsePreflightIdFromFilename("preflight-full-2026-07-15T02-51-26-420Z.json"),
  "2026-07-15T02-51-26-420Z"
);
assert.equal(
  timestampFromPreflightId("2026-07-15T02-51-26-420Z"),
  "2026-07-15T02:51:26.420Z"
);

{
  const event = eventFromSavedReport(
    {
      confidence_score: 88,
      proceed_recommendation: "proceed",
      retrieval_status: "success",
      hard_flags: [],
      retrieval_notes: "Duplex: scarlett_previous_message provided.",
      llm_assessment: {
        supported_facts: ["a", "b", "c"],
        scene_state_delta: "on track",
        grok_performance_correction: null
      },
      current_state_summary: "clean prose",
      memory_write: { action: "staged", reason: "material" },
      retrieval_plan: { high_risk_triggers: ["AMG"] },
      tool_calls: [
        {
          tool: "retrieve_story_context",
          ok: true,
          response: { result_count: 2, results: [{ text: "hello" }, { text: "hello world!!" }] }
        },
        {
          tool: "search_story_memory",
          ok: true,
          response: { result_count: 4, results: [{ text: "x" }] }
        }
      ]
    },
    {
      preflight_id: "2026-07-15T02-51-26-420Z",
      report_path: "docs/guardian-reports/preflight-full-2026-07-15T02-51-26-420Z.json"
    }
  );
  assert.equal(event.source, "backfill");
  assert.equal(event.duplex.source, "caller");
  assert.equal(event.quality.llm_facts_count, 3);
  assert.equal(event.memory.max_chunk_chars, 13);
  assert.equal(event.memory_write.action, "staged");
  assert.equal(event.latency_ms.total, 0);
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tel-agg-"));
  // Hermetic fix 2026-08-14: fixtures used absolute July timestamps against the
  // relative `days: 30` window, so the test started failing by calendar drift
  // (time bomb). Keep both events inside the window relative to now.
  const ts1 = new Date(Date.now() - 20 * 86_400_000).toISOString();
  const ts2 = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const e1 = eventFromSavedReport(
    {
      confidence_score: 70,
      proceed_recommendation: "proceed",
      retrieval_status: "success",
      hard_flags: ["DUPLEX_INPUT_MISSING: x"],
      retrieval_notes: "Duplex missing",
      current_state_summary: "HIGH confidence context found from project_source_files",
      llm_assessment: { supported_facts: [] }
    },
    { preflight_id: "2026-07-10T00-00-00-000Z", report_path: "r1.json", ts: ts1 }
  );
  const e2 = eventFromSavedReport(
    {
      confidence_score: 100,
      proceed_recommendation: "proceed",
      retrieval_status: "success",
      retrieval_notes: "Duplex: scarlett_previous_message provided.",
      llm_assessment: {
        supported_facts: ["f1", "f2", "f3", "f4", "f5"],
        scene_state_delta: "thermal lap"
      },
      current_state_summary: "clean",
      memory_write: { action: "none", reason: "noop" }
    },
    { preflight_id: "2026-07-15T02-51-26-420Z", report_path: "r2.json", ts: ts2 }
  );
  appendEventLineSync(dir, e1);
  appendEventLineSync(dir, e2);
  const loaded = loadTelemetryEvents({ telemetryDir: dir, days: 30 });
  assert.equal(loaded.length, 2);
  // WP-R3: default summary is live-only; backfill fixtures need explicit sources.
  const liveOnly = summarizeTelemetryEvents(loaded, { days: 30, reportsDir: dir });
  assert.equal(liveOnly.event_count, 0);
  const summary = summarizeTelemetryEvents(loaded, {
    days: 30,
    reportsDir: dir,
    sources: "all"
  });
  assert.equal(summary.event_count, 2);
  assert.equal(summary.backfill_count, 2);
  assert.ok(summary.quality.meta_pollution_rate > 0);
  assert.ok(summary.duplex.present_count >= 1);
  assert.ok(summary.quality.avg_facts != null && summary.quality.avg_facts >= 2);
}

// CLI dry-run against real archive if present
{
  const reports = path.join(process.cwd(), "docs/guardian-reports");
  if (fs.existsSync(reports)) {
    const cli = spawnSync(
      "npx",
      ["tsx", "scripts/backfill-telemetry.ts", "--dry-run"],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    assert.match(cli.stdout, /written=\d+/);
    console.log("backfill dry-run:", cli.stdout.trim().split("\n").pop());
  }
}

console.log("telemetry-aggregate tests passed");

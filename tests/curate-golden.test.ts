/**
 * WP-1.2 — curate-golden extractor unit tests + live report smoke.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  SKELETON_META_MUST_NOT_INCLUDE,
  buildCassetteFromToolCalls,
  curateGoldenFromReport,
  extractInputFromReport,
  suggestGoldenId
} from "../evals/curate-from-report.js";
import { CassetteRagClient } from "../evals/cassette-client.js";
import { loadGoldenCase } from "../evals/schema.js";

const sampleReport = {
  retrieval_plan: {
    preflight_query:
      "current scene state Scarlett Benjamin emotional tone open threads; recent context: On the pit wall after out lap.; Benjamin turn: I key the private radio and say drive safe älskling.",
    memory_queries: [
      "Germany trip Nuerburgring paddock",
      "public visibility jealousy",
      "third depth query"
    ],
    high_risk_triggers: ["AMG, Black Series, Nuerburgring, paddock, or race-suit"]
  },
  tool_calls: [
    { tool: "index_status", arguments: {}, ok: true, response: "Active Vector Store ID: vs_x" },
    {
      tool: "search_story_memory",
      arguments: { query: "q1", max_results: 10 },
      ok: true,
      response: { query: "q1", results: [{ text: "a" }] }
    },
    {
      tool: "search_story_memory",
      arguments: { query: "q2", max_results: 10 },
      ok: true,
      response: { query: "q2", results: [{ text: "b" }] }
    },
    {
      tool: "retrieve_story_context",
      arguments: { query: "current scene" },
      ok: true,
      response: { status: "ok", results: [{ text: "pit wall" }] }
    },
    {
      tool: "stage_story_update",
      arguments: { target_source_file: "project_source_files/current-state.md" },
      ok: true,
      response: { success: true, staged_update: { id: "pending-x" } }
    },
    {
      tool: "search_story_memory",
      arguments: { query: "failed" },
      ok: false,
      error: "timeout"
    }
  ],
  llm_assessment: {
    enabled: true,
    model: "gpt-test",
    supported_facts: ["fact one"],
    scene_state_delta: "still on thermal lap",
    grok_performance_correction: null,
    memory_write: { action: "stage", reason: "test" }
  },
  memory_write: { action: "staged", reason: "stage preferred" },
  retrieval_notes:
    "Tool calls attempted: index_status:ok. Duplex: scarlett_previous_message provided.",
  grok_scene_summary: "Pit wall radio after out lap.",
  hard_flags: []
};

// extract input
{
  const input = extractInputFromReport(sampleReport);
  assert.match(input.user_message, /private radio/);
  assert.match(String(input.recent_context), /pit wall/);
  assert.equal(input.force_full_retrieval, true);
  assert.equal(input.scarlett_previous_message, null);
  assert.equal(input.duplex_noted_but_text_missing, true);
  assert.ok(input.parse_notes.some((n) => /user_message/.test(n)));
}

// cassette FIFO + skip failed
{
  const cassette = buildCassetteFromToolCalls(sampleReport.tool_calls);
  assert.equal(typeof cassette.index_status, "string");
  assert.ok(Array.isArray(cassette.search_story_memory));
  assert.equal((cassette.search_story_memory as unknown[]).length, 2);
  assert.ok(!Array.isArray(cassette.retrieve_story_context));

  const client = new CassetteRagClient(cassette, { caseId: "gt-test" });
  const m1 = await client.callJsonTool<{ query: string }>("search_story_memory", {
    query: "anything"
  });
  assert.equal(m1.query, "q1");
  const m2 = await client.callJsonTool<{ query: string }>("search_story_memory", {
    query: "anything"
  });
  assert.equal(m2.query, "q2");
}

// full curate + schema validate
{
  const { golden, duplex_noted_but_text_missing } = curateGoldenFromReport(sampleReport, {
    category: "write-back",
    sourceReportPath: "/tmp/preflight-full-2026-07-15T02-51-26-420Z.json",
    sequence: 40
  });
  assert.equal(golden.category, "write-back");
  assert.match(golden.id, /^gt-040-write-back-/);
  assert.equal(golden.expectations.write_action_expected, "stage");
  assert.equal(golden.expectations.correction_expected, "none");
  assert.ok(
    SKELETON_META_MUST_NOT_INCLUDE.every((s) =>
      golden.expectations.brief_must_not_include.includes(s)
    )
  );
  assert.equal(golden.expectations.brief_must_include.length, 0);
  assert.ok(golden.frozen_llm_assessment);
  assert.equal(duplex_noted_but_text_missing, true);
  assert.equal(golden.source_report, "preflight-full-2026-07-15T02-51-26-420Z.json");
}

// id helper
{
  const id = suggestGoldenId(
    "temporal-mud",
    "preflight-full-2026-07-13T02-10-02-038Z.json",
    25
  );
  assert.equal(id, "gt-025-temporal-mud-20260713-021002");
}

// missing Benjamin turn throws
{
  assert.throws(
    () =>
      extractInputFromReport({
        retrieval_plan: { preflight_query: "no turn marker here" }
      }),
    /Cannot extract user_message/
  );
}

// CLI against real archive report (if present)
{
  const realReport = path.join(
    process.cwd(),
    "docs/guardian-reports/preflight-full-2026-07-15T02-51-26-420Z.json"
  );
  if (fs.existsSync(realReport)) {
    const tmpOut = path.join(os.tmpdir(), `gt-cli-smoke-${Date.now()}.json`);
    const cli = spawnSync(
      "npx",
      [
        "tsx",
        "scripts/curate-golden.ts",
        realReport,
        "--category",
        "continuous-scene",
        "--id",
        "gt-001-cli-smoke-outlap",
        "--out",
        tmpOut,
        "--force"
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(cli.status, 0, `CLI failed: ${cli.stderr || cli.stdout}`);
    assert.match(cli.stdout, /wrote:/);
    assert.ok(fs.existsSync(tmpOut));
    const loaded = loadGoldenCase(tmpOut);
    assert.equal(loaded.id, "gt-001-cli-smoke-outlap");
    assert.ok(loaded.input.user_message.length > 20);
    assert.ok(loaded.cassette.search_story_memory);
    assert.ok(loaded.cassette.retrieve_story_context);
    // cassette plays without network
    const client = new CassetteRagClient(loaded.cassette, { caseId: loaded.id });
    const status = await client.callTextTool("index_status", {});
    assert.ok(status.length > 0);
    fs.unlinkSync(tmpOut);
    console.log("curate-golden CLI smoke on live report: ok");
  } else {
    console.log("curate-golden CLI smoke skipped (report archive not present)");
  }
}

console.log("curate-golden tests passed");

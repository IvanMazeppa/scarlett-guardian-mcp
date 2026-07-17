/**
 * WP-4.8 — L3 expectation scoring + majority vote + cassette reset (hermetic, no API).
 */
import assert from "node:assert/strict";
import {
  collapseAssertionsByName,
  evaluateL3Expectations,
  majorityVoteTrials,
  summarizeAssertions,
  type AssertionResult
} from "../evals/expectations.js";
import { CassetteRagClient } from "../evals/cassette-client.js";
import { parseGoldenCase } from "../evals/schema.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

function baseReport(
  overrides: Partial<GuardianReport> = {}
): GuardianReport {
  return {
    retrieval_status: "success",
    confidence_score: 80,
    proceed_recommendation: "proceed",
    current_state_summary: "Nordschleife pit wall thermal lap",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "focused",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    memory_write: { action: "none", reason: "noop" },
    llm_assessment: {
      enabled: true,
      model: "test",
      supported_facts: [
        "Scarlett is on track in the Black Panther",
        "Benjamin is on the pit wall",
        "Thermal lap for cooling extraction"
      ],
      scene_state_delta: "Thermal validation lap underway",
      grok_performance_correction: null
    },
    retrieval_plan: { preflight_query: "", memory_queries: [], high_risk_triggers: [] },
    tool_calls: [],
    ...overrides
  };
}

// --- evaluateL3Expectations: facts_min ---
{
  const golden = parseGoldenCase({
    id: "gt-950-l3-facts",
    category: "duplex",
    description: "unit",
    input: { user_message: "hi" },
    cassette: { index_status: "x" },
    expectations: {
      llm: { facts_min: 2, scene_delta_required: true }
    }
  });
  const ok = evaluateL3Expectations({ golden, report: baseReport() });
  assert.ok(ok.every((a) => a.pass), JSON.stringify(ok.filter((a) => !a.pass)));

  const low = evaluateL3Expectations({
    golden,
    report: baseReport({
      llm_assessment: {
        enabled: true,
        supported_facts: ["only one"],
        scene_state_delta: "delta",
        grok_performance_correction: null
      }
    })
  });
  assert.ok(low.some((a) => a.name === "llm.facts_min" && !a.pass));
  console.log("L3 facts_min + scene_delta: ok");
}

// --- facts_must_cover ---
{
  const golden = parseGoldenCase({
    id: "gt-951-l3-cover",
    category: "write-back",
    description: "unit",
    input: { user_message: "hi" },
    cassette: { index_status: "x" },
    expectations: {
      llm: {
        facts_must_cover: [["Black Panther", "AMG"], ["pit wall", "pit lane"]]
      }
    }
  });
  const pass = evaluateL3Expectations({ golden, report: baseReport() });
  assert.ok(pass.find((a) => a.name === "llm.facts_must_cover")?.pass);

  const fail = evaluateL3Expectations({
    golden,
    report: baseReport({
      llm_assessment: {
        enabled: true,
        supported_facts: ["Black Panther only — no pit"],
        grok_performance_correction: null
      }
    })
  });
  assert.ok(fail.find((a) => a.name === "llm.facts_must_cover" && !a.pass));
  console.log("L3 facts_must_cover: ok");
}

// --- duplex correction via L3 ---
{
  const required = parseGoldenCase({
    id: "gt-952-l3-corr-req",
    category: "duplex",
    description: "unit",
    input: { user_message: "hi" },
    cassette: { index_status: "x" },
    expectations: {
      correction_expected: "required",
      llm: { facts_min: 1 }
    }
  });
  const noCorr = evaluateL3Expectations({
    golden: required,
    report: baseReport()
  });
  assert.ok(noCorr.find((a) => a.name === "llm.correction_expected" && !a.pass));

  const withCorr = evaluateL3Expectations({
    golden: required,
    report: baseReport({
      llm_assessment: {
        enabled: true,
        supported_facts: ["x"],
        grok_performance_correction: "Stop mirroring — claim the private radio yourself."
      }
    })
  });
  assert.ok(withCorr.find((a) => a.name === "llm.correction_expected")?.pass);

  const noneExp = parseGoldenCase({
    id: "gt-953-l3-corr-none",
    category: "duplex",
    description: "unit",
    input: { user_message: "hi" },
    cassette: { index_status: "x" },
    expectations: {
      correction_expected: "none",
      llm: { facts_min: 0 }
    }
  });
  const noneOk = evaluateL3Expectations({ golden: noneExp, report: baseReport() });
  assert.ok(noneOk.find((a) => a.name === "llm.correction_expected")?.pass);
  console.log("L3 duplex correction required/none: ok");
}

// --- majorityVoteTrials ---
{
  const t1: AssertionResult[] = [
    { name: "a", pass: true, severity: "hard", detail: "t1" },
    { name: "b", pass: false, severity: "hard", detail: "t1" }
  ];
  const t2: AssertionResult[] = [
    { name: "a", pass: true, severity: "hard", detail: "t2" },
    { name: "b", pass: true, severity: "hard", detail: "t2" }
  ];
  const t3: AssertionResult[] = [
    { name: "a", pass: false, severity: "hard", detail: "t3" },
    { name: "b", pass: true, severity: "hard", detail: "t3" }
  ];
  // a: 2/3, b: 2/3 — both pass with need=2
  const voted = majorityVoteTrials([t1, t2, t3]);
  assert.equal(voted.trials, 3);
  assert.ok(voted.assertions.find((a) => a.name === "a")?.pass);
  assert.ok(voted.assertions.find((a) => a.name === "b")?.pass);
  assert.ok(voted.flaky.includes("a") && voted.flaky.includes("b"));
  assert.ok(summarizeAssertions(voted.assertions).passed);

  // 1/3 only for c → fail majority
  const sparse = majorityVoteTrials([
    [{ name: "c", pass: true, severity: "hard", detail: "1" }],
    [{ name: "c", pass: false, severity: "hard", detail: "2" }],
    [{ name: "c", pass: false, severity: "hard", detail: "3" }]
  ]);
  assert.equal(sparse.assertions[0]?.pass, false);

  // Multi-row same name within a trial must not inflate counts (6 bans → 1 vote)
  const multiRow = majorityVoteTrials([
    [
      { name: "brief_must_not_include", pass: true, severity: "hard", detail: "a" },
      { name: "brief_must_not_include", pass: true, severity: "hard", detail: "b" },
      { name: "brief_must_not_include", pass: true, severity: "hard", detail: "c" }
    ],
    [
      { name: "brief_must_not_include", pass: true, severity: "hard", detail: "a" },
      { name: "brief_must_not_include", pass: false, severity: "hard", detail: "leak" }
    ],
    [{ name: "brief_must_not_include", pass: true, severity: "hard", detail: "ok" }]
  ]);
  // trials: pass, fail, pass → 2/3
  assert.ok(multiRow.assertions.find((a) => a.name === "brief_must_not_include")?.pass);
  assert.match(
    multiRow.assertions.find((a) => a.name === "brief_must_not_include")!.detail,
    /^2\/3/
  );
  assert.ok(collapseAssertionsByName([
    { name: "x", pass: true, severity: "hard", detail: "1" },
    { name: "x", pass: false, severity: "hard", detail: "2" }
  ])[0]?.pass === false);
  console.log("majorityVoteTrials: ok");
}

// --- CassetteRagClient.reset replays FIFO ---
{
  const client = new CassetteRagClient(
    {
      search_story_memory: [
        { status: "ok", results: [{ text: "first" }] },
        { status: "ok", results: [{ text: "second" }] }
      ]
    },
    { caseId: "gt-reset" }
  );
  const a = await client.callJsonTool<{ results: { text: string }[] }>(
    "search_story_memory",
    { q: 1 }
  );
  assert.equal(a.results[0]?.text, "first");
  const b = await client.callJsonTool<{ results: { text: string }[] }>(
    "search_story_memory",
    { q: 2 }
  );
  assert.equal(b.results[0]?.text, "second");
  client.reset();
  const c = await client.callJsonTool<{ results: { text: string }[] }>(
    "search_story_memory",
    { q: 1 }
  );
  assert.equal(c.results[0]?.text, "first");
  assert.equal(client.hits.length, 1);
  console.log("CassetteRagClient.reset: ok");
}

console.log("\nAll eval-l3 tests passed.");

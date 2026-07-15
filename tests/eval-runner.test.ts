/**
 * WP-1.3 — expectation engine + L1 runner unit tests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateL1Expectations, matchesPhraseGroups, textMatches } from "../evals/expectations.js";
import {
  diffAgainstBaseline,
  hermeticEvalConfig,
  runL1Case,
  runL1Suite,
  suiteToBaseline
} from "../evals/runner.js";
import { loadGoldenCase, parseGoldenCase } from "../evals/schema.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

// phrase matching
assert.equal(textMatches("Hello Nordschleife night", "nordschleife"), true);
assert.equal(textMatches("abc", "/n[o0]rd/i"), false);
assert.equal(textMatches("Nordschleife", "/nordschleife/i"), true);
assert.equal(
  matchesPhraseGroups("out lap on the pit wall", [
    ["out lap", "shakedown"],
    ["pit wall", "pit lane"]
  ]),
  true
);
assert.equal(
  matchesPhraseGroups("out lap only", [["out lap"], ["pit wall", "pit lane"]]),
  false
);

const emptyReport = {
  retrieval_status: "success" as const,
  confidence_score: 80,
  proceed_recommendation: "proceed" as const,
  current_state_summary: "home evening",
  critical_precedents: [],
  expanded_contexts: [],
  fact_checks: [],
  emotional_tone_guidance: "warm",
  things_to_avoid: [],
  open_threads: [],
  hard_flags: [] as string[],
  retrieval_notes: "",
  memory_write: { action: "none" as const, reason: "noop" },
  llm_assessment: {
    enabled: true,
    grok_performance_correction: null
  },
  retrieval_plan: { preflight_query: "", memory_queries: [], high_risk_triggers: [] },
  tool_calls: []
} satisfies GuardianReport;

{
  const golden = parseGoldenCase({
    id: "gt-900-assert-unit",
    category: "other",
    description: "unit",
    input: { user_message: "hi" },
    cassette: { index_status: "x" },
    expectations: {
      brief_must_include: [["home"]],
      brief_must_not_include: ["search_story_memory"],
      flags_forbidden: ["MANDATORY_RETRIEVAL_FAILED"],
      correction_expected: "none",
      write_action_expected: "none",
      brief_chars: { min: 5, max: 100 }
    }
  });
  const assertions = evaluateL1Expectations({
    golden,
    brief: "Quiet home evening together.",
    report: emptyReport
  });
  assert.ok(assertions.every((a) => a.pass), JSON.stringify(assertions.filter((a) => !a.pass)));
}

{
  const golden = parseGoldenCase({
    id: "gt-901-meta-leak",
    category: "other",
    description: "unit",
    input: { user_message: "hi" },
    cassette: { index_status: "x" },
    expectations: {
      brief_must_not_include: ["search_story_memory"]
    }
  });
  const assertions = evaluateL1Expectations({
    golden,
    brief: "Call search_story_memory for more.",
    report: emptyReport
  });
  const leak = assertions.find((a) => a.name === "brief_must_not_include");
  assert.ok(leak && !leak.pass && leak.severity === "hard");
}

// live smoke golden from repo
{
  const smokePath = path.join(process.cwd(), "evals/golden/other/gt-000-hermetic-smoke.json");
  assert.ok(fs.existsSync(smokePath), "smoke golden missing");
  const gc = loadGoldenCase(smokePath);

  const off = await runL1Case(gc, { llmMode: "off", quiet: true, config: hermeticEvalConfig() });
  assert.equal(off.passed, true, JSON.stringify(off.assertions.filter((a) => !a.pass), null, 2));
  assert.ok(off.brief_chars >= 200);
  assert.equal(off.plan_drift, false);

  const frozen = await runL1Case(gc, {
    llmMode: "frozen",
    quiet: true,
    config: hermeticEvalConfig()
  });
  assert.equal(frozen.passed, true, JSON.stringify(frozen.assertions.filter((a) => !a.pass), null, 2));
}

// suite + baseline diff
{
  const suite = await runL1Suite({
    goldenRoot: path.join(process.cwd(), "evals/golden"),
    llmMode: "off",
    ids: ["gt-000-hermetic-smoke"],
    quiet: true
  });
  assert.equal(suite.case_count, 1);
  assert.equal(suite.failed_count, 0);
  assert.ok(suite.duration_ms < 30_000);

  const baseline = suiteToBaseline(suite, "test-baseline");
  const diffOk = diffAgainstBaseline(suite, baseline);
  assert.equal(diffOk.regressions.length, 0);

  const broken = {
    ...suite,
    cases: suite.cases.map((c) => ({ ...c, passed: false }))
  };
  const reg = diffAgainstBaseline(broken, baseline);
  assert.equal(reg.regressions.length, 1);
}

// empty root is green
{
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "golden-empty-"));
  const suite = await runL1Suite({
    goldenRoot: emptyRoot,
    llmMode: "off",
    quiet: true
  });
  assert.equal(suite.case_count, 0);
  assert.equal(suite.failed_count, 0);
}

console.log("eval-runner tests passed");

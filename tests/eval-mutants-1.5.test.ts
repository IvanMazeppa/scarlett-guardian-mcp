/**
 * WP-1.5 — Mutant self-test: reintroduce one historical defect per class;
 * confirm the L1 expectation engine turns red.
 *
 * Spec: master-roadmap WP-1.5; guardian-eval-harness-design §7 acceptance.
 * These mutants do NOT patch production code permanently — they inject bad
 * outputs against real golden expectations to prove the harness catches them.
 */
import assert from "node:assert/strict";
import path from "node:path";
import {
  evaluateL1Expectations,
  summarizeAssertions
} from "../evals/expectations.js";
import { loadGoldenCase } from "../evals/schema.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

function baseReport(over: Partial<GuardianReport> = {}): GuardianReport {
  return {
    retrieval_status: "success",
    confidence_score: 90,
    proceed_recommendation: "proceed",
    current_state_summary: "clean scene",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "warm",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    memory_write: { action: "none", reason: "noop" },
    llm_assessment: {
      enabled: true,
      grok_performance_correction: null
    },
    retrieval_plan: {
      preflight_query: "",
      memory_queries: [],
      high_risk_triggers: []
    },
    tool_calls: [],
    ...over
  };
}

function hardFails(assertions: ReturnType<typeof evaluateL1Expectations>) {
  return assertions.filter((a) => !a.pass && a.severity === "hard");
}

const goldenRoot = path.join(process.cwd(), "evals/golden");

// --- Mutant class 1: meta leak in brief (Jul empty-weave / meta era) ---
{
  const golden = loadGoldenCase(
    path.join(goldenRoot, "other/gt-010-empty-weave-eifel.json")
  );
  const brief =
    "HIGH confidence context found from project_source_files/current-state.md. " +
    "Call search_story_memory for more. rank_score=0.9 vector_store=vs_x";
  const assertions = evaluateL1Expectations({
    golden,
    brief,
    report: baseReport()
  });
  const fails = hardFails(assertions);
  assert.ok(
    fails.some((f) => f.name === "brief_must_not_include"),
    `meta-leak mutant must hard-fail must_not; got: ${JSON.stringify(fails)}`
  );
  assert.equal(summarizeAssertions(assertions).passed, false);
  console.log("mutant 1 meta-leak: caught");
}

// --- Mutant class 2: changing-room bleed on a track-era case (temporal mud) ---
{
  // Use a good track golden and add the temporal-mud trap patterns, then inject
  // a changing-room precedent as if selectors regressed.
  const golden = loadGoldenCase(
    path.join(goldenRoot, "continuous-scene/gt-001-first-lap-ask.json")
  );
  const mutantGolden = {
    ...golden,
    expectations: {
      ...golden.expectations,
      precedents_must_not_match: ["changing-room|lace|lace bra"]
    }
  };
  const cleanBrief =
    "Nordschleife out lap in the Black Panther. Pit wall radio. Clean prose.";
  const assertions = evaluateL1Expectations({
    golden: mutantGolden,
    brief: cleanBrief,
    report: baseReport({
      critical_precedents: [
        {
          topic: "Morning intimacy",
          details:
            "Private changing-room at paddock; lace bra discarded on the chair.",
          must_respect: "Do not resurrect as live beat on track."
        }
      ],
      grok_precedents: [
        {
          topic: "Morning intimacy",
          details: "changing-room lace bra beat",
          must_respect: "stale"
        }
      ]
    })
  });
  const fails = hardFails(assertions);
  assert.ok(
    fails.some((f) => f.name === "precedents_must_not_match"),
    `temporal-mud mutant must hard-fail precedents; got: ${JSON.stringify(fails)}`
  );
  assert.equal(summarizeAssertions(assertions).passed, false);
  console.log("mutant 2 temporal-mud/changing-room: caught");
}

// --- Mutant class 3: micro-log / unexpected write (write-back gate) ---
{
  const golden = loadGoldenCase(
    path.join(goldenRoot, "continuous-scene/gt-002-first-lap-live.json")
  );
  // Force a strict none expectation even if golden uses either/none
  const mutantGolden = {
    ...golden,
    expectations: {
      ...golden.expectations,
      write_action_expected: "none" as const
    }
  };
  const assertions = evaluateL1Expectations({
    golden: mutantGolden,
    brief:
      "Scarlett is on the first Nordschleife lap in the Black Panther. Clean brief.",
    report: baseReport({
      memory_write: {
        action: "staged",
        reason: "scene stays aligned micro-log spam"
      }
    })
  });
  const fails = hardFails(assertions);
  assert.ok(
    fails.some((f) => f.name === "write_action_expected"),
    `write-back mutant must hard-fail write_action; got: ${JSON.stringify(fails)}`
  );
  assert.equal(summarizeAssertions(assertions).passed, false);
  console.log("mutant 3 unexpected write/stage: caught");
}

// --- Mutant class 4: duplex correction suppressed when required ---
{
  const golden = loadGoldenCase(
    path.join(goldenRoot, "duplex/gt-040-thermal-lap-duplex-stage.json")
  );
  const mutantGolden = {
    ...golden,
    expectations: {
      ...golden.expectations,
      correction_expected: "required" as const
    }
  };
  const assertions = evaluateL1Expectations({
    golden: mutantGolden,
    brief:
      "Thermal lap on the Nordschleife. Pit wall. Black Panther. Clean duplex brief.",
    report: baseReport({
      llm_assessment: {
        enabled: true,
        grok_performance_correction: null // suppressed — defect
      }
    })
  });
  const fails = hardFails(assertions);
  assert.ok(
    fails.some((f) => f.name === "correction_expected"),
    `duplex mutant must hard-fail correction_expected; got: ${JSON.stringify(fails)}`
  );
  assert.equal(summarizeAssertions(assertions).passed, false);
  console.log("mutant 4 duplex correction suppressed: caught");
}

// Sanity: clean brief on a real golden still passes hard gates (not a mutant)
{
  const golden = loadGoldenCase(
    path.join(goldenRoot, "other/gt-000-hermetic-smoke.json")
  );
  const assertions = evaluateL1Expectations({
    golden,
    brief:
      "Quiet evening at home after dinner; soft conversation continues. " +
      "Warm partnership, no crisis. Scene stays domestic and ordinary. " +
      "Key facts: home, evening, quiet — enough characters for smoke brief_chars.",
    report: baseReport({
      memory_write: { action: "none", reason: "noop" },
      llm_assessment: { enabled: true, grok_performance_correction: null }
    })
  });
  assert.equal(
    summarizeAssertions(assertions).passed,
    true,
    `smoke clean path must stay green: ${JSON.stringify(hardFails(assertions))}`
  );
  console.log("control: clean smoke still green");
}

console.log("eval-mutants-1.5 tests passed (4 defect classes caught)");

/**
 * WP-5.5 — scarlett_next_intention + resonance_echo normalize, budget, brief.
 */
import assert from "node:assert/strict";
import {
  buildAuditorSystemPrompt,
  enforceResonanceEchoBudget,
  normalizeAssessmentFields,
  normalizeNullableProseField,
  resonanceEchoRate
} from "../src/guardian/llm-assessment.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

function testNormalizeIntentionAndEcho() {
  const n = normalizeAssessmentFields({
    continuity_risk_level: "low",
    supported_facts: ["a"],
    scene_state_delta: "pit box",
    scarlett_next_intention: "  Lead the thermal debrief with one clear front-axle note.  ",
    resonance_echo:
      "Harness tension echoes South Cerney passenger-seat trust — available; don't force it.\nSecond line must die."
  });
  assert.equal(
    n.scarlett_next_intention,
    "Lead the thermal debrief with one clear front-axle note."
  );
  assert.ok(n.resonance_echo);
  assert.ok(!n.resonance_echo!.includes("\n"), "echo budget keeps one line");
  assert.match(n.resonance_echo!, /South Cerney|harness/i);

  assert.equal(
    normalizeNullableProseField("She will win the lap and must succeed", {
      rejectOutcomeLanguage: true
    }),
    null
  );
  assert.equal(enforceResonanceEchoBudget(null), null);
  assert.equal(enforceResonanceEchoBudget("null"), null);
  assert.equal(enforceResonanceEchoBudget("  only one  "), "only one");
  console.log("ok normalize intention + echo budget");
}

function testSystemPromptMentionsFields() {
  const sys = buildAuditorSystemPrompt();
  assert.match(sys, /scarlett_next_intention/i);
  assert.match(sys, /resonance_echo/i);
  assert.match(sys, /Prefer null unless genuinely useful/i);
  assert.match(sys, /never decide outcomes/i);
  assert.match(sys, /receiving care/i);
  assert.match(sys, /private\/intimate\/aftercare|prefer one real echo/i);
  assert.ok(!/harsh 1-sentence/i.test(sys), "no mandatory harsh correction");
  console.log("ok system prompt intention/echo + balance");
}

function testBriefRendersEchoNotIntention() {
  const report = {
    retrieval_status: "success",
    confidence_score: 80,
    proceed_recommendation: "proceed",
    current_state_summary: "Pit box after the stint.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Grounded.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    llm_assessment: {
      enabled: true,
      scarlett_next_intention: "Pull Benjamin half a step from the engineers for water first.",
      resonance_echo: "Radio intimacy echoes the pit-wall send-off — available; don't force it."
    },
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  } satisfies GuardianReport;

  const brief = compileGrokBrief(report);
  // Character-balance hotfix: intention is diagnostic-only — not in novelist brief
  assert.ok(!brief.includes("**Scarlett's Intention:**"));
  assert.ok(!/water first/i.test(brief));
  assert.match(brief, /\*\*Echo \(optional texture\):\*\*/);
  assert.match(brief, /pit-wall send-off|Radio intimacy/i);
  assert.ok(!brief.includes("**CHARACTER BALANCE:**"), "CB not in brief (Skill only)");
  assert.ok(!brief.includes("**QUALIFIED AUTONOMY PROTOCOL"));
  console.log("ok brief echo without intention; no Character Balance block");
}

function testBriefOmitsNulls() {
  const report = {
    retrieval_status: "success",
    confidence_score: 70,
    proceed_recommendation: "proceed",
    current_state_summary: "Quiet moment.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Soft.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    llm_assessment: {
      enabled: true,
      scarlett_next_intention: null,
      resonance_echo: null
    },
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  } satisfies GuardianReport;
  const brief = compileGrokBrief(report);
  assert.ok(!brief.includes("**Scarlett's Intention:**"));
  assert.ok(!brief.includes("**Echo (optional texture):**"));
  console.log("ok brief omits null intention/echo");
}

function testEchoRateScorecard() {
  const rate = resonanceEchoRate([null, "echo a", null, null, "echo b", null]);
  assert.ok(Math.abs(rate - 2 / 6) < 1e-9);
  assert.ok(rate <= 0.5, "sample rate at design ceiling");
  assert.ok(resonanceEchoRate(["a", "b", "c"]) > 0.5);
  console.log("ok echo rate scorecard helper");
}

testNormalizeIntentionAndEcho();
testSystemPromptMentionsFields();
testBriefRendersEchoNotIntention();
testBriefOmitsNulls();
testEchoRateScorecard();
console.log("All WP-5.5 intention/echo tests passed.");

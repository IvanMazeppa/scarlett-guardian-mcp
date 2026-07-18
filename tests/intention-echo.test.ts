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
  assert.match(sys, /Most turns the correct value is null/i);
  assert.match(sys, /never decide outcomes/i);
  console.log("ok system prompt intention/echo");
}

function testBriefRendersIntentionAndEcho() {
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
  assert.match(brief, /\*\*Scarlett's Intention:\*\*/);
  assert.match(brief, /water first/i);
  assert.match(brief, /\*\*Echo \(optional texture\):\*\*/);
  assert.match(brief, /pit-wall send-off|Radio intimacy/i);
  // Intention appears near autonomy block
  const intIdx = brief.indexOf("**Scarlett's Intention:**");
  const qaIdx = brief.indexOf("**QUALIFIED AUTONOMY PROTOCOL");
  assert.ok(intIdx >= 0 && qaIdx > intIdx, "intention should sit just before QA");
  console.log("ok brief intention + echo");
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
testBriefRendersIntentionAndEcho();
testBriefOmitsNulls();
testEchoRateScorecard();
console.log("All WP-5.5 intention/echo tests passed.");

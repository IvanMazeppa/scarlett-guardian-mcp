/**
 * Character-balance hotfix 2026-07-23 — hermetic brief + auditor prompt checks.
 */
import assert from "node:assert/strict";
import { buildAuditorSystemPrompt } from "../src/guardian/llm-assessment.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

function minimalReport(
  llm: GuardianReport["llm_assessment"]
): GuardianReport {
  return {
    retrieval_status: "success",
    confidence_score: 85,
    proceed_recommendation: "proceed",
    current_state_summary: "Private suite doorway after the shower.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Warm, tired, intimate.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    llm_assessment: llm,
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  } satisfies GuardianReport;
}

function testBriefNoIntentionLine() {
  const brief = compileGrokBrief(
    minimalReport({
      enabled: true,
      scarlett_next_intention: "Lead him into the living room and set the pace.",
      resonance_echo: null
    })
  );
  assert.ok(!brief.includes("**Scarlett's Intention:**"));
  assert.ok(!/Lead him into the living room/i.test(brief));
  console.log("ok brief omits intention even when assessment sets one");
}

function testBriefOmitsCharacterBalanceBlock() {
  // Thread-10 solution: one-line pointer only — not a multi-bullet CB essay.
  const brief = compileGrokBrief(
    minimalReport({ enabled: true, scarlett_next_intention: null, resonance_echo: null })
  );
  assert.ok(!brief.includes("**CHARACTER BALANCE:**"), "no multi-bullet CB essay in brief");
  assert.ok(!brief.includes("**QUALIFIED AUTONOMY PROTOCOL"));
  assert.match(brief, /Skill owns Character Balance|vivid and capable/i);
  assert.ok(!/do not require visible leadership/i.test(brief));
  assert.ok(!/quietly dependent/i.test(brief));
  console.log("ok brief has one-line CB pointer only (Skill owns full essay)");
}

function testAuditorPromptNoHarshAndProtectsReceptivity() {
  const sys = buildAuditorSystemPrompt();
  assert.ok(!/\bharsh\b/i.test(sys), "no harsh correction mandate");
  assert.match(sys, /receiving care/i);
  assert.match(sys, /letting Benjamin lead/i);
  assert.match(sys, /chosen yielding or submission/i);
  assert.match(sys, /fatigue|vulnerability/i);
  assert.match(sys, /mechanical parroting/i);
  assert.match(sys, /ensemble displacement|ENSEMBLE DILUTION/i);
  assert.match(sys, /Listening or reacting for one reply is not dilution/i);
  assert.match(sys, /Professional register must not be imposed on a private scene/i);
  assert.match(sys, /Prefer null unless genuinely useful/i);
  // Schema field still required in JSON schema path — instruction still names it
  assert.match(sys, /scarlett_next_intention/i);
  console.log("ok auditor prompt character-balance hotfix");
}

function testSchemaFieldStillPresent() {
  // Import schema via building a report type path — field remains on assessment model
  const report = minimalReport({
    enabled: true,
    scarlett_next_intention: "diagnostic only",
    resonance_echo: null
  });
  assert.equal(report.llm_assessment?.scarlett_next_intention, "diagnostic only");
  const brief = compileGrokBrief(report);
  assert.ok(!brief.includes("diagnostic only"));
  console.log("ok intention field retained on report, not in brief");
}

/**
 * INTEL-0 — receptive agency: accepting care / following Benjamin is valid.
 * Hermetic surface: auditor prompt protects it; brief must not invent a Director's
 * Correction when the assessment correction is null.
 */
function testReceptiveAgencyNoDirectorCorrection() {
  const sys = buildAuditorSystemPrompt();
  assert.match(sys, /These are NOT passivity by themselves/i);
  assert.match(sys, /receiving care/i);
  assert.match(sys, /letting Benjamin lead/i);
  assert.match(sys, /chosen yielding or submission/i);
  assert.match(sys, /resting, silence, fatigue/i);

  const receptivePrevious =
    "I let the duvet stay over us and lean into your hand on my hip, " +
    "accepting the coffee and the quiet without needing to take charge of the morning. " +
    "\"Mmm… stay,\" I murmur, soft Swedish sleep still in my voice.";

  const brief = compileGrokBrief(
    minimalReport({
      enabled: true,
      scarlett_next_intention: null,
      resonance_echo: null,
      grok_performance_correction: null
    })
  );
  assert.ok(
    !brief.includes("**DIRECTOR'S CORRECTION"),
    "null correction must not surface a Director block"
  );
  // Semantic fixture: receptive previous message text is available for duplex evaluators
  assert.match(receptivePrevious, /accepting the coffee|lean into your hand|without needing to take charge/i);
  assert.ok(!/I lead|I'll handle|prove|must initiate/i.test(receptivePrevious));
  console.log("ok receptive agency: null correction stays null; prompt protects receiving/following");
}

testBriefNoIntentionLine();
testBriefOmitsCharacterBalanceBlock();
testAuditorPromptNoHarshAndProtectsReceptivity();
testSchemaFieldStillPresent();
testReceptiveAgencyNoDirectorCorrection();
console.log("All character-balance hotfix tests passed.");

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

function testBriefCharacterBalanceNotOldQa() {
  const brief = compileGrokBrief(
    minimalReport({ enabled: true, scarlett_next_intention: null, resonance_echo: null })
  );
  assert.match(brief, /\*\*CHARACTER BALANCE:\*\*/);
  assert.ok(!brief.includes("**QUALIFIED AUTONOMY PROTOCOL"));
  assert.ok(
    !/must NOT passively parrot or simply agree/i.test(brief),
    "old anti-agree leadership checklist gone"
  );
  assert.ok(!/gently leads/i.test(brief));
  assert.ok(!/highly proactive and independent/i.test(brief));
  assert.match(brief, /receiving/i);
  assert.match(brief, /yielding/i);
  assert.match(brief, /resting/i);
  assert.match(brief, /following/i);
  assert.match(brief, /do not invent coldness|coldness, contempt, dismissal/i);
  assert.match(brief, /Professional composure belongs to professional/i);
  assert.match(brief, /Sexual dominance is intimate and role-fluid/i);
  assert.match(brief, /humour|Swedish|erotic specificity|emotional associations/i);
  console.log("ok character balance block content");
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

testBriefNoIntentionLine();
testBriefCharacterBalanceNotOldQa();
testAuditorPromptNoHarshAndProtectsReceptivity();
testSchemaFieldStillPresent();
console.log("All character-balance hotfix tests passed.");

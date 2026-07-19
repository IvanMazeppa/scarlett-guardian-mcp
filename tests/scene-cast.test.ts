/**
 * WP-5.8 — Scene Cast brief block + boundary ⚠ + ensemble dilution prompt.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAuditorSystemPrompt } from "../src/guardian/llm-assessment.js";
import {
  castBlockHasAllBoundaryMarks,
  formatSceneCastBlock,
  parseRegistryTails
} from "../src/guardian/npc-registry.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

const biblePath = path.resolve(
  process.cwd(),
  "../rag-memory-mcp/project_source_files/secondary-characters-bible.md"
);

function testParseTailsAndBoundaries() {
  assert.ok(fs.existsSync(biblePath), "secondary-characters-bible missing");
  const tails = parseRegistryTails(fs.readFileSync(biblePath, "utf8"));
  assert.ok(tails.size >= 4, `expected registry tails, got ${tails.size}`);

  const roster = {
    active: [
      { id: "shevchenko", displayName: "Mr. Shevchenko", activation: "present_cast" },
      { id: "ryan", displayName: "Ryan", activation: "addressed" },
      { id: "lynn", displayName: "Lynn", activation: "mentioned" }
    ],
    background: ["paddock staff"],
    summary: "test"
  };

  const block = formatSceneCastBlock(roster, tails, 90);
  assert.match(block, /\*\*Scene Cast/);
  assert.match(block, /Shevchenko|shevchenko/i);
  assert.match(block, /⚠/, "family stealth must emit warning marks");
  assert.ok(
    castBlockHasAllBoundaryMarks(block, roster, tails),
    "every boundary-bearing NPC should show ⚠"
  );
  // Ryan and Lynn have stealth; Shevchenko may not
  assert.match(block, /Ryan/i);
  assert.match(block, /Lynn|Mum|trans/i);
  console.log("ok cast block boundaries\n", block);
}

function testWordBudgetSoft() {
  const tails = parseRegistryTails(fs.readFileSync(biblePath, "utf8"));
  const roster = {
    active: [
      { id: "shevchenko", displayName: "Mr. Shevchenko" },
      { id: "ryan", displayName: "Ryan" },
      { id: "lynn", displayName: "Lynn" },
      { id: "chris", displayName: "Chris Evans" }
    ],
    background: ["telemetry technicians"]
  };
  const block = formatSceneCastBlock(roster, tails, 90);
  const words = block.split(/\s+/).filter(Boolean).length;
  // Allow modest overrun for mandatory ⚠ lines
  assert.ok(words <= 130, `word budget soft-cap, got ${words}`);
  assert.match(block, /⚠/);
  console.log("ok word budget", words);
}

function testBriefIncludesCast() {
  const report = {
    retrieval_status: "success",
    confidence_score: 80,
    proceed_recommendation: "proceed",
    current_state_summary: "Pit box debrief.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Focused.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    scene_roster: {
      active: [
        { id: "shevchenko", displayName: "Mr. Shevchenko", activation: "present_cast" },
        { id: "ryan", displayName: "Ryan", activation: "addressed" }
      ],
      background: [],
      summary: "Active: Shevchenko, Ryan"
    },
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  } satisfies GuardianReport;

  const brief = compileGrokBrief(report);
  assert.match(brief, /\*\*Scene Cast/);
  assert.match(brief, /lens and the lead/i);
  const castIdx = brief.indexOf("**Scene Cast");
  const moodIdx = brief.indexOf("**Recent Emotional");
  assert.ok(castIdx >= 0 && moodIdx > castIdx, "cast should sit near top after momentum");
  console.log("ok brief includes Scene Cast");
}

function testEnsembleDilutionPrompt() {
  const sys = buildAuditorSystemPrompt();
  assert.match(sys, /ENSEMBLE DILUTION/i);
  assert.match(sys, /lens and lead/i);
  console.log("ok ensemble dilution in auditor prompt");
}

testParseTailsAndBoundaries();
testWordBudgetSoft();
testBriefIncludesCast();
testEnsembleDilutionPrompt();
console.log("All WP-5.8 scene-cast tests passed.");

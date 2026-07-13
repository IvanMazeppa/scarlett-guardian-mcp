import assert from "node:assert/strict";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import { isRagMetaText, stripRagMeta } from "../src/guardian/report/text-clean.js";
import type { GuardianReport } from "../src/guardian/report/models.js";
import {
  buildMemoryQueries,
  buildPreflightQuery,
  detectHighRiskTriggers,
  selectPrecedents
} from "../src/guardian/tools/preflight.js";

const foodTurn = "I watch you take the best bite of ribeye and notice you bristled when the waiter kept staring.";

assert.match(
  buildPreflightQuery({ user_message: foodTurn }),
  /current scene state Scarlett Benjamin emotional tone open threads/
);

assert.deepEqual(
  detectHighRiskTriggers(foodTurn),
  [
    "Benjamin attributes Scarlett internal state",
    "Food-care, feeding, appetite, or ARFID-adjacent gesture",
    "Public visibility, jealousy, queer safety, or boundaries"
  ]
);

assert.equal(buildMemoryQueries({ user_message: "A quiet ordinary reply with no named detail." }).length, 1);
assert.match(buildMemoryQueries({ user_message: foodTurn })[0], /feeding food care appetite ribeye/);

// force_full_retrieval stays clamped to max 2 queries (latency budget)
const fullQueries = buildMemoryQueries({ user_message: foodTurn, force_full_retrieval: true });
assert.ok(fullQueries.length >= 1 && fullQueries.length <= 2);
assert.ok(new Set(fullQueries).size === fullQueries.length);

// P0.3 — intimate paddock / race-suit turns must fire intimacy + AMG triggers
const intimatePaddock =
  "Benjamin bites his lip looking at Scarlett fully suited up with red hair spilling over the collar, " +
  "resists urge to peel her out of it. They walk back to the Nürburgring paddock pit lane.";
const intimateTriggers = detectHighRiskTriggers(intimatePaddock);
assert.ok(
  intimateTriggers.some((t) => /Intimacy/i.test(t)),
  `expected intimacy trigger, got: ${intimateTriggers.join(", ")}`
);
assert.ok(
  intimateTriggers.some((t) => /AMG|Nuerburgring|paddock/i.test(t)),
  `expected AMG/paddock trigger, got: ${intimateTriggers.join(", ")}`
);
assert.match(buildMemoryQueries({ user_message: intimatePaddock })[0], /intimacy aftercare|Nuerburgring paddock/i);

// Precedent selection demotes historical threads without history triggers
const precedents = selectPrecedents(
  [
    {
      source_file: "project_source_files/historical/thread-01/thread-01-relationship-dynamics.md",
      section: "Mythological Bond",
      text: "Duʾūzu tattoo and power transfer mythology from early thread.",
      rank_score: 0.99,
      source_role: "supporting_backstory"
    },
    {
      source_file: "project_source_files/current-state.md",
      section: "Current Story State — Location",
      text: "They are at the Nürburgring paddock after shower cleanup; Scarlett is in her race suit.",
      rank_score: 0.7,
      source_role: "current_state"
    },
    {
      source_file: "project_source_files/event-log.md",
      section: "Event Log",
      text: "Recent beat: hand-in-hand return to locker room for helmet and belongings.",
      rank_score: 0.65,
      source_role: "event_log"
    }
  ],
  [],
  intimatePaddock,
  2
);
assert.equal(precedents.length, 2);
assert.ok(
  precedents.every((p) => !/historical\/thread-0/i.test(p.source_file ?? "")),
  "historical thread should be demoted when no history triggers"
);
assert.ok(precedents.some((p) => /current-state|event-log/i.test(p.source_file ?? "")));

// Meta strip + brief compiler
assert.ok(isRagMetaText("HIGH confidence context found from project_source_files/event-log.md"));
assert.ok(isRagMetaText("Call search_story_memory with concrete memory terms before drafting."));
assert.equal(stripRagMeta("They are at the paddock. Call search_story_memory next."), "They are at the paddock.");

const noisyReport: GuardianReport = {
  retrieval_status: "success",
  confidence_score: 83,
  proceed_recommendation: "proceed",
  current_state_summary:
    "HIGH confidence context found from project_source_files/event-log.md. Do not draft from this preflight alone. Call search_story_memory.",
  critical_precedents: [
    {
      topic: "Thread 01 Mythology",
      details: "Source file: historical/thread-01\nAncient power transfer lore.",
      must_respect: "x",
      source_file: "project_source_files/historical/thread-01/thread-01-relationship-dynamics.md"
    }
  ],
  expanded_contexts: [],
  fact_checks: [],
  emotional_tone_guidance:
    "HIGH confidence context found from project_source_files/event-log.md / Event Log.",
  things_to_avoid: [
    "Do not invent pre-thread facts, emotional precedents, names, dates, family details, or relationship history.",
    "Do not skip tools for narrative flow."
  ],
  open_threads: [
    "Call search_story_memory with concrete terms from the scene.",
    "Preflight is complete, but do not draft from current-scene context alone."
  ],
  hard_flags: ["PREFLIGHT_NOT_SUFFICIENT: Live-scene retrieval itself says more memory work is needed."],
  retrieval_notes: "debug only",
  grok_scene_summary:
    "Nürburgring paddock after intimate shower; Scarlett in black-and-silver race suit, red hair over collar; heading to pit lane for test laps.",
  grok_key_facts: [
    "Location: Nürburgring paddock / locker-room transition.",
    "Scarlett is suited up; limited time before the team needs them.",
    "Emotional tone: connected, playful aftercare shifting to professional focus."
  ],
  grok_precedents: [
    {
      topic: "Current paddock beat",
      details: "After shower cleanup they locked the door; now returning hand-in-hand for helmet and pit lane.",
      must_respect: "x",
      source_file: "project_source_files/current-state.md"
    }
  ],
  grok_emotional_context: "Warm aftercare turning to focused track-day energy; still physically close.",
  retrieval_plan: {
    preflight_query: "x",
    memory_queries: ["y"],
    high_risk_triggers: ["Intimacy, kink, dominance, consent, or aftercare"]
  },
  tool_calls: []
};

const brief = compileGrokBrief(noisyReport);
assert.ok(!/search_story_memory/i.test(brief), "brief must not coach RAG tools");
assert.ok(!/HIGH confidence context found/i.test(brief), "brief must not paste RAG meta summaries");
assert.ok(!/Do not draft from this preflight/i.test(brief));
assert.match(brief, /Nürburgring paddock/);
assert.match(brief, /Key Facts to Ground In/);
assert.match(brief, /None flagged|Open Threads/);
assert.ok(brief.length <= 4500 + 50, `brief too long: ${brief.length}`);
// Open threads from RAG coaching should be dropped
assert.ok(!/Call search_story_memory/i.test(brief));

console.log("preflight tests passed");
console.log("\n--- sample compileGrokBrief output ---\n");
console.log(brief);

import assert from "node:assert/strict";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import {
  isPlaceholderContext,
  isRagMetaText,
  stripRagMeta,
  truncateAtSentence
} from "../src/guardian/report/text-clean.js";
import type { GuardianReport } from "../src/guardian/report/models.js";
import {
  buildFactCheckQuestions,
  buildKeyFacts,
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
  llm_assessment: {
    enabled: true,
    serendipity_weave: "Rain ticks on the pit canopy while the open channel stays soft static."
  },
  serendipity_nudge:
    "SERENDIPITY EVENT (Optional, tier=ambient): It starts raining. Weave this naturally.",
  retrieval_plan: {
    preflight_query: "x",
    memory_queries: ["y"],
    high_risk_triggers: ["Intimacy, kink, dominance, consent, or aftercare"]
  },
  tool_calls: []
};

const brief = compileGrokBrief(noisyReport);
assert.match(brief, /World Weaver \(Serendipity\)/);
assert.match(brief, /Rain ticks on the pit canopy/);
assert.ok(!/SERENDIPITY EVENT \(Optional/i.test(brief), "brief should prefer clean weave over catalog label");
assert.ok(!/search_story_memory/i.test(brief), "brief must not coach RAG tools");
assert.ok(!/HIGH confidence context found/i.test(brief), "brief must not paste RAG meta summaries");
assert.ok(!/Do not draft from this preflight/i.test(brief));
assert.match(brief, /Nürburgring paddock/);
assert.match(brief, /Key Facts to Ground In/);
assert.match(brief, /None flagged|Open Threads/);
assert.ok(brief.length <= 6500 + 50, `brief too long: ${brief.length}`);
// Open threads from RAG coaching should be dropped
assert.ok(!/Call search_story_memory/i.test(brief));

assert.ok(isPlaceholderContext("None yet, establishing scene"));
assert.ok(isPlaceholderContext("n/a"));
assert.ok(!isPlaceholderContext("Friday at the Nürburgring paddock after shower cleanup."));

const mid =
  "Germany trip: Now in Luxembourg after Paris. Nürburgring track day moved to Friday. Then Affalterbach for AMG HQ presentation as translator.";
const cut = truncateAtSentence(mid, 90);
assert.ok(!/translat\.\.\.$/.test(cut), `should not hard-cut mid-word: ${cut}`);
assert.ok(cut.endsWith(".") || cut.endsWith("…") || cut.length <= 90);

// Parroting-fix 1.1 (2026-08-14) — Key Fact #1 must stay live scene grounding:
// FACT_CHECK_* verdicts never become key facts (clerk mode); blocking flags append last.
{
  const keyFacts = buildKeyFacts(
    [],
    {
      enabled: true,
      supported_facts: [
        "They are dressing in the suite for the Affalterbach presentation.",
        "Monday morning ~07:15; Black Panther drive ahead."
      ]
    } as never,
    [
      "FACT_CHECK_AMBIGUOUS: Verify exact continuity facts — I reach past you and turn the water off…",
      "LLM_GUARDIAN_BLOCK: Guardian assessment recommends blocking prose until continuity is repaired."
    ],
    []
  );
  assert.ok(
    !keyFacts.some((f) => /FACT_CHECK_/i.test(f)),
    `FACT_CHECK_ must never be a novelist key fact: ${keyFacts.join(" | ")}`
  );
  assert.match(
    keyFacts[0],
    /dressing in the suite/i,
    "Key Fact #1 must be live scene grounding, not a flag"
  );
  assert.ok(
    /LLM_GUARDIAN_BLOCK/.test(keyFacts[keyFacts.length - 1]),
    "blocking flags append last, never first"
  );
  console.log("ok buildKeyFacts: fact-check excluded, block flag last");
}

// Parroting-fix 2.3 (2026-08-14) — never dump present-tense play as claim_or_question.
{
  const crisisTurn =
    "I reach past you and turn the water off, then hold your shirt while you dress. Trousers next. Shevchenko believes this is GT2 homologation — Monday, Affalterbach, AMG HQ. I keep that thought to myself.";
  const none = buildFactCheckQuestions({ user_message: crisisTurn }, [
    "AMG, Germany trip, Luxembourg, Nuerburgring, Affalterbach, or track-day logistics"
  ]);
  assert.equal(
    none.length,
    0,
    `present-tense play must not become a fact-check: ${JSON.stringify(none)}`
  );

  const past = buildFactCheckQuestions(
    {
      user_message:
        "I button my shirt. Your surgery was in 2024 after Vaxholm — that's the year Mormor died, wasn't it?"
    },
    ["Family history, Vaxholm, Mormor, or childhood trauma"]
  );
  assert.equal(past.length, 1, JSON.stringify(past));
  assert.match(past[0], /Verify past-canon assertion:/);
  assert.match(past[0], /surgery|Vaxholm|Mormor/i);
  assert.ok(!/I button my shirt/i.test(past[0]), "present-tense play clause must be stripped");
  assert.ok(past[0].length < 280, `one-clause cap: ${past[0].length}`);
  console.log("ok buildFactCheckQuestions: past-canon only, one clause");
}

console.log("preflight tests passed");
console.log("\n--- sample compileGrokBrief output ---\n");
console.log(brief);

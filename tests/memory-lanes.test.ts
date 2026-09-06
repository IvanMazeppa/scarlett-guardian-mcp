import assert from "node:assert/strict";
import {
  analogueMemoryQuery,
  distillExpandedContext,
  formatHoldBlock,
  isLiveSnapshotSource,
  madeleinePlan,
  parseChekhovGuns,
  sanitizeEmotionalContext
} from "../src/guardian/memory-lanes.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";
import { selectPrecedents } from "../src/guardian/tools/preflight.js";
import { reconcileLiveOutfitCard } from "../src/guardian/wardrobe.js";

const soglioState = `# Current Story State
## Where We Are Right Now (High-Level Snapshot)
- **Location / Setting:** Soglio stone house, sofa by the fire.
## Open Story Threads & Pending Elements
- **The Sunday Coupon:** She has a blank-check coupon to use before they drive home on Sunday.
- **The "Service" Threat (Looming):** The peaceful trip is a prime setup for an active tactical threat from her former handlers.
`;

{
  const guns = parseChekhovGuns(soglioState);
  assert.equal(guns.length, 2);
  assert.match(guns[0] ?? "", /coupon/i);
  assert.match(guns[1] ?? "", /service|handlers/i);
  const hold = formatHoldBlock(guns) ?? "";
  assert.match(hold, /Hold \(unspent/);
  assert.ok(!/weave this/i.test(hold));
  console.log("ok chekhov guns pin without a spend instruction");
}

{
  const q = analogueMemoryQuery(
    { user_message: "I try to squeeze onto the tiny sofa next to you, shoulders too wide." },
    []
  );
  assert.match(q, /closeness that does not fit/i);
  assert.match(q, /emotional-milestones/i);
  assert.ok(!/current-state snapshot/i.test(q) || /not current-state/i.test(q));
  console.log("ok analogue query uses the job of the gesture");
}

{
  const q = analogueMemoryQuery(
    { user_message: "I kiss you and then I go still, waiting to see if that was too far." },
    ["Intimacy, kink, dominance, consent, or aftercare"]
  );
  assert.match(q, /boundary was pushed|stayed in control/i);
  console.log("ok analogue query maps a pushed boundary to an emotional job");
}

{
  const plan = madeleinePlan(
    { user_message: "The rain is still ticking on the stone outside." },
    { lastUpdated: "", locationLine: "Soglio hearth", timeLine: "", supersededCues: [], liveCues: ["rain"], antiResetNotes: [] }
  );
  assert.equal(plan?.motif, "rain");
  assert.equal(
    madeleinePlan({ user_message: "Pass the salt." }, null),
    undefined
  );
  console.log("ok madeleine only fires when a motif is already in the room");
}

{
  const felt = distillExpandedContext({
    expanded_results: [
      { relative_position: -1, text: "They were in the Villa Pétrusse suite, wine, low pressure, after Paris." },
      {
        relative_position: 0,
        text: "She told him about blockers at twelve and oestrogen at fourteen. She had never shared this with anyone. He stayed and did not fix it."
      },
      { relative_position: 1, text: "The cost was trust: she let the history be held." }
    ]
  });
  assert.ok(felt);
  assert.match(felt.situation, /Villa Pétrusse|Paris/i);
  assert.match(felt.whatSheDid, /told him|blockers|stayed/i);
  assert.match(felt.whatItCost, /trust|held|cost/i);
  console.log("ok distill expands into situation / did / cost");
}

{
  assert.equal(
    isLiveSnapshotSource({
      source_file: "project_source_files/current-state.md",
      section: "Where We Are Right Now (High-Level Snapshot)"
    }),
    true
  );
  const selected = selectPrecedents(
    [
      {
        source_file: "project_source_files/current-state.md",
        section: "Where We Are Right Now",
        text: "They are on the tiny sofa by the fire in Soglio.",
        rank_score: 0.99,
        source_role: "current_state"
      },
      {
        source_file: "project_source_files/emotional-milestones.md",
        section: "Luxembourg transition talk",
        text: "She told him about blockers and he listened without fixing her.",
        rank_score: 0.6,
        source_role: "story_bible"
      }
    ],
    ["Intimacy, kink, dominance, consent, or aftercare"],
    "I squeeze onto the sofa next to you.",
    2,
    undefined,
    { excludeLiveSnapshot: true }
  );
  assert.ok(selected.every((p) => !/current-state/i.test(p.source_file ?? "")));
  assert.ok(selected.some((p) => /blockers|listened/i.test(p.details)));
  console.log("ok novelist precedents ban the live snapshot");
}

{
  assert.match(sanitizeEmotionalContext("tone house"), /baseline|intimate|present/i);
  assert.match(
    sanitizeEmotionalContext("tone house floor bed by fire", {
      lastUpdated: "",
      locationLine: "Soglio stone house, sofa by the fire",
      timeLine: "Wednesday evening",
      supersededCues: [],
      liveCues: ["intimate", "warm", "safe"],
      antiResetNotes: []
    }),
    /intimate|Soglio/i
  );
  console.log("ok thin emotional context is replaced");
}

{
  const card = reconcileLiveOutfitCard({
    wearing: ["Oversized charcoal cashmere + tight black jeans"],
    hair: [],
    makeup: [],
    nails: [],
    register: "travel-soft",
    kit: "panther",
    kitNotes: "",
    bodyState: "undressed",
    bodyStateDetail: "Morning bed — undressed.",
    hardware: [],
    nextLegalChange: "",
    raw: ""
  });
  assert.equal(card.bodyState, "dressed");
  assert.ok(!/morning bed/i.test(card.bodyStateDetail));
  console.log("ok wardrobe reconcile: clothes on card wins over stale undressed");
}

{
  const report: GuardianReport = {
    retrieval_status: "success",
    confidence_score: 90,
    proceed_recommendation: "proceed",
    current_state_summary: "Sofa by the fire in Soglio.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "tone house",
    things_to_avoid: [],
    open_threads: ["The Sunday Coupon: blank-check hour"],
    hard_flags: [],
    retrieval_notes: "",
    grok_scene_summary: "Sofa by the fire in Soglio.",
    grok_key_facts: ["Wednesday evening, Soglio stone house."],
    grok_emotional_context: "tone house",
    chekhov_guns: [
      "Sunday coupon: blank hour, expires before the drive home",
      "Service threat: former handlers; peace is the setup, not the plot yet"
    ],
    felt_analogue: {
      situation: "Villa Pétrusse, after Paris, wine and low pressure.",
      whatSheDid: "She told him the blocker story and let him stay.",
      whatItCost: "Trust: she had never shared it.",
      patternToRepeat: "Repeat presence, not a speech."
    },
    madeleine_flash: "Rain on stone from the walk back — jacket still cold at the collar.",
    retrieval_plan: { preflight_query: "x", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  };
  const brief = compileGrokBrief(report);
  assert.match(brief, /Hold \(unspent/);
  assert.match(brief, /Sunday coupon/);
  assert.ok(!/weave this naturally/i.test(brief));
  assert.match(brief, /Analogue \(pattern/);
  assert.match(brief, /Villa Pétrusse/);
  assert.match(brief, /Flash \(optional body memory/);
  assert.match(brief, /jacket still cold/);
  assert.match(brief, /Unspent items are in Hold above/);
  assert.match(
    brief,
    /\*\*Recent Emotional & Relational Context:\*\*\n- Match the scene's established emotional baseline/
  );
  console.log("ok four-lane brief format");
}

console.log("memory-lanes tests passed");

/**
 * Wardrobe module — live card, change-beat menu, no random closet.
 */
import assert from "node:assert/strict";
import {
  CURATED_LOOKS,
  defaultExcludes,
  detectWornLookId,
  formatWardrobeBrief,
  inferTargetRegister,
  isWardrobeChangeBeat,
  looksFor,
  parseLiveOutfitMarkdown,
  resolveWardrobe,
  userSpecifiedOutfit
} from "../src/guardian/wardrobe.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

const LIVE_ARMOUR = `# Live Outfit — Scarlett

## Wearing

- High-waisted black trousers
- Matte silk camisole
- Structured single-button blazer
- Shoes: sharp professional heels from the Panther travel kit

## Hair / Makeup

- Copper bob: sleek / controlled
- Sharp liner, matte mouth
- Nails: glossy black squares (hands and toes)

## Register / Kit

- **Register:** \`armour\`
- **Kit:** \`panther\` (travel wardrobe from the car).

## Body hardware (always-on)

- Rose-gold gemstone anklet, **left ankle** (currently **hidden under trousers**)
- Engagement diamond

## Next legal change (Affalterbach release → G650)

If she changes, choose from panther kit / travel-soft — do not rewrite this card into a pencil skirt.
`;

function testParseLiveCard() {
  const card = parseLiveOutfitMarkdown(LIVE_ARMOUR);
  assert.equal(card.register, "armour");
  assert.equal(card.kit, "panther");
  assert.ok(card.wearing.some((l) => /trousers/i.test(l)));
  assert.ok(card.wearing.some((l) => /blazer/i.test(l)));
  assert.ok(!card.wearing.some((l) => /pencil/i.test(l)));
  assert.ok(card.hardware.some((l) => /hidden under trousers/i.test(l)));
  console.log("ok parse live armour card");
}

function testChangeBeatTight() {
  assert.equal(isWardrobeChangeBeat("Good morning, älskling. Coffee?"), false);
  assert.equal(isWardrobeChangeBeat("Sunday evening Stuttgart penthouse bathroom."), false);
  assert.equal(isWardrobeChangeBeat("we leave Affalterbach and board the Gulfstream G650"), true);
  assert.equal(isWardrobeChangeBeat("you get changed into something comfortable"), true);
  assert.equal(isWardrobeChangeBeat("put the armour on"), true);
  console.log("ok change-beat detector stays tight");
}

function testG650Menu() {
  const res = resolveWardrobe(
    {
      user_message:
        "the presentation is done. we walk out of HQ toward the Gulfstream G650. get comfortable for the flight.",
      recent_context: "Monday Affalterbach boardroom. Scarlett in corporate armour."
    },
    { lastUpdated: "", locationLine: "Affalterbach AMG HQ", timeLine: "Monday", supersededCues: [], liveCues: [], antiResetNotes: [] },
    { liveMarkdown: LIVE_ARMOUR, persistWriteback: false }
  );
  assert.equal(res.changeBeat, true);
  assert.equal(res.targetRegister, "travel-soft");
  assert.equal(res.kit, "panther");
  assert.ok(res.options.length >= 2);
  assert.ok(res.options.every((o) => o.available.includes("panther")));
  assert.ok(res.options.every((o) => o.register === "travel-soft"));
  assert.ok(!res.options.some((o) => o.id === "seine-red-latex" || o.id === "black-catsuit" || o.id === "nomex"));
  assert.ok(res.options.some((o) => o.id === "travel-cashmere-jeans"));
  assert.match(res.briefMarkdown, /trousers/i);
  assert.match(res.briefMarkdown, /Do not rewrite LIVE into a pencil skirt/);
  assert.match(res.briefMarkdown, /unless she fetches the suite-drawer/);
  assert.ok(!res.options.some((o) => /catsuit|latex/i.test(o.summary)));
  console.log("ok G650 menu is travel-soft ∩ panther, not latex");
}

function testNoChangeKeepsLive() {
  const res = resolveWardrobe(
    {
      user_message: "I look at the telemetry on the screen and wait for your opening statement.",
      recent_context: "Executive Boardroom, AMG HQ Affalterbach."
    },
    undefined,
    { liveMarkdown: LIVE_ARMOUR }
  );
  assert.equal(res.changeBeat, false);
  assert.equal(res.options.length, 0);
  assert.match(res.briefMarkdown, /No change-beat this turn/);
  assert.match(res.briefMarkdown, /blazer/i);
  console.log("ok non-change turn injects LIVE only");
}

function testLooksForKitFilter() {
  const kink = looksFor("kink-private", "panther");
  assert.equal(kink.length, 0);
  const drawer = looksFor("kink-private", "suite-drawer");
  assert.ok(drawer.some((l) => l.id === "seine-red-latex"));
  console.log("ok kit filter blocks latex on panther");
}

function testUserLockAndWritebackDetect() {
  assert.equal(userSpecifiedOutfit("she puts on the cashmere sweater and tight jeans"), true);
  assert.equal(detectWornLookId("I settle into the cashmere and jeans and let the bob fall."), "travel-cashmere-jeans");
  const res = resolveWardrobe(
    {
      user_message: "I watch you.",
      scarlett_previous_message:
        "I change into the cashmere and jeans before the jet door closes, blazer left on the seat."
    },
    undefined,
    { liveMarkdown: LIVE_ARMOUR, persistWriteback: false }
  );
  assert.equal(res.writebackCandidate?.register, "travel-soft");
  console.log("ok user-lock + previous-turn look detect");
}

function testInferRegister() {
  const live = parseLiveOutfitMarkdown(LIVE_ARMOUR);
  assert.equal(inferTargetRegister("Gulfstream G650 wheels-up", live), "travel-soft");
  assert.equal(inferTargetRegister("dinner in the emerald dress", live), "evening");
  console.log("ok register inference");
}

function testExcludes() {
  const live = parseLiveOutfitMarkdown(LIVE_ARMOUR);
  const ex = defaultExcludes(live, "panther");
  assert.ok(ex.some((e) => /pencil skirt/i.test(e)));
  assert.ok(ex.some((e) => /latex/i.test(e)));
  console.log("ok default excludes");
}

function testBriefCompileIncludesWardrobe() {
  const res = resolveWardrobe(
    { user_message: "we board the Gulfstream G650" },
    undefined,
    { liveMarkdown: LIVE_ARMOUR }
  );
  const report: GuardianReport = {
    retrieval_status: "success",
    confidence_score: 88,
    proceed_recommendation: "proceed",
    current_state_summary: "Leaving Affalterbach toward the jet.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Release after the boardroom.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    wardrobe: {
      change_beat: res.changeBeat,
      brief_markdown: res.briefMarkdown,
      register: res.targetRegister,
      kit: res.kit
    },
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  };
  const brief = compileGrokBrief(report);
  assert.match(brief, /\*\*Wardrobe \(she dresses herself\):\*\*/);
  assert.match(brief, /LIVE wearing/);
  console.log("ok compileGrokBrief includes wardrobe block");
}

function testCuratedLooksHaveKits() {
  for (const look of CURATED_LOOKS) {
    assert.ok(look.available.length > 0, look.id);
    assert.ok(look.summary.length > 20, look.id);
  }
  console.log("ok curated looks are tagged");
}

testParseLiveCard();
testChangeBeatTight();
testG650Menu();
testNoChangeKeepsLive();
testLooksForKitFilter();
testUserLockAndWritebackDetect();
testInferRegister();
testExcludes();
testBriefCompileIncludesWardrobe();
testCuratedLooksHaveKits();
console.log("wardrobe tests passed");

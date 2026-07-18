/**
 * WP-4.6 — Serendipity 2.0 weaver unit + 50-turn simulation.
 */
import assert from "node:assert/strict";
import {
  classifySceneMode,
  emptySerendipityState,
  fireChance,
  maxTierFor,
  selectSerendipity,
  SERENDIPITY_CATALOG,
  tierAdmissible
} from "../src/guardian/serendipity-weaver.js";
import {
  intersectAgendasWithLiveScene,
  parseNpcAgendas
} from "../src/guardian/npc-agendas.js";
import type { LiveBeat } from "../src/guardian/recency.js";
import fs from "node:fs";
import path from "node:path";

const emptyBeat: LiveBeat = {
  lastUpdated: "",
  locationLine: "",
  timeLine: "",
  liveCues: [],
  supersededCues: [],
  antiResetNotes: []
};

// --- Scene mode classification ---
assert.equal(
  classifySceneMode(
    ["Intimacy, kink, dominance, consent, or aftercare"],
    "soft kiss",
    emptyBeat
  ),
  "intimate"
);
assert.equal(
  classifySceneMode(
    ["Recovery, soreness, body, fragility, or caretaking"],
    "he is still green from the roads",
    emptyBeat
  ),
  "vulnerable"
);
assert.equal(
  classifySceneMode(
    ["AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc"],
    "telemetry on pit wall",
    { ...emptyBeat, locationLine: "Nordschleife pit wall", liveCues: ["radio"] }
  ),
  "professional"
);
assert.equal(classifySceneMode([], "we are on the motorway to the airport", emptyBeat), "transit");
assert.equal(maxTierFor("intimate"), "ambient");
assert.equal(maxTierFor("vulnerable"), "ambient");
assert.equal(maxTierFor("professional"), "engaging");
assert.equal(maxTierFor("downtime"), "disruptive");
assert.ok(tierAdmissible("ambient", "ambient"));
assert.ok(!tierAdmissible("disruptive", "ambient"));
console.log("ok classify + tiers");

// --- Intimate admits only ambient ---
{
  let state = emptySerendipityState();
  let ambientOnly = true;
  // Force fire every turn with rng always 0
  for (let i = 0; i < 30; i++) {
    const r = selectSerendipity(state, "intimate", ["Intimacy"], () => 0);
    state = r.state;
    if (r.event && r.event.tier !== "ambient") ambientOnly = false;
    if (r.deferredInstead) {
      assert.ok(
        !tierAdmissible(r.deferredInstead.tier, "ambient"),
        "deferred should be over-tier for intimate"
      );
    }
  }
  assert.ok(ambientOnly, "intimate mode must never fire non-ambient");
  console.log("ok intimate ambient-only");
}

// --- Deferral surfaces later in downtime ---
{
  let state = emptySerendipityState();
  // Seed cooldowns empty; force pick of ryan_arc_1 by filtering via many intimate turns
  // that only ambient fire, then force a disruptive into deferral:
  // Manually queue ryan stage 1
  state.deferred.push({
    eventId: "ryan_arc_1",
    queuedAtTurn: 1,
    expiresAtTurn: 50
  });
  state.turnCounter = 5;
  // Intimate: should NOT surface disruptive from queue
  const blocked = selectSerendipity(state, "intimate", [], () => 0.99);
  state = blocked.state;
  assert.equal(blocked.event, undefined);
  assert.ok(state.deferred.some((d) => d.eventId === "ryan_arc_1"));

  // Downtime: should surface deferred disruptive
  const open = selectSerendipity(state, "downtime", [], () => 0.99);
  assert.ok(open.event, "downtime should surface deferred ryan_arc_1");
  assert.equal(open.event?.id, "ryan_arc_1");
  assert.equal(open.surfacedFromDeferral, true);
  assert.equal(open.state.arcProgress.ryan, 1);
  console.log("ok deferral queue surfaces in downtime");
}

// --- Ryan stages in order ---
{
  let state = emptySerendipityState();
  // Cool down every non-ryan event so only ryan arc can fire
  for (const e of SERENDIPITY_CATALOG) {
    if (e.arcThread !== "ryan") state.eventCooldowns[e.id] = 99999;
  }
  const forced: number[] = [];
  for (let stage = 1; stage <= 3; stage++) {
    for (let i = 0; i < 15; i++) {
      // Clear ryan stage cooldowns between stages for the test
      if (stage > 1) {
        delete state.eventCooldowns[`ryan_arc_${stage}`];
        // previous stage may still be on cooldown — that's fine
      }
      const r = selectSerendipity(state, "downtime", [], () => 0);
      state = r.state;
      if (r.event?.arcThread === "ryan" && r.event.arcStage === stage) {
        forced.push(stage);
        break;
      }
    }
  }
  assert.deepEqual(forced, [1, 2, 3]);
  // Cannot fire stage 3 before 1/2
  state = emptySerendipityState();
  for (const e of SERENDIPITY_CATALOG) {
    if (e.arcThread !== "ryan") state.eventCooldowns[e.id] = 99999;
  }
  state.arcProgress.ryan = 0;
  const r = selectSerendipity(state, "downtime", [], () => 0);
  assert.equal(r.event?.arcStage, 1);
  console.log("ok ryan arc stages in order");
}

// --- Drought bonus monotonic ---
{
  const s0 = emptySerendipityState();
  s0.turnCounter = 10;
  s0.lastFiredTurn = 10;
  const c0 = fireChance(s0);
  s0.turnCounter = 20;
  const c1 = fireChance(s0);
  s0.turnCounter = 40;
  const c2 = fireChance(s0);
  assert.ok(c1 >= c0);
  assert.ok(c2 >= c1);
  assert.ok(c2 <= 0.6);
  console.log("ok drought bonus monotonic");
}

// --- Per-event cooldown ---
{
  let state = emptySerendipityState();
  const r1 = selectSerendipity(state, "downtime", [], () => 0);
  state = r1.state;
  assert.ok(r1.event);
  const id = r1.event!.id;
  // Immediately force fire again — same id should be on cooldown
  let sameIdAgain = false;
  for (let i = 0; i < 5; i++) {
    const r = selectSerendipity(state, "downtime", [], () => 0);
    state = r.state;
    if (r.event?.id === id) sameIdAgain = true;
  }
  assert.ok(!sameIdAgain, "event should respect cooldown");
  console.log("ok per-event cooldown");
}

// --- 50-turn simulation: fire rate lands in design band (drought-aware) ---
{
  let state = emptySerendipityState();
  let fires = 0;
  const TURNS = 50;
  // Uniform-ish pseudo-random (LCG) — not always 0
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed % 1000) / 1000;
  };
  for (let t = 0; t < TURNS; t++) {
    const mode = t % 5 === 0 ? "intimate" : t % 3 === 0 ? "professional" : "downtime";
    const r = selectSerendipity(state, mode, mode === "intimate" ? ["Intimacy"] : [], rng);
    state = r.state;
    if (r.event) fires++;
  }
  const rate = fires / TURNS;
  // Design target 20–35%; allow 15–50% for 50-turn variance + drought bonus
  assert.ok(
    rate >= 0.15 && rate <= 0.5,
    `fire rate ${rate} outside 15–50% band for 50-turn sim`
  );
  console.log(`ok 50-turn sim fire rate=${(rate * 100).toFixed(1)}% fires=${fires}`);
}

// --- WP-5.4: agenda intersections outrank catalog ---
{
  const state = emptySerendipityState();
  // rng would always fire catalog; agenda should win without roll
  const r = selectSerendipity(
    state,
    "professional",
    ["AMG"],
    () => 0.99, // would suppress catalog fireChance
    {
      npcIntersections: [
        {
          npc: "Mr. Shevchenko",
          agenda: "Wants heat-soak telemetry before Monday board sync.",
          suggestedTier: "engaging"
        }
      ]
    }
  );
  assert.ok(r.event, "agenda should fire");
  assert.equal(r.agendaDriven, true);
  assert.match(r.event!.id, /^agenda_/);
  assert.equal(r.event!.tier, "engaging");
  assert.match(r.event!.text, /telemetry|board/i);
  console.log("ok agenda outranks catalog");
}

// --- WP-5.4: over-tier agenda defers (intimate max ambient) ---
{
  const state = emptySerendipityState();
  const r = selectSerendipity(
    state,
    "intimate",
    ["Intimacy"],
    () => 0,
    {
      npcIntersections: [
        {
          npc: "Mr. Shevchenko",
          agenda: "Status check at the pit box.",
          suggestedTier: "engaging"
        }
      ]
    }
  );
  assert.equal(r.event, undefined);
  assert.ok(r.deferredInstead, "engaging agenda should defer in intimate");
  assert.equal(r.agendaDriven, true);
  assert.equal(r.deferredInstead!.tier, "engaging");
  console.log("ok agenda defers when over max tier");
}

// --- WP-5.4: parse + deterministic intersect on track-day cues ---
{
  const agendaPath = path.resolve(
    process.cwd(),
    "../rag-memory-mcp/project_source_files/npc-agendas.md"
  );
  assert.ok(fs.existsSync(agendaPath), "npc-agendas.md should exist");
  const agendas = parseNpcAgendas(fs.readFileSync(agendaPath, "utf8"));
  assert.ok(agendas.length >= 4, `expected ≥4 NPCs, got ${agendas.length}`);
  const live: LiveBeat = {
    lastUpdated: "Friday late afternoon",
    locationLine: "Nordschleife industry paddock pit box — debrief",
    timeLine: "late afternoon",
    liveCues: ["pit box", "telemetry", "debrief", "paddock"],
    supersededCues: ["out lap"],
    antiResetNotes: []
  };
  const ix = intersectAgendasWithLiveScene(
    agendas,
    live,
    "Shevchenko is waiting by the screens for the data package."
  );
  assert.ok(ix.length >= 1, "Shevchenko/AMG should intersect pit debrief");
  assert.ok(
    ix.some((i) => /shevchenko|amg|engineer/i.test(i.npc)),
    `unexpected intersections: ${ix.map((i) => i.npc).join(", ")}`
  );
  // Ryan should not fire on pure track cues without brother cues
  assert.ok(!ix.some((i) => /ryan/i.test(i.npc)), "Ryan must not spam track-day scene");
  console.log("ok parse agendas + deterministic intersect");
}

console.log("\nserendipity-weaver tests passed");

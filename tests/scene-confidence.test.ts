/**
 * INTEL-1 — resolved scene-confidence gate (hermetic).
 */
import assert from "node:assert/strict";
import {
  NEUTRAL_DRAMATURG_LINE,
  applyDramaturgNeutralPolicy,
  detectStalePresentBleed,
  resolveSceneConfidence
} from "../src/guardian/scene-confidence.js";
import { resolveSceneRoster } from "../src/guardian/scene-roster.js";
import { selectSerendipity, emptySerendipityState } from "../src/guardian/serendipity-weaver.js";
import type { LiveBeat } from "../src/guardian/recency.js";

const cabinBeat: LiveBeat = {
  lastUpdated: "Earlier",
  locationLine: "Black Panther cabin, engine off, parked",
  timeLine: "Night",
  liveCues: ["cabin", "engine off", "parked"],
  supersededCues: [],
  antiResetNotes: [],
  presentCast: ["Scarlett and Benjamin only"]
};

const suitePlay = {
  userMessage: "I dry her hair with the towel in the suite doorway, marble steam rising.",
  scarlettPreviousMessage: "Aftercare soft under the chandelier, hotel suite still warm.",
  recentContext: "Shower finished. Schloss Lieser suite bathroom."
};

function testSaveLagProvisionalSuiteVsCabin() {
  const sc = resolveSceneConfidence({
    liveBeat: cabinBeat,
    ...suitePlay,
    gateEnabled: true
  });
  assert.equal(sc.provisional, true, sc.reason);
  assert.equal(sc.saveLag.suspected, true);
  assert.equal(sc.suppressPassiveCast, true);
  assert.equal(sc.serendipityAmbientOnly, true);
  assert.equal(sc.dramaturgNeutral, true);
  assert.equal(sc.holdCanonWrites, true);
  assert.equal(sc.auditorSaveLag, true);
  console.log("ok provisional save-lag suite vs cabin");
}

function testAlignedDiskNotProvisional() {
  const suiteBeat: LiveBeat = {
    lastUpdated: "Saturday morning",
    locationLine: "Schloss Lieser suite, king bed, morning light",
    timeLine: "Saturday morning",
    liveCues: ["suite", "bed", "hotel", "aftercare"],
    supersededCues: ["cabin", "shower"],
    antiResetNotes: [],
    presentCast: ["Scarlett", "Benjamin"]
  };
  const sc = resolveSceneConfidence({
    liveBeat: suiteBeat,
    userMessage: "Coffee on the suite bed tray, älskling.",
    scarlettPreviousMessage: "I stretch under the duvet in the hotel suite.",
    recentContext: "Morning bed Schloss Lieser suite",
    gateEnabled: true
  });
  assert.equal(sc.provisional, false, sc.reason);
  assert.equal(sc.serendipityAmbientOnly, false);
  assert.equal(sc.holdCanonWrites, false);
  console.log("ok aligned disk/user not provisional");
}

function testStalePresentBleed() {
  const beat: LiveBeat = {
    lastUpdated: "",
    locationLine: "Suite doorway",
    timeLine: "",
    liveCues: ["suite", "towel"],
    supersededCues: [],
    antiResetNotes: [],
    presentCast: ["Scarlett", "Benjamin", "Mr. Shevchenko", "AMG engineers"]
  };
  assert.equal(
    detectStalePresentBleed({
      liveBeat: beat,
      userMessage: "Just us — towel and suite aftercare.",
      scarlettPreviousMessage: "I lean into the doorway with you.",
      recentContext: "Private suite hotel shower steam"
    }),
    true
  );
  const sc = resolveSceneConfidence({
    liveBeat: beat,
    userMessage: "Just us — towel and suite aftercare.",
    scarlettPreviousMessage: "I lean into the doorway with you.",
    recentContext: "Private suite hotel shower steam",
    gateEnabled: true
  });
  assert.equal(sc.provisional, true, sc.reason);
  assert.match(sc.reason, /stale_present/);
  console.log("ok stale Present Shevchenko bleed");
}

function testRosterSuppressPassiveButAddressed() {
  const beat: LiveBeat = {
    ...cabinBeat,
    presentCast: ["Scarlett", "Benjamin", "Shevchenko"]
  };
  const passive = resolveSceneRoster({
    userMessage: "Water, älskling. Suite aftercare only.",
    scarlettPreviousMessage: "Mmm.",
    liveBeat: beat,
    arcCastText: "Shevchenko waits with Monday board telemetry.",
    suppressPassiveCast: true
  });
  assert.ok(!passive.active.some((a) => a.id === "shevchenko"), passive.summary);

  const addressed = resolveSceneRoster({
    userMessage: "Shevchenko is at the suite door with papers — let him in?",
    liveBeat: beat,
    arcCastText: "Shevchenko waits",
    suppressPassiveCast: true
  });
  assert.ok(addressed.active.some((a) => a.id === "shevchenko"), addressed.summary);
  console.log("ok roster passive suppress + addressed still works");
}

function testSerendipityAmbientOnlyBlocksAgenda() {
  const state = emptySerendipityState();
  const result = selectSerendipity(state, "professional", [], () => 0.01, {
    forceMaxTier: "ambient",
    npcIntersections: [
      {
        npc: "Mr. Shevchenko",
        agenda: "Wants heat-soak telemetry before Monday board.",
        suggestedTier: "engaging"
      }
    ]
  });
  assert.equal(result.maxTier, "ambient");
  assert.ok(!result.event || result.event.tier === "ambient", String(result.event?.tier));
  assert.ok(!result.agendaDriven, "agenda must not drive under ambient-only");
  console.log("ok serendipity ambient-only skips NPC agenda fire");
}

function testDramaturgNeutral() {
  const sc = resolveSceneConfidence({
    liveBeat: cabinBeat,
    ...suitePlay,
    gateEnabled: true
  });
  const snap = applyDramaturgNeutralPolicy(
    { momentumLine: "Beat 3 of 4: Monday Affalterbach pressure is live." },
    sc
  );
  assert.equal(snap.momentumLine, NEUTRAL_DRAMATURG_LINE);
  console.log("ok dramaturg neutral under provisional");
}

function testMissingLiveBeat() {
  const sc = resolveSceneConfidence({
    liveBeat: {
      lastUpdated: "",
      locationLine: "",
      timeLine: "",
      liveCues: [],
      supersededCues: [],
      antiResetNotes: []
    },
    userMessage: "Hello",
    gateEnabled: true
  });
  assert.equal(sc.provisional, true);
  assert.match(sc.reason, /missing/);
  console.log("ok missing LIVE BEAT provisional");
}

function testGateDisabledRollback() {
  const sc = resolveSceneConfidence({
    liveBeat: cabinBeat,
    ...suitePlay,
    gateEnabled: false
  });
  assert.equal(sc.provisional, false);
  assert.match(sc.reason, /gate_disabled/);
  assert.equal(sc.serendipityAmbientOnly, false);
  assert.equal(sc.holdCanonWrites, false);
  // Detection retained
  assert.equal(sc.saveLag.suspected, true);
  console.log("ok gate disabled rollback policy");
}

function testHoldWritesFlag() {
  const sc = resolveSceneConfidence({
    liveBeat: cabinBeat,
    ...suitePlay,
    gateEnabled: true
  });
  assert.equal(sc.holdCanonWrites, true);
  console.log("ok holdCanonWrites under provisional");
}

testSaveLagProvisionalSuiteVsCabin();
testAlignedDiskNotProvisional();
testStalePresentBleed();
testRosterSuppressPassiveButAddressed();
testSerendipityAmbientOnlyBlocksAgenda();
testDramaturgNeutral();
testMissingLiveBeat();
testGateDisabledRollback();
testHoldWritesFlag();
console.log("All INTEL-1 scene-confidence tests passed.");

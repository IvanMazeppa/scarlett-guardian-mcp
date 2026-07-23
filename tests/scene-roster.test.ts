/**
 * WP-5.7 — scene roster activation, cap, presentCast parse.
 */
import assert from "node:assert/strict";
import { parseLiveBeat } from "../src/guardian/recency.js";
import { resolveSceneRoster } from "../src/guardian/scene-roster.js";

function testAddressedWins() {
  const r = resolveSceneRoster({
    userMessage: "Shevchenko is waiting by the screens — ask him for the heat numbers.",
    scarlettPreviousMessage: "The front is planted.",
    liveBeat: {
      lastUpdated: "",
      locationLine: "pit box",
      timeLine: "",
      liveCues: ["pit box"],
      supersededCues: [],
      antiResetNotes: [],
      presentCast: ["Scarlett", "Benjamin"]
    }
  });
  assert.ok(r.active.some((a) => a.id === "shevchenko"), r.summary);
  assert.equal(
    r.active.find((a) => a.id === "shevchenko")?.activation,
    "addressed"
  );
  console.log("ok addressed Shevchenko");
}

function testPresentCastActivation() {
  const r = resolveSceneRoster({
    userMessage: "Water, älskling.",
    liveBeat: {
      lastUpdated: "",
      locationLine: "pit box",
      timeLine: "",
      liveCues: [],
      supersededCues: [],
      antiResetNotes: [],
      presentCast: ["Scarlett", "Benjamin", "Shevchenko", "AMG engineers"]
    }
  });
  assert.ok(r.active.some((a) => a.id === "shevchenko"));
  assert.ok(r.active.some((a) => a.id === "amg_engineers"));
  assert.ok(r.active.length <= 4, `cap 4, got ${r.active.length}`);
  console.log("ok present cast", r.summary);
}

function testCapAtFour() {
  const r = resolveSceneRoster({
    userMessage:
      "Ryan texted, Lynn called, Chris and Deb about the wedding, Maya messaged, and Shevchenko wants telemetry.",
    liveBeat: {
      lastUpdated: "",
      locationLine: "",
      timeLine: "",
      liveCues: [],
      supersededCues: [],
      antiResetNotes: [],
      presentCast: []
    }
  });
  assert.equal(r.active.length, 4);
  assert.ok(r.background.length >= 1, "overflow should go to background");
  // Direct address ranking: all are addressed; first four by sort stability
  console.log("ok cap 4", r.summary);
}

function testParsePresentField() {
  const md = `
# Current Story State

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Pit box Nordschleife
- **Present:** Scarlett, Benjamin, Mr. Shevchenko, AMG engineers
- **Time in Story:** Friday afternoon

## Recent Key Events (Last 1–3 Sessions — Brief)

- Out lap done.

## Notes for Next Response

- Do not reset to first lap.
`;
  const beat = parseLiveBeat(md);
  assert.ok(beat.presentCast && beat.presentCast.length >= 3, String(beat.presentCast));
  assert.ok(beat.presentCast!.some((p) => /shevchenko/i.test(p)));
  const block = // formatLiveBeat used in other tests
    beat.presentCast!.join(", ");
  assert.match(block, /Shevchenko|engineers/i);
  console.log("ok parse Present:", beat.presentCast!.join(" | "));
}

function testNoFalseRyanOnDinner() {
  const r = resolveSceneRoster({
    userMessage: "Let's talk about partnership and dinner conversation.",
    liveBeat: {
      lastUpdated: "",
      locationLine: "hotel suite",
      timeLine: "",
      liveCues: ["partnership", "dinner", "conversation"],
      supersededCues: ["ordinary"],
      antiResetNotes: [],
      presentCast: ["Scarlett", "Benjamin"]
    }
  });
  assert.ok(!r.active.some((a) => a.id === "ryan"), r.summary);
  console.log("ok no false Ryan");
}

function testPrivateVenueSuppressesEngineers() {
  const r = resolveSceneRoster({
    userMessage: "Stay under the duvet with me. Ignore work.",
    scarlettPreviousMessage: "Mmm.",
    liveBeat: {
      lastUpdated: "",
      locationLine: "Schloss Lieser suite, king-sized bed, under the duvet",
      timeLine: "Saturday morning",
      liveCues: ["suite", "bed", "duvet", "aftercare"],
      supersededCues: ["paddock", "engineers"],
      antiResetNotes: [],
      presentCast: ["Scarlett and Benjamin only"]
    },
    arcCastText: "Shevchenko and AMG engineers wait on Monday Affalterbach telemetry."
  });
  assert.ok(!r.active.some((a) => a.id === "amg_engineers"), r.summary);
  assert.ok(!r.active.some((a) => a.id === "shevchenko"), r.summary);
  console.log("ok private venue suppresses engineers/Shevchenko bleed");
}

testAddressedWins();
testPresentCastActivation();
testCapAtFour();
testParsePresentField();
testNoFalseRyanOnDinner();
testPrivateVenueSuppressesEngineers();
console.log("All WP-5.7 scene-roster tests passed.");

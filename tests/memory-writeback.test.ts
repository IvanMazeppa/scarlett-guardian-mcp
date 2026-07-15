import assert from "node:assert/strict";
import {
  decideMemoryWrite,
  isMaterialMemoryUpdate,
  isNoOpMemoryUpdate
} from "../src/guardian/memory-writeback.js";

assert.equal(isNoOpMemoryUpdate(null), true);
assert.equal(isNoOpMemoryUpdate(""), true);
assert.equal(isNoOpMemoryUpdate("No durable canon change. Scene stays aligned."), true);
assert.equal(isNoOpMemoryUpdate("n/a"), true);
assert.equal(
  isNoOpMemoryUpdate(
    "Scarlett completed the shakedown lap on the Nordschleife; Benjamin remains on pit radio with AMG."
  ),
  false
);

assert.equal(
  isMaterialMemoryUpdate("No durable canon change.", { continuity_risk_level: "high" }, []),
  false
);

assert.equal(
  isMaterialMemoryUpdate(
    "They remain in the same room talking softly with no location change.",
    { continuity_risk_level: "low" },
    ["Intimacy, kink, dominance, consent, or aftercare"]
  ),
  false
);

assert.equal(
  isMaterialMemoryUpdate(
    "Scarlett has now completed her first shakedown lap on the Nordschleife; Black Panther aero is healthy; Benjamin is on pit wall radio.",
    { continuity_risk_level: "low" },
    ["AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc"]
  ),
  true
);

assert.equal(
  isMaterialMemoryUpdate(
    "Relationship milestone: first public pit-wall claim after track session with Shevchenko present.",
    { continuity_risk_level: "medium" },
    []
  ),
  true
);

const skipNoop = decideMemoryWrite({
  candidateUpdate: "Scene stays aligned with established baseline.",
  assessment: { enabled: true, continuity_risk_level: "low" },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "stage"
});
assert.equal(skipNoop.action, "none");

const stageMaterial = decideMemoryWrite({
  candidateUpdate:
    "Friday afternoon: Scarlett finished the Black Panther shakedown lap at the Nordschleife; Benjamin stays on pit radio with AMG engineers.",
  assessment: { enabled: true, continuity_risk_level: "medium", scene_state_delta: "On track post-shakedown." },
  highRiskTriggers: ["AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc"],
  proceedRecommendation: "proceed",
  writeMode: "stage"
});
assert.equal(stageMaterial.action, "stage");
if (stageMaterial.action === "stage") {
  assert.match(stageMaterial.content, /Proposed continuity update/);
  assert.match(stageMaterial.content, /shakedown lap/);
}

const liveMaterial = decideMemoryWrite({
  candidateUpdate:
    "Arrived at Affalterbach AMG HQ after Nürburgring; presentation slot is next.",
  assessment: { enabled: true, continuity_risk_level: "high" },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "live"
});
assert.equal(liveMaterial.action, "live_append");

const offMode = decideMemoryWrite({
  candidateUpdate: "Major move to Stockholm for family visit.",
  assessment: { enabled: true, continuity_risk_level: "high" },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "off"
});
assert.equal(offMode.action, "none");

const blocked = decideMemoryWrite({
  candidateUpdate: "They moved to the villa overnight.",
  assessment: { enabled: true, continuity_risk_level: "high", should_block_prose: true },
  highRiskTriggers: [],
  proceedRecommendation: "do_not_proceed",
  writeMode: "stage"
});
assert.equal(blocked.action, "none");

console.log("memory-writeback tests passed");

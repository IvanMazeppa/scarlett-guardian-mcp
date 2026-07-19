import assert from "node:assert/strict";
import {
  applyNpcStateChangesToRegistryMarkdown,
  decideNpcStateWrite,
  decideMemoryWrite,
  formatBeatAdvanceSessionContent,
  hasLiveBeatDelta,
  isMaterialMemoryUpdate,
  isNoOpMemoryUpdate
} from "../src/guardian/memory-writeback.js";
import type { NpcStateChange } from "../src/guardian/llm-assessment.js";
import {
  formatSceneCastBlock,
  parseRegistryTails
} from "../src/guardian/npc-registry.js";
import type { RagToolCaller } from "../src/guardian/rag-client.js";
import type { RagToolCall } from "../src/guardian/report/models.js";
import type { LiveBeat } from "../src/guardian/recency.js";
import { applyNpcStateChangeWrites } from "../src/guardian/tools/preflight.js";

const trackBeat: LiveBeat = {
  lastUpdated: "Friday afternoon — post out lap / shakedown",
  locationLine:
    "Nürburgring Nordschleife, Industry Pool. Scarlett in the Black Panther on track; Benjamin on the pit wall.",
  timeLine: "Friday, midday into early afternoon",
  liveCues: ["out lap", "nordschleife", "pit wall", "black panther", "shakedown"],
  supersededCues: ["changing-room", "luxembourg"],
  antiResetNotes: ["paddock changing room as current location"]
};

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
    ["Intimacy, kink, dominance, consent, or aftercare"],
    trackBeat
  ),
  false
);

// Generic advance language (no Germany-only regex dependency).
assert.equal(
  isMaterialMemoryUpdate(
    "Scarlett has now completed her first shakedown lap on the Nordschleife; Black Panther aero is healthy; Benjamin is on pit wall radio.",
    { continuity_risk_level: "low" },
    ["AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc"],
    trackBeat
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

// Live-beat delta: new place not in current live snapshot (post-Germany future).
assert.equal(
  hasLiveBeatDelta(
    "Arrived at Affalterbach AMG headquarters after the Nürburgring test; presentation prep begins.",
    trackBeat
  ),
  true
);

assert.equal(
  isMaterialMemoryUpdate(
    "Arrived at Affalterbach AMG headquarters after the Nürburgring test; presentation prep begins tomorrow morning with the aero team.",
    { continuity_risk_level: "low" },
    [],
    trackBeat
  ),
  true
);

// Same-beat restatement without novel place → not material at low risk when no advance verbs... 
// "still on track talking" is same-scene
assert.equal(
  isMaterialMemoryUpdate(
    "They remain at the same pit wall talking softly about tyre temps with no location change.",
    { continuity_risk_level: "low" },
    [],
    trackBeat
  ),
  false
);

const skipNoop = decideMemoryWrite({
  candidateUpdate: "Scene stays aligned with established baseline.",
  assessment: { enabled: true, continuity_risk_level: "low" },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "stage",
  liveBeat: trackBeat
});
assert.equal(skipNoop.action, "none");

const stageMaterial = decideMemoryWrite({
  candidateUpdate:
    "Friday afternoon: Scarlett finished the Black Panther shakedown lap at the Nordschleife; Benjamin stays on pit radio with AMG engineers.",
  assessment: { enabled: true, continuity_risk_level: "medium", scene_state_delta: "On track post-shakedown." },
  highRiskTriggers: ["AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc"],
  proceedRecommendation: "proceed",
  writeMode: "stage",
  liveBeat: trackBeat
});
assert.equal(stageMaterial.action, "stage");
if (stageMaterial.action === "stage") {
  assert.match(stageMaterial.content, /Proposed continuity update/);
  assert.match(stageMaterial.content, /## Session —/);
  assert.match(stageMaterial.content, /shakedown lap/);
}

const liveMaterial = decideMemoryWrite({
  candidateUpdate:
    "Arrived at Affalterbach AMG HQ after Nürburgring; presentation slot is next.",
  assessment: { enabled: true, continuity_risk_level: "high" },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "live",
  liveBeat: trackBeat
});
assert.equal(liveMaterial.action, "live_append");
if (liveMaterial.action === "live_append") {
  assert.match(liveMaterial.content, /## Session —/);
  assert.match(liveMaterial.content, /Affalterbach/);
}

const offMode = decideMemoryWrite({
  candidateUpdate: "Major move to Stockholm for family visit.",
  assessment: { enabled: true, continuity_risk_level: "high" },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "off"
});
assert.equal(offMode.action, "none");

// WP-4.1: auditor scene_transition → stage_transition class
const transitionWrite = decideMemoryWrite({
  candidateUpdate:
    "Departed Nordschleife paddock; arrived Affalterbach AMG HQ for the aero presentation.",
  assessment: {
    enabled: true,
    continuity_risk_level: "medium",
    scene_transition: {
      occurred: true,
      from: "Nürburgring Industry Pool paddock, Friday afternoon",
      to: "Affalterbach AMG headquarters, presentation bay",
      kind: "location"
    }
  },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "stage",
  liveBeat: trackBeat
});
assert.equal(transitionWrite.action, "stage_transition");
if (transitionWrite.action === "stage_transition") {
  assert.match(transitionWrite.reason, /stage_transition/);
  assert.equal(transitionWrite.transition.kind, "location");
  assert.match(transitionWrite.transition.to ?? "", /Affalterbach/);
  assert.match(transitionWrite.content, /## Session —/);
}

// Transition declared with empty candidate → synthetic note still stages as transition
const transitionOnly = decideMemoryWrite({
  candidateUpdate: null,
  assessment: {
    enabled: true,
    continuity_risk_level: "low",
    scene_transition: {
      occurred: true,
      from: "Villa Pétrusse, Luxembourg",
      to: "Eifel B-roads toward Nürburg",
      kind: "both"
    }
  },
  highRiskTriggers: [],
  proceedRecommendation: "proceed",
  writeMode: "stage",
  liveBeat: trackBeat
});
assert.equal(transitionOnly.action, "stage_transition");
if (transitionOnly.action === "stage_transition") {
  assert.match(transitionOnly.content, /Scene transition/);
}

const blocked = decideMemoryWrite({
  candidateUpdate: "They moved to the villa overnight.",
  assessment: { enabled: true, continuity_risk_level: "high", should_block_prose: true },
  highRiskTriggers: [],
  proceedRecommendation: "do_not_proceed",
  writeMode: "stage"
});
assert.equal(blocked.action, "none");

const sessionBody = formatBeatAdvanceSessionContent(
  "Completed thermal lap; returning to Industry Pool for debrief.",
  trackBeat
);
assert.match(sessionBody, /^## Session — /);
assert.match(sessionBody, /Friday/);
assert.match(sessionBody, /thermal lap/);

// WP-5.9: NPC deltas only route at scene close; knowledge is human-always.
const dispositionChange: NpcStateChange = {
  npc: "Karin",
  kind: "disposition",
  change: "Professional skepticism resolved after reviewing the full telemetry",
  evidence: "Karin signed the thermal sheet and called the aero result proven."
};
const knowledgeChange: NpcStateChange = {
  npc: "Karin",
  kind: "knowledge",
  change: "Saw Benjamin's complete adaptive-aero telemetry package",
  evidence: "Benjamin handed Karin the unredacted telemetry export."
};

const sameSceneNpc = decideNpcStateWrite({
  changes: [dispositionChange],
  sceneTransitionOccurred: false,
  proceedRecommendation: "proceed",
  writeMode: "stage"
});
assert.equal(sameSceneNpc.action, "none");
assert.match(sameSceneNpc.reason, /scene not closed/);

const knowledgeDecision = decideNpcStateWrite({
  changes: [dispositionChange, knowledgeChange],
  sceneTransitionOccurred: true,
  proceedRecommendation: "proceed",
  writeMode: "stage"
});
assert.equal(knowledgeDecision.action, "stage_npc");
if (knowledgeDecision.action !== "stage_npc") {
  throw new Error("expected scene-close NPC write decision");
}
assert.equal(knowledgeDecision.requiresHumanReview, true);

const registryFixture = `# Secondary Characters

### Karin
Existing stable character prose.

**Disposition (couple):** Professionally skeptical (VOLATILE)
**Wants now:** Tire-temperature deltas before sign-off (VOLATILE)
**Knows:** Scarlett is the test driver (STABLE)
**Must not accidentally learn:** Scarlett is trans (STABLE)
**Last seen:** Affalterbach presentation bay, morning (VOLATILE)

### Dr Berg (Swedish Doctor)
**Disposition (couple):** Trusted medical contact (VOLATILE)
`;

const rewritten = applyNpcStateChangesToRegistryMarkdown(
  registryFixture,
  knowledgeDecision.changes
);
assert.equal(rewritten.applied.length, 2);
assert.match(
  rewritten.markdown,
  /Professional skepticism resolved after reviewing the full telemetry \(VOLATILE\)/
);
assert.match(
  rewritten.markdown,
  /Scarlett is the test driver; Saw Benjamin's complete adaptive-aero telemetry package \(STABLE\)/
);

// The rewritten registry feeds the existing Scene Cast parser/compiler path next session.
const nextBriefCast = formatSceneCastBlock(
  {
    active: [{ id: "karin", displayName: "Karin", activation: "present_cast" }],
    background: [],
    summary: "Active: Karin"
  },
  parseRegistryTails(rewritten.markdown)
);
assert.match(nextBriefCast, /skepticism resolved/i);
assert.match(nextBriefCast, /⚠/);

const ragCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const fakeRag: RagToolCaller = {
  async callJsonTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    ragCalls.push({ name, args });
    if (name === "stage_story_update") {
      return { staged_update: { id: "npc-stage-1" } } as T;
    }
    return { success: true } as T;
  },
  async callTextTool(): Promise<string> {
    return "";
  }
};
const npcToolCalls: RagToolCall[] = [];
const knowledgeStage = await applyNpcStateChangeWrites({
  writeDecision: knowledgeDecision,
  ragClient: fakeRag,
  toolCalls: npcToolCalls,
  preflightQuery: "Karin telemetry scene close",
  autoApprove: "beats_and_valid_transitions",
  registryMarkdown: registryFixture
});
assert.equal(knowledgeStage.action, "held_for_review");
assert.match(knowledgeStage.reason, /KNOWLEDGE HUMAN REVIEW REQUIRED/);
assert.deepEqual(
  ragCalls.map((call) => call.name),
  ["stage_story_update"],
  "knowledge batch must never call approval tools"
);
assert.equal(ragCalls[0]?.args.mode, "overwrite");

ragCalls.length = 0;
const volatileDecision = decideNpcStateWrite({
  changes: [dispositionChange],
  sceneTransitionOccurred: true,
  proceedRecommendation: "proceed",
  writeMode: "stage"
});
if (volatileDecision.action !== "stage_npc") {
  throw new Error("expected volatile NPC stage decision");
}
const volatileStage = await applyNpcStateChangeWrites({
  writeDecision: volatileDecision,
  ragClient: fakeRag,
  toolCalls: [],
  preflightQuery: "Karin telemetry scene close",
  autoApprove: "beats_and_valid_transitions",
  registryMarkdown: registryFixture
});
assert.equal(volatileStage.action, "staged");
assert.deepEqual(
  ragCalls.map((call) => call.name),
  [
    "stage_story_update",
    "approve_staged_story_update",
    "approve_staged_story_update"
  ]
);

console.log("memory-writeback tests passed");

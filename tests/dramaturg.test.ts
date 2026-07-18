/**
 * WP-5.2 — parseArcPlan, deterministic beat-diff, mechanical momentum, auditor/brief hooks.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDramaturgSnapshot,
  composeMomentumLine,
  diffBeatsAgainstLive,
  formatStoryMomentumBlock,
  loadActiveArcPlan,
  parseArcPlan
} from "../src/guardian/dramaturg.js";
import {
  buildAuditorSystemPrompt,
  buildAuditorUserMessage
} from "../src/guardian/llm-assessment.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";
import type { LiveBeat } from "../src/guardian/recency.js";

const arcPlanPath = path.resolve(
  process.cwd(),
  "../rag-memory-mcp/project_source_files/arc-plans/arc-09-nurburgring-track-day.md"
);

const samplePlan = fs.existsSync(arcPlanPath)
  ? fs.readFileSync(arcPlanPath, "utf8")
  : `
# Arc Plan: arc-09-nurburgring-track-day
**Status:** active
**Slug:** arc-09-nurburgring-track-day

## Beat 1 — Arrival at the Nordschleife paddock (midday)
- **kind:** fixed
- **setting:** industry paddock arrival
- **cast:** Shevchenko, engineers
- **pressure:** On site and introduced before any lap.

## Beat 2 — The Green Hell (afternoon)
- **kind:** open
- **setting:** Nordschleife on track pit wall telemetry
- **cast:** Scarlett driver Benjamin pit wall
- **pressure:** Real track time and live telemetry.

## Beat 3 — Adrenaline crash and debrief (late afternoon)
- **kind:** open
- **setting:** Return to paddock pit box aftercare debrief
- **cast:** Scarlett post-stint engineers
- **pressure:** Return, telemetry debrief, grounding.

## Beat 4 — Transition toward recovery and Affalterbach runway (evening)
- **kind:** conditional
- **setting:** hotel Nürburg Affalterbach runway
- **pressure:** Leave circuit when track day is done.
`;

function testParseArcPlan() {
  const plan = parseArcPlan(samplePlan, arcPlanPath);
  assert.equal(plan.status, "active");
  assert.match(plan.slug, /arc-09/i);
  assert.equal(plan.beats.length, 4);
  assert.equal(plan.beats[0].kind, "fixed");
  assert.equal(plan.beats[1].kind, "open");
  assert.equal(plan.beats[3].kind, "conditional");
  assert.ok(plan.beats[2].pressure.toLowerCase().includes("debrief") || plan.beats[2].pressure.length > 0);
  assert.ok(plan.beats[1].cues.length > 0, "beat 2 should extract cues");
  console.log("ok parseArcPlan");
}

function testDiffOnTrackIsBeat2() {
  const plan = parseArcPlan(samplePlan);
  const liveBeat: LiveBeat = {
    lastUpdated: "Friday afternoon — on track",
    locationLine: "Nürburgring Nordschleife — Scarlett on track, Benjamin on pit wall",
    timeLine: "Friday afternoon",
    liveCues: ["out lap", "pit wall", "nordschleife", "on track", "telemetry"],
    supersededCues: ["changing-room", "motion-sick", "arrival", "paddock arrival"],
    antiResetNotes: []
  };
  const beats = diffBeatsAgainstLive(plan, liveBeat);
  const live = beats.find((b) => b.status === "live");
  assert.ok(live, "expected a live beat");
  // Green Hell / track should win over arrival
  assert.ok(
    live!.index === 2 || /green hell|track|nordschleife/i.test(live!.name),
    `expected track-day live beat, got ${live!.index} ${live!.name}`
  );
  assert.equal(beats.filter((b) => b.status === "done").length >= 1, true);
  const next = beats.find((b) => b.status === "next");
  assert.ok(next, "expected next beat");
  console.log("ok diff on-track → beat 2-ish", live!.index, live!.name);
}

function testDiffDebriefIsBeat3() {
  const plan = parseArcPlan(samplePlan);
  const liveBeat: LiveBeat = {
    lastUpdated: "Friday late afternoon — post stint pit box",
    locationLine: "Nordschleife industry paddock / pit box — Scarlett out of the car",
    timeLine: "Late afternoon",
    liveCues: ["pit box", "debrief", "aftercare", "paddock", "telemetry"],
    supersededCues: ["out lap", "on track", "pit wall", "shakedown", "green hell"],
    antiResetNotes: []
  };
  const beats = diffBeatsAgainstLive(plan, liveBeat);
  const live = beats.find((b) => b.status === "live");
  assert.ok(live);
  assert.ok(
    live!.index >= 3 || /debrief|adrenaline|crash/i.test(live!.name),
    `expected debrief-ish live, got ${live!.index} ${live!.name}`
  );
  const line = composeMomentumLine(plan, beats);
  assert.match(line, /Beat \d+ of 4/i);
  assert.match(line, /world is ready/i);
  assert.ok(!/she will|must succeed|lap time/i.test(line), "no outcome language");
  console.log("ok diff debrief + momentum:", line.slice(0, 120));
}

function testSnapshotAndBlocks() {
  const liveBeat: LiveBeat = {
    lastUpdated: "post stint",
    locationLine: "pit box paddock debrief",
    timeLine: "late afternoon",
    liveCues: ["pit box", "debrief", "aftercare"],
    supersededCues: ["out lap", "nordschleife", "on track"],
    antiResetNotes: []
  };
  const snap = buildDramaturgSnapshot(samplePlan, liveBeat, arcPlanPath);
  assert.ok(snap.momentumLine.length > 20);
  assert.ok(snap.beats.some((b) => b.status === "live"));

  const block = formatStoryMomentumBlock(snap);
  assert.match(block, /### STORY MOMENTUM/);
  assert.match(block, /pressure/i);

  const empty = formatStoryMomentumBlock(undefined);
  assert.match(empty, /no active arc plan/i);

  const msg = buildAuditorUserMessage(
    {
      preflightInput: { user_message: "Water, then telemetry." },
      memories: [],
      expandedContexts: [],
      factChecks: [],
      highRiskTriggers: [],
      liveBeat,
      dramaturg: snap
    },
    4000
  );
  const liveIdx = msg.indexOf("### LIVE BEAT");
  const momIdx = msg.indexOf("### STORY MOMENTUM");
  const evIdx = msg.indexOf("### RETRIEVED EVIDENCE");
  assert.ok(liveIdx >= 0 && momIdx > liveIdx && evIdx > momIdx, "order LIVE → MOMENTUM → EVIDENCE");

  const sys = buildAuditorSystemPrompt();
  assert.match(sys, /STORY MOMENTUM/i);
  assert.match(sys, /never outcomes/i);

  const report = {
    retrieval_status: "success",
    confidence_score: 80,
    proceed_recommendation: "proceed",
    current_state_summary: "Pit box after the stint.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Grounded and warm.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    story_momentum: snap.momentumLine,
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: []
  } satisfies GuardianReport;

  const brief = compileGrokBrief(report);
  assert.match(brief, /\*\*Story Momentum:\*\*/);
  assert.ok(brief.includes(snap.momentumLine.slice(0, 40)));
  console.log("ok snapshot + auditor order + brief");
}

function testLoadActiveFromSibling() {
  const loaded = loadActiveArcPlan(process.cwd());
  if (!fs.existsSync(arcPlanPath)) {
    console.log("skip loadActive (arc plan file not on disk)");
    return;
  }
  assert.ok(loaded, "should find active arc plan beside guardian via rag-memory-mcp path");
  assert.match(loaded!.sourcePath, /arc-09-nurburgring-track-day\.md/);
  assert.match(loaded!.markdown, /\*\*Status:\*\*\s*active/i);
  console.log("ok loadActiveArcPlan", path.basename(loaded!.sourcePath));
}

testParseArcPlan();
testDiffOnTrackIsBeat2();
testDiffDebriefIsBeat3();
testSnapshotAndBlocks();
testLoadActiveFromSibling();
console.log("All WP-5.2 dramaturg tests passed.");

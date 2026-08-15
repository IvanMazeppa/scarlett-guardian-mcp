/**
 * Mission Control — scene modes, lore packs, location streak, classifiers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatSceneModeBriefBlock,
  locationStagnationThreshold,
  normalizeMissionControlState,
  readMissionControlState,
  resolveMissionControlForPreflight,
  writeMissionControlState
} from "../src/guardian/mission-control.js";
import {
  getLorePackMeta,
  listLorePacks,
  resolveLorePackSourceFiles
} from "../src/guardian/lore-packs.js";
import {
  computeLocationFingerprint,
  tickLocationProgress
} from "../src/guardian/location-progress.js";
import {
  classifyCorrectionKind,
  classifyIntention
} from "../src/guardian/telemetry.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

// --- classifiers ---
assert.equal(classifyIntention("Lead him to the window and initiate a kiss."), "initiate");
assert.equal(classifyIntention("Rest against him and stay quiet."), "rest");
assert.equal(classifyIntention("Receive his touch and soften."), "receive");
assert.equal(classifyIntention(null), "unknown");

assert.equal(
  classifyCorrectionKind("Critical rewind: cis-washing replaced pre-op anatomy."),
  "cis_wash"
);
assert.equal(classifyCorrectionKind("Mechanical parroting — only agreeing."), "parroting");
assert.equal(classifyCorrectionKind("Location rewind to the wrong suite."), "location_rewind");
assert.equal(classifyCorrectionKind(null), "none");

// --- mission control state ---
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-"));
  const state = await writeMissionControlState(
    { sceneMode: "banter", lorePack: "europe-arm" },
    dir
  );
  assert.equal(state.sceneMode, "banter");
  assert.equal(state.lorePack, "europe-arm");
  const read = readMissionControlState(dir);
  assert.equal(read.sceneMode, "banter");
  assert.equal(read.lorePack, "europe-arm");

  const isolated = resolveMissionControlForPreflight({ isolateSidecars: true, cwd: dir });
  assert.equal(isolated.sceneMode, "default");
  assert.equal(isolated.lorePack, "none");

  assert.equal(normalizeMissionControlState({ sceneMode: "nope" as never }).sceneMode, "default");
}

assert.match(formatSceneModeBriefBlock("banter"), /BANTER/);
assert.match(formatSceneModeBriefBlock("explicit_slow_burn"), /SLOW-BURN/);
assert.match(formatSceneModeBriefBlock("tactical"), /TACTICAL/);
assert.equal(formatSceneModeBriefBlock("default"), "");
assert.equal(locationStagnationThreshold("default"), 15);
assert.equal(locationStagnationThreshold("explicit_slow_burn"), 25);

// --- location streak ---
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loc-"));
  const fp = computeLocationFingerprint("Private Aviation Terminal tarmac");
  assert.equal(fp.length, 16);
  const a = tickLocationProgress({
    locationLine: "Private Aviation Terminal tarmac",
    sceneMode: "default",
    persist: true,
    cwd: dir
  });
  assert.equal(a.consecutiveTurns, 1);
  const b = tickLocationProgress({
    locationLine: "Private Aviation Terminal tarmac",
    sceneMode: "default",
    persist: true,
    cwd: dir
  });
  assert.equal(b.consecutiveTurns, 2);
  const c = tickLocationProgress({
    locationLine: "Somewhere else entirely",
    sceneMode: "default",
    persist: true,
    cwd: dir
  });
  assert.equal(c.consecutiveTurns, 1);

  // eval isolation: no persist, streak always starts at 1 from null prev
  const evalTick = tickLocationProgress({
    locationLine: "Private Aviation Terminal tarmac",
    sceneMode: "banter",
    persist: false,
    cwd: dir
  });
  assert.equal(evalTick.consecutiveTurns, 1);
}

// force stagnation
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stag-"));
  let last = tickLocationProgress({
    locationLine: "Same suite",
    sceneMode: "default",
    persist: true,
    cwd: dir
  });
  for (let i = 0; i < 14; i++) {
    last = tickLocationProgress({
      locationLine: "Same suite",
      sceneMode: "default",
      persist: true,
      cwd: dir
    });
  }
  assert.equal(last.consecutiveTurns, 15);
  assert.equal(last.stagnation, true);
  assert.equal(last.threshold, 15);
}

// --- lore packs ---
{
  const packs = listLorePacks();
  assert.ok(packs.some((p) => p.id === "europe-arm"));
  assert.equal(getLorePackMeta("none").roots.length, 0);
  const files = resolveLorePackSourceFiles("europe-arm");
  assert.ok(files.length > 0, "europe-arm should resolve markdown files");
  assert.ok(files.every((f) => f.startsWith("project_source_files/historical/europe-arm/")));
  const letters = resolveLorePackSourceFiles("letters");
  assert.ok(letters.length >= 1);
}

// --- brief injection ---
{
  const base: GuardianReport = {
    retrieval_status: "success",
    confidence_score: 90,
    proceed_recommendation: "proceed",
    current_state_summary: "On the tarmac by the Gulfstream.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Warm and present.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "ok",
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: [],
    scene_mode: "banter"
  };
  const md = compileGrokBrief(base);
  assert.match(md, /SCENE MODE \(ACTIVE\): BANTER/);
  assert.match(md, /Status:/);

  const defaultMd = compileGrokBrief({ ...base, scene_mode: "default" });
  assert.doesNotMatch(defaultMd, /SCENE MODE \(ACTIVE\)/);
}

console.log("mission-control.test.ts: ok");

/**
 * INTEL-2 — live-scene fingerprint, dramaturg invalidation, serendipity isolation,
 * superseded-cue agendas, dramaturg NPC corroboration.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeLiveSceneFingerprint,
  fingerprintsMatch
} from "../src/guardian/scene-fingerprint.js";
import {
  hashArcPlanMarkdown,
  readDramaturgCache,
  resolveHotPathDramaturg,
  shouldRefreshDramaturg,
  writeDramaturgCache,
  type DramaturgCacheFile,
  type DramaturgSnapshot
} from "../src/guardian/dramaturg.js";
import {
  intersectAgendasWithLiveScene,
  mergeNpcIntersections,
  parseNpcAgendas
} from "../src/guardian/npc-agendas.js";
import {
  emptySerendipityState,
  prepareSerendipityStateForScene,
  selectSerendipity
} from "../src/guardian/serendipity-weaver.js";
import type { LiveBeat } from "../src/guardian/recency.js";

const cabin: LiveBeat = {
  lastUpdated: "night",
  locationLine: "Black Panther cabin engine off",
  timeLine: "Friday night",
  liveCues: ["cabin", "parked"],
  supersededCues: [],
  antiResetNotes: [],
  presentCast: ["Scarlett", "Benjamin"]
};

const suite: LiveBeat = {
  lastUpdated: "Saturday morning",
  locationLine: "Schloss Lieser suite king bed",
  timeLine: "Saturday morning",
  liveCues: ["suite", "bed", "hotel"],
  supersededCues: ["cabin", "paddock", "engineers"],
  antiResetNotes: [],
  presentCast: ["Scarlett and Benjamin only"]
};

function testFingerprintDiffersAcrossScenes() {
  const a = computeLiveSceneFingerprint(cabin);
  const b = computeLiveSceneFingerprint(suite);
  assert.notEqual(a, b);
  assert.equal(fingerprintsMatch(a, a), true);
  assert.equal(fingerprintsMatch(a, b), false);
  console.log("ok fingerprints differ cabin vs suite");
}

function testDramaturgInvalidatesOnSceneChange() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intel2-dramaturg-"));
  const det: DramaturgSnapshot = {
    arcSlug: "test",
    planStatus: "active",
    beats: [],
    momentumLine: "Deterministic cabin pressure.",
    planWarnings: [],
    source: "deterministic"
  };
  const planHash = hashArcPlanMarkdown("# plan");
  const cache: DramaturgCacheFile = {
    version: 1,
    turnCounter: 3,
    context: {
      arcSlug: "test",
      beats: [],
      momentumLine: "LLM paddock engineers wait on telemetry.",
      npcIntersections: [
        { npc: "Mr. Shevchenko", agenda: "data package", suggestedTier: "engaging" }
      ],
      planWarnings: [],
      generatedAtTurn: 2,
      source: "llm",
      planHash,
      refreshedAt: new Date().toISOString(),
      liveSceneFingerprint: computeLiveSceneFingerprint(cabin)
    }
  };
  writeDramaturgCache(cache, tmp);

  // Same scene → cache usable
  const same = resolveHotPathDramaturg({
    deterministic: det,
    cache: readDramaturgCache(tmp),
    planHash,
    liveBeat: cabin,
    bumpTurn: false,
    rootDir: tmp
  });
  assert.equal(same.snapshot.source, "llm_cache");
  assert.match(same.snapshot.momentumLine, /LLM paddock/);

  // Changed scene → deterministic
  const changed = resolveHotPathDramaturg({
    deterministic: { ...det, momentumLine: "Deterministic suite morning." },
    cache: readDramaturgCache(tmp),
    planHash,
    liveBeat: suite,
    bumpTurn: false,
    rootDir: tmp
  });
  assert.equal(changed.snapshot.source, "deterministic");
  assert.match(changed.snapshot.momentumLine, /suite|Deterministic/i);
  assert.ok(changed.cacheInvalidationReason);

  const refresh = shouldRefreshDramaturg({
    enabled: true,
    llmEnabled: true,
    hasApiKey: true,
    hasPlan: true,
    cache: readDramaturgCache(tmp),
    planHash,
    turnCounter: 10,
    stalenessTurns: 12,
    sceneTransitionOccurred: false,
    currentSceneFingerprint: computeLiveSceneFingerprint(suite)
  });
  assert.equal(refresh.refresh, true);
  assert.equal(refresh.reason, "scene_fingerprint");
  console.log("ok dramaturg invalidates on live scene change");
}

function testSerendipityThreadAndSceneIsolation() {
  const state = emptySerendipityState();
  state.threadKey = "thread-A";
  state.sceneFingerprint = "fp-cabin";
  state.deferred = [
    {
      eventId: "weather_rain",
      queuedAtTurn: 1,
      expiresAtTurn: 99,
      sceneFingerprint: "fp-cabin",
      threadKey: "thread-A"
    }
  ];

  // Same thread + scene keeps deferred
  const same = prepareSerendipityStateForScene(state, {
    threadKey: "thread-A",
    sceneFingerprint: "fp-cabin"
  });
  assert.equal(same.deferred.length, 1);

  // Scene change drops untagged-or-mismatched deferred
  const sceneB = prepareSerendipityStateForScene(state, {
    threadKey: "thread-A",
    sceneFingerprint: "fp-suite"
  });
  assert.equal(sceneB.deferred.length, 0, "cross-scene deferred must not apply");

  // Thread change clears deferred
  const threadB = prepareSerendipityStateForScene(state, {
    threadKey: "thread-B",
    sceneFingerprint: "fp-cabin"
  });
  assert.equal(threadB.deferred.length, 0, "cross-thread deferred must not apply");
  console.log("ok serendipity thread/scene isolation");
}

function testDeferredExpiry() {
  const state = emptySerendipityState();
  state.deferred = [
    {
      eventId: "weather_rain",
      queuedAtTurn: 1,
      expiresAtTurn: 2,
      sceneFingerprint: "fp1",
      threadKey: "t1"
    }
  ];
  state.sceneFingerprint = "fp1";
  state.threadKey = "t1";
  // turnCounter becomes 3 after select → expired
  state.turnCounter = 2;
  const r = selectSerendipity(state, "downtime", [], () => 0.99, {
    sceneFingerprint: "fp1",
    threadKey: "t1"
  });
  assert.ok(!r.surfacedFromDeferral, "expired deferred must not fire");
  console.log("ok deferred expiry");
}

function testSupersededCuesDoNotActivateAgendas() {
  const agendas = parseNpcAgendas(`
## Mr. Shevchenko
**wants:** Data package before Monday board
**scene_cues:** shevchenko, paddock, engineers, telemetry, debrief
**default_tier:** engaging
**pressure_hint:** offstage data work

## Ryan (threat arc)
**wants:** Control
**scene_cues:** ryan, brother, cheltenham
**default_tier:** engaging
`);
  const live: LiveBeat = {
    lastUpdated: "Saturday",
    locationLine: "suite bed Schloss Lieser",
    timeLine: "morning",
    liveCues: ["suite", "bed", "aftercare"],
    // paddock/engineers only as superseded — must not activate
    supersededCues: ["paddock", "engineers", "telemetry", "shevchenko"],
    antiResetNotes: [],
    presentCast: ["Scarlett and Benjamin only"]
  };
  const ix = intersectAgendasWithLiveScene(
    agendas,
    live,
    "Just us under the duvet. Rain on the windows."
  );
  assert.ok(!ix.some((i) => /shevchenko|engineer/i.test(i.npc)), String(ix));
  console.log("ok superseded cues do not activate agendas");
}

function testDramaturgNpcNeedsCorroboration() {
  const det = [
    {
      npc: "AMG telemetry engineers",
      agenda: "ambient data work",
      suggestedTier: "peripheral" as const
    }
  ];
  const fromCache = [
    {
      npc: "Mr. Shevchenko",
      agenda: "wants board package",
      suggestedTier: "engaging" as const
    }
  ];
  const noCorr = mergeNpcIntersections(det, fromCache, {
    requireDramaturgCorroboration: true,
    corroborationHay: "suite bed rain duvet couple only"
  });
  assert.ok(!noCorr.some((i) => /shevchenko/i.test(i.npc)));

  const withCorr = mergeNpcIntersections(det, fromCache, {
    requireDramaturgCorroboration: true,
    corroborationHay: "Shevchenko called about the data package"
  });
  assert.ok(withCorr.some((i) => /shevchenko/i.test(i.npc)));
  console.log("ok dramaturg NPC needs current-turn corroboration");
}

function testOldCacheMissingFingerprintNotUsed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intel2-oldcache-"));
  const det: DramaturgSnapshot = {
    arcSlug: "x",
    planStatus: "active",
    beats: [],
    momentumLine: "Deterministic.",
    planWarnings: [],
    source: "deterministic"
  };
  const planHash = "abc";
  writeDramaturgCache(
    {
      version: 1,
      turnCounter: 1,
      context: {
        arcSlug: "x",
        beats: [],
        momentumLine: "Stale LLM without fingerprint.",
        npcIntersections: [],
        planWarnings: [],
        generatedAtTurn: 1,
        source: "llm",
        planHash,
        refreshedAt: new Date().toISOString()
        // no liveSceneFingerprint — old sidecar
      }
    },
    tmp
  );
  const r = resolveHotPathDramaturg({
    deterministic: det,
    cache: readDramaturgCache(tmp),
    planHash,
    liveBeat: suite,
    bumpTurn: false,
    rootDir: tmp
  });
  assert.equal(r.snapshot.source, "deterministic");
  assert.ok(r.cacheInvalidationReason);
  console.log("ok old cache without fingerprint not used as llm_cache");
}

testFingerprintDiffersAcrossScenes();
testDramaturgInvalidatesOnSceneChange();
testSerendipityThreadAndSceneIsolation();
testDeferredExpiry();
testSupersededCuesDoNotActivateAgendas();
testDramaturgNpcNeedsCorroboration();
testOldCacheMissingFingerprintNotUsed();
console.log("All INTEL-2 scene-fingerprint tests passed.");

/**
 * Ops trio 2026-07-23:
 * 1) save-lag detect + soften
 * 2) quiet private couple brief (no Story Momentum / Scene Cast)
 * 3) resonance_echo + save_lag telemetry rates
 */
import assert from "node:assert/strict";
import {
  buildAuditorSystemPrompt,
  buildAuditorUserMessage
} from "../src/guardian/llm-assessment.js";
import {
  applySaveLagSoftening,
  detectSaveLag,
  isLocationRewindCorrection
} from "../src/guardian/save-lag.js";
import {
  compileGrokBrief,
  isQuietPrivateCoupleScene
} from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";
import {
  isCoupleOnlyPresent,
  resolveSceneRoster
} from "../src/guardian/scene-roster.js";
import { buildPreflightTelemetryEvent, PreflightTelemetryCollector } from "../src/guardian/telemetry.js";
import { summarizeTelemetryEvents } from "../src/guardian/telemetry-aggregate.js";
import type { PreflightTelemetryEvent } from "../src/guardian/telemetry.js";
import type { LiveBeat } from "../src/guardian/recency.js";

const cabinLiveBeat: LiveBeat = {
  lastUpdated: "Earlier — still in cabin",
  locationLine: "Black Panther cabin, engine off, parked",
  timeLine: "Night",
  liveCues: ["cabin", "engine off", "parked", "passenger seat"],
  supersededCues: [],
  antiResetNotes: [],
  presentCast: ["Scarlett and Benjamin only"]
};

function testDetectSaveLagSuiteVsCabin() {
  const lag = detectSaveLag({
    liveBeat: cabinLiveBeat,
    userMessage:
      "I towel her hair dry in the suite doorway, steam still rising from the marble bathroom.",
    scarlettPreviousMessage:
      "She leans into the towel, aftercare soft, chandelier light on wet shoulders.",
    recentContext: "Shower finished. Suite living area. Schloss Lieser hotel night."
  });
  assert.equal(lag.suspected, true, lag.reason);
  assert.equal(lag.liveCluster, "car_cabin");
  assert.equal(lag.playedCluster, "suite_hotel");
  console.log("ok save-lag suite vs cabin");
}

function testNoLagWhenAligned() {
  const lag = detectSaveLag({
    liveBeat: {
      ...cabinLiveBeat,
      locationLine: "Suite doorway after shower, marble, chandelier",
      liveCues: ["suite", "shower", "towel", "aftercare", "marble"]
    },
    userMessage: "I dry her hair with the towel in the suite doorway.",
    scarlettPreviousMessage: "Steam and aftercare.",
    recentContext: "Hotel suite bathroom."
  });
  assert.equal(lag.suspected, false, lag.reason);
  console.log("ok no lag when aligned");
}

function testSofteningRewindsLocation() {
  assert.ok(
    isLocationRewindCorrection(
      "Return Scarlett to the parked cabin. Do not invent the suite."
    )
  );
  const soft = applySaveLagSoftening({
    saveLag: {
      suspected: true,
      liveCluster: "car_cabin",
      playedCluster: "suite_hotel",
      liveScore: 3,
      playedScore: 4,
      reason: "test"
    },
    correction: "Return Scarlett to the parked cabin. Do not invent the suite.",
    shouldBlockProse: true
  });
  assert.equal(soft.softened, true);
  assert.equal(soft.shouldBlockProse, false);
  assert.match(soft.correction ?? "", /SAVE LAG/i);
  assert.ok(!/return scarlett to the parked cabin/i.test(soft.correction ?? ""));
  console.log("ok save-lag softens location rewind");
}

function testCoupleOnlyPresentAndRosterQuiet() {
  assert.equal(isCoupleOnlyPresent(["Scarlett", "Benjamin"]), true);
  assert.equal(isCoupleOnlyPresent(["Scarlett and Benjamin only"]), true);
  assert.equal(
    isCoupleOnlyPresent(["Scarlett", "Benjamin", "Shevchenko"]),
    false
  );

  const r = resolveSceneRoster({
    userMessage: "Water, älskling. Just us.",
    scarlettPreviousMessage: "Mmm.",
    liveBeat: {
      lastUpdated: "",
      locationLine: "pit box and paddock with AMG engineers nearby",
      timeLine: "",
      liveCues: ["Shevchenko", "paddock", "telemetry debrief", "AMG"],
      supersededCues: [],
      antiResetNotes: [],
      presentCast: ["Scarlett and Benjamin only"]
    },
    arcCastText: "Shevchenko waits; Ryan texts about Monday board."
  });
  assert.equal(r.coupleOnlyPresent, true);
  assert.equal(r.active.length, 0, r.summary);
  assert.equal(r.background.length, 0);
  assert.match(r.summary, /couple-only/i);
  console.log("ok couple-only suppresses arc/cue bleed");
}

function testAddressedNpcStillActivatesInCoupleOnly() {
  const r = resolveSceneRoster({
    userMessage: "Shevchenko is outside the suite door with papers — should I let him in?",
    liveBeat: {
      lastUpdated: "",
      locationLine: "suite",
      timeLine: "",
      liveCues: [],
      supersededCues: [],
      antiResetNotes: [],
      presentCast: ["Scarlett", "Benjamin"]
    }
  });
  assert.ok(r.active.some((a) => a.id === "shevchenko"), r.summary);
  console.log("ok user-addressed NPC still activates when couple-only present");
}

function suiteReport(over: Partial<GuardianReport> = {}): GuardianReport {
  return {
    retrieval_status: "success",
    confidence_score: 90,
    proceed_recommendation: "proceed",
    current_state_summary: "Private suite doorway after the shower at Schloss Lieser.",
    grok_scene_summary: "Towel aftercare in the suite doorway; steam, marble, intimate.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "Warm intimate aftercare.",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    story_momentum: "Beat 3 of 4: Monday board and Shevchenko debrief still wait.",
    scene_roster: {
      active: [],
      background: [],
      summary: "Couple-only present (no supporting cast)"
    },
    llm_assessment: {
      enabled: true,
      scarlett_next_intention: null,
      resonance_echo: "Harness trust from South Cerney — available; don't force it."
    },
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: [],
    ...over
  } satisfies GuardianReport;
}

function testQuietPrivateBrief() {
  const report = suiteReport();
  assert.equal(isQuietPrivateCoupleScene(report), true);
  const brief = compileGrokBrief(report);
  assert.ok(!brief.includes("**Story Momentum:**"), brief);
  assert.ok(!brief.includes("**Scene Cast:**"), brief);
  assert.ok(!/Shevchenko|Monday board/i.test(brief), "schedule pressure must not leak");
  assert.match(brief, /\*\*Echo \(optional texture\):\*\*/);
  assert.match(brief, /South Cerney|harness/i);
  console.log("ok quiet private brief omits momentum + cast");
}

function testAuditorSaveLagPromptAndUserBlock() {
  const sys = buildAuditorSystemPrompt({ saveLagSuspected: true });
  assert.match(sys, /SAVE LAG/i);
  assert.match(sys, /prefer the played consensus/i);

  const userMsg = buildAuditorUserMessage(
    {
      preflightInput: {
        user_message: "Towel dry in the suite doorway.",
        scarlett_previous_message: "Aftercare soft.",
        recent_context: "Shower suite hotel marble"
      },
      memories: [],
      expandedContexts: [],
      factChecks: [],
      highRiskTriggers: [],
      liveBeat: cabinLiveBeat,
      saveLagSuspected: true
    },
    4000
  );
  assert.match(userMsg, /### SAVE LAG FLAG/);
  assert.match(userMsg, /Prefer played consensus/i);
  console.log("ok auditor system + user save-lag blocks");
}

function testTelemetryEchoAndSaveLag() {
  const collector = new PreflightTelemetryCollector();
  const event = buildPreflightTelemetryEvent({
    collector,
    input: { scarlett_previous_message: "Prior." },
    report: {
      confidence_score: 88,
      proceed_recommendation: "proceed",
      retrieval_status: "success",
      hard_flags: ["SAVE_LAG_SUSPECTED: live=car_cabin played=suite_hotel"],
      memory_write: { action: "none", reason: "noop" },
      llm_assessment: {
        supported_facts: ["a"],
        scene_state_delta: null,
        grok_performance_correction: null,
        resonance_echo: "South Cerney harness trust — available; don't force it."
      },
      current_state_summary: "suite",
      retrieval_plan: { high_risk_triggers: [] },
      tool_calls: []
    }
  });
  assert.equal(event.resonance_echo?.present, true);
  assert.equal(event.save_lag?.suspected, true);

  const base: PreflightTelemetryEvent = {
    v: 1,
    ts: new Date().toISOString(),
    source: "live",
    latency_ms: { total: 10, rag: { search: [], other: [] } },
    quality: {
      confidence_score: 80,
      proceed_recommendation: "proceed",
      retrieval_status: "success",
      llm_facts_count: 1,
      scene_delta_present: false,
      meta_pollution: false
    },
    duplex: { source: "caller", previous_message_chars: 4, correction_fired: false },
    serendipity: { fired: false, tier: null, category: null, deferred: false },
    memory: {
      preflight_result_count: 0,
      search_result_counts: [],
      max_chunk_chars: 0,
      avg_chunk_chars: 0,
      expand_sections: 0
    },
    memory_write: { action: "none", reason_short: "" },
    hard_flags_count: 0,
    triggers: []
  };
  const summary = summarizeTelemetryEvents(
    [
      { ...base, resonance_echo: { present: true }, save_lag: { suspected: true } },
      { ...base, resonance_echo: { present: false }, save_lag: { suspected: false } },
      { ...base, resonance_echo: { present: true }, save_lag: { suspected: false } }
    ],
    { sources: "all" }
  );
  assert.equal(summary.resonance_echo.present_count, 2);
  assert.ok(Math.abs(summary.resonance_echo.present_rate - 2 / 3) < 1e-9);
  assert.equal(summary.save_lag.suspected_count, 1);
  assert.ok(Math.abs(summary.save_lag.suspected_rate - 1 / 3) < 1e-9);
  console.log("ok telemetry echo + save_lag rates");
}

testDetectSaveLagSuiteVsCabin();
testNoLagWhenAligned();
testSofteningRewindsLocation();
testCoupleOnlyPresentAndRosterQuiet();
testAddressedNpcStillActivatesInCoupleOnly();
testQuietPrivateBrief();
testAuditorSaveLagPromptAndUserBlock();
testTelemetryEchoAndSaveLag();
console.log("All save-lag / quiet-brief / echo-telemetry tests passed.");

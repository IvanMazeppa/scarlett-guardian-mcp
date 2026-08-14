/**
 * WP-2.3 — LIVE BEAT block sits above evidence; supersession instruction in system prompt.
 */
import assert from "node:assert/strict";
import {
  LIVE_BEAT_SUPERSESSION_INSTRUCTION,
  buildAuditorSystemPrompt,
  buildAuditorUserMessage,
  filterQuotedRiskyClaims,
  normalizeAssessmentFields,
  normalizeNpcStateChanges
} from "../src/guardian/llm-assessment.js";
import { formatLiveBeatBlock, parseLiveBeat, type LiveBeat } from "../src/guardian/recency.js";

const sampleBeat: LiveBeat = {
  lastUpdated: "Friday afternoon — post out lap",
  locationLine: "Nürburgring Nordschleife, Industry Pool — Scarlett on track",
  timeLine: "Friday, midday into early afternoon",
  liveCues: ["out lap", "pit wall", "nordschleife"],
  supersededCues: ["changing-room", "motion-sick"],
  antiResetNotes: ["paddock changing room as current location"]
};

function testFormatLiveBeatBlock() {
  const block = formatLiveBeatBlock(sampleBeat);
  assert.match(block, /### LIVE BEAT/);
  assert.match(block, /out lap/i);
  assert.match(block, /changing-room/i);
  assert.match(block, /Anti-reset/i);
  assert.match(block, /Location:/);

  const empty = formatLiveBeatBlock(undefined);
  assert.match(empty, /no live snapshot/i);

  const sparse = formatLiveBeatBlock({
    lastUpdated: "",
    locationLine: "",
    timeLine: "",
    liveCues: [],
    supersededCues: [],
    antiResetNotes: []
  });
  assert.match(sparse, /sparse/i);
}

function testUserMessageOrder() {
  const msg = buildAuditorUserMessage(
    {
      preflightInput: {
        user_message: "One more flying lap, älskling.",
        recent_context: "Nordschleife pit wall"
      },
      memories: [],
      expandedContexts: [],
      factChecks: [],
      highRiskTriggers: [],
      liveBeat: sampleBeat
    },
    8000
  );

  const liveIdx = msg.indexOf("### LIVE BEAT");
  const evidenceIdx = msg.indexOf("### RETRIEVED EVIDENCE");
  assert.ok(liveIdx >= 0, "LIVE BEAT heading present");
  assert.ok(evidenceIdx > liveIdx, "LIVE BEAT must appear above RETRIEVED EVIDENCE");
  assert.match(msg, /pit wall|nordschleife/i);
  assert.match(msg, /latest_user_message/);
  assert.match(msg, /live_beat_summary/);
  assert.match(msg, /"liveCues"/);
}

function testSystemPromptSupersession() {
  const sys = buildAuditorSystemPrompt();
  assert.ok(sys.includes(LIVE_BEAT_SUPERSESSION_INSTRUCTION));
  assert.match(sys, /LIVE BEAT wins/i);
  assert.match(sys, /Never describe superseded beats as current/i);
  assert.match(sys, /serendipity_weave/i);
  assert.match(sys, /scarlett_next_intention/i);
  assert.match(sys, /resonance_echo/i);
  assert.match(sys, /npc_state_changes/i);
  assert.match(sys, /knowledge proposals are always human-reviewed/i);
  assert.match(sys, /SLEEP \/ CALENDAR DAY BOUNDARY/i);
  assert.match(sys, /same hotel suite|physical location is unchanged/i);
}

function testNpcStateChangeNormalization() {
  const normalized = normalizeNpcStateChanges([
    {
      npc: "  Karin ",
      kind: "disposition",
      change: " Skepticism resolved after telemetry review. ",
      evidence: " She signed the thermal sheet. "
    },
    {
      npc: "Karin",
      kind: "knowledge",
      change: "Learned the complete aero package",
      evidence: "Benjamin handed her the export"
    },
    { npc: "Karin", kind: "invented_kind", change: "bad", evidence: "none" },
    { npc: "", kind: "wants", change: "bad", evidence: "none" }
  ]);
  assert.equal(normalized?.length, 2);
  assert.deepEqual(normalized?.map((change) => change.kind), [
    "disposition",
    "knowledge"
  ]);
  assert.equal(normalized?.[0]?.npc, "Karin");

  const fields = normalizeAssessmentFields({
    scene_transition: null,
    npc_state_changes: "malformed"
  });
  assert.equal(fields.npc_state_changes, null);
}

function testSerendipityBlockInUserMessage() {
  const withEvent = buildAuditorUserMessage(
    {
      preflightInput: { user_message: "hey" },
      memories: [],
      expandedContexts: [],
      factChecks: [],
      highRiskTriggers: [],
      liveBeat: sampleBeat,
      serendipity: {
        event: {
          id: "weather_rain",
          category: "weather",
          tier: "ambient",
          text: "Heavy rain starts on the paddock roof.",
          cooldownTurns: 8,
          weight: 1
        },
        mode: "professional",
        maxTier: "engaging"
      }
    },
    8000
  );
  assert.match(withEvent, /SERENDIPITY WORLD EVENT/);
  assert.match(withEvent, /Heavy rain starts on the paddock roof/);
  assert.match(withEvent, /tier: ambient/);

  const none = buildAuditorUserMessage(
    {
      preflightInput: { user_message: "hey" },
      memories: [],
      expandedContexts: [],
      factChecks: [],
      highRiskTriggers: [],
      liveBeat: sampleBeat
    },
    8000
  );
  assert.match(none, /None selected this turn/);
}

function testParseThenFormatRoundTrip() {
  const md = `
# Current Story State

**Last Updated:** Friday afternoon, Mid/Late October 2026

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Nürburgring — Scarlett completed out lap; Benjamin on pit wall
- **Time in Story:** Friday midday
- **Overall Mood/Atmosphere:** Earlier day: changing-room aftercare. **Now:** on track thermal stint.

## Recent Key Events (Last 1–3 Sessions — Brief)

- Morning paddock changing room.
- Out lap / shakedown complete; still on track.

## Notes for Next Response

- Do not reset to changing room as current location.
`;
  const beat = parseLiveBeat(md);
  const block = formatLiveBeatBlock(beat);
  assert.match(block, /### LIVE BEAT/);
  assert.ok(beat.liveCues.length > 0 || beat.locationLine.length > 0);
}

function testQuotedRiskyClaimFilter() {
  const kept =
    'The delay tactic contradicts retrieved canon: "Scarlett engineers the aero-package pivot to distract Albion."';
  const dropped =
    "Scarlett masterminded the aero package as a corporate AGI-delay smokescreen conflicts with the available history, which frames the aero package as Benjamin’s work.";
  const filtered = filterQuotedRiskyClaims([dropped, kept, "", 12, null]);
  assert.deepEqual(filtered, [kept]);

  const fields = normalizeAssessmentFields({
    unsupported_or_risky_claims: [dropped, kept]
  });
  assert.deepEqual(fields.unsupported_or_risky_claims, [kept]);
  console.log("ok quoted risky-claim filter");
}

testFormatLiveBeatBlock();
testUserMessageOrder();
testSystemPromptSupersession();
testNpcStateChangeNormalization();
testSerendipityBlockInUserMessage();
testParseThenFormatRoundTrip();
testQuotedRiskyClaimFilter();
console.log("llm-assessment-live-beat.test.ts: all passed");

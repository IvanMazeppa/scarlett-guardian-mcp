/**
 * WP-2.3 — LIVE BEAT block sits above evidence; supersession instruction in system prompt.
 */
import assert from "node:assert/strict";
import {
  LIVE_BEAT_SUPERSESSION_INSTRUCTION,
  buildAuditorSystemPrompt,
  buildAuditorUserMessage
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

testFormatLiveBeatBlock();
testUserMessageOrder();
testSystemPromptSupersession();
testSerendipityBlockInUserMessage();
testParseThenFormatRoundTrip();
console.log("llm-assessment-live-beat.test.ts: all passed");

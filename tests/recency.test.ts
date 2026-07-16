/**
 * WP-2.2 — parseLiveBeat + scoreRecency + selectPrecedents wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseLiveBeat,
  scoreRecency,
  textMatchesLiveBeat
} from "../src/guardian/recency.js";
import { selectPrecedents } from "../src/guardian/tools/preflight.js";

const fixturePath = path.join(
  process.cwd(),
  "../rag-memory-mcp/project_source_files/current-state.md"
);
const altFixture = path.join(
  process.cwd(),
  "tests/fixtures/current-state-sample.md"
);

const sampleCurrentState = fs.existsSync(fixturePath)
  ? fs.readFileSync(fixturePath, "utf8")
  : fs.existsSync(altFixture)
    ? fs.readFileSync(altFixture, "utf8")
    : `
# Current Story State — Scarlett & Benjamin

**Last Updated:** Friday afternoon, Mid/Late October 2026 (Nürburgring Nordschleife — post out lap / shakedown)

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Nürburgring Nordschleife, Industry Pool. Scarlett is **in the Black Panther on track**, having just **completed her out lap / shakedown**. Benjamin is on the **pit wall**.
- **Time in Story:** Friday, midday into early afternoon.
- **Overall Mood/Atmosphere:** High-performance focus. Earlier day: B-road motion-sickness caretaking; private paddock changing-room intimacy + aftercare; public pit send-off. **Now:** first out lap done with clear aero feedback; she is still on track / in the stint flow, private radio open.

## Recent Key Events (Last 1–3 Sessions — Brief)

- Friday checkout Luxembourg → Eifel B-roads; aggressive aero test; Benjamin motion-sick; Swedish aftercare.
- Private locked changing-room intimacy + aftercare; race suit; pit-lane public embrace.
- **Out lap / shakedown completed** with continuous private-channel commentary to Benjamin.

## Notes for Next Response

- Do not reset to B-roads or "still preparing first lap."
- Benjamin: pit wall, private channel.
`;

// --- parseLiveBeat ---
{
  const beat = parseLiveBeat(sampleCurrentState);
  assert.ok(beat.locationLine.toLowerCase().includes("nordschleife") || beat.locationLine.toLowerCase().includes("track"));
  assert.ok(beat.liveCues.length > 0, "expected live cues");
  assert.ok(
    beat.liveCues.some((c) => /out lap|shakedown|track|pit wall|on track|nordschleife/i.test(c)),
    `live cues should include track anchors, got: ${beat.liveCues.join(", ")}`
  );
  assert.ok(
    beat.supersededCues.some((c) => /changing|motion|b-road|aftercare|intimate/i.test(c)),
    `superseded should include earlier-day cues, got: ${beat.supersededCues.join(", ")}`
  );
  assert.ok(
    beat.antiResetNotes.length > 0 || beat.supersededCues.some((c) => /b-road/i.test(c)),
    "anti-reset or B-road demotion cues expected"
  );
  console.log(
    "parseLiveBeat live=",
    beat.liveCues.slice(0, 10).join("|"),
    "super=",
    beat.supersededCues.slice(0, 10).join("|")
  );
}

// --- scoreRecency ranking ---
{
  const beat = parseLiveBeat(sampleCurrentState);
  const outLap = {
    source_file: "project_source_files/event-log.md",
    section: "Session — Friday out lap",
    text: "Scarlett completed the out lap / shakedown on the Nordschleife; private radio to pit wall; aero talking.",
    rank_score: 0.7
  };
  const changingRoom = {
    source_file: "project_source_files/event-log.md",
    section: "Session — changing room",
    text: "Private locked changing-room intimacy and aftercare; lace and race-suit prep; door secured.",
    rank_score: 0.95
  };
  const luxembourg = {
    source_file: "project_source_files/scarlett-full-detailed-chronological-summary-6.md",
    section: "Session — Villa Pétrusse",
    text: "Return to Villa Pétrusse suite after Bistrot; bath preparation in Luxembourg.",
    rank_score: 0.9
  };

  const sOut = scoreRecency(outLap, beat, "Benjamin on the pit wall radio after the out lap");
  const sRoom = scoreRecency(changingRoom, beat, "Benjamin on the pit wall radio after the out lap");
  const sLux = scoreRecency(luxembourg, beat, "Benjamin on the pit wall radio after the out lap");

  assert.ok(sOut > sRoom, `out-lap (${sOut}) should outrank changing-room (${sRoom})`);
  assert.ok(sOut > sLux, `out-lap (${sOut}) should outrank Luxembourg (${sLux})`);
  assert.ok(sRoom < 0, `changing-room should be demoted, got ${sRoom}`);

  // Escape hatch: deliberate callback to morning
  const sRoomCallback = scoreRecency(
    changingRoom,
    beat,
    "Remember this morning in the changing room — I keep thinking about that."
  );
  assert.ok(
    sRoomCallback > sRoom,
    `callback should soften demotion: callback=${sRoomCallback} plain=${sRoom}`
  );
  console.log("scoreRecency out/room/lux/callback", sOut, sRoom, sLux, sRoomCallback);
}

// --- selectPrecedents integration ---
{
  const beat = parseLiveBeat(sampleCurrentState);
  const results = [
    {
      source_file: "project_source_files/event-log.md",
      section: "Session — changing room morning",
      text: "Private changing-room intimacy, lace, aftercare before any track activity.",
      rank_score: 0.99,
      source_role: "event_log" as const
    },
    {
      source_file: "project_source_files/event-log.md",
      section: "Session — Friday out lap shakedown",
      text: "Out lap complete on Nordschleife; pit wall private radio; Black Panther aero feedback.",
      rank_score: 0.7,
      source_role: "event_log" as const
    },
    {
      source_file: "project_source_files/historical/thread-01/x.md",
      section: "Mythology",
      text: "Ancient bond mythology unrelated to track day.",
      rank_score: 0.98,
      source_role: "supporting_backstory" as const
    }
  ];

  const selected = selectPrecedents(
    results,
    ["AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc"],
    "Benjamin keys the private radio after her out lap, still on the pit wall.",
    2,
    beat
  );

  assert.equal(selected.length, 2);
  assert.ok(
    selected.some((p) => /out lap|shakedown|pit wall|nordschleife/i.test(p.details)),
    `expected out-lap precedent in ${JSON.stringify(selected.map((p) => p.topic))}`
  );
  // Changing-room should not be the sole top hit when live beat is on track
  const top = selected[0];
  assert.ok(
    !/changing-room intimacy, lace/i.test(top.details) ||
      /out lap|pit wall|shakedown/i.test(top.details),
    `top precedent should not be pure changing-room mud: ${top.details.slice(0, 120)}`
  );
  console.log(
    "selectPrecedents top:",
    selected.map((p) => p.topic).join(" | ")
  );
}

// textMatchesLiveBeat
{
  const beat = parseLiveBeat(sampleCurrentState);
  assert.equal(textMatchesLiveBeat("private radio after the out lap on the pit wall", beat), true);
  assert.equal(textMatchesLiveBeat("random unrelated kitchen silence", beat), false);
}

// empty beat is safe
{
  assert.equal(scoreRecency({ text: "anything" }, parseLiveBeat(""), "hi"), 0);
}

console.log("recency tests passed");

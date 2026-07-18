/**
 * WP-4.2 — validateStateRewrite golden + mutants (no live LLM).
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildSyntheticAffalterbachRewrite,
  extractLastUpdated,
  extractOpenThreadLines,
  loadProtectedFacts,
  validateStateRewrite
} from "../src/guardian/state-rewrite.js";

const root = process.cwd();

/**
 * Use a stable embedded OLD snapshot (not live current-state.md).
 * Live corpus length drifts after operator-approved rewrites (Phase 4 turn 5),
 * which breaks the synthetic rewrite length-ratio mutant. Sized so the
 * Affalterbach synthetic rewrite stays within the 0.5×–2.0× gate.
 */
const oldMd = `# Current Story State — Scarlett & Benjamin

**Last Updated:** Friday afternoon, Mid/Late October 2026 (Nürburgring Nordschleife — post out lap / shakedown)

**Primary Reference:** story-bible.md + event-log.md + emotional-milestones.md

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Nürburgring Nordschleife Industry Pool — Scarlett on track / Benjamin on pit wall with private radio.
- **Time in Story:** Friday afternoon.
- **Overall Mood/Atmosphere:** Professional track-day focus after morning B-road caretaking; Black Panther aero under evaluation.

## Scarlett's Current Emotional & Relational State

- **Dominant feelings right now:** Focused, slightly adrenaline-high; still warm toward Benjamin.
- **Qualified Autonomy:** She leads the stint and technical feedback; agency in service of partnership.
- Pre-op Swedish trans woman continuity unchanged; body and identity facts intact.

## Benjamin's Observable State (What Scarlett Sees / Hears)

- On the pit wall beside Shevchenko; private radio open; residual morning motion-sickness possible.
- Partner and aero author watching live telemetry.

## Open Story Threads & Pending Elements

- **Active storylines / arcs:**
  - **Industry Pool track day:** Out lap complete; further evaluation laps open.
  - **Aero package performance confirmation:** front load, canards, diffuser, cooling under heat.
  - **Mr. Shevchenko + AMG engineers:** on site.
  - **Emotional afterglow:** motion-sickness care + paddock intimacy + public claim + private radio.
  - **Next after track day:** Affalterbach / AMG HQ presentation; later private Gulfstream return.
  - **Affalterbach presentation:** planned next.
  - **Private Gulfstream return:** planned later.

- **Things Scarlett wants to do or say next (autonomous plans):**
  - Complete evaluation laps; give engineers clear driver-led impressions.
  - Check Benjamin before formal debrief.

## Recent Key Events (Last 1–3 Sessions — Brief)

- Nordschleife Industry Pool: out lap / shakedown; dual radio with Benjamin on pit wall.
- Friday Eifel drive; Benjamin motion-sick; Swedish aftercare; paddock changing-room intimacy + public send-off.
- Black Panther AMG Industry Pool continuity anchors held.

## Notes for Next Response

- **Tone/energy:** Professional track focus + private couple warmth; Qualified Autonomy.
- Do not reset location to Luxembourg suite or tourist gates.
- Preserve: pre-op, trans woman, Swedish, Benjamin partnership, Black Panther, AMG.
`;

const good = buildSyntheticAffalterbachRewrite(oldMd);
const facts = loadProtectedFacts(root);

assert.ok(facts.some((f) => /pre-op/i.test(f)));
assert.ok(facts.some((f) => /Qualified Autonomy/i.test(f)));
assert.ok(extractOpenThreadLines(oldMd).length >= 1, "old current-state should yield open threads");

const pass = validateStateRewrite(oldMd, good, { protectedFacts: facts, rootDir: root });
assert.equal(pass.ok, true, pass.ok ? "ok" : pass.violations.join("; "));

// Mutant: missing heading
const missingHeading = good.replace("## Notes for Next Response", "## Something Else Entirely");
const m1 = validateStateRewrite(oldMd, missingHeading, { protectedFacts: facts });
assert.equal(m1.ok, false);
if (!m1.ok) assert.ok(m1.violations.some((v) => /missing required heading/i.test(v)));

// Mutant: dropped protected fact
const droppedFact = good.replace(/pre-op/gi, "xxx").replace(/trans woman/gi, "yyy");
const m2 = validateStateRewrite(oldMd, droppedFact, { protectedFacts: facts });
assert.equal(m2.ok, false);
if (!m2.ok) assert.ok(m2.violations.some((v) => /protected fact/i.test(v)));

// Mutant: unique open thread dropped without resolved:
const oldUnique =
  oldMd.replace(
    "## Open Story Threads & Pending Elements",
    "## Open Story Threads & Pending Elements\n\n- **UniqueThreadXylophone:** must stay until resolved marker.\n"
  );
const m3 = validateStateRewrite(oldUnique, good, { protectedFacts: facts });
assert.equal(m3.ok, false);
if (!m3.ok) assert.ok(m3.violations.some((v) => /open thread dropped|UniqueThreadXylophone/i.test(v)));

// Mutant: 10× length
const bloated = good + "\n\n" + "padding word ".repeat(Math.ceil((oldMd.length * 3) / 12));
const m4 = validateStateRewrite(oldMd, bloated, { protectedFacts: facts });
assert.equal(m4.ok, false);
if (!m4.ok) assert.ok(m4.violations.some((v) => /too long/i.test(v)));

// Mutant: Last Updated unchanged
const oldLu = extractLastUpdated(oldMd);
if (oldLu) {
  const sameLu = good.replace(extractLastUpdated(good), oldLu);
  if (extractLastUpdated(sameLu) === oldLu) {
    const m5 = validateStateRewrite(oldMd, sameLu, { protectedFacts: facts });
    assert.equal(m5.ok, false);
    if (!m5.ok) assert.ok(m5.violations.some((v) => /Last Updated/i.test(v)));
  }
}

assert.ok(extractLastUpdated(good).length > 0);
console.log("state-rewrite tests passed");

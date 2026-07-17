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
const currentStatePath = path.resolve(
  root,
  "../rag-memory-mcp/project_source_files/current-state.md"
);

function loadCurrentState(): string {
  if (fs.existsSync(currentStatePath)) return fs.readFileSync(currentStatePath, "utf8");
  return `# Current Story State — Scarlett & Benjamin

**Last Updated:** Friday afternoon at Nordschleife

## Where We Are Right Now (High-Level Snapshot)

- On track at Nürburgring; Benjamin on pit wall.

## Scarlett's Current Emotional & Relational State

- Focused; Qualified Autonomy; pre-op Swedish trans woman.

## Benjamin's Observable State (What Scarlett Sees / Hears)

- Pit wall, private radio.

## Open Story Threads & Pending Elements

- **Active storylines / arcs:**
  - **Industry Pool track day:** Out lap complete; further laps open.
  - **Affalterbach presentation:** planned next.
  - **Private Gulfstream return:** planned later.

## Recent Key Events (Last 1–3 Sessions — Brief)

- Out lap completed.

## Notes for Next Response

- Do not reset location. Scarlett Benjamin Black Panther AMG.
`;
}

const oldMd = loadCurrentState();
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

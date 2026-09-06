/**
 * Character location parser for GET /telemetry/api/locations.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseCharacterLocations,
  readCharacterLocations
} from "../src/guardian/character-locations.js";

const livePath = path.join(
  process.cwd(),
  "../rag-memory-mcp/project_source_files/current-state.md"
);
const fixturePath = path.join(process.cwd(), "tests/fixtures/current-state-sample.md");

{
  const parsed = parseCharacterLocations(`
# Current Story State — Scarlett & Benjamin

**Last Updated:** Saturday evening (London apartment)

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** London apartment.
- **Scarlett:** Kitchen
- **Benjamin:** Bed
- **Immediate situation:** Cooking after a long day.
`);
  assert.equal(parsed.scarlett, "Kitchen");
  assert.equal(parsed.benjamin, "Bed");
}

{
  const parsed = parseCharacterLocations(`
## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** The London apartment.
- **Immediate situation:** Scarlett is in the kitchen. Benjamin is still in bed.
`);
  assert.equal(parsed.scarlett, "Kitchen");
  assert.equal(parsed.benjamin, "Bed");
}

{
  const parsed = parseCharacterLocations(`
## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Holiday house.
- **Immediate situation:** Scarlett and Benjamin are sitting together on the tiny sofa by the fire.
`);
  assert.equal(parsed.scarlett, "Living Room");
  assert.equal(parsed.benjamin, "Living Room");
}

{
  const fixture = fs.readFileSync(fixturePath, "utf8");
  const parsed = parseCharacterLocations(fixture);
  assert.equal(parsed.scarlett, "Track");
  assert.equal(parsed.benjamin, "Pit Wall");
}

{
  const parsed = parseCharacterLocations(`
# Current Story State — Scarlett & Benjamin

**Last Updated:** Wednesday evening (Soglio — Sofa by the fire)

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Soglio, Swiss/Italian Alps. Inside the modest stone holiday house, sitting by a roaring fire in the traditional stone hearth.
- **Present:** Scarlett and Benjamin.
- **Immediate situation:** They have just returned from dinner. Scarlett has taken off her wet leather jacket and boots and is sitting on a tiny, low-slung two-seater sofa. Benjamin successfully took her toe-ring off his chain. He is currently attempting to sit next to her on the tiny sofa.

## Recent Key Events (Last 1–3 Sessions — Brief)

- Yesterday they cooked in the kitchen and later went to bed.
`);
  assert.equal(parsed.scarlett, "Living Room");
  assert.equal(parsed.benjamin, "Living Room");
}

{
  const parsed = parseCharacterLocations("");
  assert.equal(parsed.scarlett, null);
  assert.equal(parsed.benjamin, null);
}

{
  const parsed = parseCharacterLocations(`
## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** The balcony overlooking the Thames.
- **Immediate situation:** Scarlett is on the balcony. Benjamin stayed in the living room.
`);
  assert.equal(parsed.scarlett, "Balcony");
  assert.equal(parsed.benjamin, "Living Room");
}

{
  const parsed = parseCharacterLocations(`
## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Unknown.
- **Immediate situation:** Only Scarlett is described, standing in the hallway.
`);
  assert.equal(parsed.scarlett, "Hallway");
  assert.equal(parsed.benjamin, null);
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "locs-"));
  const missing = readCharacterLocations(dir);
  assert.equal(missing.scarlett, null);
  assert.equal(missing.benjamin, null);
  assert.equal(missing.sourcePath, null);
}

if (fs.existsSync(livePath)) {
  const live = parseCharacterLocations(fs.readFileSync(livePath, "utf8"));
  assert.ok(live.scarlett === null || typeof live.scarlett === "string");
  assert.ok(live.benjamin === null || typeof live.benjamin === "string");
  console.log("live current-state locations", live);
}

console.log("character-locations tests ok");

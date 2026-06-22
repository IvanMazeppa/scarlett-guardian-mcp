import assert from "node:assert/strict";
import {
  buildMemoryQueries,
  buildPreflightQuery,
  detectHighRiskTriggers
} from "../src/guardian/tools/preflight.js";

const foodTurn = "I watch you take the best bite of ribeye and notice you bristled when the waiter kept staring.";

assert.match(
  buildPreflightQuery({ user_message: foodTurn }),
  /current scene state Scarlett Benjamin emotional tone open threads/
);

assert.deepEqual(
  detectHighRiskTriggers(foodTurn),
  [
    "Benjamin attributes Scarlett internal state",
    "Food-care, feeding, appetite, or ARFID-adjacent gesture",
    "Public visibility, jealousy, queer safety, or boundaries"
  ]
);

assert.equal(buildMemoryQueries({ user_message: "A quiet ordinary reply with no named detail." }).length, 1);
assert.match(buildMemoryQueries({ user_message: foodTurn })[0], /feeding food care appetite ribeye/);

const fullQueries = buildMemoryQueries({ user_message: foodTurn, force_full_retrieval: true });
assert.ok(fullQueries.length >= 3);
assert.ok(new Set(fullQueries).size === fullQueries.length);

console.log("preflight tests passed");

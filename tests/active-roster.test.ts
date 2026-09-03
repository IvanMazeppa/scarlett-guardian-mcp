/**
 * Active Roster cache + brief formatting.
 */
import assert from "node:assert/strict";
import {
  ActiveRosterCache,
  DEFAULT_LISTENER_TTL_MS,
  formatActiveRosterBlock,
  normalizeEntityKey,
  resolveActiveRosterForPreflight,
  type ActiveRosterDossier
} from "../src/guardian/active-roster.js";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";

function dossier(over: Partial<ActiveRosterDossier> = {}): ActiveRosterDossier {
  return {
    entity: "Sarah",
    confidence: 0.9,
    bullets: ["Benjamin's ex-assistant", "left in 2024", "amicable relationship"],
    sources: [{ source_file: "secondary-characters-bible.md", section: "Sarah" }],
    ...over
  };
}

function testNormalize() {
  assert.equal(normalizeEntityKey("Mr. Shevchenko"), "mr shevchenko");
  assert.equal(normalizeEntityKey("  Vaxholm  "), "vaxholm");
  console.log("ok normalizeEntityKey");
}

function testUpsertGetFreshAndTtl() {
  const cache = new ActiveRosterCache();
  const now = 1_000_000;
  cache.upsert(
    {
      threadKey: "t1",
      dossiers: [dossier()],
      updatedAtMs: now,
      sourceHash: "abc"
    },
    now
  );
  const hit = cache.getFresh("t1", DEFAULT_LISTENER_TTL_MS, now + 1000);
  assert.equal(hit?.sourceHash, "abc");
  assert.equal(hit?.dossiers[0].entity, "Sarah");

  const stale = cache.getFresh("t1", 500, now + 1000);
  assert.equal(stale, undefined);

  cache.upsert(
    {
      threadKey: "t1",
      dossiers: [dossier({ entity: "Karin", bullets: ["Vaxholm"] })],
      updatedAtMs: now + 50,
      sourceHash: "def"
    },
    now + 50
  );
  const overwritten = cache.getFresh("t1", DEFAULT_LISTENER_TTL_MS, now + 60);
  assert.equal(overwritten?.sourceHash, "def");
  assert.equal(overwritten?.dossiers[0].entity, "Karin");
  console.log("ok upsert / getFresh / TTL / overwrite");
}

function testNewestWhenThreadKeyEmpty() {
  const cache = new ActiveRosterCache();
  const now = 2_000_000;
  cache.upsert(
    {
      threadKey: "old",
      dossiers: [dossier({ entity: "Ryan" })],
      updatedAtMs: now,
      sourceHash: "1"
    },
    now
  );
  cache.upsert(
    {
      threadKey: "new",
      dossiers: [dossier({ entity: "Karin" })],
      updatedAtMs: now + 10,
      sourceHash: "2"
    },
    now + 10
  );
  const newest = cache.getFresh(undefined, DEFAULT_LISTENER_TTL_MS, now + 20);
  assert.equal(newest?.threadKey, "new");
  assert.equal(newest?.dossiers[0].entity, "Karin");
  console.log("ok newest fresh entry when threadKey empty");
}

function testEntityMemo() {
  const cache = new ActiveRosterCache();
  const now = 3_000_000;
  cache.upsert(
    {
      threadKey: "t",
      dossiers: [dossier()],
      updatedAtMs: now,
      sourceHash: "h"
    },
    now
  );
  const memo = cache.getMemo("Sarah", 2 * 60 * 60 * 1000, now + 1000);
  assert.equal(memo?.bullets[0], "Benjamin's ex-assistant");
  const expired = cache.getMemo("Sarah", 10, now + 50);
  assert.equal(expired, undefined);
  console.log("ok entity memo TTL");
}

function testClear() {
  const cache = new ActiveRosterCache();
  cache.upsert({
    threadKey: "a",
    dossiers: [dossier()],
    updatedAtMs: Date.now(),
    sourceHash: "x"
  });
  cache.upsert({
    threadKey: "b",
    dossiers: [dossier({ entity: "Karin" })],
    updatedAtMs: Date.now(),
    sourceHash: "y"
  });
  assert.equal(cache.clear("a"), 1);
  assert.equal(cache.size(), 1);
  assert.ok(cache.getMemo("Karin"));
  assert.equal(cache.clear(), 1);
  assert.equal(cache.size(), 0);
  assert.equal(cache.memoSize(), 0);
  console.log("ok clear thread vs all");
}

function testFormatBlockOmittedWhenEmpty() {
  assert.equal(formatActiveRosterBlock(undefined), undefined);
  assert.equal(formatActiveRosterBlock([]), undefined);
  const block = formatActiveRosterBlock([dossier()]);
  assert.match(block ?? "", /\*\*Active Roster \(background dossiers\):\*\*/);
  assert.match(block ?? "", /\*\*Sarah:\*\*/);
  assert.match(block ?? "", /ex-assistant/);
  const long = formatActiveRosterBlock(
    Array.from({ length: 20 }, (_, i) =>
      dossier({
        entity: `Person${i}`,
        bullets: ["one fact that is reasonably long to force a cap", "two", "three"]
      })
    ),
    200
  );
  assert.ok((long?.length ?? 0) <= 200);
  console.log("ok formatActiveRosterBlock omit / cap");
}

function testResolvePreflightIsolate() {
  const cache = new ActiveRosterCache();
  cache.upsert({
    threadKey: "t1",
    dossiers: [dossier()],
    updatedAtMs: Date.now(),
    sourceHash: "z"
  });
  const isolated = resolveActiveRosterForPreflight({
    threadKey: "t1",
    ttlMs: DEFAULT_LISTENER_TTL_MS,
    cache,
    isolate: true
  });
  assert.equal(isolated, undefined);
  const live = resolveActiveRosterForPreflight({
    threadKey: "t1",
    ttlMs: DEFAULT_LISTENER_TTL_MS,
    cache,
    isolate: false
  });
  assert.equal(live?.[0].entity, "Sarah");
  console.log("ok resolveActiveRosterForPreflight isolate");
}

function baseReport(over: Partial<GuardianReport> = {}): GuardianReport {
  return {
    retrieval_status: "success",
    confidence_score: 90,
    proceed_recommendation: "proceed",
    current_state_summary: "They are in the hotel suite after the track day.",
    critical_precedents: [],
    expanded_contexts: [],
    fact_checks: [],
    emotional_tone_guidance: "quiet recovery",
    things_to_avoid: [],
    open_threads: [],
    hard_flags: [],
    retrieval_notes: "",
    grok_scene_summary: "They are in the hotel suite after the track day.",
    scene_roster: {
      active: [],
      background: [],
      summary: "Couple-only present (no supporting cast)",
      couple_only_present: true
    },
    retrieval_plan: { preflight_query: "q", memory_queries: [], high_risk_triggers: [] },
    tool_calls: [],
    ...over
  };
}

function testBriefOmitsEmptyRoster() {
  const without = compileGrokBrief(baseReport());
  const withEmptyField = compileGrokBrief(baseReport({ active_roster: [] }));
  assert.equal(without.includes("Active Roster"), false);
  assert.equal(withEmptyField.includes("Active Roster"), false);
  assert.equal(without, withEmptyField);
  console.log("ok brief omits empty Active Roster (eval-safe)");
}

function testBriefInjectsRosterInQuietPrivate() {
  const brief = compileGrokBrief(
    baseReport({
      active_roster: [dossier()]
    })
  );
  assert.match(brief, /\*\*Active Roster \(background dossiers\):\*\*/);
  assert.match(brief, /Sarah/);
  assert.equal(brief.includes("**Scene Cast"), false);
  const rosterIdx = brief.indexOf("**Active Roster");
  const moodIdx = brief.indexOf("**Recent Emotional");
  assert.ok(rosterIdx >= 0 && moodIdx > rosterIdx, "roster sits beside scene-cast slot before mood");
  console.log("ok brief injects Active Roster in quiet private couple scene");
}

testNormalize();
testUpsertGetFreshAndTtl();
testNewestWhenThreadKeyEmpty();
testEntityMemo();
testClear();
testFormatBlockOmittedWhenEmpty();
testResolvePreflightIsolate();
testBriefOmitsEmptyRoster();
testBriefInjectsRosterInQuietPrivate();
console.log("All active-roster tests passed.");

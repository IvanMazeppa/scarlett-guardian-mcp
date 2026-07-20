/**
 * WP-3.1 / WP-R1 unit tests — DuplexCache + resolveDuplexInput + substantial floor.
 */
import assert from "node:assert/strict";
import {
  DEFAULT_DUPLEX_CACHE_TTL_MS,
  DEFAULT_DUPLEX_MIN_CHARS,
  DuplexCache,
  hashDuplexContent,
  isSubstantialDuplexMessage,
  normalizeDuplexText,
  resolveDuplexInput,
  storeDuplexMessage
} from "../src/guardian/duplex-cache.js";

/** ≥200 chars + sentence structure so WP-R1 floor passes. */
const SAMPLE_A =
  "I pull the Nomex zipper with trembling fingers and meet your eyes across the locked changing room. " +
  "The 6:54.2 still rings in my ears, but the track is over — just us, the heat, and the suit that has to come off. " +
  "Jag älskar dig, Benjamin.";

const SAMPLE_B =
  "From the bridge scrape: Scarlett reports the aero package planted hard through the compression sequence. " +
  "She keeps the private radio warm while the engineers stare at the plots. " +
  "No next stint — only recovery behind the door.";

const SAMPLE_NEWER =
  "Thread B newer Scarlett reply with enough narrative body for the duplex floor. " +
  "She leans against the wall, breathing hard, choosing the pace of aftercare herself. " +
  "The engineers already have the telemetry.";

function testNormalizeAndHash() {
  const a = normalizeDuplexText("hello  \n\n\nworld  \n");
  assert.equal(a, "hello\n\nworld");
  assert.equal(hashDuplexContent(a).length, 64);
  console.log("ok normalize + hash");
}

function testCallerWins() {
  const cache = new DuplexCache();
  storeDuplexMessage({
    scarlettMessage: SAMPLE_A,
    threadKey: "t1",
    cache
  });
  const r = resolveDuplexInput({
    scarlettPreviousMessage: SAMPLE_B,
    threadKey: "t1",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache
  });
  assert.equal(r.duplexSource, "caller");
  assert.match(r.scarlettPreviousMessage, /bridge scrape/);
  assert.equal(r.cacheHit, false);
  console.log("ok caller wins over cache");
}

function testBridgeCacheFill() {
  const cache = new DuplexCache();
  storeDuplexMessage({
    scarlettMessage: SAMPLE_A,
    threadKey: "t1",
    cache
  });
  const r = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "t1",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache
  });
  assert.equal(r.duplexSource, "bridge_cache");
  assert.equal(r.cacheHit, true);
  assert.match(r.scarlettPreviousMessage, /6:54\.2/);
  console.log("ok bridge_cache fills empty caller");
}

function testAbsentWhenBothEmpty() {
  const cache = new DuplexCache();
  const r = resolveDuplexInput({
    scarlettPreviousMessage: undefined,
    threadKey: "t1",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache
  });
  assert.equal(r.duplexSource, "absent");
  assert.equal(r.scarlettPreviousMessage, "");
  console.log("ok absent when both empty");
}

function testTtlExpiry() {
  const cache = new DuplexCache();
  const t0 = 1_000_000;
  storeDuplexMessage({
    scarlettMessage: SAMPLE_A,
    threadKey: "t1",
    cache,
    nowMs: t0
  });
  const stale = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "t1",
    ttlMs: 60_000,
    cache,
    nowMs: t0 + 120_000
  });
  assert.equal(stale.duplexSource, "absent");

  const fresh = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "t1",
    ttlMs: 60_000,
    cache,
    nowMs: t0 + 30_000
  });
  assert.equal(fresh.duplexSource, "bridge_cache");
  console.log("ok TTL expiry");
}

function testNewestWinsWithoutKey() {
  const cache = new DuplexCache();
  const now = Date.now();
  storeDuplexMessage({
    scarlettMessage: SAMPLE_A + " Thread A marker.",
    threadKey: "thread-a",
    cache,
    nowMs: now
  });
  storeDuplexMessage({
    scarlettMessage: SAMPLE_NEWER,
    threadKey: "thread-b",
    cache,
    nowMs: now + 5_000
  });
  const newest = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: undefined,
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now + 6_000
  });
  assert.equal(newest.duplexSource, "bridge_cache");
  assert.match(newest.scarlettPreviousMessage, /Thread B newer|aftercare/);

  const miss = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "thread-z",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now + 6_000
  });
  assert.equal(miss.duplexSource, "absent");

  const hit = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "thread-a",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now + 6_000
  });
  assert.equal(hit.duplexSource, "bridge_cache");
  assert.match(hit.scarlettPreviousMessage, /Thread A marker/);
  console.log("ok multi-thread newest-wins without key");
}

function testClear() {
  const cache = new DuplexCache();
  storeDuplexMessage({
    scarlettMessage: SAMPLE_A,
    threadKey: "c1",
    cache
  });
  storeDuplexMessage({
    scarlettMessage: SAMPLE_B,
    threadKey: "c2",
    cache
  });
  assert.equal(cache.clear("c1"), 1);
  assert.equal(cache.size(), 1);
  assert.equal(cache.clear(), 1);
  assert.equal(cache.size(), 0);
  console.log("ok clear thread and all");
}

function testMinCharsAndStructure() {
  const cache = new DuplexCache();
  assert.throws(() => {
    storeDuplexMessage({ scarlettMessage: "short", cache });
  });
  assert.throws(() => {
    storeDuplexMessage({ scarlettMessage: "Understood", cache });
  });
  // Long enough but pure ack padded
  const padded = "Understood. " + "x".repeat(DEFAULT_DUPLEX_MIN_CHARS);
  // has sentence end so structure might pass — still store as narrative-ish
  // Short ack alone fails structure/length
  const ackOnly = "Understood.";
  assert.equal(isSubstantialDuplexMessage(ackOnly).ok, false);

  // Real narrative passes
  assert.equal(isSubstantialDuplexMessage(SAMPLE_A).ok, true);
  storeDuplexMessage({ scarlettMessage: SAMPLE_A, cache });
  console.log("ok min chars + structure reject");
}

function main() {
  testNormalizeAndHash();
  testCallerWins();
  testBridgeCacheFill();
  testAbsentWhenBothEmpty();
  testTtlExpiry();
  testNewestWinsWithoutKey();
  testClear();
  testMinCharsAndStructure();
  console.log("\nAll duplex-cache tests passed.");
}

main();

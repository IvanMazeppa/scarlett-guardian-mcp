/**
 * WP-3.1 unit tests — DuplexCache + resolveDuplexInput (caller wins).
 */
import assert from "node:assert/strict";
import {
  DEFAULT_DUPLEX_CACHE_TTL_MS,
  DuplexCache,
  hashDuplexContent,
  normalizeDuplexText,
  resolveDuplexInput,
  storeDuplexMessage
} from "../src/guardian/duplex-cache.js";

function testNormalizeAndHash() {
  const a = normalizeDuplexText("hello  \n\n\nworld  \n");
  assert.equal(a, "hello\n\nworld");
  assert.equal(hashDuplexContent(a).length, 64);
  console.log("ok normalize + hash");
}

function testCallerWins() {
  const cache = new DuplexCache();
  storeDuplexMessage({
    scarlettMessage: "Cached Scarlett line that is long enough for min chars.",
    threadKey: "t1",
    cache
  });
  const r = resolveDuplexInput({
    scarlettPreviousMessage: "Caller provided full Scarlett previous message here.",
    threadKey: "t1",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache
  });
  assert.equal(r.duplexSource, "caller");
  assert.match(r.scarlettPreviousMessage, /Caller provided/);
  assert.equal(r.cacheHit, false);
  console.log("ok caller wins over cache");
}

function testBridgeCacheFill() {
  const cache = new DuplexCache();
  storeDuplexMessage({
    scarlettMessage: "From bridge: Scarlett reports aero planted and Jag älskar dig.",
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
  assert.match(r.scarlettPreviousMessage, /From bridge/);
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
    scarlettMessage: "Stale Scarlett message content for TTL test here.",
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

function testAmbiguousThreadsWithoutKey() {
  const cache = new DuplexCache();
  const now = Date.now();
  storeDuplexMessage({
    scarlettMessage: "Thread A Scarlett reply long enough for cache.",
    threadKey: "thread-a",
    cache,
    nowMs: now
  });
  storeDuplexMessage({
    scarlettMessage: "Thread B Scarlett reply long enough for cache.",
    threadKey: "thread-b",
    cache,
    nowMs: now
  });
  // No thread key + two fresh threads → refuse to guess
  const ambig = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: undefined,
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now
  });
  assert.equal(ambig.duplexSource, "absent");

  // Single thread + no key → OK
  cache.clear();
  storeDuplexMessage({
    scarlettMessage: "Only thread Scarlett reply long enough for cache.",
    threadKey: "only",
    cache,
    nowMs: now
  });
  const single = resolveDuplexInput({
    scarlettPreviousMessage: "",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now
  });
  assert.equal(single.duplexSource, "bridge_cache");
  console.log("ok multi-thread disambiguation without key");
}

function testMinChars() {
  const cache = new DuplexCache();
  assert.throws(() => {
    storeDuplexMessage({ scarlettMessage: "short", cache });
  });
  console.log("ok min chars reject");
}

function main() {
  testNormalizeAndHash();
  testCallerWins();
  testBridgeCacheFill();
  testAbsentWhenBothEmpty();
  testTtlExpiry();
  testAmbiguousThreadsWithoutKey();
  testMinChars();
  console.log("\nAll duplex-cache tests passed.");
}

main();

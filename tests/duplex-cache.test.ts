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

function testNewestWinsWithoutKey() {
  const cache = new DuplexCache();
  const now = Date.now();
  storeDuplexMessage({
    scarlettMessage: "Thread A older Scarlett reply long enough for cache.",
    threadKey: "thread-a",
    cache,
    nowMs: now
  });
  storeDuplexMessage({
    scarlettMessage: "Thread B NEWER Scarlett reply long enough for cache.",
    threadKey: "thread-b",
    cache,
    nowMs: now + 5_000
  });
  // No thread key + two fresh threads → newest by capturedAt (WP-3.4 fix)
  const newest = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: undefined,
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now + 6_000
  });
  assert.equal(newest.duplexSource, "bridge_cache");
  assert.match(newest.scarlettPreviousMessage, /Thread B NEWER/);

  // Explicit wrong thread key still misses (no silent cross-thread when keyed)
  const miss = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "thread-z",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now + 6_000
  });
  assert.equal(miss.duplexSource, "absent");

  // Explicit correct key still exact-matches
  const hit = resolveDuplexInput({
    scarlettPreviousMessage: "",
    threadKey: "thread-a",
    ttlMs: DEFAULT_DUPLEX_CACHE_TTL_MS,
    cache,
    nowMs: now + 6_000
  });
  assert.equal(hit.duplexSource, "bridge_cache");
  assert.match(hit.scarlettPreviousMessage, /Thread A older/);
  console.log("ok multi-thread newest-wins without key");
}

function testClear() {
  const cache = new DuplexCache();
  storeDuplexMessage({
    scarlettMessage: "Clear test message long enough for min chars aa.",
    threadKey: "c1",
    cache
  });
  storeDuplexMessage({
    scarlettMessage: "Clear test message long enough for min chars bb.",
    threadKey: "c2",
    cache
  });
  assert.equal(cache.clear("c1"), 1);
  assert.equal(cache.size(), 1);
  assert.equal(cache.clear(), 1);
  assert.equal(cache.size(), 0);
  console.log("ok clear thread and all");
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
  testNewestWinsWithoutKey();
  testClear();
  testMinChars();
  console.log("\nAll duplex-cache tests passed.");
}

main();

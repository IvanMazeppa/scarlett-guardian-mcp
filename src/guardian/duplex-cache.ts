/**
 * WP-3.1 — In-memory shadow-sidecar duplex cache.
 *
 * Browser bridge POSTs Scarlett's last IC reply here; preflight merges it when
 * the MCP caller omits scarlett_previous_message. Caller always wins.
 */
import { createHash } from "node:crypto";

export type DuplexCacheEntry = {
  scarlettMessage: string;
  threadKey: string;
  capturedAt: number;
  contentHash: string;
};

export type DuplexSource = "caller" | "bridge_cache" | "absent";

/** Default TTL: 45 minutes (D6). */
export const DEFAULT_DUPLEX_CACHE_TTL_MS = 45 * 60 * 1000;

/**
 * WP-R1: reject short OOC acks ("Understood") that poison corrections.
 * Real IC Scarlett turns are almost always well above this.
 */
export const DEFAULT_DUPLEX_MIN_CHARS = 200;

export function normalizeDuplexText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * WP-R1 — substantial narrative floor for bridge POSTs.
 * Requires min length AND weak structure (sentence end, multi-line, or dialogue).
 */
export function isSubstantialDuplexMessage(
  text: string,
  minChars: number = DEFAULT_DUPLEX_MIN_CHARS
): { ok: true } | { ok: false; reason: string } {
  const normalized = normalizeDuplexText(text);
  if (normalized.length < minChars) {
    return {
      ok: false,
      reason: `too short (${normalized.length} < ${minChars} chars after normalize)`
    };
  }
  // Reject pure meta/OOC one-liners even if padded with spaces
  if (/^(understood|got it|ok(?:ay)?|thanks?|acknowledged|noted|will do|sure|yes|no)[.!]?$/i.test(normalized)) {
    return { ok: false, reason: "non-narrative acknowledgment" };
  }
  const hasSentenceEnd = /[.!?]["']?(\s|$)/.test(normalized);
  const multiLine = normalized.includes("\n");
  const hasDialogue = /["“”]/.test(normalized) || /\b(I|I'm|I've|my|me)\b/i.test(normalized);
  if (!hasSentenceEnd && !multiLine && !hasDialogue) {
    return {
      ok: false,
      reason: "lacks narrative structure (no sentence end, multi-line, or first-person dialogue)"
    };
  }
  return { ok: true };
}

export function hashDuplexContent(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export class DuplexCache {
  private readonly byThread = new Map<string, DuplexCacheEntry>();

  /** Replace the entry for this thread (regenerations overwrite by design). */
  set(entry: DuplexCacheEntry): void {
    this.byThread.set(entry.threadKey, entry);
  }

  /**
   * Return a non-stale entry.
   * - Known threadKey → that thread's entry if fresh (exact match only).
   * - Unknown/empty threadKey → **newest** fresh entry by capturedAt (WP-3.4 fix).
   *   MCP preflights usually omit thread_key; requiring fresh.length === 1 broke
   *   daily use when a second tab/test thread also posted within TTL.
   */
  getFresh(threadKey: string | undefined, ttlMs: number, nowMs = Date.now()): DuplexCacheEntry | undefined {
    const ttl = Math.max(0, ttlMs);
    const isFresh = (e: DuplexCacheEntry) => nowMs - e.capturedAt <= ttl;

    const key = threadKey?.trim();
    if (key) {
      const hit = this.byThread.get(key);
      if (hit && isFresh(hit)) return hit;
      return undefined;
    }

    let newest: DuplexCacheEntry | undefined;
    for (const e of this.byThread.values()) {
      if (!isFresh(e)) continue;
      if (!newest || e.capturedAt > newest.capturedAt) newest = e;
    }
    return newest;
  }

  /** Test/ops: clear all entries (or one thread if threadKey set). */
  clear(threadKey?: string): number {
    if (threadKey?.trim()) {
      const key = threadKey.trim();
      const had = this.byThread.delete(key);
      return had ? 1 : 0;
    }
    const n = this.byThread.size;
    this.byThread.clear();
    return n;
  }

  size(): number {
    return this.byThread.size;
  }

  /** Snapshot of keys + ages (no message bodies). */
  stats(nowMs = Date.now()): Array<{ thread_key: string; chars: number; age_ms: number; hash_prefix: string }> {
    return [...this.byThread.values()].map((e) => ({
      thread_key: e.threadKey,
      chars: e.scarlettMessage.length,
      age_ms: nowMs - e.capturedAt,
      hash_prefix: e.contentHash.slice(0, 12)
    }));
  }
}

/** Process-wide cache (single operator / single Guardian instance). */
export const duplexCache = new DuplexCache();

export type ResolveDuplexResult = {
  /** Message to feed the auditor (may be empty). */
  scarlettPreviousMessage: string;
  duplexSource: DuplexSource;
  cacheHit: boolean;
  contentHash?: string;
};

/**
 * Caller wins: non-empty scarlett_previous_message always takes precedence.
 * Otherwise try bridge cache.
 */
export function resolveDuplexInput(options: {
  scarlettPreviousMessage?: string | null;
  threadKey?: string;
  ttlMs: number;
  cache?: DuplexCache;
  nowMs?: number;
}): ResolveDuplexResult {
  const cache = options.cache ?? duplexCache;
  const caller = options.scarlettPreviousMessage?.trim() ?? "";
  if (caller.length > 0) {
    return {
      scarlettPreviousMessage: caller,
      duplexSource: "caller",
      cacheHit: false,
      contentHash: hashDuplexContent(normalizeDuplexText(caller))
    };
  }

  const fresh = cache.getFresh(options.threadKey, options.ttlMs, options.nowMs);
  if (fresh?.scarlettMessage.trim()) {
    return {
      scarlettPreviousMessage: fresh.scarlettMessage,
      duplexSource: "bridge_cache",
      cacheHit: true,
      contentHash: fresh.contentHash
    };
  }

  return {
    scarlettPreviousMessage: "",
    duplexSource: "absent",
    cacheHit: false
  };
}

export function storeDuplexMessage(options: {
  scarlettMessage: string;
  threadKey?: string;
  contentHash?: string;
  cache?: DuplexCache;
  nowMs?: number;
  /** Default DEFAULT_DUPLEX_MIN_CHARS (WP-R1). Pass a lower floor only in unit tests. */
  minChars?: number;
  /** When true (default), also require narrative structure. Tests may disable. */
  requireStructure?: boolean;
}): DuplexCacheEntry {
  const minChars = options.minChars ?? DEFAULT_DUPLEX_MIN_CHARS;
  const requireStructure = options.requireStructure !== false;
  const normalized = normalizeDuplexText(options.scarlettMessage);

  if (requireStructure) {
    const gate = isSubstantialDuplexMessage(normalized, minChars);
    if (!gate.ok) {
      throw new Error(`scarlett_message rejected: ${gate.reason}`);
    }
  } else if (normalized.length < minChars) {
    throw new Error(`scarlett_message too short (min ${minChars} chars after normalize)`);
  }

  const contentHash = options.contentHash?.trim() || hashDuplexContent(normalized);
  const entry: DuplexCacheEntry = {
    scarlettMessage: normalized,
    threadKey: options.threadKey?.trim() || "default",
    capturedAt: options.nowMs ?? Date.now(),
    contentHash
  };
  (options.cache ?? duplexCache).set(entry);
  return entry;
}

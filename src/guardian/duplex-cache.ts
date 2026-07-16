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

export function normalizeDuplexText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
   * - Known threadKey → that thread's entry if fresh.
   * - Unknown/empty threadKey → most recent fresh entry only if exactly one
   *   thread has a fresh entry (avoids cross-thread ambiguity).
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

    const fresh: DuplexCacheEntry[] = [];
    for (const e of this.byThread.values()) {
      if (isFresh(e)) fresh.push(e);
    }
    if (fresh.length === 1) return fresh[0];
    return undefined;
  }

  /** Test/debug: clear all entries. */
  clear(): void {
    this.byThread.clear();
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
  minChars?: number;
}): DuplexCacheEntry {
  const minChars = options.minChars ?? 20;
  const normalized = normalizeDuplexText(options.scarlettMessage);
  if (normalized.length < minChars) {
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

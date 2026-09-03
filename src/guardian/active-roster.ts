/**
 * Live Listener Active Roster — volatile per-thread dossier cache.
 *
 * Prefetched off the duplex-cache hot path; preflight does an O(1) Map lookup.
 * TTL-expire (do not flush on inject) so Grok regenerations still see dossiers.
 */

export const DEFAULT_LISTENER_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_ENTITY_MEMO_TTL_MS = 2 * 60 * 60 * 1000;
export const ACTIVE_ROSTER_BLOCK_MAX_CHARS = 1200;
export const DOSSIER_MAX_CHARS = 350;
export const MAX_BULLETS_PER_DOSSIER = 3;

export type ActiveRosterSource = {
  source_file: string;
  section: string;
};

export type ActiveRosterDossier = {
  entity: string;
  confidence: number;
  bullets: string[];
  sources?: ActiveRosterSource[];
};

export type RosterEntry = {
  threadKey: string;
  dossiers: ActiveRosterDossier[];
  updatedAtMs: number;
  sourceHash: string;
};

type MemoEntry = {
  dossier: ActiveRosterDossier;
  updatedAtMs: number;
};

export function normalizeEntityKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function clampDossier(
  dossier: ActiveRosterDossier,
  maxChars: number = DOSSIER_MAX_CHARS
): ActiveRosterDossier {
  const bullets = dossier.bullets
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_BULLETS_PER_DOSSIER);
  let used = 0;
  const out: string[] = [];
  for (const bullet of bullets) {
    const remaining = maxChars - used;
    if (remaining <= 8) break;
    const clipped =
      bullet.length > remaining ? `${bullet.slice(0, Math.max(0, remaining - 3))}...` : bullet;
    out.push(clipped);
    used += clipped.length + 2;
  }
  return { ...dossier, bullets: out };
}

/**
 * Compact markdown for Grok. Omitted entirely when empty (eval:fast goldens).
 * Total block capped at ACTIVE_ROSTER_BLOCK_MAX_CHARS.
 */
export function formatActiveRosterBlock(
  dossiers: ActiveRosterDossier[] | undefined | null,
  maxChars: number = ACTIVE_ROSTER_BLOCK_MAX_CHARS
): string | undefined {
  if (!dossiers?.length) return undefined;
  const lines: string[] = ["**Active Roster (background dossiers):**"];
  for (const d of dossiers) {
    const clamped = clampDossier(d);
    if (!clamped.bullets.length) continue;
    lines.push(`- **${clamped.entity}:** ${clamped.bullets.join("; ")}`);
  }
  if (lines.length < 2) return undefined;
  const joined = lines.join("\n").trim();
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export class ActiveRosterCache {
  private readonly byThread = new Map<string, RosterEntry>();
  private readonly entityMemo = new Map<string, MemoEntry>();

  upsert(
    entry: RosterEntry,
    nowMs = Date.now(),
    memoTtlMs: number = DEFAULT_ENTITY_MEMO_TTL_MS
  ): void {
    this.byThread.set(entry.threadKey, entry);
    for (const dossier of entry.dossiers) {
      this.entityMemo.set(normalizeEntityKey(dossier.entity), {
        dossier,
        updatedAtMs: nowMs
      });
    }
    this.pruneMemo(nowMs, memoTtlMs);
  }

  /**
   * Return a non-stale thread entry.
   * - Known threadKey → that thread's entry if fresh.
   * - Unknown/empty threadKey → newest fresh entry (MCP preflights often omit thread_key).
   */
  getFresh(
    threadKey: string | undefined,
    ttlMs: number,
    nowMs = Date.now()
  ): RosterEntry | undefined {
    const ttl = Math.max(0, ttlMs);
    const isFresh = (e: RosterEntry) => nowMs - e.updatedAtMs <= ttl;

    const key = threadKey?.trim();
    if (key) {
      const hit = this.byThread.get(key);
      if (hit && isFresh(hit)) return hit;
      return undefined;
    }

    let newest: RosterEntry | undefined;
    for (const e of this.byThread.values()) {
      if (!isFresh(e)) continue;
      if (!newest || e.updatedAtMs > newest.updatedAtMs) newest = e;
    }
    return newest;
  }

  getMemo(
    entity: string,
    ttlMs: number = DEFAULT_ENTITY_MEMO_TTL_MS,
    nowMs = Date.now()
  ): ActiveRosterDossier | undefined {
    const key = normalizeEntityKey(entity);
    if (!key) return undefined;
    const hit = this.entityMemo.get(key);
    if (!hit) return undefined;
    if (nowMs - hit.updatedAtMs > ttlMs) {
      this.entityMemo.delete(key);
      return undefined;
    }
    return hit.dossier;
  }

  /** Test/ops: clear all entries (or one thread if threadKey set). Memo cleared only on full clear. */
  clear(threadKey?: string): number {
    if (threadKey?.trim()) {
      const key = threadKey.trim();
      const had = this.byThread.delete(key);
      return had ? 1 : 0;
    }
    const n = this.byThread.size;
    this.byThread.clear();
    this.entityMemo.clear();
    return n;
  }

  size(): number {
    return this.byThread.size;
  }

  memoSize(): number {
    return this.entityMemo.size;
  }

  private pruneMemo(nowMs: number, memoTtlMs: number): void {
    for (const [key, hit] of this.entityMemo) {
      if (nowMs - hit.updatedAtMs > memoTtlMs) this.entityMemo.delete(key);
    }
  }
}

/** Process-wide cache (single operator / single Guardian instance). */
export const activeRosterCache = new ActiveRosterCache();

export function resolveActiveRosterForPreflight(options: {
  threadKey?: string;
  ttlMs: number;
  cache?: ActiveRosterCache;
  nowMs?: number;
  isolate?: boolean;
}): ActiveRosterDossier[] | undefined {
  if (options.isolate) return undefined;
  const hit = (options.cache ?? activeRosterCache).getFresh(
    options.threadKey,
    options.ttlMs,
    options.nowMs
  );
  if (!hit?.dossiers.length) return undefined;
  return hit.dossiers;
}

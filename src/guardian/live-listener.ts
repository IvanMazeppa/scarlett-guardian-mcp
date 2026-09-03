/**
 * Live Listener — fire-and-forget researcher after POST /duplex-cache.
 *
 * NER (cheap model) → two-lane RAG fetch → 3-bullet dossiers → Active Roster cache.
 * Never blocks the duplex 200. Never throws into the caller.
 */
import OpenAI from "openai";
import { performance } from "node:perf_hooks";
import {
  activeRosterCache,
  clampDossier,
  DEFAULT_ENTITY_MEMO_TTL_MS,
  DEFAULT_LISTENER_TTL_MS,
  MAX_BULLETS_PER_DOSSIER,
  normalizeEntityKey,
  type ActiveRosterCache,
  type ActiveRosterDossier,
  type ActiveRosterSource
} from "./active-roster.js";
import type { GuardianConfig } from "./config.js";
import { hashDuplexContent, normalizeDuplexText } from "./duplex-cache.js";
import { pLimit } from "./limit.js";
import { RagMcpClient, type RagToolCaller } from "./rag-client.js";
import type { ExpandedContext, RagRetrieveResponse } from "./report/models.js";
import { DEFAULT_NPC_REGISTRY, type RegistryNpc } from "./scene-roster.js";
import {
  recordLiveListenerTelemetry,
  type LiveListenerTelemetryEvent
} from "./telemetry.js";

export const MAX_ENTITIES_PER_RUN = 4;

const PROTAGONIST_TOKENS = new Set([
  "scarlett",
  "benjamin",
  "ben",
  "scar",
  "loughrey"
]);

export type NerEntityType = "person" | "location" | "lore";

export type NerEntity = {
  entity: string;
  type: NerEntityType;
  confidence: number;
};

export type LiveListenerConfig = Pick<
  GuardianConfig,
  | "GUARDIAN_LISTENER_ENABLED"
  | "GUARDIAN_LISTENER_MODEL"
  | "GUARDIAN_LISTENER_TTL_MS"
  | "GUARDIAN_LISTENER_TIMEOUT_MS"
  | "GUARDIAN_LISTENER_MIN_CONFIDENCE"
  | "OPENAI_API_KEY"
  | "RAG_MCP_URL"
  | "RAG_MCP_BEARER_TOKEN"
  | "RAG_MCP_TIMEOUT_MS"
>;

export type LiveListenerLlm = {
  completeJson: (prompt: string, signal?: AbortSignal) => Promise<unknown>;
};

export type LiveListenerTelemetryRecorder = (event: LiveListenerTelemetryEvent) => void;

export type ScheduleLiveListenerArgs = {
  threadKey: string;
  scarlettMessage: string;
  sourceHash?: string;
  config: LiveListenerConfig;
  cache?: ActiveRosterCache;
  ragClient?: RagToolCaller;
  llm?: LiveListenerLlm;
  nowMs?: number;
  onTelemetry?: LiveListenerTelemetryRecorder;
  createRagClient?: (config: LiveListenerConfig) => RagToolCaller;
};

type InFlightSlot = {
  promise: Promise<void>;
  pending?: ScheduleLiveListenerArgs;
};

const inFlightByThread = new Map<string, InFlightSlot>();

export function isProtagonistEntity(name: string): boolean {
  const key = normalizeEntityKey(name);
  if (!key) return true;
  const tokens = key.split(" ").filter(Boolean);
  if (tokens.every((t) => PROTAGONIST_TOKENS.has(t))) return true;
  const first = tokens[0];
  return first === "scarlett" || first === "benjamin" || first === "ben";
}

function hayIncludesAlias(hay: string, alias: string): boolean {
  const a = alias.toLowerCase().trim();
  if (a.length < 2) return false;
  if (a.includes(" ")) return hay.includes(a);
  const re = new RegExp(
    `(?:^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`,
    "i"
  );
  return re.test(hay);
}

export function matchRegistryNpc(
  entity: string,
  registry: RegistryNpc[] = DEFAULT_NPC_REGISTRY
): RegistryNpc | undefined {
  const hay = entity.toLowerCase().replace(/[-_.'']/g, " ").replace(/\s+/g, " ").trim();
  for (const npc of registry) {
    if (hayIncludesAlias(hay, npc.displayName)) return npc;
    if (npc.aliases.some((a) => hayIncludesAlias(hay, a))) return npc;
  }
  return undefined;
}

export function parseNerEntities(raw: unknown): NerEntity[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && Array.isArray((raw as { entities?: unknown }).entities)
      ? (raw as { entities: unknown[] }).entities
      : null;
  if (!arr) return [];
  const out: NerEntity[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { entity?: unknown; name?: unknown; type?: unknown; confidence?: unknown };
    const entity =
      typeof rec.entity === "string"
        ? rec.entity.trim()
        : typeof rec.name === "string"
          ? rec.name.trim()
          : "";
    if (!entity) continue;
    const type: NerEntityType =
      rec.type === "location" || rec.type === "lore" || rec.type === "person" ? rec.type : "person";
    const conf = Number(rec.confidence);
    const confidence = Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0;
    out.push({ entity, type, confidence });
  }
  return out.slice(0, 8);
}

function parseSummaries(raw: unknown): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (raw == null || typeof raw !== "object") return map;
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { dossiers?: unknown }).dossiers)
      ? ((raw as { dossiers: unknown[] }).dossiers)
      : null;
  if (!arr) return map;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { entity?: unknown; bullets?: unknown };
    const entity = typeof rec.entity === "string" ? rec.entity.trim() : "";
    if (!entity) continue;
    const bullets = Array.isArray(rec.bullets)
      ? rec.bullets
          .filter((b): b is string => typeof b === "string")
          .map((b) => b.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, MAX_BULLETS_PER_DOSSIER)
      : [];
    if (bullets.length) map.set(normalizeEntityKey(entity), bullets);
  }
  return map;
}

function fallbackBullets(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const sentences = compact.split(/(?<=[.!?])\s+/).filter((s) => s.length > 12);
  const picked = (sentences.length ? sentences : [compact]).slice(0, MAX_BULLETS_PER_DOSSIER);
  return picked.map((s) => s.slice(0, 140).trim()).filter(Boolean);
}

function aborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function defaultLlm(config: LiveListenerConfig): LiveListenerLlm {
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  return {
    async completeJson(prompt, signal) {
      const response = await client.chat.completions.create(
        {
          model: config.GUARDIAN_LISTENER_MODEL,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        },
        { signal } as never
      );
      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("empty LLM response");
      return JSON.parse(text) as unknown;
    }
  };
}

function extractExpandPayload(response: ExpandedContext | undefined): {
  text: string;
  sources: ActiveRosterSource[];
} {
  const sources: ActiveRosterSource[] = [];
  const parts: string[] = [];
  if (response?.summary?.trim()) parts.push(response.summary.trim());
  for (const r of response?.expanded_results ?? []) {
    if (r.text?.trim()) parts.push(r.text.trim());
    const file = r.source_file?.trim() || response?.anchor?.source_file || "";
    const section = r.section?.trim() || response?.anchor?.section || "";
    if (file || section) sources.push({ source_file: file, section });
  }
  if (!sources.length && response?.anchor) {
    sources.push({
      source_file: response.anchor.source_file ?? "",
      section: response.anchor.section ?? ""
    });
  }
  return { text: parts.join("\n\n").slice(0, 4000), sources };
}

function extractSearchPayload(response: RagRetrieveResponse | undefined): {
  text: string;
  sources: ActiveRosterSource[];
} {
  const sources: ActiveRosterSource[] = [];
  const parts: string[] = [];
  if (response?.summary?.trim()) parts.push(response.summary.trim());
  for (const r of response?.results ?? []) {
    if (r.text?.trim()) parts.push(r.text.trim());
    sources.push({
      source_file: r.source_file ?? "",
      section: r.section ?? ""
    });
  }
  return { text: parts.join("\n\n").slice(0, 4000), sources };
}

function buildNerPrompt(scarlettMessage: string): string {
  const snippet = scarlettMessage.replace(/\s+/g, " ").trim().slice(0, 4000);
  return `You are a Named Entity Recognition specialist for a long-running literary roleplay (Scarlett & Benjamin).
Read the last in-character reply. Extract proper nouns a story-memory researcher should look up:
- supporting NPCs (never Scarlett or Benjamin)
- named locations with narrative weight
- named lore objects / places from prior canon

Ignore throwaway waiters, generic nouns, and the two protagonists.

Return JSON: { "entities": [ { "entity": string, "type": "person"|"location"|"lore", "confidence": number } ] }
confidence is narrative relevance from 0 to 1, not spelling certainty. Cap at 8 entities.

Reply:
${snippet}`;
}

function buildSummarizePrompt(
  items: Array<{ entity: string; type: NerEntityType; text: string }>
): string {
  const blocks = items
    .map(
      (item, i) =>
        `### ${i + 1}. ${item.entity} (${item.type})\n${item.text.slice(0, 1800)}`
    )
    .join("\n\n");
  return `Compile dense 3-bullet dossiers for a novelist. Facts ONLY from SOURCE TEXT. If a source is insufficient, omit that entity.

Each entity: at most 3 bullets, total under 350 characters. No purple prose. No invented facts.

Return JSON: { "dossiers": [ { "entity": string, "bullets": string[] } ] }

SOURCE TEXT:
${blocks}`;
}

export type RunLiveListenerResult = {
  dossiers: ActiveRosterDossier[];
  entitiesExtracted: number;
  skippedMemo: number;
  skippedLowConfidence: number;
  skippedProtagonist: number;
};

export async function runLiveListenerResearch(args: {
  threadKey: string;
  scarlettMessage: string;
  sourceHash?: string;
  config: LiveListenerConfig;
  cache?: ActiveRosterCache;
  ragClient: RagToolCaller;
  llm: LiveListenerLlm;
  nowMs?: number;
  signal?: AbortSignal;
  onTelemetry?: LiveListenerTelemetryRecorder;
}): Promise<RunLiveListenerResult> {
  const t0 = performance.now();
  const nowMs = args.nowMs ?? Date.now();
  const cache = args.cache ?? activeRosterCache;
  const ttlMs = args.config.GUARDIAN_LISTENER_TTL_MS ?? DEFAULT_LISTENER_TTL_MS;
  const minConfidence = args.config.GUARDIAN_LISTENER_MIN_CONFIDENCE ?? 0.6;
  const threadKey = args.threadKey.trim() || "default";
  const sourceHash =
    args.sourceHash?.trim() || hashDuplexContent(normalizeDuplexText(args.scarlettMessage));

  const stats = {
    entitiesExtracted: 0,
    skippedMemo: 0,
    skippedLowConfidence: 0,
    skippedProtagonist: 0
  };
  let nerMs: number | undefined;
  let ragMs: number | undefined;
  let summarizeMs: number | undefined;
  let error: string | undefined;

  const emit = (ok: boolean, dossiersWritten: number) => {
    const event: LiveListenerTelemetryEvent = {
      v: 1,
      kind: "live_listener",
      ts: new Date(nowMs).toISOString(),
      thread_key: threadKey,
      entities_extracted: stats.entitiesExtracted,
      dossiers_written: dossiersWritten,
      skipped_memo: stats.skippedMemo,
      skipped_low_confidence: stats.skippedLowConfidence,
      skipped_protagonist: stats.skippedProtagonist,
      latency_ms: {
        total: Math.round(performance.now() - t0),
        ner: nerMs,
        rag: ragMs,
        summarize: summarizeMs
      },
      model: args.config.GUARDIAN_LISTENER_MODEL,
      ok,
      error
    };
    try {
      if (args.onTelemetry) args.onTelemetry(event);
      else recordLiveListenerTelemetry(event);
    } catch {
      /* never throw */
    }
  };

  try {
    const existing = cache.getFresh(threadKey, ttlMs, nowMs);
    if (existing?.sourceHash === sourceHash && existing.dossiers.length) {
      emit(true, existing.dossiers.length);
      return { dossiers: existing.dossiers, ...stats };
    }

    if (aborted(args.signal)) {
      error = "aborted";
      emit(false, 0);
      return { dossiers: [], ...stats };
    }

    const tNer = performance.now();
    let nerRaw: unknown;
    try {
      nerRaw = await args.llm.completeJson(buildNerPrompt(args.scarlettMessage), args.signal);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      nerMs = Math.round(performance.now() - tNer);
      emit(false, 0);
      return { dossiers: [], ...stats };
    }
    nerMs = Math.round(performance.now() - tNer);

    const extracted = parseNerEntities(nerRaw);
    stats.entitiesExtracted = extracted.length;

    const filtered: NerEntity[] = [];
    const seenKeys = new Set<string>();
    for (const ent of extracted.sort((a, b) => b.confidence - a.confidence)) {
      if (isProtagonistEntity(ent.entity)) {
        stats.skippedProtagonist += 1;
        continue;
      }
      if (ent.confidence < minConfidence) {
        stats.skippedLowConfidence += 1;
        continue;
      }
      const key = normalizeEntityKey(ent.entity);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      filtered.push(ent);
      if (filtered.length >= MAX_ENTITIES_PER_RUN) break;
    }

    const memoHits: ActiveRosterDossier[] = [];
    const needFetch: NerEntity[] = [];
    for (const ent of filtered) {
      const memo = cache.getMemo(ent.entity, DEFAULT_ENTITY_MEMO_TTL_MS, nowMs);
      if (memo) {
        stats.skippedMemo += 1;
        memoHits.push({ ...memo, entity: ent.entity, confidence: ent.confidence });
      } else {
        needFetch.push(ent);
      }
    }

    if (aborted(args.signal)) {
      error = "aborted";
      if (memoHits.length) {
        cache.upsert(
          { threadKey, dossiers: memoHits.map((d) => clampDossier(d)), updatedAtMs: nowMs, sourceHash },
          nowMs
        );
      }
      emit(false, memoHits.length);
      return { dossiers: memoHits, ...stats };
    }

    type Fetched = {
      entity: NerEntity;
      text: string;
      sources: ActiveRosterSource[];
    };
    const fetched: Fetched[] = [];

    if (needFetch.length && args.ragClient) {
      const tRag = performance.now();
      const limit = pLimit(2);
      await Promise.all(
        needFetch.map((ent) =>
          limit(async () => {
            if (aborted(args.signal)) return;
            const npc = matchRegistryNpc(ent.entity);
            try {
              if (npc) {
                const response = await args.ragClient.callJsonTool<ExpandedContext>(
                  "expand_context_around_chunk",
                  {
                    source_file: npc.sourceFile,
                    section: npc.sectionNeedle,
                    before: 0,
                    after: 0,
                    max_chars: 2200
                  },
                  args.signal
                );
                const payload = extractExpandPayload(response);
                if (payload.text.trim()) {
                  fetched.push({ entity: ent, ...payload });
                  return;
                }
              }
              const search = await args.ragClient.callJsonTool<RagRetrieveResponse>(
                "search_story_memory",
                {
                  query: `${ent.entity} canon dossier ${ent.type}`,
                  max_results: 4,
                  rewrite_query: true,
                  max_chars_per_result: 1800,
                  source_roles: ["npc_canon", "story_bible", "arc_chronicle"]
                },
                args.signal
              );
              const payload = extractSearchPayload(search);
              if (payload.text.trim()) fetched.push({ entity: ent, ...payload });
            } catch (err) {
              console.warn(
                `${Date.now()} Live Listener RAG miss for ${ent.entity}:`,
                err instanceof Error ? err.message : String(err)
              );
            }
          })
        )
      );
      ragMs = Math.round(performance.now() - tRag);
    }

    const summaries = new Map<string, string[]>();
    if (fetched.length && !aborted(args.signal)) {
      const tSum = performance.now();
      try {
        const raw = await args.llm.completeJson(
          buildSummarizePrompt(
            fetched.map((f) => ({
              entity: f.entity.entity,
              type: f.entity.type,
              text: f.text
            }))
          ),
          args.signal
        );
        for (const [k, v] of parseSummaries(raw)) summaries.set(k, v);
      } catch (err) {
        console.warn(
          `${Date.now()} Live Listener summarize failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
      summarizeMs = Math.round(performance.now() - tSum);
    }

    const researched: ActiveRosterDossier[] = [];
    for (const f of fetched) {
      const fromLlm = summaries.get(normalizeEntityKey(f.entity.entity));
      const bullets = fromLlm?.length ? fromLlm : fallbackBullets(f.text);
      if (!bullets.length) continue;
      researched.push(
        clampDossier({
          entity: f.entity.entity,
          confidence: f.entity.confidence,
          bullets,
          sources: f.sources.filter((s) => s.source_file || s.section)
        })
      );
    }

    const dossiers = [...memoHits, ...researched].map((d) => clampDossier(d));
    if (dossiers.length) {
      cache.upsert({ threadKey, dossiers, updatedAtMs: nowMs, sourceHash }, nowMs);
    }
    emit(true, dossiers.length);
    return { dossiers, ...stats };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    emit(false, 0);
    return { dossiers: [], ...stats };
  }
}

function listenerArmed(config: LiveListenerConfig, llm?: LiveListenerLlm): boolean {
  if (!config.GUARDIAN_LISTENER_ENABLED) return false;
  if (llm) return true;
  return Boolean(config.OPENAI_API_KEY);
}

/**
 * Fire-and-forget. Per-thread in-flight lock with latest-pending coalescing.
 * Never throws into the caller.
 */
export function scheduleLiveListenerResearch(args: ScheduleLiveListenerArgs): void {
  try {
    if (!listenerArmed(args.config, args.llm)) return;
    const threadKey = args.threadKey?.trim() || "default";
    const existing = inFlightByThread.get(threadKey);
    if (existing) {
      existing.pending = { ...args, threadKey };
      return;
    }

    const slot: InFlightSlot = { promise: Promise.resolve() };
    inFlightByThread.set(threadKey, slot);
    slot.promise = (async () => {
      let current: ScheduleLiveListenerArgs | undefined = { ...args, threadKey };
      while (current) {
        const timeoutMs = current.config.GUARDIAN_LISTENER_TIMEOUT_MS ?? 20000;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        const ownedClient =
          current.ragClient ??
          current.createRagClient?.(current.config) ??
          new RagMcpClient(current.config);
        const closeOwned = !current.ragClient && Boolean(ownedClient.close);
        try {
          const llm = current.llm ?? defaultLlm(current.config);
          if (ownedClient.connect) {
            await ownedClient.connect(ac.signal);
          }
          await runLiveListenerResearch({
            threadKey,
            scarlettMessage: current.scarlettMessage,
            sourceHash: current.sourceHash,
            config: current.config,
            cache: current.cache,
            ragClient: ownedClient,
            llm,
            nowMs: current.nowMs,
            signal: ac.signal,
            onTelemetry: current.onTelemetry
          });
        } catch (err) {
          console.warn(
            `${Date.now()} Live Listener pass failed:`,
            err instanceof Error ? err.message : String(err)
          );
        } finally {
          clearTimeout(timer);
          if (closeOwned && ownedClient.close) {
            await ownedClient.close().catch(() => undefined);
          }
        }
        current = slot.pending;
        slot.pending = undefined;
      }
    })().finally(() => {
      inFlightByThread.delete(threadKey);
    });

    void slot.promise;
  } catch (err) {
    console.warn(
      `${Date.now()} Live Listener schedule failed:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Test helper: clear in-flight / pending locks. */
export function _resetLiveListenerLocksForTests(): void {
  inFlightByThread.clear();
}

export function _liveListenerInFlightForTests(threadKey = "default"): boolean {
  return inFlightByThread.has(threadKey);
}

export async function _waitForLiveListenerIdleForTests(timeoutMs = 5000): Promise<void> {
  const t0 = Date.now();
  while (inFlightByThread.size > 0) {
    if (Date.now() - t0 > timeoutMs) throw new Error("live listener idle timeout");
    await Promise.allSettled([...inFlightByThread.values()].map((s) => s.promise));
  }
}

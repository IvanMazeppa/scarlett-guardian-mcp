/**
 * Hermetic RAG stand-in for L1 eval replay (WP-1.1).
 * Returns recorded cassette responses; any tool/args miss throws PLAN_DRIFT.
 *
 * Spec: docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md §1.2, §3 L1
 */
import { performance } from "node:perf_hooks";
import type { RagToolCaller } from "../src/guardian/rag-client.js";
import { getActiveTelemetryCollector } from "../src/guardian/telemetry.js";
import type { CassetteResponse, CassetteToolEntry, GoldenCassette } from "./schema.js";

export const PLAN_DRIFT = "PLAN_DRIFT" as const;

export class CassetteMissError extends Error {
  readonly code = PLAN_DRIFT;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly availableTools: string[];

  constructor(tool: string, args: Record<string, unknown>, availableTools: string[]) {
    const argPreview = stableStringify(args);
    super(
      `${PLAN_DRIFT}: cassette has no response for tool "${tool}" with args ${argPreview}. ` +
        `Available tools: [${availableTools.join(", ") || "(none)"}]. ` +
        `Retrieval plan likely changed — re-record from a fresh report or amend the golden deliberately.`
    );
    this.name = "CassetteMissError";
    this.tool = tool;
    this.args = args;
    this.availableTools = availableTools;
  }
}

/** Stable JSON for args hashing / previews (sorted object keys, recursive). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

export function hashArgs(args: Record<string, unknown>): string {
  return stableStringify(args ?? {});
}

type ConsumableSlot =
  | { kind: "single"; response: CassetteResponse; used: boolean }
  | { kind: "queue"; responses: CassetteResponse[]; index: number }
  | { kind: "map"; byHash: Map<string, CassetteResponse>; used: Set<string> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Heuristic: a record whose values are all cassette responses and whose keys
 * look like hashes/keys (not a single RAG payload like { results: [...] }).
 * Prefer explicit array form for multi-call; map form when curated with hashes.
 */
function looksLikeHashMap(entry: Record<string, unknown>): boolean {
  const keys = Object.keys(entry);
  if (keys.length === 0) return false;
  // RAG payloads almost always include these
  if ("results" in entry || "status" in entry || "query" in entry || "content" in entry) {
    return false;
  }
  if ("success" in entry || "staged_update" in entry || "expanded_results" in entry) {
    return false;
  }
  // All values must themselves be responses (string | object | array)
  return keys.every((k) => {
    const v = entry[k];
    return typeof v === "string" || typeof v === "object";
  });
}

function toSlot(entry: CassetteToolEntry): ConsumableSlot {
  if (typeof entry === "string" || Array.isArray(entry)) {
    // Bare string response OR array of responses
    if (typeof entry === "string") {
      return { kind: "single", response: entry, used: false };
    }
    // array: could be JSON array response OR multi-call queue
    // Multi-call queues are arrays of objects/strings; a single RAG "results" payload
    // is never a top-level array in our tools. Treat top-level array as FIFO queue.
    // Exception: empty array is still a valid single response for callJsonTool.
    if (entry.length > 0 && entry.every((item) => typeof item === "string" || isPlainObject(item) || Array.isArray(item))) {
      // Ambiguity: [ {results:...}, {results:...} ] = queue of two tool calls
      // vs one tool returning an array. Our RAG tools return objects, not top-level arrays.
      const allLookLikeCalls = entry.every(
        (item) => typeof item === "string" || isPlainObject(item)
      );
      if (allLookLikeCalls) {
        return { kind: "queue", responses: entry as CassetteResponse[], index: 0 };
      }
    }
    return { kind: "single", response: entry as CassetteResponse, used: false };
  }

  // object
  if (looksLikeHashMap(entry)) {
    const byHash = new Map<string, CassetteResponse>();
    for (const [k, v] of Object.entries(entry)) {
      byHash.set(k, v as CassetteResponse);
    }
    return { kind: "map", byHash, used: new Set() };
  }
  return { kind: "single", response: entry, used: false };
}

export type CassetteClientOptions = {
  /** Case id for error context / future seeded serendipity. */
  caseId?: string;
};

/**
 * Structural stand-in for RagMcpClient. Zero network. Loud on miss.
 */
export class CassetteRagClient implements RagToolCaller {
  private readonly cassette: GoldenCassette;
  private slots: Map<string, ConsumableSlot>;
  private readonly caseId?: string;
  /** Ordered log of successful cassette hits (for scorecards / debug). */
  readonly hits: Array<{ tool: string; argsHash: string }> = [];

  constructor(cassette: GoldenCassette, options: CassetteClientOptions = {}) {
    this.caseId = options.caseId;
    this.cassette = cassette;
    this.slots = new Map();
    this.rebuildSlots();
  }

  /**
   * Reset FIFO / map consumption so the same cassette can be replayed
   * (WP-4.8 L3 multi-trial). Does not mutate the original cassette payload.
   */
  reset(): void {
    this.hits.length = 0;
    this.rebuildSlots();
  }

  private rebuildSlots(): void {
    this.slots = new Map();
    for (const [tool, entry] of Object.entries(this.cassette)) {
      this.slots.set(tool, toSlot(entry));
    }
  }

  get availableTools(): string[] {
    return [...this.slots.keys()].sort();
  }

  async callJsonTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const t0 = performance.now();
    let ok = false;
    try {
      const response = this.resolve(name, args ?? {});
      if (typeof response === "string") {
        try {
          const parsed = JSON.parse(response) as T;
          ok = true;
          return parsed;
        } catch (error) {
          throw new Error(
            `Cassette response for ${name} is not valid JSON text: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      ok = true;
      return response as T;
    } finally {
      try {
        getActiveTelemetryCollector()?.recordTool(name, performance.now() - t0, ok);
      } catch {
        /* ignore */
      }
    }
  }

  async callTextTool(name: string, args: Record<string, unknown>): Promise<string> {
    const t0 = performance.now();
    let ok = false;
    try {
      const response = this.resolve(name, args ?? {});
      ok = true;
      if (typeof response === "string") return response;
      return JSON.stringify(response);
    } finally {
      try {
        getActiveTelemetryCollector()?.recordTool(name, performance.now() - t0, ok);
      } catch {
        /* ignore */
      }
    }
  }

  private resolve(tool: string, args: Record<string, unknown>): CassetteResponse {
    const slot = this.slots.get(tool);
    if (!slot) {
      throw this.miss(tool, args);
    }

    const argsHash = hashArgs(args);

    if (slot.kind === "single") {
      if (slot.used) {
        // Second call with only a single recorded response → plan drift
        throw this.miss(tool, args);
      }
      slot.used = true;
      this.hits.push({ tool, argsHash });
      return slot.response;
    }

    if (slot.kind === "queue") {
      if (slot.index >= slot.responses.length) {
        throw this.miss(tool, args);
      }
      const response = slot.responses[slot.index];
      slot.index += 1;
      this.hits.push({ tool, argsHash });
      return response;
    }

    // map: exact hash match, then empty-args / {} fallback key "", then any single unused
    if (slot.byHash.has(argsHash)) {
      if (slot.used.has(argsHash)) {
        throw this.miss(tool, args);
      }
      slot.used.add(argsHash);
      this.hits.push({ tool, argsHash });
      return slot.byHash.get(argsHash)!;
    }
    // optional empty-object alias
    if (slot.byHash.has("") && !slot.used.has("")) {
      slot.used.add("");
      this.hits.push({ tool, argsHash: "" });
      return slot.byHash.get("")!;
    }
    throw this.miss(tool, args);
  }

  private miss(tool: string, args: Record<string, unknown>): CassetteMissError {
    const err = new CassetteMissError(tool, args, this.availableTools);
    if (this.caseId) {
      err.message = `[${this.caseId}] ${err.message}`;
    }
    return err;
  }
}

/** Build a cassette client from a golden case cassette map. */
export function createCassetteClient(
  cassette: GoldenCassette,
  options?: CassetteClientOptions
): CassetteRagClient {
  return new CassetteRagClient(cassette, options);
}

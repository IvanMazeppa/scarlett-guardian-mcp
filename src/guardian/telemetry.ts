/**
 * Guardian preflight telemetry (WP-1.6 / D3 P0).
 * Fire-and-forget NDJSON append — never blocks or fails the hot path.
 *
 * Spec: docs/fable-5-roadmaps-audits/guardian-telemetry-dashboard-design-2026-07.md
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export type ToolTimingSample = {
  tool: string;
  ms: number;
  ok: boolean;
};

export type IntentionKind = "initiate" | "receive" | "rest" | "unknown";

export type CorrectionKind =
  | "cis_wash"
  | "parroting"
  | "location_rewind"
  | "ensemble"
  | "other"
  | "none";

export type PreflightTelemetryEvent = {
  v: typeof TELEMETRY_SCHEMA_VERSION;
  ts: string;
  preflight_id?: string;
  report_path?: string;
  /**
   * live hot-path emit vs reconstructed from saved report (WP-1.7 backfill)
   * vs hermetic/eval harness emit (WP-R3 — excluded from dashboard defaults).
   */
  source?: "live" | "backfill" | "eval";

  latency_ms: {
    total: number;
    rag: {
      index_status?: number;
      retrieve?: number;
      search: number[];
      expand?: number;
      verify?: number;
      other: Array<{ tool: string; ms: number }>;
    };
    llm_assessment?: number;
    phases?: Record<string, number>;
  };

  quality: {
    confidence_score: number;
    proceed_recommendation: string;
    retrieval_status: string;
    llm_facts_count: number;
    scene_delta_present: boolean;
    brief_chars?: number;
    meta_pollution: boolean;
  };

  duplex: {
    source: "caller" | "bridge_cache" | "absent";
    previous_message_chars: number;
    correction_fired: boolean;
  };

  /** Warmth restore: resonance_echo present on this turn (optional for older NDJSON) */
  resonance_echo?: {
    present: boolean;
  };

  /** Multi-scene save lag detection (optional for older NDJSON) */
  save_lag?: {
    suspected: boolean;
  };

  serendipity: {
    fired: boolean;
    tier: string | null;
    category: string | null;
    deferred: boolean;
  };

  /** Mission Control narrative fields (additive; older NDJSON omit these). */
  intention?: IntentionKind;
  correction_kind?: CorrectionKind;
  location_fingerprint?: string | null;
  location_streak?: number;
  tools_invoked?: string[];
  scene_mode?: string;
  lore_pack?: string;

  memory: {
    preflight_result_count: number;
    search_result_counts: number[];
    max_chunk_chars: number;
    avg_chunk_chars: number;
    expand_sections: number;
  };

  memory_write: {
    action: "none" | "staged" | "live_append" | "failed" | string;
    reason_short: string;
  };

  hard_flags_count: number;
  triggers: string[];
};

/** Classify scarlett_next_intention for Serendipity / Parroting charts. */
export function classifyIntention(raw: string | null | undefined): IntentionKind {
  if (typeof raw !== "string") return "unknown";
  const t = raw.trim().toLowerCase();
  if (!t || t === "null") return "unknown";
  if (
    /\b(rest|recover|pause|still|quiet|receive|let him|wait|soften|yield|listen|accept)\b/.test(t) &&
    !/\b(initiate|lead|pull|start|open|reach|take|drive|choose|steer)\b/.test(t)
  ) {
    if (/\b(rest|recover|pause|still|quiet)\b/.test(t)) return "rest";
    return "receive";
  }
  if (/\b(rest|recover|pause|stillness|quiet)\b/.test(t)) return "rest";
  if (/\b(receive|let him|wait for|soften|yield|listen|accept his)\b/.test(t)) return "receive";
  if (
    /\b(initiate|lead|pull|start|open|reach|take|drive|choose|steer|kiss|touch|draw|invite|nudge)\b/.test(
      t
    )
  ) {
    return "initiate";
  }
  return "unknown";
}

/** Classify Director's Correction text into taxonomy buckets. */
export function classifyCorrectionKind(raw: string | null | undefined): CorrectionKind {
  if (typeof raw !== "string") return "none";
  const t = raw.trim();
  if (!t || t === "null") return "none";
  const lower = t.toLowerCase();
  if (
    /\b(cis-?wash|cis wash|pre-?op|anatom|hardware|genital|phallus|whatever sits beneath)\b/.test(
      lower
    )
  ) {
    return "cis_wash";
  }
  if (/\b(parrot|parroting|echo|mechanical agree|only-agree|hollow passivity)\b/.test(lower)) {
    return "parroting";
  }
  if (/\b(rewind|location|wrong (room|suite|place)|scene reset|save.?lag)\b/.test(lower)) {
    return "location_rewind";
  }
  if (/\b(ensemble|npc|cast|crowd|dilut|supporting)\b/.test(lower)) {
    return "ensemble";
  }
  return "other";
}

/** In-process collector for one preflight turn. */
export class PreflightTelemetryCollector {
  readonly t0 = performance.now();
  readonly toolSamples: ToolTimingSample[] = [];
  readonly phaseMarks = new Map<string, number>();
  private lastMark = this.t0;

  mark(phase: string): void {
    const now = performance.now();
    this.phaseMarks.set(phase, Math.round(now - this.lastMark));
    this.lastMark = now;
  }

  recordTool(tool: string, ms: number, ok: boolean): void {
    this.toolSamples.push({ tool, ms: Math.round(ms * 100) / 100, ok });
  }

  totalMs(): number {
    return Math.round(performance.now() - this.t0);
  }
}

const als = new AsyncLocalStorage<PreflightTelemetryCollector>();

export function getActiveTelemetryCollector(): PreflightTelemetryCollector | undefined {
  return als.getStore();
}

export function runWithTelemetryCollector<T>(
  collector: PreflightTelemetryCollector,
  fn: () => Promise<T>
): Promise<T> {
  return als.run(collector, fn);
}

export type TelemetrySink = {
  record(event: PreflightTelemetryEvent): void;
};

export function defaultTelemetryDir(cwd = process.cwd()): string {
  return path.join(cwd, ".guardian", "telemetry");
}

export function defaultReportsDir(cwd = process.cwd()): string {
  return path.join(cwd, "docs", "guardian-reports");
}

/**
 * Append one NDJSON line. Never throws to caller.
 * Uses setImmediate so the hot path returns before disk I/O.
 */
export function createNdjsonTelemetrySink(options?: {
  dir?: string;
  /** For tests: capture events without disk. */
  onEvent?: (event: PreflightTelemetryEvent) => void;
}): TelemetrySink {
  const dir = options?.dir ?? defaultTelemetryDir();
  return {
    record(event: PreflightTelemetryEvent): void {
      try {
        options?.onEvent?.(event);
        setImmediate(() => {
          void appendEventLine(dir, event).catch(() => {
            /* swallow — observability only */
          });
        });
      } catch {
        /* swallow */
      }
    }
  };
}

export async function appendEventLine(dir: string, event: PreflightTelemetryEvent): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
  const day = (event.ts || new Date().toISOString()).slice(0, 10);
  const file = path.join(dir, `events-${day}.ndjson`);
  const line = `${JSON.stringify(event)}\n`;
  await fsp.appendFile(file, line, "utf8");
}

/** Synchronous append for bulk backfill (caller owns error handling). */
export function appendEventLineSync(dir: string, event: PreflightTelemetryEvent): void {
  fs.mkdirSync(dir, { recursive: true });
  const day = (event.ts || new Date().toISOString()).slice(0, 10);
  const file = path.join(dir, `events-${day}.ndjson`);
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
}

/** Synchronous fail-closed existence check for tests. */
export function telemetryDirExists(dir: string): boolean {
  try {
    return fs.existsSync(dir);
  } catch {
    return false;
  }
}

const META_POLLUTION_PATTERNS = [
  /search_story_memory/i,
  /retrieve_story_context/i,
  /HIGH confidence context found/i,
  /project_source_files/i,
  /rank_score/i,
  /vector_store/i,
  /Do not draft from this preflight/i
];

export function detectMetaPollution(...texts: Array<string | undefined | null>): boolean {
  const blob = texts.filter(Boolean).join("\n");
  return META_POLLUTION_PATTERNS.some((re) => re.test(blob));
}

function firstMs(samples: ToolTimingSample[], tool: string): number | undefined {
  const hit = samples.find((s) => s.tool === tool);
  return hit ? Math.round(hit.ms) : undefined;
}

function allMs(samples: ToolTimingSample[], tool: string): number[] {
  return samples.filter((s) => s.tool === tool).map((s) => Math.round(s.ms));
}

export type BuildEventInput = {
  collector: PreflightTelemetryCollector;
  report: {
    confidence_score: number;
    proceed_recommendation: string;
    retrieval_status: string;
    hard_flags?: string[];
    memory_write?: { action?: string; reason?: string };
    duplex_source?: "caller" | "bridge_cache" | "absent";
    retrieval_notes?: string;
    llm_assessment?: {
      supported_facts?: string[];
      scene_state_delta?: string | null;
      grok_performance_correction?: string | null;
      resonance_echo?: string | null;
      scarlett_next_intention?: string | null;
    };
    current_state_summary?: string;
    grok_scene_summary?: string;
    serendipity_nudge?: string;
    retrieval_plan?: { high_risk_triggers?: string[] };
    tool_calls?: Array<{
      tool?: string;
      ok?: boolean;
      response?: unknown;
    }>;
    /** Optional Mission Control fields already on the report. */
    scene_mode?: string;
    lore_pack?: string;
  };
  input: {
    scarlett_previous_message?: string | null;
  };
  preflight_id?: string;
  report_path?: string;
  brief_chars?: number;
  llm_assessment_ms?: number;
  /** WP-R3: defaults to live; eval harness tags as eval when emitted. */
  source?: "live" | "backfill" | "eval";
  /** Optional narrative enrichments from preflight (Mission Control). */
  narrative?: {
    serendipity?: {
      fired?: boolean;
      tier?: string | null;
      category?: string | null;
      deferred?: boolean;
    };
    location_fingerprint?: string | null;
    location_streak?: number;
    scene_mode?: string;
    lore_pack?: string;
  };
};

/**
 * Build a compact event from collector + finished report (no extra I/O).
 */
export function buildPreflightTelemetryEvent(input: BuildEventInput): PreflightTelemetryEvent {
  const { collector, report } = input;
  const samples = collector.toolSamples;

  const searchCounts: number[] = [];
  let maxChunk = 0;
  let chunkSum = 0;
  let chunkN = 0;
  let expandSections = 0;
  let preflightResultCount = 0;

  for (const call of report.tool_calls ?? []) {
    const resp = call.response as
      | {
          result_count?: number;
          results?: Array<{ text?: string }>;
          expanded_results?: unknown[];
        }
      | undefined;
    if (!resp || typeof resp !== "object") continue;
    if (call.tool === "retrieve_story_context") {
      preflightResultCount = resp.result_count ?? resp.results?.length ?? 0;
    }
    if (call.tool === "search_story_memory") {
      searchCounts.push(resp.result_count ?? resp.results?.length ?? 0);
    }
    if (call.tool === "expand_context_around_chunk") {
      expandSections = resp.expanded_results?.length ?? 0;
    }
    for (const r of resp.results ?? []) {
      const n = (r.text ?? "").length;
      if (n > maxChunk) maxChunk = n;
      chunkSum += n;
      chunkN += 1;
    }
  }

  const known = new Set([
    "index_status",
    "retrieve_story_context",
    "search_story_memory",
    "expand_context_around_chunk",
    "verify_story_fact"
  ]);
  const other = samples
    .filter((s) => !known.has(s.tool))
    .map((s) => ({ tool: s.tool, ms: Math.round(s.ms) }));

  // Prefer report.duplex_source (WP-3.1) so bridge_cache merges are visible on the dashboard.
  const reportDuplex = report.duplex_source;
  const prevFromInput = input.input.scarlett_previous_message?.trim() ?? "";
  const duplexSource: PreflightTelemetryEvent["duplex"]["source"] =
    reportDuplex === "caller" || reportDuplex === "bridge_cache" || reportDuplex === "absent"
      ? reportDuplex
      : prevFromInput
        ? "caller"
        : "absent";
  const prevChars =
    duplexSource === "absent"
      ? 0
      : prevFromInput.length ||
        (typeof report.retrieval_notes === "string" && /provided/i.test(report.retrieval_notes) ? 1 : 0);
  const correction = report.llm_assessment?.grok_performance_correction;
  const correctionFired =
    typeof correction === "string" && correction.trim().length > 0 && correction.trim() !== "null";
  const correctionKind = classifyCorrectionKind(correction);
  const intention = classifyIntention(report.llm_assessment?.scarlett_next_intention);
  const toolsInvoked = [
    ...new Set(
      (report.tool_calls ?? [])
        .map((c) => c.tool)
        .filter((t): t is string => typeof t === "string" && t.length > 0)
    )
  ];

  const scene = report.grok_scene_summary ?? report.current_state_summary ?? "";
  const facts = report.llm_assessment?.supported_facts ?? [];

  const phases: Record<string, number> = {};
  for (const [k, v] of collector.phaseMarks) phases[k] = v;

  const narr = input.narrative;
  const serendipityFired =
    narr?.serendipity?.fired ?? Boolean(report.serendipity_nudge?.trim());

  return {
    v: TELEMETRY_SCHEMA_VERSION,
    ts: new Date().toISOString(),
    preflight_id: input.preflight_id,
    report_path: input.report_path,
    source: input.source ?? "live",
    latency_ms: {
      total: collector.totalMs(),
      rag: {
        index_status: firstMs(samples, "index_status"),
        retrieve: firstMs(samples, "retrieve_story_context"),
        search: allMs(samples, "search_story_memory"),
        expand: firstMs(samples, "expand_context_around_chunk"),
        verify: firstMs(samples, "verify_story_fact"),
        other
      },
      llm_assessment: input.llm_assessment_ms,
      phases
    },
    quality: {
      confidence_score: report.confidence_score,
      proceed_recommendation: report.proceed_recommendation,
      retrieval_status: report.retrieval_status,
      llm_facts_count: facts.length,
      scene_delta_present: Boolean(report.llm_assessment?.scene_state_delta),
      brief_chars: input.brief_chars,
      meta_pollution: detectMetaPollution(scene)
    },
    duplex: {
      source: duplexSource,
      previous_message_chars: prevChars,
      correction_fired: correctionFired
    },
    resonance_echo: {
      present: Boolean(
        typeof report.llm_assessment?.resonance_echo === "string" &&
          report.llm_assessment.resonance_echo.trim() &&
          report.llm_assessment.resonance_echo.trim() !== "null"
      )
    },
    save_lag: {
      suspected: (report.hard_flags ?? []).some((f) => /SAVE_LAG_SUSPECTED/i.test(f))
    },
    serendipity: {
      fired: serendipityFired,
      tier: narr?.serendipity?.tier ?? null,
      category: narr?.serendipity?.category ?? null,
      deferred: narr?.serendipity?.deferred ?? false
    },
    intention,
    correction_kind: correctionKind,
    location_fingerprint: narr?.location_fingerprint ?? null,
    location_streak: narr?.location_streak,
    tools_invoked: toolsInvoked,
    scene_mode: narr?.scene_mode ?? report.scene_mode,
    lore_pack: narr?.lore_pack ?? report.lore_pack,
    memory: {
      preflight_result_count: preflightResultCount,
      search_result_counts: searchCounts,
      max_chunk_chars: maxChunk,
      avg_chunk_chars: chunkN ? Math.round(chunkSum / chunkN) : 0,
      expand_sections: expandSections
    },
    memory_write: {
      action: report.memory_write?.action ?? "none",
      reason_short: (report.memory_write?.reason ?? "").slice(0, 120)
    },
    hard_flags_count: report.hard_flags?.length ?? 0,
    triggers: report.retrieval_plan?.high_risk_triggers ?? []
  };
}

let defaultSink: TelemetrySink | null = null;

export function getDefaultTelemetrySink(): TelemetrySink {
  if (!defaultSink) {
    defaultSink = createNdjsonTelemetrySink();
  }
  return defaultSink;
}

/** Test helper: replace default sink. */
export function setDefaultTelemetrySinkForTests(sink: TelemetrySink | null): void {
  defaultSink = sink;
}

/**
 * Best-effort record. Never throws.
 */
export function recordPreflightTelemetry(
  event: PreflightTelemetryEvent,
  sink: TelemetrySink = getDefaultTelemetrySink()
): void {
  try {
    sink.record(event);
  } catch {
    /* never surface */
  }
}

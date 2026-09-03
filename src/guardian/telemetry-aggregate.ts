/**
 * Read-path telemetry aggregation (WP-1.7) — never on the preflight hot path.
 */
import fs from "node:fs";
import path from "node:path";
import {
  defaultReportsDir,
  defaultTelemetryDir,
  detectMetaPollution,
  classifyCorrectionKind,
  classifyIntention,
  type CorrectionKind,
  type IntentionKind,
  type PreflightTelemetryEvent
} from "./telemetry.js";
import { readLocationProgress } from "./location-progress.js";
import { readMissionControlState } from "./mission-control.js";

export function parsePreflightIdFromFilename(name: string): string | null {
  const m = name.match(/preflight-full-(.+)\.json$/);
  return m ? m[1] : null;
}

/** Reconstruct ISO ts from id stem like 2026-07-15T02-51-26-420Z */
export function timestampFromPreflightId(id: string): string {
  // 2026-07-15T02-51-26-420Z → 2026-07-15T02:51:26.420Z
  const m = id.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/
  );
  if (m) {
    return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
  }
  const d = new Date(id.replace(/-/g, (ch, i) => (i > 10 ? ":" : ch)));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

type LooseReport = {
  confidence_score?: number;
  proceed_recommendation?: string;
  retrieval_status?: string;
  hard_flags?: string[];
  memory_write?: { action?: string; reason?: string };
  llm_assessment?: {
    supported_facts?: string[];
    scene_state_delta?: string | null;
    grok_performance_correction?: string | null;
    resonance_echo?: string | null;
    scarlett_next_intention?: string | null;
    enabled?: boolean;
  };
  current_state_summary?: string;
  grok_scene_summary?: string;
  grok_key_facts?: string[];
  serendipity_nudge?: string;
  retrieval_notes?: string;
  retrieval_plan?: { high_risk_triggers?: string[] };
  tool_calls?: Array<{ tool?: string; ok?: boolean; response?: unknown }>;
};

/**
 * Build a telemetry event from a saved preflight-full JSON (no live timings).
 */
export function eventFromSavedReport(
  report: LooseReport,
  meta: { preflight_id: string; report_path: string; ts?: string }
): PreflightTelemetryEvent {
  const notes = report.retrieval_notes ?? "";
  const duplexAbsent = (report.hard_flags ?? []).some((f) =>
    /DUPLEX_INPUT_MISSING/i.test(f)
  );
  const duplexFromNotes = /scarlett_previous_message provided/i.test(notes);
  const duplexSource: PreflightTelemetryEvent["duplex"]["source"] = duplexAbsent
    ? "absent"
    : duplexFromNotes
      ? "caller"
      : "absent";

  const correction = report.llm_assessment?.grok_performance_correction;
  const correctionFired =
    typeof correction === "string" &&
    correction.trim().length > 0 &&
    correction.trim() !== "null";

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

  const scene = report.grok_scene_summary ?? report.current_state_summary ?? "";
  const facts =
    report.llm_assessment?.supported_facts ?? report.grok_key_facts ?? [];
  const briefChars = [
    report.grok_scene_summary,
    report.grok_key_facts?.join(" "),
    report.current_state_summary
  ]
    .filter(Boolean)
    .join("\n").length;

  return {
    v: 1,
    ts: meta.ts ?? timestampFromPreflightId(meta.preflight_id),
    preflight_id: meta.preflight_id,
    report_path: meta.report_path,
    source: "backfill",
    latency_ms: {
      total: 0,
      rag: { search: [], other: [] },
      phases: { backfilled: 1 }
    },
    quality: {
      confidence_score: report.confidence_score ?? 0,
      proceed_recommendation: report.proceed_recommendation ?? "unknown",
      retrieval_status: report.retrieval_status ?? "unknown",
      llm_facts_count: facts.length,
      scene_delta_present: Boolean(report.llm_assessment?.scene_state_delta),
      brief_chars: briefChars || undefined,
      meta_pollution: detectMetaPollution(scene)
    },
    duplex: {
      source: duplexSource,
      previous_message_chars: duplexSource === "caller" ? 1 : 0,
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
      fired: Boolean(report.serendipity_nudge?.trim()),
      tier: null,
      category: null,
      deferred: false
    },
    intention: classifyIntention(report.llm_assessment?.scarlett_next_intention),
    correction_kind: classifyCorrectionKind(correction),
    tools_invoked: [
      ...new Set(
        (report.tool_calls ?? [])
          .map((c) => c.tool)
          .filter((t): t is string => typeof t === "string" && t.length > 0)
      )
    ],
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

export function listEventFiles(telemetryDir: string, days?: number): string[] {
  if (!fs.existsSync(telemetryDir)) return [];
  const files = fs
    .readdirSync(telemetryDir)
    .filter((f) => /^events-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f))
    .sort();
  if (days == null || days <= 0) return files.map((f) => path.join(telemetryDir, f));
  const cutoff = Date.now() - days * 86400000;
  return files
    .filter((f) => {
      const day = f.slice("events-".length, "events-".length + 10);
      const t = Date.parse(`${day}T00:00:00.000Z`);
      return !Number.isNaN(t) && t >= cutoff - 86400000;
    })
    .map((f) => path.join(telemetryDir, f));
}

export function loadTelemetryEvents(options?: {
  telemetryDir?: string;
  days?: number;
  limit?: number;
}): PreflightTelemetryEvent[] {
  const dir = options?.telemetryDir ?? defaultTelemetryDir();
  const files = listEventFiles(dir, options?.days);
  const events: PreflightTelemetryEvent[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { kind?: string };
        if (parsed?.kind === "live_listener") continue;
        events.push(parsed as PreflightTelemetryEvent);
      } catch {
        /* skip bad lines */
      }
    }
  }
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  if (options?.limit && options.limit > 0) {
    return events.slice(-options.limit);
  }
  return events;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export type TelemetrySummary = {
  days: number;
  event_count: number;
  live_count: number;
  backfill_count: number;
  last_event_ts: string | null;
  latency: {
    p50_total_ms: number | null;
    p95_total_ms: number | null;
    live_with_timing: number;
  };
  quality: {
    avg_confidence: number | null;
    avg_facts: number | null;
    meta_pollution_rate: number;
    scene_delta_rate: number;
    avg_brief_chars: number | null;
  };
  duplex: {
    present_rate: number;
    correction_rate: number;
    absent_count: number;
    present_count: number;
    correction_count: number;
  };
  /** Share of turns with a non-null resonance_echo (warmth texture). */
  resonance_echo: {
    present_rate: number;
    present_count: number;
  };
  /** Share of turns where multi-scene save lag was flagged. */
  save_lag: {
    suspected_rate: number;
    suspected_count: number;
  };
  memory_write: Record<string, number>;
  memory: {
    avg_max_chunk_chars: number | null;
    max_chunk_chars_p95: number | null;
  };
  reports_dir_count: number;
};

export function summarizeTelemetryEvents(
  events: PreflightTelemetryEvent[],
  options?: {
    days?: number;
    reportsDir?: string;
    /**
     * WP-R3: which event sources to include.
     * Default `live` — exclude eval/backfill so dashboard p50 is trustworthy.
     * Pass `all` or explicit list for ops.
     */
    sources?: Array<"live" | "backfill" | "eval"> | "all";
  }
): TelemetrySummary {
  const days = options?.days ?? 7;
  const scoped =
    options?.sources === "all"
      ? events
      : events.filter((e) => {
          const src = e.source ?? "live";
          const allow = options?.sources ?? ["live"];
          return allow.includes(src as "live" | "backfill" | "eval");
        });
  const live = scoped.filter((e) => e.source !== "backfill" && (e.latency_ms?.total ?? 0) > 0);
  const totals = live
    .map((e) => e.latency_ms.total)
    .filter((n) => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);

  const conf = scoped.map((e) => e.quality.confidence_score).filter((n) => n > 0);
  const facts = scoped.map((e) => e.quality.llm_facts_count);
  const briefs = scoped
    .map((e) => e.quality.brief_chars)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const metaHits = scoped.filter((e) => e.quality.meta_pollution).length;
  const deltaHits = scoped.filter((e) => e.quality.scene_delta_present).length;
  const present = scoped.filter((e) => e.duplex.source !== "absent").length;
  const absent = scoped.length - present;
  const corrections = scoped.filter((e) => e.duplex.correction_fired).length;
  const echoPresent = scoped.filter((e) => e.resonance_echo?.present).length;
  const saveLagSuspected = scoped.filter((e) => e.save_lag?.suspected).length;

  const writeCounts: Record<string, number> = {};
  for (const e of scoped) {
    const a = e.memory_write?.action ?? "none";
    writeCounts[a] = (writeCounts[a] ?? 0) + 1;
  }

  const maxChunks = scoped
    .map((e) => e.memory.max_chunk_chars)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  let reportsCount = 0;
  const rdir = options?.reportsDir ?? defaultReportsDir();
  try {
    reportsCount = fs
      .readdirSync(rdir)
      .filter((f) => f.startsWith("preflight-full-") && f.endsWith(".json")).length;
  } catch {
    reportsCount = 0;
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  return {
    days,
    event_count: scoped.length,
    live_count: events.filter((e) => (e.source ?? "live") === "live").length,
    backfill_count: events.filter((e) => e.source === "backfill").length,
    last_event_ts: scoped.length ? scoped[scoped.length - 1].ts : null,
    latency: {
      p50_total_ms: percentile(totals, 50),
      p95_total_ms: percentile(totals, 95),
      live_with_timing: totals.length
    },
    quality: {
      avg_confidence: avg(conf),
      avg_facts: avg(facts),
      meta_pollution_rate: events.length ? metaHits / events.length : 0,
      scene_delta_rate: events.length ? deltaHits / events.length : 0,
      avg_brief_chars: avg(briefs)
    },
    duplex: {
      present_rate: scoped.length ? present / scoped.length : 0,
      correction_rate: scoped.length ? corrections / scoped.length : 0,
      absent_count: absent,
      present_count: present,
      correction_count: corrections
    },
    resonance_echo: {
      present_rate: scoped.length ? echoPresent / scoped.length : 0,
      present_count: echoPresent
    },
    save_lag: {
      suspected_rate: scoped.length ? saveLagSuspected / scoped.length : 0,
      suspected_count: saveLagSuspected
    },
    memory_write: writeCounts,
    memory: {
      avg_max_chunk_chars: avg(maxChunks),
      max_chunk_chars_p95: percentile(maxChunks, 95)
    },
    reports_dir_count: reportsCount
  };
}

export function telemetryHealth(options?: {
  telemetryDir?: string;
  reportsDir?: string;
}): {
  ok: boolean;
  last_event_ts: string | null;
  events_today: number;
  reports_dir_count: number;
  telemetry_dir: string;
} {
  const dir = options?.telemetryDir ?? defaultTelemetryDir();
  const today = new Date().toISOString().slice(0, 10);
  const todayFile = path.join(dir, `events-${today}.ndjson`);
  let eventsToday = 0;
  if (fs.existsSync(todayFile)) {
    eventsToday = fs
      .readFileSync(todayFile, "utf8")
      .split("\n")
      .filter((l) => l.trim()).length;
  }
  const recent = loadTelemetryEvents({ telemetryDir: dir, days: 30, limit: 1 });
  let reportsCount = 0;
  try {
    reportsCount = fs
      .readdirSync(options?.reportsDir ?? defaultReportsDir())
      .filter((f) => f.startsWith("preflight-full-") && f.endsWith(".json")).length;
  } catch {
    /* */
  }
  return {
    ok: true,
    last_event_ts: recent[0]?.ts ?? null,
    events_today: eventsToday,
    reports_dir_count: reportsCount,
    telemetry_dir: dir
  };
}

const NARRATIVE_TOOLS = [
  "retrieve_story_context",
  "search_story_memory",
  "expand_context_around_chunk",
  "verify_story_fact",
  "get_live_story_state"
] as const;

export type NarrativeTelemetrySummary = {
  days: number;
  event_count: number;
  intention: Record<IntentionKind, number>;
  serendipity_fired: number;
  parroting_corrections: number;
  /** initiate + serendipity vs receive + parroting — chart-friendly rates */
  serendipity_parroting: {
    initiate_plus_serendipity: number;
    receive_plus_parroting: number;
    initiate: number;
    receive: number;
    rest: number;
    serendipity: number;
    parroting: number;
  };
  location: {
    current_streak: number;
    current_fingerprint: string | null;
    current_location_line: string;
    threshold: number;
    stagnation: boolean;
    streak_series: Array<{ ts: string; streak: number }>;
  };
  tools: {
    counts: Record<string, number>;
    neglected: string[];
  };
  corrections: {
    total_fired: number;
    rate: number;
    by_kind: Record<CorrectionKind, number>;
    series: Array<{ ts: string; kind: CorrectionKind }>;
  };
  mission_control: {
    scene_mode: string;
    lore_pack: string;
    updated_at: string;
  };
};

function emptyIntention(): Record<IntentionKind, number> {
  return { initiate: 0, receive: 0, rest: 0, unknown: 0 };
}

function emptyCorrectionKinds(): Record<CorrectionKind, number> {
  return {
    cis_wash: 0,
    parroting: 0,
    location_rewind: 0,
    ensemble: 0,
    other: 0,
    none: 0
  };
}

/**
 * Mission Control narrative aggregates for Chart.js.
 * Defaults to live-only events (same as summary).
 */
export function summarizeNarrativeTelemetry(
  events: PreflightTelemetryEvent[],
  options?: {
    days?: number;
    sources?: Array<"live" | "backfill" | "eval"> | "all";
    cwd?: string;
  }
): NarrativeTelemetrySummary {
  const days = options?.days ?? 7;
  const scoped =
    options?.sources === "all"
      ? events
      : events.filter((e) => {
          const src = e.source ?? "live";
          const allow = options?.sources ?? ["live"];
          return allow.includes(src as "live" | "backfill" | "eval");
        });

  const intention = emptyIntention();
  let serendipityFired = 0;
  let parrotingCorrections = 0;
  const toolCounts: Record<string, number> = {};
  for (const name of NARRATIVE_TOOLS) toolCounts[name] = 0;
  const byKind = emptyCorrectionKinds();
  const correctionSeries: Array<{ ts: string; kind: CorrectionKind }> = [];
  const streakSeries: Array<{ ts: string; streak: number }> = [];
  let correctionFired = 0;

  for (const e of scoped) {
    const intent = e.intention ?? "unknown";
    intention[intent] = (intention[intent] ?? 0) + 1;
    if (e.serendipity?.fired) serendipityFired += 1;
    const kind = e.correction_kind ?? (e.duplex.correction_fired ? "other" : "none");
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    if (kind === "parroting") parrotingCorrections += 1;
    if (e.duplex.correction_fired || kind !== "none") {
      correctionFired += 1;
      correctionSeries.push({ ts: e.ts, kind });
    }
    if (typeof e.location_streak === "number") {
      streakSeries.push({ ts: e.ts, streak: e.location_streak });
    }
    const tools = e.tools_invoked?.length
      ? e.tools_invoked
      : [
          ...(e.latency_ms.rag.retrieve != null ? ["retrieve_story_context"] : []),
          ...(e.latency_ms.rag.search?.length ? ["search_story_memory"] : []),
          ...(e.latency_ms.rag.expand != null ? ["expand_context_around_chunk"] : []),
          ...(e.latency_ms.rag.verify != null ? ["verify_story_fact"] : []),
          ...(e.latency_ms.rag.other?.some((o) => o.tool === "get_live_story_state")
            ? ["get_live_story_state"]
            : [])
        ];
    for (const t of tools) {
      if (NARRATIVE_TOOLS.includes(t as (typeof NARRATIVE_TOOLS)[number])) {
        toolCounts[t] = (toolCounts[t] ?? 0) + 1;
      }
    }
  }

  const loc = readLocationProgress(options?.cwd);
  const mc = readMissionControlState(options?.cwd);
  const threshold = mc.sceneMode === "explicit_slow_burn" ? 25 : 15;
  const currentStreak = loc?.consecutiveTurns ?? 0;

  return {
    days,
    event_count: scoped.length,
    intention,
    serendipity_fired: serendipityFired,
    parroting_corrections: parrotingCorrections,
    serendipity_parroting: {
      initiate_plus_serendipity: intention.initiate + serendipityFired,
      receive_plus_parroting: intention.receive + parrotingCorrections,
      initiate: intention.initiate,
      receive: intention.receive,
      rest: intention.rest,
      serendipity: serendipityFired,
      parroting: parrotingCorrections
    },
    location: {
      current_streak: currentStreak,
      current_fingerprint: loc?.fingerprint ?? null,
      current_location_line: loc?.locationLine ?? "",
      threshold,
      stagnation: currentStreak >= threshold && Boolean(loc?.fingerprint && loc.fingerprint !== "empty"),
      streak_series: streakSeries.slice(-60)
    },
    tools: {
      counts: toolCounts,
      neglected: NARRATIVE_TOOLS.filter((t) => (toolCounts[t] ?? 0) === 0)
    },
    corrections: {
      total_fired: correctionFired,
      rate: scoped.length ? correctionFired / scoped.length : 0,
      by_kind: byKind,
      series: correctionSeries.slice(-80)
    },
    mission_control: {
      scene_mode: mc.sceneMode,
      lore_pack: mc.lorePack,
      updated_at: mc.updatedAt
    }
  };
}

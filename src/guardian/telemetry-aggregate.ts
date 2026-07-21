/**
 * Read-path telemetry aggregation (WP-1.7) — never on the preflight hot path.
 */
import fs from "node:fs";
import path from "node:path";
import {
  defaultReportsDir,
  defaultTelemetryDir,
  detectMetaPollution,
  type PreflightTelemetryEvent
} from "./telemetry.js";

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
    serendipity: {
      fired: Boolean(report.serendipity_nudge?.trim()),
      tier: null,
      category: null,
      deferred: false
    },
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
        events.push(JSON.parse(line) as PreflightTelemetryEvent);
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
      present_rate: events.length ? present / events.length : 0,
      correction_rate: events.length ? corrections / events.length : 0,
      absent_count: absent,
      present_count: present,
      correction_count: corrections
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

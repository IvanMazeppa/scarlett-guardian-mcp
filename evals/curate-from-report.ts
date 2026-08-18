/**
 * Extract a golden-case skeleton from a saved preflight-full-*.json report (WP-1.2).
 * Spec: docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md §2.3
 *
 * Inputs + cassette are recovered from the archive; expectations stay skeleton
 * (with universal meta-leak hygiene seeds) for human/Gemini authorship.
 */
import path from "node:path";
import type { GoldenCase, GoldenCassette, GoldenCategory, GoldenInput } from "./schema.js";
import { GOLDEN_CATEGORIES, parseGoldenCase } from "./schema.js";
// isGoldenCategory re-exported below from schema

export type ReportToolCall = {
  tool?: string;
  arguments?: Record<string, unknown>;
  ok?: boolean;
  response?: unknown;
  error?: string;
};

export type PreflightReportLike = {
  retrieval_plan?: {
    preflight_query?: string;
    memory_queries?: string[];
    high_risk_triggers?: string[];
  };
  tool_calls?: ReportToolCall[];
  llm_assessment?: Record<string, unknown> | null;
  memory_write?: { action?: string; reason?: string };
  hard_flags?: string[];
  retrieval_notes?: string;
  confidence_score?: number;
  grok_scene_summary?: string;
  current_state_summary?: string;
};

/** Universal L1 hygiene — always seeded; authors add case-specific must_include. */
export const SKELETON_META_MUST_NOT_INCLUDE = [
  "search_story_memory",
  "retrieve_story_context",
  "HIGH confidence context found",
  "project_source_files",
  "rank_score",
  "vector_store",
  "Do not draft from this preflight",
  "Call search_story_memory"
] as const;

export type ExtractedPreflightInput = GoldenInput & {
  /** How user_message / recent_context were recovered. */
  parse_notes: string[];
  /** True when retrieval_notes claim duplex was provided (text itself is not archived). */
  duplex_noted_but_text_missing: boolean;
};

/**
 * Recover Benjamin turn + recent context from retrieval_plan.preflight_query
 * (same shape as scripts/replay-brief-fixture.ts).
 */
export function extractInputFromReport(report: PreflightReportLike): ExtractedPreflightInput {
  const notes: string[] = [];
  const plan = report.retrieval_plan ?? {};
  const pq = (plan.preflight_query ?? "").trim();

  let user_message = "";
  let recent_context: string | null = null;

  const turnMatch = pq.match(/;\s*Benjamin turn:\s*([\s\S]+)$/i);
  if (turnMatch) {
    user_message = turnMatch[1].trim();
    notes.push("user_message from retrieval_plan.preflight_query (Benjamin turn:)");
  } else if (pq.includes("Benjamin turn:")) {
    user_message = pq.split(/Benjamin turn:/i).pop()?.trim() ?? "";
    notes.push("user_message from preflight_query split on Benjamin turn:");
  }

  const recentMatch = pq.match(/recent context:\s*([\s\S]+?);\s*Benjamin turn:/i);
  if (recentMatch) {
    recent_context = recentMatch[1].trim();
    notes.push("recent_context from preflight_query");
  }

  if (!user_message) {
    // Last-resort: first memory query (weak)
    const mq = plan.memory_queries?.[0]?.trim();
    if (mq) {
      user_message = mq;
      notes.push("WARNING: user_message fallback to first memory_query — review manually");
    }
  }

  if (!user_message) {
    throw new Error(
      "Cannot extract user_message from report: no Benjamin turn: in retrieval_plan.preflight_query"
    );
  }

  // force_full_retrieval heuristic: plan had 3 memory queries (diagnostic depth path)
  const force_full_retrieval = (plan.memory_queries?.length ?? 0) >= 3;
  if (force_full_retrieval) {
    notes.push("force_full_retrieval inferred true (memory_queries >= 3)");
  }

  // Duplex text is not persisted on GuardianReport today — only a notes breadcrumb.
  const notesText = report.retrieval_notes ?? "";
  const duplex_noted_but_text_missing =
    /Duplex:\s*scarlett_previous_message provided/i.test(notesText) ||
    /scarlett_previous_message provided/i.test(notesText);
  if (duplex_noted_but_text_missing) {
    notes.push(
      "scarlett_previous_message was provided at capture but is not stored in the report; set input.scarlett_previous_message manually for duplex cases"
    );
  }

  return {
    user_message,
    recent_context,
    scarlett_previous_message: null,
    force_full_retrieval,
    parse_notes: notes,
    duplex_noted_but_text_missing
  };
}

/**
 * Build cassette map from tool_calls: single response or FIFO array for multi-call tools.
 * Only successful calls with a response are included.
 */
export function buildCassetteFromToolCalls(
  toolCalls: ReportToolCall[] | undefined
): GoldenCassette {
  if (!toolCalls?.length) {
    throw new Error("Report has no tool_calls — cannot build cassette");
  }

  const byTool = new Map<string, unknown[]>();
  for (const call of toolCalls) {
    const tool = call.tool?.trim();
    if (!tool) continue;
    if (call.ok === false) continue;
    if (call.response === undefined || call.response === null) continue;
    const list = byTool.get(tool) ?? [];
    list.push(call.response);
    byTool.set(tool, list);
  }

  if (byTool.size === 0) {
    throw new Error("No successful tool_calls with responses — cassette would be empty");
  }

  const cassette: GoldenCassette = {};
  for (const [tool, responses] of byTool) {
    cassette[tool] = responses.length === 1 ? (responses[0] as GoldenCassette[string]) : (responses as GoldenCassette[string]);
  }
  return cassette;
}

export function suggestGoldenId(
  category: GoldenCategory,
  sourceReportName: string,
  sequence?: number
): string {
  // preflight-full-2026-07-15T02-51-26-420Z.json → 20260715-025126
  const base = path.basename(sourceReportName);
  const m = base.match(
    /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/
  );
  const stamp = m
    ? `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`
    : base.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  const seq = sequence != null ? String(sequence).padStart(3, "0") : "000";
  const catSlug = category.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `gt-${seq}-${catSlug}-${stamp}`.replace(/-+/g, "-").slice(0, 80);
}

export { isGoldenCategory } from "./schema.js";

export type CurateOptions = {
  category: GoldenCategory;
  id?: string;
  description?: string;
  sourceReportPath: string;
  /** Include frozen llm_assessment for --llm-mode frozen (WP-1.3). Default true. */
  includeFrozenLlm?: boolean;
  sequence?: number;
};

export type CurateResult = {
  golden: GoldenCase;
  parse_notes: string[];
  duplex_noted_but_text_missing: boolean;
  tool_summary: Record<string, number>;
};

function skeletonExpectations(report: PreflightReportLike): GoldenCase["expectations"] {
  const writeAction = report.memory_write?.action;
  let write_action_expected: GoldenCase["expectations"]["write_action_expected"] = "either";
  if (writeAction === "staged") write_action_expected = "stage";
  else if (writeAction === "none") write_action_expected = "none";

  const correction = report.llm_assessment?.grok_performance_correction;
  let correction_expected: GoldenCase["expectations"]["correction_expected"] = "either";
  if (correction === null) correction_expected = "none";
  else if (typeof correction === "string" && correction.trim()) correction_expected = "required";

  return {
    brief_must_include: [],
    brief_must_not_include: [...SKELETON_META_MUST_NOT_INCLUDE],
    flags_expected: [],
    flags_forbidden: ["MANDATORY_RETRIEVAL_FAILED"],
    precedents_must_not_match: [],
    correction_expected,
    write_action_expected,
    brief_chars: { min: 500, max: 10000 }
  };
}

function countTools(toolCalls: ReportToolCall[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const call of toolCalls ?? []) {
    const t = call.tool ?? "unknown";
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/**
 * Build a schema-valid golden skeleton from a full preflight report object.
 */
export function curateGoldenFromReport(
  report: PreflightReportLike,
  options: CurateOptions
): CurateResult {
  const extracted = extractInputFromReport(report);
  const cassette = buildCassetteFromToolCalls(report.tool_calls);
  const source_report = path.basename(options.sourceReportPath);
  const id = options.id ?? suggestGoldenId(options.category, source_report, options.sequence);

  const sceneHint =
    (typeof report.grok_scene_summary === "string" && report.grok_scene_summary.slice(0, 120)) ||
    (typeof report.current_state_summary === "string" && report.current_state_summary.slice(0, 120)) ||
    "";

  const description =
    options.description ??
    [
      `Skeleton curated from ${source_report}.`,
      "Author expectations (brief_must_include, case-specific must_not, precedents) before merging.",
      extracted.duplex_noted_but_text_missing
        ? "Duplex was on at capture — paste scarlett_previous_message into input if this is a duplex case."
        : "",
      sceneHint ? `Scene hint: ${sceneHint}` : ""
    ]
      .filter(Boolean)
      .join(" ");

  const raw = {
    id,
    category: options.category,
    description,
    source_report,
    input: {
      user_message: extracted.user_message,
      recent_context: extracted.recent_context,
      scarlett_previous_message: extracted.scarlett_previous_message,
      force_full_retrieval: extracted.force_full_retrieval
    },
    cassette,
    expectations: skeletonExpectations(report),
    ...(options.includeFrozenLlm !== false && report.llm_assessment
      ? { frozen_llm_assessment: report.llm_assessment }
      : {}),
    tags: ["curated-skeleton", options.category]
  };

  const golden = parseGoldenCase(raw, options.sourceReportPath);
  return {
    golden,
    parse_notes: extracted.parse_notes,
    duplex_noted_but_text_missing: extracted.duplex_noted_but_text_missing,
    tool_summary: countTools(report.tool_calls)
  };
}

export function defaultOutputPath(category: GoldenCategory, id: string, cwd = process.cwd()): string {
  return path.join(cwd, "evals", "golden", category, `${id}.json`);
}

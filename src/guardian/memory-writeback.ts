/**
 * P1 / WP-2.4 — Safe write-back policy for Guardian preflight.
 * Prefer staging over live append; never micro-log "scene stays aligned" noise.
 * Material gate uses live-beat delta + generic advance language (no arc-hardcoded places).
 */

import {
  extractCues,
  isStrongCue,
  type LiveBeat
} from "./recency.js";
import type { GuardianLlmAssessment } from "./report/models.js";

export type MemoryWriteMode = "stage" | "live" | "off";

export type MemoryWriteDecision =
  | { action: "none"; reason: string }
  | { action: "stage"; content: string; rationale: string; reason: string }
  | { action: "live_append"; content: string; reason: string };

const NOOP_PATTERNS = [
  /^(no durable|none|n\/?a|null|no change|scene stays aligned|no update needed|nothing to update)/i,
  /\bno durable canon change\b/i,
  /\bscene remains aligned\b/i,
  /\bno material change\b/i,
  /\bno write needed\b/i
];

/** Generic verbs/phrases that signal a beat advance (place-agnostic). */
const ADVANCE_LANGUAGE =
  /\b(moved to|arrived at|left for|departed|entered|exited|completed|finished|began|started|rolled out|relocated|transitioned to|now (?:at|in|on)|first time|milestone|open thread|new open thread|resolved thread|relationship milestone)\b/i;

const SAME_SCENE_LANGUAGE =
  /\b(no location change|same room|still in|remains? (in|at)|continues? (in|at)|talking softly|no major|unchanged)\b/i;

/** True if the auditor proposal is empty or a no-op micro-log. */
export function isNoOpMemoryUpdate(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length < 24) return true;
  return NOOP_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * True when the candidate update's place/time cues diverge from the live beat
 * (new location, new story-time anchors, or strong novel tokens vs current snapshot).
 */
export function hasLiveBeatDelta(update: string, liveBeat?: LiveBeat | null): boolean {
  if (!liveBeat) return false;
  const liveHay = [
    liveBeat.locationLine,
    liveBeat.timeLine,
    liveBeat.lastUpdated,
    ...liveBeat.liveCues
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[-_]+/g, " ");

  if (!liveHay.trim()) return false;

  const updateCues = extractCues(update, 24).filter(isStrongCue);
  const novel = updateCues.filter((c) => {
    const n = c.toLowerCase().replace(/[-_]+/g, " ");
    if (n.length < 5) return false;
    return !liveHay.includes(n);
  });

  // Two+ novel strong cues → likely a different place/beat than the live snapshot.
  if (novel.length >= 2) return true;

  // One novel cue + advance language (e.g. "arrived at Affalterbach" while live is Nordschleife).
  if (novel.length >= 1 && ADVANCE_LANGUAGE.test(update)) return true;

  return false;
}

/**
 * Material gate: medium+ risk, or clear state advance (generic language and/or live-beat delta).
 * No Germany-arc place literals — those were the WP-2.4 time bomb.
 */
export function isMaterialMemoryUpdate(
  update: string,
  assessment: Pick<
    GuardianLlmAssessment,
    "continuity_risk_level" | "scene_state_delta" | "should_block_prose"
  >,
  highRiskTriggers: string[],
  liveBeat?: LiveBeat | null
): boolean {
  if (isNoOpMemoryUpdate(update)) return false;
  if (assessment.should_block_prose) return false;

  const risk = assessment.continuity_risk_level ?? "low";
  if (risk === "medium" || risk === "high") return true;

  // Reject soft denials / continuous same-scene language.
  if (SAME_SCENE_LANGUAGE.test(update)) {
    return false;
  }

  const trimmed = update.trim();
  const advance = ADVANCE_LANGUAGE.test(update);
  const delta = hasLiveBeatDelta(update, liveBeat);

  // Low risk: need a clear advance signal and enough prose to be useful.
  if ((advance || delta) && trimmed.length >= 40) return true;

  // High-risk triggers alone are not enough (every intimate turn would write).
  // Require advance/delta plus a slightly longer note when only triggers fire.
  if (highRiskTriggers.length > 0 && (advance || delta) && trimmed.length >= 60) {
    return true;
  }

  return false;
}

/**
 * Pull a short session label from the first ~80 chars of an update (for ## Session — lines).
 */
export function sessionLabelFromUpdate(update: string): string {
  const cleaned = update
    .replace(/^[-*•]\s*/, "")
    .replace(/^\[[\d\-:\sT.Z]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const slice = cleaned.slice(0, 72);
  const cut = slice.replace(/[,:;.\s]+$/, "");
  return cut.length < cleaned.length ? `${cut}…` : cut || "continuity update";
}

/**
 * Story-date fragment from live beat when available (for ## Session — headers).
 */
export function sessionDateFromLiveBeat(liveBeat?: LiveBeat | null): string {
  if (!liveBeat) return "undated";
  const raw = (liveBeat.timeLine || liveBeat.lastUpdated || "").trim();
  if (!raw) return "undated";
  // Keep first clause short
  const first = raw.split(/[—(]/)[0]?.trim() || raw;
  return first.slice(0, 48) || "undated";
}

/**
 * Beat-advance body for event-log / staged appends: `## Session —` heading (D5 §3.2).
 */
export function formatBeatAdvanceSessionContent(
  update: string,
  liveBeat?: LiveBeat | null
): string {
  const cleaned = update
    .replace(/^[-*•]\s*/, "")
    .replace(/^\[[\d\-:\sT.Z]+\]\s*/, "")
    .trim();
  const date = sessionDateFromLiveBeat(liveBeat);
  const label = sessionLabelFromUpdate(cleaned);
  return `## Session — ${date} — ${label}\n\n- ${cleaned}\n`;
}

/** @deprecated Prefer formatBeatAdvanceSessionContent; kept name for staged current-state reviews. */
export function formatStagedMemoryContent(
  update: string,
  liveBeat?: LiveBeat | null
): string {
  // Still emit Session heading so any target (event-log or review queue) stays format-aligned.
  const body = formatBeatAdvanceSessionContent(update, liveBeat);
  return `## Proposed continuity update (Guardian)\n\n${body}`;
}

export function formatLiveAppendContent(
  update: string,
  liveBeat?: LiveBeat | null
): string {
  // Live mode still uses Session heading for future event-log appends (D5 §3.2).
  return `\n${formatBeatAdvanceSessionContent(update, liveBeat)}`;
}

/**
 * Decide whether/how to persist a candidate memory update.
 * Default mode is "stage" so autonomous proposals never touch live canon without review.
 */
export function decideMemoryWrite(input: {
  candidateUpdate: string | null | undefined;
  assessment: GuardianLlmAssessment;
  highRiskTriggers: string[];
  proceedRecommendation: "proceed" | "proceed_with_caution" | "do_not_proceed";
  writeMode?: MemoryWriteMode;
  /** Current live beat — used for material delta (WP-2.4). */
  liveBeat?: LiveBeat | null;
}): MemoryWriteDecision {
  const mode = input.writeMode ?? "stage";
  if (mode === "off") {
    return { action: "none", reason: "GUARDIAN_MEMORY_WRITE_MODE=off" };
  }

  if (input.proceedRecommendation === "do_not_proceed") {
    return { action: "none", reason: "prose blocked; no write-back" };
  }

  if (!input.assessment.enabled || input.assessment.error) {
    return { action: "none", reason: "LLM assessment unavailable" };
  }

  const raw =
    typeof input.candidateUpdate === "string"
      ? input.candidateUpdate
      : input.candidateUpdate == null
        ? ""
        : String(input.candidateUpdate);

  if (isNoOpMemoryUpdate(raw)) {
    return { action: "none", reason: "null/empty/no-op candidate_memory_update" };
  }

  if (!isMaterialMemoryUpdate(raw, input.assessment, input.highRiskTriggers, input.liveBeat)) {
    return {
      action: "none",
      reason: "immaterial under write-back gate (need medium+ risk or clear state advance / live-beat delta)"
    };
  }

  const delta = hasLiveBeatDelta(raw, input.liveBeat);
  const rationale = [
    `risk=${input.assessment.continuity_risk_level ?? "unknown"}`,
    input.highRiskTriggers.length ? `triggers=${input.highRiskTriggers.slice(0, 3).join("|")}` : "triggers=none",
    input.assessment.scene_state_delta ? "has_scene_delta" : "no_scene_delta",
    delta ? "live_beat_delta=yes" : "live_beat_delta=no"
  ].join("; ");

  if (mode === "live") {
    return {
      action: "live_append",
      content: formatLiveAppendContent(raw, input.liveBeat),
      reason: `live append allowed (${rationale})`
    };
  }

  return {
    action: "stage",
    content: formatStagedMemoryContent(raw, input.liveBeat),
    rationale: `Guardian preflight staged update (${rationale})`,
    reason: `stage preferred (${rationale})`
  };
}

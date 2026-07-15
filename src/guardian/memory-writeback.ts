/**
 * P1 — Safe / quieter write-back policy for Guardian preflight.
 * Prefer staging over live append; never micro-log "scene stays aligned" noise.
 */

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

/** True if the auditor proposal is empty or a no-op micro-log. */
export function isNoOpMemoryUpdate(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length < 24) return true;
  return NOOP_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Material gate: only write/stage when continuity risk is medium+,
 * or the update clearly advances location/time/physical/relationship state.
 */
export function isMaterialMemoryUpdate(
  update: string,
  assessment: Pick<GuardianLlmAssessment, "continuity_risk_level" | "scene_state_delta" | "should_block_prose">,
  highRiskTriggers: string[]
): boolean {
  if (isNoOpMemoryUpdate(update)) return false;
  if (assessment.should_block_prose) return false;

  const risk = assessment.continuity_risk_level ?? "low";
  if (risk === "medium" || risk === "high") return true;

  // Reject soft denials / continuous same-scene language.
  if (
    /\b(no location change|same room|still in|remains? (in|at)|continues? (in|at)|talking softly|no major|unchanged)\b/i.test(
      update
    )
  ) {
    return false;
  }

  // Low risk: allow clear location/time/physical advances (track day, travel, etc.)
  const materialCue =
    /\b(moved to|arrived at|left for|entered|exited|completed|finished|began|rolled out|on track|pit lane|paddock|shakedown|shakedown lap|test lap|race suit|nordschleife|n[uü]rburgring|affalterbach|where we are now|time in story)\b/i.test(
      update
    );

  if (materialCue && update.trim().length >= 40) return true;

  // High-risk triggers alone are not enough (every intimate turn would write).
  if (highRiskTriggers.length > 0 && materialCue && update.trim().length >= 60) return true;

  return false;
}

export function formatStagedMemoryContent(update: string): string {
  const cleaned = update
    .replace(/^[-*•]\s*/, "")
    .replace(/^\[[\d\-:\sT.Z]+\]\s*/, "")
    .trim();
  // Continuity-level note suitable for review / later merge into current-state.
  return `## Proposed continuity update (Guardian)\n\n- ${cleaned}\n`;
}

export function formatLiveAppendContent(update: string): string {
  const timeString = new Date().toISOString().replace("T", " ").substring(0, 19);
  const cleaned = update
    .replace(/^[-*•]\s*/, "")
    .replace(/^\[[\d\-:\sT.Z]+\]\s*/, "")
    .trim();
  return `\n- [${timeString}] ${cleaned}`;
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

  if (!isMaterialMemoryUpdate(raw, input.assessment, input.highRiskTriggers)) {
    return {
      action: "none",
      reason: "immaterial under write-back gate (need medium+ risk or clear state advance)"
    };
  }

  const rationale = [
    `risk=${input.assessment.continuity_risk_level ?? "unknown"}`,
    input.highRiskTriggers.length ? `triggers=${input.highRiskTriggers.slice(0, 3).join("|")}` : "triggers=none",
    input.assessment.scene_state_delta ? "has_scene_delta" : "no_scene_delta"
  ].join("; ");

  if (mode === "live") {
    return {
      action: "live_append",
      content: formatLiveAppendContent(raw),
      reason: `live append allowed (${rationale})`
    };
  }

  return {
    action: "stage",
    content: formatStagedMemoryContent(raw),
    rationale: `Guardian preflight staged update (${rationale})`,
    reason: `stage preferred (${rationale})`
  };
}

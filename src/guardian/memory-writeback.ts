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
import type { NpcStateChange } from "./llm-assessment.js";
import type { GuardianLlmAssessment } from "./report/models.js";

export type MemoryWriteMode = "stage" | "live" | "off";

export type MemoryWriteDecision =
  | { action: "none"; reason: string }
  | { action: "stage"; content: string; rationale: string; reason: string }
  | {
      action: "stage_transition";
      content: string;
      rationale: string;
      reason: string;
      /** Snapshot from auditor scene_transition (for WP-4.2 rewrite input). */
      transition: {
        from?: string;
        to?: string;
        kind?: "location" | "time_jump" | "both";
      };
    }
  | { action: "live_append"; content: string; reason: string };

export type NpcStateWriteDecision =
  | { action: "none"; reason: string }
  | {
      action: "stage_npc";
      changes: NpcStateChange[];
      requiresHumanReview: boolean;
      reason: string;
    };

export type NpcRegistryRewriteResult = {
  markdown: string;
  applied: NpcStateChange[];
  skipped: Array<{ change: NpcStateChange; reason: string }>;
};

const NPC_FIELD_LABELS: Record<NpcStateChange["kind"], string> = {
  disposition: "Disposition (couple)",
  wants: "Wants now",
  last_seen: "Last seen",
  knowledge: "Knows"
};

/**
 * D9 §7 gate: NPC deltas are bundled with a durable scene close and always use staging.
 * `live` mode does not bypass staging; knowledge is marked human-always.
 */
export function decideNpcStateWrite(input: {
  changes: NpcStateChange[] | null | undefined;
  sceneTransitionOccurred: boolean;
  proceedRecommendation: "proceed" | "proceed_with_caution" | "do_not_proceed";
  writeMode?: MemoryWriteMode;
}): NpcStateWriteDecision {
  if (!input.changes?.length) {
    return { action: "none", reason: "no npc_state_changes" };
  }
  if ((input.writeMode ?? "stage") === "off") {
    return { action: "none", reason: "GUARDIAN_MEMORY_WRITE_MODE=off" };
  }
  if (input.proceedRecommendation === "do_not_proceed") {
    return { action: "none", reason: "prose blocked; no NPC write-back" };
  }
  if (!input.sceneTransitionOccurred) {
    return {
      action: "none",
      reason: "npc_state_changes deferred: scene not closed (prevents same-scene last_seen churn)"
    };
  }
  const requiresHumanReview = input.changes.some((change) => change.kind === "knowledge");
  return {
    action: "stage_npc",
    changes: input.changes,
    requiresHumanReview,
    reason: requiresHumanReview
      ? "NPC registry delta contains knowledge: HUMAN REVIEW REQUIRED"
      : "NPC volatile registry deltas eligible for staged review"
  };
}

/**
 * Build a full-file overwrite proposal for the NPC registry.
 * The caller stages this markdown; this helper never writes canon directly.
 */
export function applyNpcStateChangesToRegistryMarkdown(
  markdown: string,
  changes: NpcStateChange[]
): NpcRegistryRewriteResult {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const applied: NpcStateChange[] = [];
  const skipped: Array<{ change: NpcStateChange; reason: string }> = [];

  for (const change of changes) {
    const section = findNpcRegistrySection(lines, change.npc);
    if (!section) {
      skipped.push({ change, reason: `NPC registry section not found: ${change.npc}` });
      continue;
    }

    const label = NPC_FIELD_LABELS[change.kind];
    const labelPattern = new RegExp(
      `^\\*\\*${escapeRegex(label)}:\\*\\*\\s*(.*?)(?:\\s+\\((?:VOLATILE|STABLE)\\))?\\s*$`,
      "i"
    );
    const incomingValue = cleanNpcRegistryValue(change.change);
    let fieldIndex = -1;
    let currentValue = "";
    for (let i = section.start + 1; i < section.end; i++) {
      const match = lines[i]?.trimEnd().match(labelPattern);
      if (!match) continue;
      fieldIndex = i;
      currentValue = cleanNpcRegistryValue(match[1] ?? "");
      break;
    }

    const normalizedCurrent = currentValue.toLocaleLowerCase();
    const normalizedIncoming = incomingValue.toLocaleLowerCase();
    const unchanged =
      change.kind === "knowledge"
        ? normalizedCurrent
            .split(/\s*;\s*/)
            .some((fact) => fact === normalizedIncoming)
        : currentValue.localeCompare(incomingValue, undefined, {
            sensitivity: "accent"
          }) === 0;
    if (currentValue && unchanged) {
      skipped.push({ change, reason: `${change.npc} ${change.kind} is unchanged` });
      continue;
    }

    // Knowledge is cumulative: append the reviewed fact rather than erasing prior STABLE knowledge.
    const value =
      change.kind === "knowledge" && currentValue
        ? `${currentValue}; ${incomingValue}`
        : incomingValue;
    const tier = change.kind === "knowledge" ? "STABLE" : "VOLATILE";
    const replacement = `**${label}:** ${value} (${tier})  `;
    if (fieldIndex >= 0) {
      lines[fieldIndex] = replacement;
    } else {
      lines.splice(section.end, 0, replacement);
    }
    applied.push(change);
  }

  return {
    markdown: lines.join("\n"),
    applied,
    skipped
  };
}

function findNpcRegistrySection(
  lines: string[],
  npc: string
): { start: number; end: number } | null {
  const needle = normalizeNpcRegistryName(npc);
  if (!needle) return null;
  let best: { start: number; level: number; score: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i]?.match(/^(#{3,4})\s+(.+?)\s*$/);
    if (!heading) continue;
    const candidate = normalizeNpcRegistryName(heading[2] ?? "");
    const score = scoreNpcRegistryName(needle, candidate);
    if (score <= (best?.score ?? 0)) continue;
    best = { start: i, level: heading[1]?.length ?? 3, score };
  }
  if (!best) return null;

  let end = lines.length;
  for (let i = best.start + 1; i < lines.length; i++) {
    const heading = lines[i]?.match(/^(#{1,4})\s+/);
    if (heading && (heading[1]?.length ?? 5) <= best.level) {
      end = i;
      break;
    }
  }
  return { start: best.start, end };
}

function normalizeNpcRegistryName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/^(?:mr|mrs|ms|miss|dr)\.?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreNpcRegistryName(needle: string, candidate: string): number {
  if (!needle || !candidate) return 0;
  if (needle === candidate) return 100;
  if (candidate.startsWith(`${needle} `) || needle.startsWith(`${candidate} `)) return 80;
  const needleFirst = needle.split(" ")[0] ?? "";
  const candidateFirst = candidate.split(" ")[0] ?? "";
  return needleFirst.length >= 4 && needleFirst === candidateFirst ? 60 : 0;
}

function cleanNpcRegistryValue(value: string): string {
  return value
    .replace(/\s+\((?:VOLATILE|STABLE)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NOOP_PATTERNS = [
  /^(no durable|none|n\/?a|null|no change|scene stays aligned|no update needed|nothing to update)/i,
  /\bno durable canon change\b/i,
  /\bscene remains aligned\b/i,
  /\bno material change\b/i,
  /\bno write needed\b/i
];

/** Generic verbs/phrases that signal a beat advance (place-agnostic). */
const ADVANCE_LANGUAGE =
  /\b(moved to|arrived at|left for|departed|entered|exited|completed|finished|began|started|rolled out|relocated|transitioned to|now (?:at|in|on)|first time|milestone|open thread|new open thread|resolved thread|relationship milestone|woke up|waking up|next morning|this morning|slept|fell asleep|went to sleep|alarm)\b/i;

const SAME_SCENE_LANGUAGE =
  /\b(no location change|same room|still in|remains? (in|at)|continues? (in|at)|talking softly|no major|unchanged)\b/i;

/** Played-turn cues that the story crossed into a new morning / wake. */
const WAKE_OR_MORNING_CUES =
  /\b(next morning|this morning|monday morning|tuesday morning|wednesday morning|thursday morning|friday morning|saturday morning|sunday morning|god morgon|good morning|alarm(?:\s+goes?\s+off)?|woke up|waking up|already awake|got up so early|side of the bed has cooled|6\s*a\.?m\.?|06:00|slept through|sound asleep|fell asleep|went to sleep|we(?:'re| are) both (?:sound )?asleep)\b/i;

/** Live-beat / prior-frame cues that the closed beat was still night/evening. */
const NIGHT_OR_EVENING_LIVE =
  /\b(evening|tonight|last night|late night|sunday (?:evening|night)|saturday (?:evening|night)|in bed|bedroom|after(?:care)?|dressing gown|rain|penthouse bedroom|hotel-recovery|recovery frame)\b/i;

const WEEKDAY_WORDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const;

export type SleepCycleTurnHints = {
  userMessage?: string;
  scarlettPreviousMessage?: string;
  recentContext?: string;
};

function joinTurnHaystack(hints: SleepCycleTurnHints): string {
  return [hints.userMessage, hints.scarlettPreviousMessage, hints.recentContext]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n");
}

function joinLiveHaystack(liveBeat?: LiveBeat | null): string {
  if (!liveBeat) return "";
  return [liveBeat.timeLine, liveBeat.lastUpdated, liveBeat.locationLine, ...(liveBeat.liveCues ?? [])]
    .filter(Boolean)
    .join(" ");
}

function extractWeekday(text: string): (typeof WEEKDAY_WORDS)[number] | null {
  const lower = text.toLowerCase();
  for (const day of WEEKDAY_WORDS) {
    if (new RegExp(`\\b${day}\\b`, "i").test(lower)) return day;
  }
  return null;
}

/**
 * Deterministic sleep / calendar-day boundary detector.
 * Same physical location (hotel suite) must still count as a durable time_jump when
 * play crosses night → next morning, otherwise write-back skips and current-state lags.
 */
export function detectSleepOrCalendarDayTransition(input: {
  liveBeat?: LiveBeat | null;
  hints: SleepCycleTurnHints;
}): NonNullable<GuardianLlmAssessment["scene_transition"]> | null {
  const played = joinTurnHaystack(input.hints);
  if (!played.trim()) return null;
  if (!WAKE_OR_MORNING_CUES.test(played)) return null;

  const liveHay = joinLiveHaystack(input.liveBeat);
  const recent = input.hints.recentContext ?? "";
  const priorNight =
    NIGHT_OR_EVENING_LIVE.test(liveHay) ||
    NIGHT_OR_EVENING_LIVE.test(recent) ||
    /\b(sunday|saturday)\b.*\b(evening|night|bed)\b/i.test(`${liveHay}\n${recent}`);

  const liveDay = extractWeekday(liveHay);
  const playedDay = extractWeekday(played);
  const calendarDayChanged = Boolean(liveDay && playedDay && liveDay !== playedDay);

  // Explicit "next morning" / wake after sleep language is enough even if live beat is sparse,
  // as long as recent_context or live hay still smells like the prior evening frame.
  const explicitNextMorning = /\b(next morning|monday morning|this morning after|alarm)\b/i.test(played);
  if (!priorNight && !calendarDayChanged && !explicitNextMorning) {
    return null;
  }

  const from =
    [input.liveBeat?.timeLine, input.liveBeat?.locationLine].filter(Boolean).join(" — ").trim() ||
    (recent.trim() ? recent.trim().slice(0, 160) : "prior evening / night beat");
  const toMatch = played.match(
    /\b((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+morning|[^.!\n]{0,40}(?:alarm|woke|god morgon|good morning)[^.!\n]{0,60})/i
  );
  const to = (toMatch?.[1] ?? "next morning (same location)").trim().slice(0, 160);

  return {
    occurred: true,
    from,
    to,
    kind: "time_jump"
  };
}

export function synthesizeSleepCycleMemoryUpdate(transition: {
  from?: string;
  to?: string;
}): string {
  const from = transition.from?.trim() || "prior evening beat";
  const to = transition.to?.trim() || "next morning";
  return (
    `Sleep/calendar day transition (same location allowed): closed ${from}; ` +
    `present is now ${to}. Summarize the prior day's durable events into current-state ` +
    `(Where We Are / Recent Key Events) and advance story-time to the new morning.`
  );
}

/**
 * If the auditor omitted scene_transition on a clear sleep/day boundary, inject time_jump
 * and ensure a non-null candidate_memory_update so decideMemoryWrite can stage it.
 */
export function enrichAssessmentForSleepCycleBoundary(input: {
  assessment: GuardianLlmAssessment;
  candidateUpdate: string | null | undefined;
  liveBeat?: LiveBeat | null;
  hints?: SleepCycleTurnHints;
}): {
  assessment: GuardianLlmAssessment;
  candidateUpdate: string | null | undefined;
  injected: boolean;
} {
  if (input.assessment.scene_transition?.occurred === true) {
    return {
      assessment: input.assessment,
      candidateUpdate: input.candidateUpdate,
      injected: false
    };
  }
  if (!input.hints) {
    return {
      assessment: input.assessment,
      candidateUpdate: input.candidateUpdate,
      injected: false
    };
  }

  const detected = detectSleepOrCalendarDayTransition({
    liveBeat: input.liveBeat,
    hints: input.hints
  });
  if (!detected) {
    return {
      assessment: input.assessment,
      candidateUpdate: input.candidateUpdate,
      injected: false
    };
  }

  const candidate =
    typeof input.candidateUpdate === "string" && input.candidateUpdate.trim() && !isNoOpMemoryUpdate(input.candidateUpdate)
      ? input.candidateUpdate
      : synthesizeSleepCycleMemoryUpdate(detected);

  return {
    assessment: {
      ...input.assessment,
      scene_transition: detected
    },
    candidateUpdate: candidate,
    injected: true
  };
}

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
 * SAVE-LAG DEADLOCK BREAK: provisional holdCanonWrites must not block the location
 * remediation write that clears the lag. Speculative NPC / other holds still apply.
 */
export function allowSaveLagRemediationWrite(input: {
  holdCanonWrites: boolean;
  saveLagSuspected: boolean;
  writeAction: MemoryWriteDecision["action"];
}): boolean {
  if (!input.holdCanonWrites) return true;
  if (!input.saveLagSuspected) return false;
  return (
    input.writeAction === "stage_transition" ||
    input.writeAction === "stage" ||
    input.writeAction === "live_append"
  );
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
  /** Optional played-turn text for sleep/day-boundary fallback when auditor omits transition. */
  turnHints?: SleepCycleTurnHints;
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

  const enriched = enrichAssessmentForSleepCycleBoundary({
    assessment: input.assessment,
    candidateUpdate: input.candidateUpdate,
    liveBeat: input.liveBeat,
    hints: input.turnHints
  });
  const assessment = enriched.assessment;

  const raw =
    typeof enriched.candidateUpdate === "string"
      ? enriched.candidateUpdate
      : enriched.candidateUpdate == null
        ? ""
        : String(enriched.candidateUpdate);

  const transition = assessment.scene_transition;
  const transitionOccurred = Boolean(transition && transition.occurred === true);

  // Scene transition may still need a non-noop candidate; if auditor set transition but
  // empty update, synthesize a minimal note from from→to for staging (WP-4.2 will rewrite).
  let rawForWrite = raw;
  if (isNoOpMemoryUpdate(raw)) {
    if (transitionOccurred && transition) {
      const from = transition.from?.trim() || "prior scene";
      const to = transition.to?.trim() || "new scene";
      rawForWrite =
        transition.kind === "time_jump"
          ? synthesizeSleepCycleMemoryUpdate(transition)
          : `Scene transition (${transition.kind ?? "location"}): ${from} → ${to}.`;
    } else {
      return { action: "none", reason: "null/empty/no-op candidate_memory_update" };
    }
  }

  // Transitions are always material when auditor declared them; otherwise use existing gate.
  if (
    !transitionOccurred &&
    !isMaterialMemoryUpdate(rawForWrite, assessment, input.highRiskTriggers, input.liveBeat)
  ) {
    return {
      action: "none",
      reason: "immaterial under write-back gate (need medium+ risk or clear state advance / live-beat delta)"
    };
  }

  const delta = hasLiveBeatDelta(rawForWrite, input.liveBeat);
  const rationale = [
    `risk=${assessment.continuity_risk_level ?? "unknown"}`,
    input.highRiskTriggers.length ? `triggers=${input.highRiskTriggers.slice(0, 3).join("|")}` : "triggers=none",
    assessment.scene_state_delta ? "has_scene_delta" : "no_scene_delta",
    delta ? "live_beat_delta=yes" : "live_beat_delta=no",
    transitionOccurred
      ? `scene_transition=yes kind=${transition?.kind ?? "unknown"}`
      : "scene_transition=no",
    enriched.injected ? "sleep_cycle_fallback=yes" : "sleep_cycle_fallback=no"
  ].join("; ");

  if (mode === "live") {
    return {
      action: "live_append",
      content: formatLiveAppendContent(rawForWrite, input.liveBeat),
      reason: `live append allowed (${rationale})`
    };
  }

  // WP-4.1: auditor-declared scene transition → distinct decision class (rewrite in WP-4.2).
  if (transitionOccurred) {
    return {
      action: "stage_transition",
      content: formatStagedMemoryContent(rawForWrite, input.liveBeat),
      rationale: `Guardian preflight scene transition (${rationale}) from=${transition?.from ?? "?"} to=${transition?.to ?? "?"}`,
      reason: `stage_transition preferred (${rationale})`,
      transition: {
        from: transition?.from,
        to: transition?.to,
        kind: transition?.kind
      }
    };
  }

  return {
    action: "stage",
    content: formatStagedMemoryContent(rawForWrite, input.liveBeat),
    rationale: `Guardian preflight staged update (${rationale})`,
    reason: `stage preferred (${rationale})`
  };
}

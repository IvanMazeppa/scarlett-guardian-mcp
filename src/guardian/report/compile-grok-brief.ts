/**
 * Compile a prose-facing markdown brief for Grok from a GuardianReport.
 * Full JSON (with tool_calls) remains for debug; this is what the novelist sees.
 */

import { enforceResonanceEchoBudget } from "../llm-assessment.js";
import {
  formatSceneCastBlock,
  loadRegistryTailMap
} from "../npc-registry.js";
import type { CriticalPrecedent, GuardianReport } from "./models.js";
import { isRagMetaText, stripRagMeta, truncate, truncateAtSentence } from "./text-clean.js";

/** Soft cap for the streamlined markdown Grok receives. Cost is fine to grow for quality. */
export const GROK_BRIEF_MAX_CHARS = 6500;

/** WP-5.8 design budget for Scene Cast block. */
export const SCENE_CAST_MAX_WORDS = 90;

/**
 * Character-balance anchor (hotfix 2026-07-23).
 * Replaces performative "Qualified Autonomy" leadership checklist.
 * scarlett_next_intention remains on the report for diagnostics but is not rendered in the brief.
 */
const CHARACTER_BALANCE_LINES = [
  "Scarlett's agency may appear as initiating, receiving, agreeing, following, yielding, resting, asking, setting a boundary, or relying on Benjamin — do not require visible leadership in every reply.",
  "With Benjamin, confidence stays warm and respectful. Do not invent coldness, contempt, dismissal, bossiness, punishment, or emotional distance unless the current on-page exchange clearly warrants conflict.",
  "Professional composure belongs to professional/public scenes. In private she may be playful, erotic, receptive, emotionally exposed, uncertain, tired, or quietly dependent.",
  "Sexual dominance is intimate and role-fluid, not a default command posture toward Benjamin. Receptivity or chosen submission is not passivity.",
  // Warmth restore (2026-07-23 follow-on): invite full private texture without performative slogans.
  "Private texture is welcome when grounded: humour, Swedish endearments, warmth, erotic specificity, bodily detail, and emotional associations from retrieved continuity — live them, do not announce them as proof of agency or softness."
];

const DEFAULT_AVOID = [
  "Do not invent pre-thread facts, names, dates, family details, or relationship history that are not supported by retrieved evidence or LIVE BEAT.",
  "When retrieved continuity supports a private phrase, gesture, or established erotic/emotional dynamic, you may use it; do not invent new history.",
  "Do not read Benjamin's private thoughts; infer only from speech, visible behavior, and retrieved context.",
  "Do not flatten Scarlett into generic romance, bland reassurance, cold autonomy, cruelty, or passive caretaking.",
  "CRITICAL CANON: Scarlett is a pre-op trans woman. Never forget her gender identity, anatomy, or transition history."
];

function statusLabel(recommendation: GuardianReport["proceed_recommendation"]): string {
  if (recommendation === "proceed") return "Proceed";
  if (recommendation === "proceed_with_caution") return "Proceed with Caution";
  return "Do Not Proceed";
}

function pickSceneSummary(report: GuardianReport): string {
  if (report.grok_scene_summary && !isRagMetaText(report.grok_scene_summary)) {
    return report.grok_scene_summary.trim();
  }

  const llm = report.llm_assessment;
  if (llm?.enabled && !llm.error) {
    if (llm.scene_state_delta && !isRagMetaText(llm.scene_state_delta)) {
      return stripRagMeta(llm.scene_state_delta) || llm.scene_state_delta.trim();
    }
    if (llm.continuity_facts_for_grok && !isRagMetaText(llm.continuity_facts_for_grok)) {
      return stripRagMeta(llm.continuity_facts_for_grok) || llm.continuity_facts_for_grok.trim();
    }
  }

  const cleaned = stripRagMeta(report.current_state_summary ?? "");
  if (cleaned) return cleaned;
  return "Live-scene context retrieved; ground in key facts and precedents below.";
}

function pickEmotionalContext(report: GuardianReport): string {
  if (report.grok_emotional_context && !isRagMetaText(report.grok_emotional_context)) {
    return report.grok_emotional_context.trim();
  }
  const cleaned = stripRagMeta(report.emotional_tone_guidance ?? "");
  return cleaned || "Match the scene's established emotional baseline; stay present and specific.";
}

function pickKeyFacts(report: GuardianReport): string[] {
  if (report.grok_key_facts && report.grok_key_facts.length > 0) {
    return report.grok_key_facts
      .map((f) => stripRagMeta(f) || f.trim())
      .filter((f) => f && !isRagMetaText(f))
      .slice(0, 6);
  }

  const llm = report.llm_assessment;
  if (llm?.enabled && !llm.error && llm.supported_facts?.length) {
    return llm.supported_facts
      .map((f) => stripRagMeta(f) || f.trim())
      .filter((f) => f && !isRagMetaText(f))
      .slice(0, 6);
  }

  // Surface only blocking / high-signal hard flags — not RAG coaching or duplex-input housekeeping.
  const blocking = (report.hard_flags ?? []).filter((flag) =>
    /MANDATORY_RETRIEVAL_FAILED|LLM_GUARDIAN_BLOCK|NO_DEEP_MEMORY|FACT_CHECK_|PARTIAL_RETRIEVAL/i.test(flag)
  );
  if (blocking.length > 0) {
    return blocking.slice(0, 4).map((f) => stripRagMeta(f) || f);
  }

  return ["No critical continuity flags; stay grounded in scene summary and precedents."];
}

function pickPrecedents(report: GuardianReport): CriticalPrecedent[] {
  const source = report.grok_precedents?.length
    ? report.grok_precedents
    : report.critical_precedents ?? [];

  return source
    .filter((p) => p.details && !isRagMetaText(p.details))
    .slice(0, 2)
    .map((p) => ({
      ...p,
      topic: truncate(p.topic.replace(/^Source file:.*$/gim, "").trim() || "Precedent", 80),
      details: truncateAtSentence(stripRagMeta(p.details) || p.details, 750)
    }));
}

function pickOpenThreads(report: GuardianReport): string[] {
  return (report.open_threads ?? [])
    .map((t) => stripRagMeta(t) || t.trim())
    .filter((t) => t && !isRagMetaText(t) && !/\b(search_story_memory|retrieve_story_context|Call |Do not draft)\b/i.test(t))
    .slice(0, 3);
}

function pickAvoid(report: GuardianReport): string[] {
  const fromReport = (report.things_to_avoid ?? [])
    .filter((line) => !/\b(skip tools|tools, JSON|connector mechanics|this Guardian report)\b/i.test(line))
    .filter((line) => !isRagMetaText(line));

  // Prefer shortened static list + any trigger-specific extras.
  const extras = fromReport.filter((line) => !DEFAULT_AVOID.some((d) => line.startsWith(d.slice(0, 40))));
  return [...DEFAULT_AVOID, ...extras].slice(0, 6);
}

function pickScarlettIntention(report: GuardianReport): string | undefined {
  const raw = report.llm_assessment?.scarlett_next_intention;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t || t === "null" || isRagMetaText(t)) return undefined;
  return stripRagMeta(t) || t;
}

/** Code-enforced ≤1 echo line (WP-5.5). */
function pickResonanceEcho(report: GuardianReport): string | undefined {
  const enforced = enforceResonanceEchoBudget(report.llm_assessment?.resonance_echo);
  if (!enforced || isRagMetaText(enforced)) return undefined;
  const cleaned = stripRagMeta(enforced) || enforced;
  return cleaned || undefined;
}

/** WP-5.8 Scene Cast from report.scene_roster + on-disk registry tails. */
function pickSceneCastBlock(report: GuardianReport): string | undefined {
  const roster = report.scene_roster;
  if (!roster?.active?.length) return undefined;
  try {
    const tails = loadRegistryTailMap();
    const block = formatSceneCastBlock(roster, tails, SCENE_CAST_MAX_WORDS);
    return block.trim() || undefined;
  } catch {
    // Fallback without tails
    const block = formatSceneCastBlock(roster, new Map(), SCENE_CAST_MAX_WORDS);
    return block.trim() || undefined;
  }
}

/**
 * Build the streamlined markdown brief Grok reads before writing Scarlett.
 * Never includes tool_calls, RAG coaching, or raw retrieval dialect.
 */
export function compileGrokBrief(report: GuardianReport): string {
  const parts: string[] = [];

  parts.push(`**Status:** ${statusLabel(report.proceed_recommendation)} (Confidence: ${report.confidence_score}%)`);
  parts.push(`**Scene Summary:** ${truncateAtSentence(pickSceneSummary(report), 900)}`);
  parts.push("");

  // WP-5.2: mechanical day/arc schedule pressure (no outcomes).
  const momentum =
    typeof report.story_momentum === "string" ? report.story_momentum.trim() : "";
  if (momentum && !isRagMetaText(momentum)) {
    parts.push(`**Story Momentum:** ${truncateAtSentence(momentum, 520)}`);
    parts.push("");
  }

  // WP-5.8: supporting cast pressure + mandatory stealth ⚠ lines (≤90 words).
  const castBlock = pickSceneCastBlock(report);
  if (castBlock) {
    parts.push(castBlock);
    parts.push("");
  }

  parts.push("**Recent Emotional & Relational Context:**");
  parts.push(`- ${truncateAtSentence(pickEmotionalContext(report), 520)}`);
  parts.push("");

  parts.push("**Key Facts to Ground In:**");
  for (const fact of pickKeyFacts(report)) {
    parts.push(`- ${truncateAtSentence(fact, 360)}`);
  }
  parts.push("");

  parts.push("**Relevant Precedents:**");
  const precedents = pickPrecedents(report);
  if (precedents.length === 0) {
    parts.push("None flagged for this turn.");
  } else {
    precedents.forEach((p, i) => {
      parts.push(`${i + 1}. **${p.topic}:** ${p.details}`);
    });
  }
  parts.push("");

  parts.push("**Things to Avoid:**");
  for (const avoid of pickAvoid(report)) {
    parts.push(`- ${avoid}`);
  }
  parts.push("");

  parts.push("**Open Threads / Notes:**");
  const threads = pickOpenThreads(report);
  if (threads.length === 0) {
    parts.push("- None flagged.");
  } else {
    for (const t of threads) {
      parts.push(`- ${truncateAtSentence(t, 420)}`);
    }
  }
  parts.push("");

  // WP-4.7: prefer auditor serendipity_weave (already preferred into serendipity_nudge in preflight).
  const weave =
    (report.llm_assessment?.serendipity_weave &&
    typeof report.llm_assessment.serendipity_weave === "string" &&
    report.llm_assessment.serendipity_weave.trim() &&
    report.llm_assessment.serendipity_weave !== "null"
      ? report.llm_assessment.serendipity_weave.trim()
      : undefined) ||
    (report.serendipity_nudge && !isRagMetaText(report.serendipity_nudge)
      ? report.serendipity_nudge.trim()
      : undefined);
  if (weave && !isRagMetaText(weave)) {
    parts.push("**World Weaver (Serendipity):**");
    // Strip legacy "SERENDIPITY EVENT..." prefix if present for cleaner novelist brief
    const clean = weave
      .replace(/^SERENDIPITY EVENT[^:]*:\s*/i, "")
      .replace(/\s*Grok Note:.*$/i, "")
      .trim();
    parts.push(`- ${truncateAtSentence(clean || weave, 320)}`);
    parts.push("");
  }

  // WP-5.5 scarlett_next_intention remains on the report for diagnostics/eval;
  // not rendered in the novelist brief (character-balance hotfix 2026-07-23).

  parts.push("**CHARACTER BALANCE:**");
  for (const line of CHARACTER_BALANCE_LINES) {
    parts.push(`- ${line}`);
  }
  parts.push("");

  const echo = pickResonanceEcho(report);
  if (echo) {
    parts.push("**Echo (optional texture):**");
    parts.push(`- ${truncateAtSentence(echo, 220)}`);
    parts.push("");
  }

  const correction = report.llm_assessment?.grok_performance_correction;
  if (correction && typeof correction === "string" && correction.trim() && correction !== "null") {
    parts.push("**DIRECTOR'S CORRECTION (CRITICAL):**");
    parts.push(`- ${truncate(correction.trim(), 400)}`);
    parts.push("");
  }

  let markdown = parts.join("\n").trim() + "\n";

  if (markdown.length > GROK_BRIEF_MAX_CHARS) {
    markdown = `${markdown.slice(0, GROK_BRIEF_MAX_CHARS - 20).trim()}\n\n…(brief truncated)\n`;
  }

  return markdown;
}

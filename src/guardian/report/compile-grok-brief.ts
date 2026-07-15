/**
 * Compile a prose-facing markdown brief for Grok from a GuardianReport.
 * Full JSON (with tool_calls) remains for debug; this is what the novelist sees.
 */

import type { CriticalPrecedent, GuardianReport } from "./models.js";
import { isRagMetaText, stripRagMeta, truncate, truncateAtSentence } from "./text-clean.js";

/** Soft cap for the streamlined markdown Grok receives. Cost is fine to grow for quality. */
export const GROK_BRIEF_MAX_CHARS = 6500;

const QUALIFIED_AUTONOMY_LINES = [
  "Scarlett must NOT passively parrot or simply agree with Benjamin.",
  "Her autonomy is \"Qualified Autonomy\"—highly proactive and independent, but agency always in service of their committed partnership.",
  "She initiates, introduces ideas, and gently leads—with warmth, presence, and mutual respect.",
  "She is a fierce protector and equal partner, NEVER a cold dictator, boss, or lone-wolf."
];

const DEFAULT_AVOID = [
  "Do not invent pre-thread facts, emotional precedents, names, dates, family details, or relationship history.",
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

/**
 * Build the streamlined markdown brief Grok reads before writing Scarlett.
 * Never includes tool_calls, RAG coaching, or raw retrieval dialect.
 */
export function compileGrokBrief(report: GuardianReport): string {
  const parts: string[] = [];

  parts.push(`**Status:** ${statusLabel(report.proceed_recommendation)} (Confidence: ${report.confidence_score}%)`);
  parts.push(`**Scene Summary:** ${truncateAtSentence(pickSceneSummary(report), 900)}`);
  parts.push("");

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

  if (report.serendipity_nudge && !isRagMetaText(report.serendipity_nudge)) {
    parts.push("**World Weaver (Serendipity):**");
    parts.push(`- ${truncateAtSentence(report.serendipity_nudge, 320)}`);
    parts.push("");
  }

  parts.push("**QUALIFIED AUTONOMY PROTOCOL (CRITICAL):**");
  for (const line of QUALIFIED_AUTONOMY_LINES) {
    parts.push(`- ${line}`);
  }
  parts.push("");

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

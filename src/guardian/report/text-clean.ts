/**
 * Shared text cleaning for Grok-facing Guardian briefs.
 * Strips RAG tool meta, upload boilerplate, and trims prose for the novelist.
 */

const RAG_META_PATTERNS: RegExp[] = [
  /\bshould_answer_now\b/i,
  /\bsearch_story_memory\b/i,
  /\bretrieve_story_context\b/i,
  /\bexpand_context_around_chunk\b/i,
  /\bverify_story_fact\b/i,
  /\bHIGH confidence context found from\b/i,
  /\bMEDIUM confidence (?:context|corpus)/i,
  /\bLOW confidence\b/i,
  /\bDo not draft from this preflight alone\b/i,
  /\bMake a targeted search_story_memory\b/i,
  /\bCall search_story_memory\b/i,
  /\bPreflight is complete, but do not draft\b/i,
  /\bUse these (?:corpus|indexed-memory) matches directly\b/i,
  /\brank_score\b/i,
  /\bvector_store\b/i,
  /\bDeep corpus evidence is also included from\b/i,
  /\bDo not draft from current-scene context alone\b/i,
  /\bMake one narrower corpus query\b/i
];

const UPLOAD_BOILERPLATE_LINE = /^(Source file:|Section:|File:|Filename:|result_id:|file_id:)/i;

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
}

/**
 * Truncate at a sentence / clause boundary when possible so briefs don't end mid-word.
 * Falls back to last space before the cap, then hard cut.
 */
export function truncateAtSentence(value: string, maxChars: number): string {
  const trimmed = compactWhitespace(value);
  if (trimmed.length <= maxChars) return trimmed;

  const window = trimmed.slice(0, maxChars);
  // Prefer ending on sentence punctuation within the last 40% of the window.
  const minKeep = Math.floor(maxChars * 0.55);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("; ")
  );
  if (sentenceEnd >= minKeep) {
    return window.slice(0, sentenceEnd + 1).trim();
  }

  const space = window.lastIndexOf(" ");
  if (space >= minKeep) {
    return `${window.slice(0, space).trim()}…`;
  }

  return `${window.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

/** True for useless client recaps that should not override retrieval. */
export function isPlaceholderContext(value: string | undefined | null): boolean {
  if (!value?.trim()) return true;
  const v = compactWhitespace(value).toLowerCase();
  if (v.length < 12) return true;
  return /^(none(?:\s+yet)?|n\/?a|null|undefined|tbd|establishing scene|none yet,?\s*establishing scene|no context|unknown)[.!]?$/.test(
    v
  );
}

/** Short topic label from a long "A > B > C" section path. */
export function shortTopicLabel(section?: string, fallback = "Scene precedent"): string {
  if (!section?.trim()) return fallback;
  const cleaned = section
    .replace(/^project_source_files\//i, "")
    .replace(/^Source file:.*$/gim, "")
    .trim();
  const parts = cleaned.split(/\s*>\s*/).map((p) => p.trim()).filter(Boolean);
  const leaf = parts[parts.length - 1] || cleaned;
  return truncateAtSentence(leaf, 72);
}

/** True if the string is primarily RAG tool-coaching / retrieval meta. */
export function isRagMetaText(value: string | undefined | null): boolean {
  if (!value?.trim()) return true;
  return RAG_META_PATTERNS.some((pattern) => pattern.test(value));
}

/** Remove sentences/clauses that match known RAG meta patterns. */
export function stripRagMeta(value: string): string {
  if (!value?.trim()) return "";

  // Split on sentence boundaries and drop meta sentences.
  const sentences = value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((sentence) => !isRagMetaText(sentence));

  const joined = sentences.join(" ").trim();
  // If the whole blob still looks like meta, drop it.
  if (!joined || isRagMetaText(joined)) return "";
  return compactWhitespace(joined);
}

/** Strip "Source file:" / "Section:" header lines from indexed chunk text. */
export function stripUploadBoilerplate(value: string): string {
  if (!value?.trim()) return "";

  const lines = value.split(/\r?\n/);
  const kept: string[] = [];
  let pastHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!pastHeader) {
      if (!trimmed) continue;
      if (UPLOAD_BOILERPLATE_LINE.test(trimmed)) continue;
      // Skip leading markdown H1/H2 that just restates the section title once.
      if (/^#{1,3}\s+/.test(trimmed)) {
        pastHeader = true;
        continue;
      }
      pastHeader = true;
    }
    // Drop mid-chunk markdown headers but keep the following content.
    if (/^#{1,3}\s+/.test(trimmed)) continue;
    kept.push(line);
  }

  return kept.join("\n").trim();
}

/** Clean a retrieval chunk for prose-facing use. */
export function cleanResultText(value: string | undefined | null, maxChars = 600): string {
  if (!value?.trim()) return "";
  const withoutBoiler = stripUploadBoilerplate(value);
  const withoutMeta = stripRagMeta(withoutBoiler);
  // If meta strip emptied meaningful content, fall back to boilerplate-stripped only
  // but still reject pure meta blobs.
  let candidate = withoutMeta || (isRagMetaText(withoutBoiler) ? "" : withoutBoiler);
  // Collapse leftover markdown emphasis / list markers for prose bullets.
  candidate = candidate
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/\s*[-*•]\s+/g, "; ");
  return truncateAtSentence(compactWhitespace(candidate), maxChars);
}

/** First 1–2 sentences of cleaned text as a short bullet. */
export function firstSentences(value: string, maxSentences = 2, maxChars = 280): string {
  const cleaned = cleanResultText(value, maxChars * 2);
  if (!cleaned) return "";

  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  return truncateAtSentence(compactWhitespace(parts.slice(0, maxSentences).join(" ")), maxChars);
}

export function sourceRoleBoost(sourceFile?: string, sourceRole?: string, section?: string): number {
  const hay = `${sourceFile ?? ""} ${sourceRole ?? ""} ${section ?? ""}`.toLowerCase();
  if (/current-state|current_state/.test(hay)) return 50;
  if (/event-log|event_log/.test(hay)) return 40;
  if (/master-context|master_context/.test(hay)) return 35;
  if (/story-bible|story_bible/.test(hay)) return 30;
  // Warm recent narrative (europe-arm / arc_chronicle) — above cool history, below event-log.
  if (isWarmChronicle(sourceFile, sourceRole)) return 28;
  if (/character-bible|character_bible/.test(hay)) return 20;
  if (/chronological-summary|emotional-milestones/.test(hay)) return 15;
  if (/historical\/thread-0|\/thread-0|index_ready|index-ready/.test(hay)) return -35;
  if (/supporting_backstory|historical_narrative/.test(hay)) return -10;
  return 0;
}

/** Recent trip / peeled chronicles — not deep UK archive. */
export function isWarmChronicle(sourceFile?: string, sourceRole?: string): boolean {
  const hay = `${sourceFile ?? ""} ${sourceRole ?? ""}`.toLowerCase();
  return /europe-arm|arc_chronicle|arc-chronicles/.test(hay);
}

export function isHistoricalThread(sourceFile?: string, section?: string): boolean {
  const hay = `${sourceFile ?? ""} ${section ?? ""}`.toLowerCase();
  if (isWarmChronicle(sourceFile)) return false;
  return /historical\/thread-0|\/thread-0|index_ready|index-ready/.test(hay);
}

export function keywordOverlapScore(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    if (lower.includes(kw.toLowerCase())) score += 3;
  }
  return Math.min(30, score);
}

/** Extract stopword-filtered keywords from a user message for overlap scoring. */
export function extractKeywords(message: string, max = 24): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "they", "them", "then",
    "than", "into", "onto", "your", "you", "are", "was", "were", "have", "has",
    "had", "her", "his", "him", "she", "he", "their", "there", "what", "when",
    "where", "which", "while", "about", "just", "like", "out", "back", "get",
    "got", "ready", "says", "said", "look", "looking", "make", "made"
  ]);
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9äöåüéè\s'-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w));
  return [...new Set(words)].slice(0, max);
}

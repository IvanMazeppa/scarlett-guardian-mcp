/**
 * WP-2.2 / Pillar A — live-beat supersession for precedent selection.
 * Spec: docs/fable-5-roadmaps-audits/guardian-writeback-recency-serendipity-roadmap-2026-07.md §A
 */

export type LiveBeat = {
  lastUpdated: string;
  locationLine: string;
  timeLine: string;
  supersededCues: string[];
  liveCues: string[];
  antiResetNotes: string[];
};

export type RecencyChunk = {
  source_file?: string;
  section?: string;
  text?: string;
  /** Optional story_epoch from RAG attributes (Layer 2; demotion when present). */
  story_epoch?: number;
};

const EMPTY_BEAT: LiveBeat = {
  lastUpdated: "",
  locationLine: "",
  timeLine: "",
  supersededCues: [],
  liveCues: [],
  antiResetNotes: []
};

/** Split markdown into ## sections (title → body). */
export function splitH2Sections(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = markdown.replace(/\r\n/g, "\n");
  const parts = text.split(/^##\s+/m);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf("\n");
    const title = (nl === -1 ? block : block.slice(0, nl)).trim();
    const body = nl === -1 ? "" : block.slice(nl + 1);
    if (title) map.set(title, body);
  }
  return map;
}

function findSection(sections: Map<string, string>, ...needles: string[]): string {
  for (const [title, body] of sections) {
    const t = title.toLowerCase();
    if (needles.some((n) => t.includes(n.toLowerCase()))) return body;
  }
  return "";
}

function extractBoldField(body: string, label: string): string {
  // Support both **Label:** value and **Label**: value (colon inside or outside bold).
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\*\\*${esc}:?\\*\\*:?\\s*([^\\n]+)`,
    "i"
  );
  const m = body.match(re);
  return m?.[1]?.trim() ?? "";
}

function bullets(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/** Tokens too generic to drive recency demotion/boost alone. */
const WEAK_CUES = new Set([
  "about", "after", "before", "being", "benjamin", "scarlett", "their", "there",
  "these", "those", "which", "while", "would", "could", "should", "still", "under",
  "with", "from", "have", "this", "that", "they", "them", "were", "when", "what",
  "where", "private", "public", "first", "clear", "having", "early", "present",
  "locked", "completed", "friday", "thursday", "monday", "tuesday", "wednesday",
  "saturday", "sunday", "october", "midday", "afternoon", "morning", "evening",
  "black", "panther", "industry", "waiting", "voice", "continues", "rising",
  "focus", "talking", "technical", "confidence", "reserved", "warmth", "radio",
  "swedish", "embrace", "arrival", "aggressive", "checkout", "channel", "active",
  "continuous", "commentary", "feedback", "stint", "having", "overall", "setting"
]);

export function isStrongCue(cue: string): boolean {
  const c = cue.toLowerCase().trim();
  if (!c || WEAK_CUES.has(c)) return false;
  // Prefer multi-word / hyphenated anchors and distinctive place/action tokens
  if (c.includes(" ") || c.includes("-")) return true;
  return c.length >= 6;
}

/** Pull cue phrases/tokens from free text for matching. */
export function extractCues(text: string, max = 24): string[] {
  if (!text?.trim()) return [];
  const lower = text.toLowerCase();
  const cues = new Set<string>();

  // Multi-word narrative anchors first
  const phrases = [
    "changing room",
    "changing-room",
    "out lap",
    "shakedown",
    "pit wall",
    "pit lane",
    "on track",
    "private radio",
    "race suit",
    "motion sick",
    "motion-sickness",
    "b-road",
    "b-roads",
    "villa pétrusse",
    "villa petrusse",
    "nordschleife",
    "nürburgring",
    "nuerburgring",
    "industry pool",
    "send-off",
    "send off",
    "aftercare",
    "black panther",
    "thermal",
    "cooling extraction",
    "affalterbach",
    "luxembourg",
    "green hell",
    "intimacy",
    "caretaking"
  ];
  for (const p of phrases) {
    if (lower.includes(p)) cues.add(p);
  }

  // Significant tokens — skip weak generics
  for (const raw of lower.match(/[a-zà-ü0-9][a-zà-ü0-9'-]{5,}/gi) ?? []) {
    const w = raw.toLowerCase();
    if (isStrongCue(w)) cues.add(w);
  }

  return [...cues].filter(isStrongCue).slice(0, max);
}

function splitEarlierNow(moodLine: string): { earlier: string; now: string } {
  // Prefer **Now:** / Now: marker
  const nowMatch = moodLine.match(/\*{0,2}Now:\*{0,2}\s*(.+)$/i);
  const now = nowMatch?.[1]?.trim() ?? "";
  let earlier = moodLine;
  if (nowMatch) {
    earlier = moodLine.slice(0, nowMatch.index).trim();
  }
  // Strip "Earlier day:" prefix noise for cue extraction
  earlier = earlier.replace(/\*{0,2}Earlier day:\*{0,2}\s*/i, "");
  return { earlier, now };
}

/**
 * Parse live snapshot markdown (current-state.md or get_live_story_state text).
 * Heading-anchored; safe empty beat if structure is missing.
 */
export function parseLiveBeat(currentStateMarkdown: string): LiveBeat {
  if (!currentStateMarkdown?.trim()) return { ...EMPTY_BEAT };

  // Strip admin wrapper if present
  let md = currentStateMarkdown.replace(/^### Live Current State[^\n]*\n+/i, "");

  const lastUpdated =
    md.match(/\*\*Last Updated:\*\*\s*([^\n]+)/i)?.[1]?.trim() ?? "";

  const sections = splitH2Sections(md);
  const whereBody = findSection(sections, "Where We Are", "High-Level Snapshot");
  const recentBody = findSection(sections, "Recent Key Events");
  const notesBody = findSection(sections, "Notes for Next Response");

  const locationLine =
    extractBoldField(whereBody, "Location / Setting") ||
    extractBoldField(whereBody, "Location") ||
    "";
  const timeLine =
    extractBoldField(whereBody, "Time in Story") ||
    extractBoldField(whereBody, "Time") ||
    "";
  const moodLine =
    extractBoldField(whereBody, "Overall Mood/Atmosphere") ||
    extractBoldField(whereBody, "Overall Mood") ||
    "";

  const { earlier, now } = splitEarlierNow(moodLine);

  // Recent events: last bullet(s) with **bold** "complete" / out lap tend to be live;
  // earlier bullets are superseded narrative of the day.
  const recentBullets = bullets(recentBody);
  let liveFromRecent = "";
  let supersededFromRecent = "";
  if (recentBullets.length) {
    liveFromRecent = recentBullets[recentBullets.length - 1] ?? "";
    supersededFromRecent = recentBullets.slice(0, -1).join(" ");
  }

  const liveCues = uniqueStrings([
    ...extractCues(now || liveFromRecent),
    ...extractCues(locationLine),
    ...extractCues(timeLine),
    ...extractCues(lastUpdated)
  ]);

  const supersededCues = uniqueStrings([
    ...extractCues(earlier),
    ...extractCues(supersededFromRecent)
  ]).filter((c) => !liveCues.includes(c));

  // Anti-reset: "Do not reset to X"
  const antiResetNotes: string[] = [];
  for (const line of bullets(notesBody).concat(notesBody.split("\n"))) {
    const m = line.match(/do not reset to\s+(.+?)(?:\.|$)/i);
    if (m) {
      antiResetNotes.push(m[1].trim());
      for (const c of extractCues(m[1])) {
        if (!liveCues.includes(c)) supersededCues.push(c);
      }
    }
  }

  return {
    lastUpdated,
    locationLine,
    timeLine,
    supersededCues: uniqueStrings(supersededCues),
    liveCues: uniqueStrings(liveCues),
    antiResetNotes: uniqueStrings(antiResetNotes)
  };
}

/**
 * WP-2.3 — human-readable LIVE BEAT block for the continuity auditor prompt.
 * Placed **above** retrieved evidence; empty/sparse beats still emit a short stub.
 */
export function formatLiveBeatBlock(beat: LiveBeat | undefined | null): string {
  if (!beat) {
    return [
      "### LIVE BEAT",
      "(no live snapshot available — treat retrieval timestamps carefully; do not invent present location/time)"
    ].join("\n");
  }

  const hasSignal =
    Boolean(beat.lastUpdated || beat.locationLine || beat.timeLine) ||
    beat.liveCues.length > 0 ||
    beat.supersededCues.length > 0 ||
    beat.antiResetNotes.length > 0;

  if (!hasSignal) {
    return [
      "### LIVE BEAT",
      "(snapshot present but sparse — prefer current-state fields in evidence over older session logs)"
    ].join("\n");
  }

  const lines = [
    "### LIVE BEAT",
    "This is the present story moment from current-state.md. Supersedes earlier same-day beats."
  ];
  if (beat.lastUpdated) lines.push(`- Last updated: ${beat.lastUpdated}`);
  if (beat.locationLine) lines.push(`- Location: ${beat.locationLine}`);
  if (beat.timeLine) lines.push(`- Time in story: ${beat.timeLine}`);
  if (beat.liveCues.length) {
    lines.push(`- Live cues: ${beat.liveCues.slice(0, 16).join(", ")}`);
  }
  if (beat.supersededCues.length) {
    lines.push(
      `- Superseded / earlier same-day cues (context only, NOT current): ${beat.supersededCues.slice(0, 16).join(", ")}`
    );
  }
  if (beat.antiResetNotes.length) {
    lines.push(`- Anti-reset: ${beat.antiResetNotes.join("; ")}`);
  }
  return lines.join("\n");
}

function uniqueStrings(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function haystack(chunk: RecencyChunk): string {
  return `${chunk.source_file ?? ""} ${chunk.section ?? ""} ${chunk.text ?? ""}`.toLowerCase();
}

function normalizeCueText(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesAnyCue(hay: string, cues: string[]): string[] {
  const hayN = normalizeCueText(hay);
  return cues.filter((c) => {
    const cue = normalizeCueText(c);
    if (cue.length < 3) return false;
    return hayN.includes(cue) || hay.includes(c.toLowerCase());
  });
}

/**
 * Signed score modifier for selectPrecedents.
 * +25 live, −45 superseded (halved if user deliberately references that cue), −80 anti-reset.
 */
export function scoreRecency(
  chunk: RecencyChunk,
  beat: LiveBeat,
  userMessage = ""
): number {
  if (!beat.liveCues.length && !beat.supersededCues.length && !beat.antiResetNotes.length) {
    return 0;
  }

  const hay = haystack(chunk);
  if (!hay.trim()) return 0;

  const userHay = normalizeCueText(userMessage);
  let score = 0;

  const liveHits = matchesAnyCue(hay, beat.liveCues).filter(isStrongCue);
  const superHits = matchesAnyCue(hay, beat.supersededCues).filter(isStrongCue);
  const antiHits = beat.antiResetNotes.filter((note) => {
    const cues = extractCues(note, 8);
    return matchesAnyCue(hay, cues).length > 0 || hay.includes(note.toLowerCase().slice(0, 40));
  });

  if (liveHits.length > 0) score += 25;

  if (antiHits.length > 0) {
    score -= 80;
  } else if (superHits.length > 0) {
    // Superseded beat: full demotion unless chunk also carries distinctive live anchors
    // (e.g. "on track" + memory of morning is still mostly live).
    const liveOnly = liveHits.filter(
      (c) => !superHits.some((s) => normalizeCueText(s) === normalizeCueText(c))
    );
    if (liveOnly.length === 0) {
      const userReferencesSuper = superHits.some((c) =>
        userHay.includes(normalizeCueText(c))
      );
      score -= userReferencesSuper ? 22 : 45;
    }
  }

  // Layer 2 (optional): epoch distance when attributes exist on the result set
  if (typeof chunk.story_epoch === "number" && Number.isFinite(chunk.story_epoch)) {
    // Caller may pass maxEpoch via a fake field on beat later; for now mild only if epoch very low
    if (chunk.story_epoch > 0 && chunk.story_epoch < 50) {
      // historical-ish — small demotion unless already live-cued
      if (liveHits.length === 0) score -= 8;
    }
  }

  return score;
}

/** Whether free text looks like it describes the current live beat (for scene fallbacks). */
export function textMatchesLiveBeat(text: string, beat: LiveBeat): boolean {
  if (!text?.trim()) return false;
  const hits = matchesAnyCue(text.toLowerCase(), beat.liveCues);
  return hits.length > 0;
}

export function emptyLiveBeat(): LiveBeat {
  return { ...EMPTY_BEAT };
}

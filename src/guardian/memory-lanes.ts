/**
 * Four-lane subconscious stack for the Grok novelist brief.
 * Guardian runs these in parallel; Grok never chains RAG tools.
 *
 * 1. Hold — Chekhov items pinned from live current-state, not searched.
 * 2. Analogue — emotional-job query (gesture → feeling), not noun lookup.
 * 3. Madeleine — one optional sensory rhyme, not a serendipity weather plot.
 * 4. Distill — expand the analogue hit into situation / did / cost / pattern.
 */
import type { LiveBeat } from "./recency.js";
import { splitH2Sections } from "./recency.js";
import type { ExpandedContext, RagContextResult } from "./report/models.js";
import { compactWhitespace, firstSentences, isRagMetaText, truncateAtSentence } from "./report/text-clean.js";
import type { GuardianPreflightInput } from "./tools/preflight.js";

export type FeltAnalogue = {
  situation: string;
  whatSheDid: string;
  whatItCost: string;
  patternToRepeat: string;
};

export type MadeleinePlan = {
  motif: string;
  query: string;
};

const EMOTIONAL_MILESTONES_FILE = "project_source_files/emotional-milestones.md";
const MOTIF_INDEX_FILE = "project_source_files/motif-index.md";

export const ANALOGUE_SOURCE_FILES = [EMOTIONAL_MILESTONES_FILE];
export const MADELEINE_SOURCE_FILES = [MOTIF_INDEX_FILE, EMOTIONAL_MILESTONES_FILE];

const TRIGGER_JOBS: Array<{ test: RegExp; job: string }> = [
  {
    test: /Food-care|appetite|ARFID/i,
    job: "care around food without mothering; last time she fed him without making it a test"
  },
  {
    test: /Intimacy|kink|dominance|aftercare/i,
    job: "play as how she stayed in control; last time a boundary was pushed and she chose the next move"
  },
  {
    test: /Public visibility|jealousy|boundaries/i,
    job: "public-private boundary; last time she claimed him without spectacle"
  },
  {
    test: /Family|transition|trauma|Vaxholm|Mormor/i,
    job: "vulnerable sharing met with presence not fixing"
  },
  {
    test: /Recovery|soreness|caretaking/i,
    job: "body care after intensity; she is not fragile"
  },
  {
    test: /Repeated gesture|memory echo/i,
    job: "repeated gesture as emotional echo not inventory"
  },
  {
    test: /AMG|Nuerburgring|Black Panther/i,
    job: "professional competence held beside private trust"
  }
];

const GESTURE_JOBS: Array<{ test: RegExp; job: string }> = [
  {
    test: /\b(sofa|couch|too small|tiny seat|shoulders? (?:too )?wide|squeeze(?:d|ing)? on)\b/i,
    job: "closeness that does not fit the furniture and she makes room anyway"
  },
  {
    test: /\b(coupon|blank[- ]check|one hour of absolutely anything)\b/i,
    job: "unspent permission she is holding rather than spending"
  },
  {
    test: /\b(rain|wet jacket|walk(?:ed|ing)? back)\b/i,
    job: "weather they already walked through together; safety on the other side of cold"
  },
  {
    test: /\b(fire|hearth|hearthside|roaring)\b/i,
    job: "a small room made on purpose; last time fire meant they were done performing"
  },
  {
    test: /\b(toe[- ]?ring|anklet)\b/i,
    job: "a small gold claim returned or worn; play as possession without a speech"
  },
  {
    test: /\b(kiss|boundary|push(?:ed|ing)?|too (?:far|much|fast))\b/i,
    job: "last time a boundary was pushed; stillness then choice, not a lecture"
  }
];

const MOTIFS: Array<{ id: string; test: RegExp; query: string }> = [
  { id: "rain", test: /\brain|wet (?:jacket|stone|asphalt)|downpour\b/i, query: "rain on stone jacket cold walk home Scarlett Benjamin sensory memory" },
  { id: "fire", test: /\bfire|hearth|hearthside|embers\b/i, query: "fire hearth small room Scarlett Benjamin sensory memory" },
  { id: "sofa", test: /\bsofa|couch|two-seater\b/i, query: "too-small sofa closeness Scarlett Benjamin sensory memory" },
  { id: "coupon", test: /\bcoupon|blank[- ]check\b/i, query: "Sunday coupon anything hour unspent permission Scarlett Benjamin" },
  { id: "anklet", test: /\banklet\b/i, query: "rose-gold anklet left ankle gift Scarlett Benjamin memory" },
  { id: "toe-ring", test: /\btoe[- ]?ring\b/i, query: "gold toe ring left third toe play claim Scarlett Benjamin" },
  { id: "perfume", test: /\bperfume|scent|smell\b/i, query: "perfume scent trigger Scarlett Benjamin sensory memory" },
  { id: "song", test: /\bsong|music|roxy|mother of pearl\b/i, query: "song music aftercare Mother of Pearl Scarlett Benjamin" },
  { id: "ribeye", test: /\bribeye|steak|appetite|arfid\b/i, query: "ribeye food care appetite Scarlett Benjamin" },
  { id: "letter", test: /\bletter|mormor\b/i, query: "letter Mormor family writing Scarlett Benjamin emotional memory" }
];

export function isLiveSnapshotSource(result: Pick<RagContextResult, "source_file" | "section" | "source_role">): boolean {
  const file = `${result.source_file ?? ""} ${result.source_role ?? ""}`.toLowerCase();
  const section = (result.section ?? "").toLowerCase();
  if (/current-state\.md|\/current-state|current_state/.test(file)) return true;
  if (/where we are|high-level snapshot/.test(section)) return true;
  return false;
}

export function isAnalogueSource(result: Pick<RagContextResult, "source_file" | "section">): boolean {
  const hay = `${result.source_file ?? ""} ${result.section ?? ""}`.toLowerCase();
  return /emotional-milestones|motif-index/.test(hay);
}

function findSection(sections: Map<string, string>, ...needles: string[]): string {
  for (const [title, body] of sections) {
    const t = title.toLowerCase();
    if (needles.some((n) => t.includes(n.toLowerCase()))) return body;
  }
  return "";
}

function bullets(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Lane 1: pin unspent tension from the live Open Story Threads section.
 * Present-tense inventory, not a prompt to spend.
 */
export function parseChekhovGuns(currentStateMarkdown: string, limit = 3): string[] {
  if (!currentStateMarkdown.trim()) return [];
  const sections = splitH2Sections(currentStateMarkdown);
  const body = findSection(sections, "Open Story Threads", "Pending Elements");
  if (!body.trim()) return [];

  const guns: string[] = [];
  for (const raw of bullets(body)) {
    if (/^#+\s|status:|authority:|historical archive/i.test(raw)) continue;
    if (/cold dominant|real me\s*=|disappearance\/return pattern|ponytail\/latex switch/i.test(raw)) {
      continue;
    }
    const cleaned = compactWhitespace(raw.replace(/^\*\*[^*]+\*\*:?\s*/, ""));
    if (cleaned.length < 12) continue;
    guns.push(truncateAtSentence(cleaned, 160));
    if (guns.length >= limit) break;
  }
  return guns;
}

export function formatHoldBlock(guns: string[]): string | undefined {
  const usable = guns
    .map((g) => compactWhitespace(g))
    .filter((g) => g && !isRagMetaText(g))
    .slice(0, 3);
  if (!usable.length) return undefined;
  const lines = [
    "**Hold (unspent — do not fire unless the turn spends it):**",
    ...usable.map((g) => `- ${g}`)
  ];
  return lines.join("\n");
}

function analogueJob(input: GuardianPreflightInput, highRiskTriggers: string[]): string {
  const blob = [
    input.user_message,
    input.scarlett_previous_message ?? "",
    input.recent_context ?? ""
  ].join(" ");

  for (const row of GESTURE_JOBS) {
    if (row.test.test(blob)) return row.job;
  }
  for (const row of TRIGGER_JOBS) {
    if (highRiskTriggers.some((t) => row.test.test(t))) return row.job;
  }
  return "last time she felt this specific closeness or control; emotional precedent not the live snapshot";
}

/**
 * Lane 2: search the job of the gesture, not the nouns in the turn.
 * Physical boundary is the pointer; psychological analogue is the query.
 */
export function analogueMemoryQuery(input: GuardianPreflightInput, highRiskTriggers: string[]): string {
  const job = analogueJob(input, highRiskTriggers);
  return `Scarlett Benjamin emotional precedent ${job} emotional-milestones not current-state snapshot`;
}

function motifHaystack(input: GuardianPreflightInput, liveBeat?: LiveBeat | null): string {
  return [
    input.user_message,
    input.scarlett_previous_message ?? "",
    input.recent_context ?? "",
    liveBeat?.locationLine ?? "",
    ...(liveBeat?.liveCues ?? [])
  ].join(" ");
}

/** Lane 3: only when a sensory motif is already in the room. */
export function madeleinePlan(
  input: GuardianPreflightInput,
  liveBeat?: LiveBeat | null
): MadeleinePlan | undefined {
  const hay = motifHaystack(input, liveBeat);
  for (const motif of MOTIFS) {
    if (motif.test.test(hay)) {
      return { motif: motif.id, query: motif.query };
    }
  }
  return undefined;
}

export function pickMadeleineFlash(results: RagContextResult[], motif: string): string | undefined {
  for (const result of results) {
    const text = result.text ?? "";
    if (!text.trim() || isRagMetaText(text)) continue;
    const sentence = firstSentences(text, 1, 180);
    if (sentence && sentence.length >= 24) return sentence;
  }
  return undefined;
}

export function formatFlashLine(flash: string, motif: string): string {
  const clean = truncateAtSentence(compactWhitespace(flash), 180);
  return `**Flash (optional body memory — not a plot beat):**\n- ${clean}`;
}

function agencySentence(text: string): string {
  const cleaned = compactWhitespace(text);
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const agency = parts.find((p) =>
    /\b(she|scarlett)\b.{0,80}\b(chose|chose not|said|asked|led|stayed|opened|held|kissed|told|refused|made)\b/i.test(
      p
    )
  );
  return truncateAtSentence(compactWhitespace(agency ?? parts[0] ?? cleaned), 200);
}

/**
 * Lane 4: turn an expanded hit into a felt object.
 * Setup / moment / aftermath → situation, what she did, cost, pattern.
 */
export function distillExpandedContext(expanded: ExpandedContext | undefined): FeltAnalogue | null {
  if (!expanded) return null;
  const sections = [...(expanded.expanded_results ?? [])].sort(
    (a, b) => (a.relative_position ?? 0) - (b.relative_position ?? 0)
  );
  const texts = sections
    .map((s) => compactWhitespace(s.text ?? ""))
    .filter((t) => t.length > 20 && !isRagMetaText(t));

  const summary = compactWhitespace(expanded.summary ?? "");
  if (!texts.length && !summary) return null;

  const before = texts.length >= 3 ? texts[0] : "";
  const anchor = texts.length >= 3 ? texts[1] : texts[0] ?? summary;
  const after = texts.length >= 3 ? texts[2] : texts[1] ?? "";

  const situation = truncateAtSentence(compactWhitespace(before || firstSentences(anchor, 1, 180) || summary), 180);
  const whatSheDid = agencySentence(anchor || summary);
  const costSource = after || anchor;
  const costMatch = costSource.match(
    /(?:cost|hurt|scared|relief|trust|never(?:'t)? shared|first time|weight|soft(?:er)? than)[^.!?]{0,140}/i
  );
  const whatItCost = truncateAtSentence(
    compactWhitespace(costMatch?.[0] ?? firstSentences(after || anchor, 1, 160)),
    160
  );
  const patternToRepeat = truncateAtSentence(
    "Repeat the pattern (stillness then choice, presence not a speech) — do not parrot the lines.",
    140
  );

  if (!situation && !whatSheDid) return null;
  return {
    situation: situation || "Retrieved emotional precedent.",
    whatSheDid: whatSheDid || "She stayed inside the moment and chose the next beat.",
    whatItCost: whatItCost || "The weight was relational, not decorative.",
    patternToRepeat
  };
}

export function formatFeltAnalogueBlock(felt: FeltAnalogue): string {
  return [
    "**Analogue (pattern, not a quote to repeat):**",
    `- Situation: ${felt.situation}`,
    `- She did: ${felt.whatSheDid}`,
    `- Cost: ${felt.whatItCost}`,
    `- Repeat: ${felt.patternToRepeat}`
  ].join("\n");
}

export function sanitizeEmotionalContext(text: string, liveBeat?: LiveBeat | null): string {
  const cleaned = compactWhitespace(text);
  const tooThin =
    !cleaned ||
    cleaned.length < 24 ||
    /^(tone|mood|atmosphere)\b/i.test(cleaned) ||
    /^tone house\b/i.test(cleaned);
  if (!tooThin && !isRagMetaText(cleaned)) return cleaned;

  const mood = (liveBeat?.liveCues ?? []).find((c) =>
    /intimate|warm|safe|tender|playful|charged|aftercare|decompression|quiet/i.test(c)
  );
  const location = liveBeat?.locationLine?.trim();
  if (mood && location) return compactWhitespace(`${mood}; ${location}`);
  if (mood) return mood;
  if (location) return location;
  return "Match the scene's established emotional baseline; stay present and specific.";
}

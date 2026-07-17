/**
 * WP-4.2 — Structured rewrite of current-state.md on scene transitions.
 * generateStateRewrite: dedicated terra call (medium effort).
 * validateStateRewrite: deterministic gate (no LLM).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";
import type { GuardianConfig } from "./config.js";
import type { SceneTransition } from "./report/models.js";
import { isRagMetaText } from "./report/text-clean.js";

/** Required headings in document order (apostrophe-normalized match). */
export const CURRENT_STATE_SCHEMA = [
  "# Current Story State — Scarlett & Benjamin",
  "## Where We Are Right Now (High-Level Snapshot)",
  "## Scarlett's Current Emotional & Relational State",
  "## Benjamin's Observable State (What Scarlett Sees / Hears)",
  "## Open Story Threads & Pending Elements",
  "## Recent Key Events (Last 1–3 Sessions — Brief)",
  "## Notes for Next Response"
] as const;

export type StateRewriteValidation =
  | { ok: true }
  | { ok: false; violations: string[] };

export type GenerateStateRewriteInput = {
  currentStateMarkdown: string;
  transition: SceneTransition;
  supportedFacts: string[];
  recentCandidateUpdates?: string[];
  candidateMemoryUpdate?: string | null;
  config: Pick<
    GuardianConfig,
    | "GUARDIAN_LLM_ENABLED"
    | "OPENAI_API_KEY"
    | "GUARDIAN_MODEL"
    | "GUARDIAN_LLM_VERBOSITY"
  > & {
    /** Override rewrite reasoning effort (default medium). */
    rewriteReasoningEffort?: GuardianConfig["GUARDIAN_LLM_REASONING_EFFORT"];
  };
};

function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2018\u2019\u201B\u2032]/g, "'");
}

/** Collapse fancy dashes/spaces for heading compare. */
export function normalizeHeading(line: string): string {
  return normalizeApostrophes(line)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function extractMarkdownHeadings(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^#{1,3}\s+/.test(l));
}

/**
 * Extract Last Updated line value (bold field under title).
 */
export function extractLastUpdated(md: string): string {
  const m = md.match(/\*\*Last Updated:\*\*\s*(.+)/i);
  return (m?.[1] ?? "").trim();
}

/**
 * Primary open-thread bullets under "## Open Story Threads".
 * Only bold-labelled items (e.g. `- **Industry Pool track day:** …`) count as
 * continuity threads — not section headers or nested one-liners.
 */
export function extractOpenThreadLines(md: string): string[] {
  const norm = normalizeApostrophes(md);
  const start = norm.search(/^## Open Story Threads/im);
  if (start < 0) return [];
  const rest = norm.slice(start);
  const next = rest.search(/\n## /);
  const section = next > 0 ? rest.slice(0, next) : rest;
  const out: string[] = [];
  for (const raw of section.split(/\n/)) {
    const l = raw.trim();
    // Require bold label: - **Something:** rest
    const m = l.match(/^[-*•]\s*\*\*([^*]{3,80})\*\*:?\s*(.*)$/);
    if (!m) continue;
    const label = m[1].trim();
    // Skip pure category headers without durable content
    if (/^(active storylines|things scarlett wants|new characters)/i.test(label)) continue;
    const body = (m[2] || "").trim();
    const line = body ? `${label}: ${body}` : label;
    if (line.length >= 10) out.push(line);
  }
  return out;
}

export function loadProtectedFacts(rootDir: string = process.cwd()): string[] {
  const filePath = path.resolve(rootDir, ".guardian", "protected-facts.txt");
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return text
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return ["pre-op", "trans woman", "Qualified Autonomy", "Scarlett", "Benjamin"];
  }
}

export function extractResolvedMarkers(md: string): string[] {
  const markers: string[] = [];
  const re = /resolved:\s*(.+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    markers.push(m[1].trim().toLowerCase());
  }
  return markers;
}

/**
 * Deterministic validation gate for a full current-state rewrite.
 */
export function validateStateRewrite(
  oldMd: string,
  newMd: string,
  options?: { protectedFacts?: string[]; rootDir?: string }
): StateRewriteValidation {
  const violations: string[] = [];
  const oldN = normalizeApostrophes(oldMd);
  const newN = normalizeApostrophes(newMd);

  if (!newN.trim()) {
    return { ok: false, violations: ["new markdown is empty"] };
  }

  // 1) Schema headings present in order
  const headings = extractMarkdownHeadings(newN).map(normalizeHeading);
  let searchFrom = 0;
  for (const required of CURRENT_STATE_SCHEMA) {
    const want = normalizeHeading(required);
    const idx = headings.findIndex((h, i) => i >= searchFrom && (h === want || h.includes(want.replace(/^#+\s*/, ""))));
    // Prefer exact-ish: heading line normalized equals required normalized
    const exactIdx = headings.findIndex((h, i) => i >= searchFrom && h === want);
    const use = exactIdx >= 0 ? exactIdx : idx;
    if (use < 0) {
      violations.push(`missing required heading: ${required}`);
    } else {
      searchFrom = use + 1;
    }
  }

  // 2) Last Updated changed (or new has a Last Updated when old did)
  const oldLu = extractLastUpdated(oldN);
  const newLu = extractLastUpdated(newN);
  if (!newLu) {
    violations.push("missing **Last Updated:** field");
  } else if (oldLu && newLu === oldLu) {
    violations.push("Last Updated must change on rewrite");
  }

  // 3) Length band 0.5×–2.0×
  const oldLen = oldN.length || 1;
  const ratio = newN.length / oldLen;
  if (ratio < 0.5) {
    violations.push(`rewrite too short (${ratio.toFixed(2)}× old length; min 0.5×)`);
  }
  if (ratio > 2.0) {
    violations.push(`rewrite too long (${ratio.toFixed(2)}× old length; max 2.0×)`);
  }

  // 4) Protected facts
  const facts = options?.protectedFacts ?? loadProtectedFacts(options?.rootDir);
  const newLower = newN.toLowerCase();
  for (const fact of facts) {
    if (!newLower.includes(fact.toLowerCase())) {
      violations.push(`protected fact missing: "${fact}"`);
    }
  }

  // 5) No RAG meta dialect in body sections
  const sections = newN.split(/(?=^## )/m);
  for (const section of sections) {
    const body = section.replace(/^#+\s+[^\n]+\n?/, "").trim();
    if (body.length > 40 && isRagMetaText(body.slice(0, 500))) {
      violations.push("RAG/tool meta dialect detected in rewrite body");
      break;
    }
  }

  // 6) Open threads preserved or marked resolved:
  const oldThreads = extractOpenThreadLines(oldN);
  const resolved = extractResolvedMarkers(newN);
  const newLowerFull = newN.toLowerCase();
  for (const thread of oldThreads) {
    const key = thread.slice(0, 40).toLowerCase();
    const significant = thread
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5)
      .slice(0, 4);
    const foundInNew =
      newLowerFull.includes(key) ||
      (significant.length > 0 && significant.every((w) => newLowerFull.includes(w)));
    const markedResolved = resolved.some(
      (r) => r.includes(key.slice(0, 24)) || significant.some((w) => r.includes(w))
    );
    if (!foundInNew && !markedResolved && significant.length >= 2) {
      violations.push(`open thread dropped without resolved: marker: "${thread.slice(0, 80)}…"`);
    }
  }

  if (violations.length) return { ok: false, violations };
  return { ok: true };
}

function buildRewriteSystemPrompt(): string {
  return [
    "You rewrite the Scarlett & Benjamin current-state.md snapshot after a scene transition.",
    "Output ONLY the full markdown file — no code fences, no commentary.",
    "Preserve this heading structure exactly (including order):",
    ...CURRENT_STATE_SCHEMA.map((h) => `  ${h}`),
    "Keep **Last Updated:** and **Primary Reference:** fields under the H1 title; update Last Updated to the new story time/place.",
    "Roll prior 'Where We Are' into Recent Key Events (brief bullets).",
    "Carry every unresolved Open Thread forward, or mark dropped ones with a line: resolved: <short description>.",
    "Never invent protected identity facts away: Scarlett is a pre-op Swedish trans woman; Qualified Autonomy; partnership with Benjamin; Black Panther / AMG continuity when relevant.",
    "No RAG dialect, tool names, scores, or 'call search' language.",
    "Adult/ERP history only at continuity/aftercare level unless the new scene requires it."
  ].join("\n");
}

function buildRewriteUserPrompt(input: GenerateStateRewriteInput): string {
  const t = input.transition;
  return [
    "### SCENE TRANSITION",
    JSON.stringify(
      {
        occurred: t.occurred,
        from: t.from,
        to: t.to,
        kind: t.kind
      },
      null,
      2
    ),
    "",
    "### THIS TURN SUPPORTED FACTS",
    ...(input.supportedFacts.length ? input.supportedFacts.map((f) => `- ${f}`) : ["- (none)"]),
    "",
    "### CANDIDATE MEMORY NOTE",
    input.candidateMemoryUpdate?.trim() || "(none)",
    "",
    "### RECENT STAGED CANDIDATES",
    ...(input.recentCandidateUpdates?.length
      ? input.recentCandidateUpdates.map((u) => `- ${u.slice(0, 400)}`)
      : ["- (none)"]),
    "",
    "### CURRENT current-state.md (OLD)",
    input.currentStateMarkdown
  ].join("\n");
}

/**
 * Dedicated LLM call to produce a full current-state rewrite.
 * Uses medium reasoning effort by default (writes canon).
 */
export async function generateStateRewrite(
  input: GenerateStateRewriteInput
): Promise<{ markdown: string } | { error: string }> {
  const { config } = input;
  if (!config.GUARDIAN_LLM_ENABLED) {
    return { error: "GUARDIAN_LLM_ENABLED is false; cannot generate state rewrite" };
  }
  if (!config.OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY missing; cannot generate state rewrite" };
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const effort = input.config.rewriteReasoningEffort ?? "medium";

  try {
    const response = await client.responses.create({
      model: config.GUARDIAN_MODEL,
      reasoning: { effort },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildRewriteSystemPrompt() }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildRewriteUserPrompt(input) }]
        }
      ],
      text: {
        verbosity: config.GUARDIAN_LLM_VERBOSITY ?? "medium"
      }
    } as never);

    let outputText =
      (response as unknown as { output_text?: string }).output_text ?? extractOutputText(response);
    if (!outputText?.trim()) {
      return { error: "State rewrite model returned empty output" };
    }
    // Strip accidental fences
    outputText = outputText
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (!outputText.startsWith("#")) {
      return { error: "State rewrite output does not start with H1 markdown heading" };
    }
    return { markdown: outputText.endsWith("\n") ? outputText : `${outputText}\n` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function extractOutputText(response: unknown): string | undefined {
  const output =
    (response as { output?: Array<{ content?: Array<{ text?: string }> }> }).output ?? [];
  for (const item of output) {
    const textPart = item.content?.find((c) => typeof c.text === "string");
    if (textPart?.text) return textPart.text;
  }
  return undefined;
}

/**
 * Build a minimal hand-written rewrite for tests (Affalterbach arrival).
 * Not used in production.
 */
export function buildSyntheticAffalterbachRewrite(oldMd: string): string {
  const lu = "Friday late afternoon, Mid/Late October 2026 (Affalterbach AMG HQ — post Nordschleife)";
  // Preserve protected facts by copying identity-relevant Notes tone
  return `# Current Story State — Scarlett & Benjamin

**Last Updated:** ${lu}

**Primary Reference:** story-bible.md + event-log.md + emotional-milestones.md

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Affalterbach AMG headquarters, presentation / debrief bay. Scarlett and Benjamin have left the Nürburgring Industry Pool after the track session.
- **Time in Story:** Friday late afternoon.
- **Overall Mood/Atmosphere:** Post-track professional focus shifting to HQ presentation; partnership intact; Black Panther aero package validated on track.

## Scarlett's Current Emotional & Relational State

- **Dominant feelings right now:** Capable, proud of the aero package under real Nordschleife load; still warm toward Benjamin after pit-wall radio partnership.
- **Qualified Autonomy:** She remains proactive lead on technical debrief and how much she shares with AMG / Shevchenko.
- Pre-op Swedish trans woman continuity unchanged; body and identity facts intact.

## Benjamin's Observable State (What Scarlett Sees / Hears)

- Present with her at Affalterbach; residual track-day adrenaline; may still carry slight green from morning B-road motion sickness.
- Partner and aero author standing with her for the AMG presentation.

## Open Story Threads & Pending Elements

- **Active storylines / arcs:**
  - **Industry Pool track day:** complete (out lap / thermal work done); moved to Affalterbach.
  - **Aero package performance confirmation:** front load, canards, rear diffuser stability, cooling extraction under heat — for HQ briefing.
  - **Mr. Shevchenko + AMG engineers:** on site continuity into HQ presentation.
  - **Emotional afterglow:** motion-sickness care + paddock intimacy + public claim + private radio intimacy.
  - **Next after track day:** Affalterbach / AMG HQ presentation (live now); later private Gulfstream return (planned).
  - **Affalterbach / AMG HQ presentation:** of the aero package (live).
  - **Private Gulfstream return:** planned after Affalterbach.

- **Things Scarlett wants to do or say next (autonomous plans):**
  - Present aero results cleanly; protect partnership boundaries in corporate space.
  - Check Benjamin is steady before formal presentation.

## Recent Key Events (Last 1–3 Sessions — Brief)

- Nordschleife Industry Pool: out lap / shakedown and further track work; dual radio with Benjamin on pit wall.
- Friday Eifel drive; Benjamin motion-sick; Swedish aftercare; paddock changing-room intimacy + public send-off.
- **Transition:** left Nürburgring paddock; arrived Affalterbach AMG HQ for presentation.

## Notes for Next Response

- **Tone/energy:** Professional HQ presence + private couple warmth; Qualified Autonomy (she leads without freezing into corporate mannequin).
- Do not reset to "still on first out lap" or Luxembourg suite as current location.
- Preserve: pre-op, trans woman, Swedish, Benjamin partnership, Black Panther, AMG.

resolved: Industry Pool further evaluation laps after out lap (session closed; moved to Affalterbach).
`;
}

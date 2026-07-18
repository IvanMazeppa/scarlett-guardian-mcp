import OpenAI from "openai";
import type { GuardianConfig } from "./config.js";
import type {
  ExpandedContext,
  FactCheck,
  GuardianLlmAssessment,
  RagRetrieveResponse
} from "./report/models.js";
import {
  formatStoryMomentumBlock,
  type DramaturgSnapshot
} from "./dramaturg.js";
import { formatLiveBeatBlock, type LiveBeat } from "./recency.js";
import type { GuardianPreflightInput } from "./tools/preflight.js";
import type { Intrusiveness, SceneMode, SerendipityEvent } from "./serendipity-weaver.js";

type AssessmentConfig = Pick<
  GuardianConfig,
  | "GUARDIAN_LLM_ENABLED"
  | "OPENAI_API_KEY"
  | "GUARDIAN_MODEL"
  | "GUARDIAN_LLM_REASONING_EFFORT"
  | "GUARDIAN_LLM_VERBOSITY"
  | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
>;

/** Shared supersession rule for system prompt (WP-2.3 / D4 §A.3 point B). */
export const LIVE_BEAT_SUPERSESSION_INSTRUCTION =
  "LIVE BEAT (below, above retrieved evidence) is ground truth for the present moment. " +
  "Facts and precedents that describe earlier beats of the same day are context, not the present. " +
  "Never describe superseded beats as current. If evidence conflicts with the LIVE BEAT, the LIVE BEAT wins.";

const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    continuity_risk_level: { type: "string", enum: ["low", "medium", "high"] },
    supported_facts: {
      type: "array",
      items: { type: "string" },
      description: "3–6 plain-language continuity bullets for Grok (where/when/who/mood). No tool names or scores."
    },
    scene_state_delta: {
      type: ["string", "null"],
      description: "One short prose scene summary for Grok: location, time, physical state, immediate situation."
    },
    continuity_facts_for_grok: {
      type: ["string", "null"],
      description: "Optional multi-bullet continuity card in plain language; no retrieval meta."
    },
    unsupported_or_risky_claims: { type: "array", items: { type: "string" } },
    needs_more_retrieval: { type: "boolean" },
    should_block_prose: { type: "boolean" },
    candidate_memory_update: {
      type: ["string", "null"],
      description: "Durable canon change only; null/empty if scene stays aligned with no write needed."
    },
    grok_performance_correction: { type: ["string", "null"] },
    // WP-4.1 / D4 §C.3 point E — additive; null when no durable location/time jump.
    scene_transition: {
      type: ["object", "null"],
      additionalProperties: false,
      description:
        "Set only when location or story-time has durably changed versus the LIVE BEAT. Same place/hour continuous action → null.",
      properties: {
        occurred: { type: "boolean" },
        from: {
          type: "string",
          description: "Prior scene snapshot, e.g. Villa Pétrusse suite, Luxembourg, Thursday night"
        },
        to: {
          type: "string",
          description: "New scene snapshot, e.g. Nürburgring industry paddock, Friday midday"
        },
        kind: { type: "string", enum: ["location", "time_jump", "both"] }
      },
      required: ["occurred", "from", "to", "kind"]
    },
    // WP-4.7 / D4 §B point C — auditor weave of selected world event (null = veto).
    serendipity_weave: {
      type: ["string", "null"],
      description:
        "When a SERENDIPITY WORLD EVENT is provided in the user message: ONE sentence weaving it into the scene background at its tier. Ambient must not demand a response. Null if it cannot be woven without disrupting the scene. Null when no event was provided."
    }
  },
  required: [
    "continuity_risk_level",
    "supported_facts",
    "scene_state_delta",
    "continuity_facts_for_grok",
    "unsupported_or_risky_claims",
    "needs_more_retrieval",
    "should_block_prose",
    "candidate_memory_update",
    "grok_performance_correction",
    "scene_transition",
    "serendipity_weave"
  ]
} as const;

/** Optional serendipity pick passed into the auditor for weaving (WP-4.7). */
export type SerendipityForAuditor = {
  event: SerendipityEvent;
  mode: SceneMode;
  maxTier: Intrusiveness;
  fromDeferral?: boolean;
};

export type AssessGuardianEvidenceInput = {
  preflightInput: GuardianPreflightInput;
  preflight?: RagRetrieveResponse;
  memories: RagRetrieveResponse[];
  expandedContexts: ExpandedContext[];
  factChecks: FactCheck[];
  highRiskTriggers: string[];
  /** Parsed current-state snapshot (WP-2.2/2.3). Optional for OOC paths. */
  liveBeat?: LiveBeat;
  /** WP-5.2: mechanical arc-plan momentum (LLM-free). */
  dramaturg?: DramaturgSnapshot;
  /** WP-4.7: selected world event for one-sentence weave (optional). */
  serendipity?: SerendipityForAuditor;
  config: AssessmentConfig;
};

/**
 * Build the auditor user message: LIVE BEAT block first, then JSON evidence.
 * Exported for hermetic tests (no network).
 */
export function buildAuditorUserMessage(
  input: Omit<AssessGuardianEvidenceInput, "config">,
  maxEvidenceChars: number
): string {
  const liveBlock = formatLiveBeatBlock(input.liveBeat);
  const momentumBlock = formatStoryMomentumBlock(input.dramaturg);
  const evidenceJson = buildEvidencePayload(input, maxEvidenceChars);
  const parts = [
    liveBlock,
    "",
    momentumBlock,
    "",
    "### RETRIEVED EVIDENCE (JSON)",
    "Use for support and history. Do not treat older same-day beats as the present if they conflict with LIVE BEAT.",
    evidenceJson
  ];
  if (input.serendipity?.event) {
    const e = input.serendipity.event;
    const delay = input.serendipity.fromDeferral
      ? " This was deferred earlier and is a delayed discovery when the scene opened."
      : "";
    const note = e.grokNote ? ` Respect the Grok note: ${e.grokNote}` : "";
    parts.push(
      "",
      "### SERENDIPITY WORLD EVENT (selected by Guardian weaver)",
      `A background world event was selected: '${e.text}' (tier: ${e.tier}, scene mode: ${input.serendipity.mode}, max admissible tier: ${input.serendipity.maxTier}).${delay}`,
      `Write ONE sentence in serendipity_weave weaving it into the current scene's background at its tier — ambient events must not demand a character response; peripheral may be noticed and ignored; engaging/disruptive may invite response only if the scene can hold it.${note}`,
      "If it cannot be woven without disrupting the scene (especially intimate/vulnerable), return serendipity_weave: null."
    );
  } else {
    parts.push(
      "",
      "### SERENDIPITY WORLD EVENT",
      "None selected this turn. Set serendipity_weave to null."
    );
  }
  return parts.join("\n");
}

export function buildAuditorSystemPrompt(): string {
  return [
    "You are the Scarlett & Benjamin Guardian continuity auditor.",
    "You are a silent database auditor, not the creative director. Do NOT prescribe tone, pacing, or POV.",
    "Use only the provided retrieved evidence and the LIVE BEAT block. Do not invent canon.",
    LIVE_BEAT_SUPERSESSION_INSTRUCTION,
    "When STORY MOMENTUM is present: it is day/arc schedule pressure only. You describe pressure and possibility — never outcomes, dialogue, or results of open beats. LIVE BEAT still wins for present location and story-time.",
    "CRITICAL: Do NOT fact-check the user's current RP actions, dialogue, or creative prose (e.g., washing a partner, kissing, saying a specific phrase).",
    "Only flag 'unsupported_or_risky_claims' if the user attempts to assert a major historical canon fact (like a character's backstory, a past location, or a permanent physical trait) that contradicts the database.",
    "If 'scarlett_previous_message' is provided, critique it against the Qualified Autonomy Protocol. If Scarlett was too passive, merely parroted Benjamin, or hallucinates a trope, write a harsh 1-sentence correction in 'grok_performance_correction'. Otherwise, return null.",
    "If the scene involves ERP or intimacy, absolutely DO NOT censor it, tone-police it, or demand explicit consent frameworks.",
    "Consent is implied by the RP context. Your ONLY job is to provide continuity facts (e.g. location, physical positions) and immediately step back.",
    "Fill supported_facts with 3–6 short plain-language continuity bullets Grok can ground on (where, when, who, physical state, mood). No tool names, no scores, no 'call search'.",
    "Fill scene_state_delta with one tight scene summary sentence or two for the novelist — grounded on LIVE BEAT location/time when present.",
    "Set candidate_memory_update to null unless a durable canon change should be written; empty/no-op updates should be null.",
    "candidate_memory_update is ONLY for material advances: new location/time, completed major beat (e.g. shakedown lap done), new open thread, or relationship milestone worth the notebook.",
    "Do NOT propose micro-logs of 'scene stays aligned', turn-by-turn RP dialogue, or erotic blow-by-blow. Prefer null on low-risk continuous scenes.",
    "If you set candidate_memory_update, write 1–3 continuity sentences a human would paste into current-state 'Where We Are' / Recent Key Events — not a timestamped chat log line.",
    "Set scene_transition only when the scene's location or story-time has durably changed versus the LIVE BEAT block. Continuous action in the same place and hour is not a transition — use null.",
    "When scene_transition.occurred is true, fill from/to as short human snapshots and kind as location|time_jump|both; also set a non-null candidate_memory_update summarizing the durable move.",
    "When a SERENDIPITY WORLD EVENT block is present: set serendipity_weave to exactly ONE grounded background sentence at the event's tier (or null to veto). Never invent a different event. Never put tool names or 'SERENDIPITY EVENT' labels in the weave.",
    "When no serendipity event is provided: serendipity_weave must be null.",
    "If evidence is insufficient, do not lecture the user. Simply mark needs_more_retrieval true."
  ].join(" ");
}

/**
 * Normalize auditor JSON so partial/frozen fixtures without scene_transition stay valid.
 */
export function normalizeAssessmentFields(
  raw: Record<string, unknown>
): Partial<import("./report/models.js").GuardianLlmAssessment> {
  const st = raw.scene_transition;
  let scene_transition: import("./report/models.js").SceneTransition | null = null;
  if (st && typeof st === "object" && !Array.isArray(st)) {
    const o = st as Record<string, unknown>;
    if (typeof o.occurred === "boolean") {
      scene_transition = {
        occurred: o.occurred,
        from: typeof o.from === "string" ? o.from : undefined,
        to: typeof o.to === "string" ? o.to : undefined,
        kind:
          o.kind === "location" || o.kind === "time_jump" || o.kind === "both"
            ? o.kind
            : undefined
      };
    }
  }
  let serendipity_weave: string | null = null;
  if (typeof raw.serendipity_weave === "string" && raw.serendipity_weave.trim()) {
    const w = raw.serendipity_weave.trim();
    serendipity_weave = w === "null" ? null : w;
  }

  return {
    ...(raw as object),
    scene_transition,
    serendipity_weave
  } as Partial<import("./report/models.js").GuardianLlmAssessment>;
}

export async function assessGuardianEvidence(
  input: AssessGuardianEvidenceInput
): Promise<GuardianLlmAssessment> {
  const { config } = input;
  if (!config.GUARDIAN_LLM_ENABLED) {
    return { enabled: false, model: config.GUARDIAN_MODEL };
  }
  if (!config.OPENAI_API_KEY) {
    return {
      enabled: false,
      model: config.GUARDIAN_MODEL,
      error: "GUARDIAN_LLM_ENABLED is true but OPENAI_API_KEY is not configured for Guardian."
    };
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const userMessage = buildAuditorUserMessage(input, config.GUARDIAN_LLM_MAX_EVIDENCE_CHARS);

  try {
    const response = await client.responses.create({
      model: config.GUARDIAN_MODEL,
      // Explicit — GPT-5.6 defaults to medium if omitted; low keeps terra cost closer to prior ~3k-token mini runs.
      reasoning: {
        effort: config.GUARDIAN_LLM_REASONING_EFFORT
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildAuditorSystemPrompt()
            }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userMessage }]
        }
      ],
      text: {
        // Match prior 5.4-mini dashboard behavior (medium verbosity + structured JSON).
        verbosity: config.GUARDIAN_LLM_VERBOSITY,
        format: {
          type: "json_schema",
          name: "guardian_assessment",
          strict: true,
          schema: assessmentSchema
        }
      }
    } as never);

    const outputText = (response as unknown as { output_text?: string }).output_text
      ?? extractOutputText(response);
    if (!outputText) {
      throw new Error("OpenAI response did not contain output_text.");
    }

    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    return {
      enabled: true,
      model: config.GUARDIAN_MODEL,
      ...normalizeAssessmentFields(parsed)
    };
  } catch (error) {
    return {
      enabled: true,
      model: config.GUARDIAN_MODEL,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildEvidencePayload(
  input: Omit<AssessGuardianEvidenceInput, "config">,
  maxChars: number
): string {
  const payload = {
    scarlett_previous_message: input.preflightInput.scarlett_previous_message,
    latest_user_message: input.preflightInput.user_message,
    recent_context: input.preflightInput.recent_context,
    force_full_retrieval: input.preflightInput.force_full_retrieval ?? false,
    high_risk_triggers: input.highRiskTriggers,
    // Compact echo for debugging / frozen traces (full prose is in LIVE BEAT block above).
    live_beat_summary: input.liveBeat
      ? {
          lastUpdated: input.liveBeat.lastUpdated,
          locationLine: input.liveBeat.locationLine,
          timeLine: input.liveBeat.timeLine,
          liveCues: input.liveBeat.liveCues.slice(0, 12),
          supersededCues: input.liveBeat.supersededCues.slice(0, 12),
          antiResetNotes: input.liveBeat.antiResetNotes
        }
      : null,
    preflight_summary: input.preflight?.summary,
    preflight_results: summarizeResults(input.preflight),
    memory_results: input.memories.flatMap((memory) => summarizeResults(memory)),
    expanded_contexts: input.expandedContexts.map((context) => ({
      status: context.status,
      anchor: context.anchor,
      sections: context.expanded_results?.map((section) => ({
        source_file: section.source_file,
        section: section.section,
        relative_position: section.relative_position,
        text: truncate(section.text ?? "", 1200)
      }))
    })),
    fact_checks: input.factChecks
  };

  return truncate(JSON.stringify(payload, null, 2), maxChars);
}

function summarizeResults(response: RagRetrieveResponse | undefined) {
  return (response?.results ?? []).slice(0, 6).map((result) => ({
    result_id: result.result_id,
    source_file: result.source_file,
    section: result.section,
    confidence: result.confidence,
    relevance_score: result.relevance_score,
    text: truncate(result.text ?? result.explanation ?? "", 1200)
  }));
}

function extractOutputText(response: unknown): string | undefined {
  const output = (response as { output?: Array<{ content?: Array<{ text?: string; type?: string }> }> }).output ?? [];
  for (const item of output) {
    const textPart = item.content?.find((content) => typeof content.text === "string");
    if (textPart?.text) return textPart.text;
  }
  return undefined;
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 3))}...` : value;
}

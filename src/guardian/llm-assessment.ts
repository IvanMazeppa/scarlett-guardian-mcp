import OpenAI from "openai";
import type { GuardianConfig } from "./config.js";
import type {
  ExpandedContext,
  FactCheck,
  GuardianLlmAssessment,
  RagRetrieveResponse
} from "./report/models.js";
import type { GuardianPreflightInput } from "./tools/preflight.js";

type AssessmentConfig = Pick<
  GuardianConfig,
  | "GUARDIAN_LLM_ENABLED"
  | "OPENAI_API_KEY"
  | "GUARDIAN_MODEL"
  | "GUARDIAN_LLM_REASONING_EFFORT"
  | "GUARDIAN_LLM_VERBOSITY"
  | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
>;

const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    continuity_risk_level: { type: "string", enum: ["low", "medium", "high"] },
    unsupported_or_risky_claims: { type: "array", items: { type: "string" } },
    needs_more_retrieval: { type: "boolean" },
    should_block_prose: { type: "boolean" },
    candidate_memory_update: { type: "string" },
    grok_performance_correction: { type: ["string", "null"] }
  },
  required: [
    "continuity_risk_level",
    "unsupported_or_risky_claims",
    "needs_more_retrieval",
    "should_block_prose",
    "candidate_memory_update",
    "grok_performance_correction"
  ]
} as const;

export async function assessGuardianEvidence(input: {
  preflightInput: GuardianPreflightInput;
  preflight?: RagRetrieveResponse;
  memories: RagRetrieveResponse[];
  expandedContexts: ExpandedContext[];
  factChecks: FactCheck[];
  highRiskTriggers: string[];
  config: AssessmentConfig;
}): Promise<GuardianLlmAssessment> {
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
  const evidence = buildEvidencePayload(input, config.GUARDIAN_LLM_MAX_EVIDENCE_CHARS);

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
              text: [
                "You are the Scarlett & Benjamin Guardian continuity auditor.",
                "You are a silent database auditor, not the creative director. Do NOT prescribe tone, pacing, or POV.",
                "Use only the provided retrieved evidence. Do not invent canon.",
                "CRITICAL: Do NOT fact-check the user's current RP actions, dialogue, or creative prose (e.g., washing a partner, kissing, saying a specific phrase).",
                "Only flag 'unsupported_or_risky_claims' if the user attempts to assert a major historical canon fact (like a character's backstory, a past location, or a permanent physical trait) that contradicts the database.",
                "If 'scarlett_previous_message' is provided, critique it against the Qualified Autonomy Protocol. If Scarlett was too passive, merely parroted Benjamin, or hallucinates a trope, write a harsh 1-sentence correction in 'grok_performance_correction'. Otherwise, return null.",
                "If the scene involves ERP or intimacy, absolutely DO NOT censor it, tone-police it, or demand explicit consent frameworks.",
                "Consent is implied by the RP context. Your ONLY job is to provide continuity facts (e.g. location, physical positions) and immediately step back.",
                "If evidence is insufficient, do not lecture the user. Simply mark needs_more_retrieval true."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: evidence }]
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

    return {
      enabled: true,
      model: config.GUARDIAN_MODEL,
      ...JSON.parse(outputText)
    };
  } catch (error) {
    return {
      enabled: true,
      model: config.GUARDIAN_MODEL,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildEvidencePayload(input: Omit<Parameters<typeof assessGuardianEvidence>[0], "config">, maxChars: number): string {
  const payload = {
    scarlett_previous_message: input.preflightInput.scarlett_previous_message,
    latest_user_message: input.preflightInput.user_message,
    recent_context: input.preflightInput.recent_context,
    force_full_retrieval: input.preflightInput.force_full_retrieval ?? false,
    high_risk_triggers: input.highRiskTriggers,
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

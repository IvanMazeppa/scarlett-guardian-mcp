import type { GuardianConfig } from "../config.js";
import { assessGuardianEvidence } from "../llm-assessment.js";
import type { RagMcpClient } from "../rag-client.js";
import type {
  FactCheck,
  GuardianLlmAssessment,
  RagRetrieveResponse,
  RagToolCall
} from "../report/models.js";

export type GuardianOocConsultInput = {
  question: string;
  latest_user_message?: string;
  recent_context?: string;
  mode?: "continuity_review" | "fact_check" | "scene_planning" | "memory_update_review";
  force_full_retrieval?: boolean;
};

export type GuardianOocConsultReport = {
  mode: NonNullable<GuardianOocConsultInput["mode"]>;
  question: string;
  answer: string;
  retrieval_summary: string;
  recommended_actions: string[];
  fact_checks: FactCheck[];
  llm_assessment: GuardianLlmAssessment;
  tool_calls: RagToolCall[];
};

type OocConfig = Pick<
  GuardianConfig,
  "GUARDIAN_LLM_ENABLED" | "OPENAI_API_KEY" | "GUARDIAN_MODEL" | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
>;

export async function runGuardianOocConsult(
  input: GuardianOocConsultInput,
  ragClient: RagMcpClient,
  config: OocConfig
): Promise<GuardianOocConsultReport> {
  const mode = input.mode ?? "continuity_review";
  const toolCalls: RagToolCall[] = [];
  const query = buildConsultQuery(input, mode);
  const preflight = await callJson<RagRetrieveResponse>(toolCalls, ragClient, "retrieve_story_context", {
    query,
    max_results: 5,
    rewrite_query: true,
    max_chars_per_result: 1600
  });
  const memory = await callJson<RagRetrieveResponse>(toolCalls, ragClient, "search_story_memory", {
    query,
    max_results: input.force_full_retrieval ? 8 : 5,
    rewrite_query: true,
    max_chars_per_result: 1800
  });

  const factChecks: FactCheck[] = [];
  if (mode === "fact_check" || /\b(exact|verify|true|canon|date|when|where|who|timeline|name|fact)\b/i.test(input.question)) {
    const factCheck = await callJson<FactCheck>(toolCalls, ragClient, "verify_story_fact", {
      claim_or_question: input.question,
      max_evidence: 5,
      require_corroboration: false
    });
    if (factCheck.ok && factCheck.response) factChecks.push(factCheck.response);
  }

  const llmAssessment = await assessGuardianEvidence({
    preflightInput: {
      user_message: input.latest_user_message || input.question,
      recent_context: input.recent_context,
      force_full_retrieval: input.force_full_retrieval
    },
    preflight: preflight.response,
    memories: memory.response ? [memory.response] : [],
    expandedContexts: [],
    factChecks,
    highRiskTriggers: [mode],
    config
  });

  return {
    mode,
    question: input.question,
    answer: buildAnswer(llmAssessment, preflight.response, memory.response, factChecks),
    retrieval_summary: buildRetrievalSummary(preflight.response, memory.response),
    recommended_actions: buildRecommendedActions(llmAssessment, factChecks, mode),
    fact_checks: factChecks,
    llm_assessment: llmAssessment,
    tool_calls: toolCalls
  };
}

function buildConsultQuery(input: GuardianOocConsultInput, mode: NonNullable<GuardianOocConsultInput["mode"]>): string {
  return [
    `Guardian OOC ${mode.replace(/_/g, " ")}`,
    input.question,
    input.latest_user_message ? `Latest Benjamin/user message: ${input.latest_user_message}` : "",
    input.recent_context ? `Recent context: ${input.recent_context}` : ""
  ].filter(Boolean).join("; ");
}

function buildAnswer(
  assessment: GuardianLlmAssessment,
  preflight: RagRetrieveResponse | undefined,
  memory: RagRetrieveResponse | undefined,
  factChecks: FactCheck[]
): string {
  if (assessment.enabled && !assessment.error && assessment.continuity_facts_for_grok) {
    return assessment.continuity_facts_for_grok;
  }
  if (factChecks.length > 0) {
    return factChecks.map((check) => `${check.status ?? "unknown"}: ${check.answer ?? check.explanation ?? "Fact check completed."}`).join("\n");
  }
  return [
    "Guardian deterministic consult completed.",
    preflight?.summary ? `Current context: ${preflight.summary}` : undefined,
    memory?.summary ? `Memory context: ${memory.summary}` : undefined,
    "Enable GUARDIAN_LLM_ENABLED=true for a synthesized Guardian OOC answer."
  ].filter(Boolean).join("\n");
}

function buildRetrievalSummary(preflight: RagRetrieveResponse | undefined, memory: RagRetrieveResponse | undefined): string {
  return [
    `Preflight: ${preflight?.status ?? "missing"} / ${preflight?.confidence ?? "unknown"} / ${preflight?.result_count ?? 0} result(s).`,
    `Memory: ${memory?.status ?? "missing"} / ${memory?.confidence ?? "unknown"} / ${memory?.result_count ?? 0} result(s).`
  ].join(" ");
}

function buildRecommendedActions(
  assessment: GuardianLlmAssessment,
  factChecks: FactCheck[],
  mode: NonNullable<GuardianOocConsultInput["mode"]>
): string[] {
  const actions = new Set<string>();
  if (assessment.needs_more_retrieval) actions.add("Run one narrower retrieval query before writing prose.");
  if (assessment.should_block_prose) actions.add("Block in-character prose until the continuity issue is repaired.");
  if (factChecks.some((check) => check.status !== "verified")) actions.add("Do not treat the fact as canon unless stronger evidence is retrieved.");
  if (mode === "memory_update_review") actions.add("Draft staged memory updates only; do not write directly to live corpus files.");
  if (actions.size === 0) actions.add("Use the retrieved evidence conservatively and avoid unsupported continuity claims.");
  return [...actions];
}

async function callJson<T>(
  toolCalls: RagToolCall[],
  ragClient: RagMcpClient,
  tool: string,
  args: Record<string, unknown>
): Promise<RagToolCall<T>> {
  try {
    const response = await ragClient.callJsonTool<T>(tool, args);
    const call = { tool, arguments: args, ok: true, response };
    toolCalls.push(call);
    return call;
  } catch (error) {
    const call = { tool, arguments: args, ok: false, error: error instanceof Error ? error.message : String(error) };
    toolCalls.push(call);
    return call;
  }
}

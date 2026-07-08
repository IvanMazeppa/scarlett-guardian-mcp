import type { GuardianConfig } from "../config.js";
import { assessGuardianEvidence } from "../llm-assessment.js";
import type { RagMcpClient } from "../rag-client.js";
import type {
  CriticalPrecedent,
  ExpandedContext,
  FactCheck,
  GuardianReport,
  RagRetrieveResponse,
  RagToolCall
} from "../report/models.js";
import { getSerendipityNudge } from "../serendipity.js";

export type GuardianPreflightInput = {
  user_message: string;
  scarlett_previous_message?: string;
  recent_context?: string;
  force_full_retrieval?: boolean;
};

type HighRiskTrigger = {
  label: string;
  pattern: RegExp;
  queryHint: string;
};

const OPTIONAL_RAG_TOOLS = new Set(["index_status", "expand_context_around_chunk", "verify_story_fact"]);

const HIGH_RISK_TRIGGERS: HighRiskTrigger[] = [
  {
    label: "Benjamin attributes Scarlett internal state",
    pattern: /\b(you|your)\s+(bristled|looked|seemed|felt|wanted|needed|were|are)\b/i,
    queryHint: "Scarlett emotional state Benjamin perception internal reaction precedent"
  },
  {
    label: "Food-care, feeding, appetite, or ARFID-adjacent gesture",
    pattern: /\b(food|feed|feeding|bite|steak|ribeye|appetite|arfid|meal|dinner|eat|eating)\b/i,
    queryHint: "feeding food care appetite ribeye Benjamin Scarlett precedent"
  },
  {
    label: "Recovery, soreness, body, fragility, or caretaking",
    pattern: /\b(sore|soreness|tender|fragile|recovery|recovering|body|cream|cushion|care|caretaking)\b/i,
    queryHint: "Scarlett recovery soreness aftercare body not fragile Benjamin"
  },
  {
    label: "Intimacy, kink, dominance, consent, or aftercare",
    pattern: /\b(intimate|bath|skin|sex|kink|dominance|dominant|aftercare|consent|surrender|submit|desire)\b/i,
    queryHint: "Scarlett Benjamin intimacy dominance aftercare consent precedent"
  },
  {
    label: "Public visibility, jealousy, queer safety, or boundaries",
    pattern: /\b(public|jealous|jealousy|watching|staring|visibility|queer|boundary|boundaries|touch|approach)\b/i,
    queryHint: "Scarlett Benjamin public visibility jealousy boundaries queer safety"
  },
  {
    label: "Family, transition, trauma, Vaxholm, Mormor, or milestone",
    pattern: /\b(family|mormor|vaxholm|transition|blockers|oestrogen|surgery|trauma|assault|letter|milestone)\b/i,
    queryHint: "Scarlett family transition Vaxholm Mormor emotional milestone"
  },
  {
    label: "AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc",
    pattern: /\b(amg|black panther|germany|luxembourg|n[uü]rburgring|nuerburgring|track|aero|villa|bistro)\b/i,
    queryHint: "Germany trip Luxembourg Black Panther AMG Nuerburgring current scene"
  },
  {
    label: "Repeated gesture or explicit memory echo",
    pattern: /\b(again|remember|reminds|same one|like before|last time|always|pattern)\b/i,
    queryHint: "repeated gesture relationship precedent emotional echo Scarlett Benjamin"
  }
];

export function buildPreflightQuery(input: GuardianPreflightInput): string {
  const recentContext = input.recent_context?.trim();
  const base = "current scene state Scarlett Benjamin emotional tone open threads";
  const userMessage = compactWhitespace(input.user_message).slice(0, 600);
  return recentContext
    ? `${base}; recent context: ${compactWhitespace(recentContext).slice(0, 400)}; Benjamin turn: ${userMessage}`
    : `${base}; Benjamin turn: ${userMessage}`;
}

export function detectHighRiskTriggers(userMessage: string): string[] {
  return HIGH_RISK_TRIGGERS
    .filter((trigger) => trigger.pattern.test(userMessage))
    .map((trigger) => trigger.label);
}

export function buildMemoryQueries(input: GuardianPreflightInput): string[] {
  const message = compactWhitespace(input.user_message);
  const matched = HIGH_RISK_TRIGGERS.filter((trigger) => trigger.pattern.test(message));

  if (input.force_full_retrieval) {
    return uniqueQueries([
      `current scene continuity relationship precedent ${message}`,
      ...matched.map((trigger) => trigger.queryHint)
    ]).slice(0, 2); // CLAMP TO MAX 2 QUERIES TO PREVENT TIMEOUTS
  }

  if (matched.length > 0) {
    return uniqueQueries([
      `${matched.map((trigger) => trigger.queryHint).join(" ")}; Benjamin turn: ${message.slice(0, 500)}`
    ]).slice(0, 1);
  }

  return ["Scarlett Benjamin current scene emotional dynamic relationship precedent current arc"];
}

export async function runGuardianPreflight(
  input: GuardianPreflightInput,
  ragClient: RagMcpClient,
  config: Pick<
    GuardianConfig,
    "GUARDIAN_CONFIDENCE_THRESHOLD" | "GUARDIAN_LLM_ENABLED" | "OPENAI_API_KEY" | "GUARDIAN_MODEL" | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
  >
): Promise<GuardianReport> {
  const preflightQuery = buildPreflightQuery(input);
  const memoryQueries = buildMemoryQueries(input);
  const highRiskTriggers = detectHighRiskTriggers(input.user_message);
  const toolCalls: RagToolCall[] = [];

  console.log(`${Date.now()} Dispatching queries to RAG...`);
  const indexStatusPromise = callText(toolCalls, ragClient, "index_status", {});
  const preflightPromise = callJson<RagRetrieveResponse>(toolCalls, ragClient, "retrieve_story_context", {
    query: preflightQuery,
    max_results: 6,
    rewrite_query: true,
    max_chars_per_result: 2500
  });

  const memoryPromises = memoryQueries.map((query) =>
    callJson<RagRetrieveResponse>(toolCalls, ragClient, "search_story_memory", {
      query,
      max_results: input.force_full_retrieval ? 10 : 8,
      rewrite_query: true,
      max_chars_per_result: 3000
    })
  );

  console.log(`${Date.now()} Awaiting indexStatus...`);
  const indexStatus = await indexStatusPromise;
  console.log(`${Date.now()} Awaiting preflight...`);
  const preflight = await preflightPromise;
  console.log(`${Date.now()} Awaiting memoryResults...`);
  const memoryCallResults = await Promise.all(memoryPromises);
  const memoryResponses = memoryCallResults
    .filter((call) => call.ok && call.response)
    .map((call) => call.response as RagRetrieveResponse);

  // DISABLED TO FIX TIMEOUTS:
  const expandedContexts: ExpandedContext[] = [];
  const factChecks: FactCheck[] = [];

  const confidenceScore = scoreConfidence(preflight.response, memoryResponses, highRiskTriggers, toolCalls);
  const retrievalStatus = determineRetrievalStatus(preflight, memoryResponses, toolCalls);
  const deterministicProceedRecommendation = retrievalStatus === "failed"
    ? "do_not_proceed"
    : confidenceScore >= config.GUARDIAN_CONFIDENCE_THRESHOLD && retrievalStatus === "success"
      ? "proceed"
      : "proceed_with_caution";
  console.log(`${Date.now()} Starting assessGuardianEvidence...`);
  const llmAssessment = await assessGuardianEvidence({
    preflightInput: input,
    preflight: preflight.response,
    memories: memoryResponses,
    expandedContexts,
    factChecks,
    highRiskTriggers,
    config
  });
  console.log(`${Date.now()} Finished assessGuardianEvidence.`);
  
  const proceedRecommendation = llmAssessment.enabled && llmAssessment.should_block_prose
    ? "do_not_proceed"
    : deterministicProceedRecommendation;

  if (llmAssessment.enabled && llmAssessment.candidate_memory_update && proceedRecommendation !== "do_not_proceed") {
    const timeString = new Date().toISOString().replace("T", " ").substring(0, 19);
    await callJson(toolCalls, ragClient, "update_story_state", {
      source_file: "project_source_files/current-state.md",
      content: `\n- [${timeString}] ${llmAssessment.candidate_memory_update}`,
      mode: "append"
    });
  }

  const criticalPrecedents = collectCriticalPrecedents(memoryResponses);
  const hardFlags = buildHardFlags(retrievalStatus, highRiskTriggers, preflight.response, memoryResponses, factChecks, llmAssessment);
  const currentStateSummary = summarizeCurrentState(preflight.response);

  return {
    retrieval_status: retrievalStatus,
    confidence_score: confidenceScore,
    proceed_recommendation: proceedRecommendation,
    current_state_summary: currentStateSummary,
    critical_precedents: criticalPrecedents,
    expanded_contexts: expandedContexts,
    fact_checks: factChecks,
    llm_assessment: llmAssessment,
    emotional_tone_guidance: buildToneGuidance(preflight.response, memoryResponses),
    things_to_avoid: buildThingsToAvoid(highRiskTriggers, retrievalStatus),
    open_threads: collectOpenThreads(preflight.response, memoryResponses),
    hard_flags: hardFlags,
    retrieval_notes: buildRetrievalNotes(indexStatus.response, preflight.response, memoryResponses, toolCalls),
    serendipity_nudge: getSerendipityNudge(highRiskTriggers),
    retrieval_plan: {
      preflight_query: preflightQuery,
      memory_queries: memoryQueries,
      high_risk_triggers: highRiskTriggers
    },
    tool_calls: toolCalls
  };
}

async function expandBestContext(
  toolCalls: RagToolCall[],
  ragClient: RagMcpClient,
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  highRiskTriggers: string[]
): Promise<ExpandedContext[]> {
  const candidate = [
    ...memories.flatMap((memory) => memory.results ?? []),
    ...(preflight?.results ?? [])
  ].find((result) => result.can_expand !== false && (result.result_id || (result.source_file && result.section)));

  if (!candidate) return [];

  const shouldExpand = highRiskTriggers.length > 0
    || preflight?.should_answer_now === false
    || memories.some((memory) => memory.confidence !== "high");
  if (!shouldExpand) return [];

  const response = await callJson<ExpandedContext>(toolCalls, ragClient, "expand_context_around_chunk", {
    result_id: candidate.result_id,
    source_file: candidate.result_id ? undefined : candidate.source_file,
    section: candidate.result_id ? undefined : candidate.section,
    before: 1,
    after: 1,
    max_chars: 3000
  });

  return response.ok && response.response ? [response.response] : [];
}

async function verifyExactClaims(
  toolCalls: RagToolCall[],
  ragClient: RagMcpClient,
  input: GuardianPreflightInput,
  highRiskTriggers: string[]
): Promise<FactCheck[]> {
  const claims = buildFactCheckQuestions(input, highRiskTriggers);
  const checks: FactCheck[] = [];

  const promises = claims.slice(0, 2).map((claim) =>
    callJson<FactCheck>(toolCalls, ragClient, "verify_story_fact", {
      claim_or_question: claim,
      max_evidence: 4,
      require_corroboration: false
    })
  );

  const results = await Promise.all(promises);
  for (const response of results) {
    if (response.ok && response.response) {
      checks.push(response.response);
    }
  }

  return checks;
}

function buildFactCheckQuestions(input: GuardianPreflightInput, highRiskTriggers: string[]): string[] {
  const message = compactWhitespace(input.user_message);
  const questions: string[] = [];
  const exactPattern = /\b(friday|thursday|monday|tuesday|wednesday|saturday|sunday|october|luxembourg|paris|germany|n[uü]rburgring|nuerburgring|affalterbach|amg|vaxholm|mormor|oestrogen|estrogen|blockers|surgery|villa|bistrot)\b/i;

  if (exactPattern.test(message)) {
    questions.push(`Verify exact continuity facts, timeline, places, and named details in this Benjamin turn: ${message.slice(0, 700)}`);
  }

  if (highRiskTriggers.some((trigger) => /Family|transition|trauma|Vaxholm|Mormor|milestone/i.test(trigger))) {
    questions.push(`Verify family, transition, timeline, and milestone facts raised by this turn: ${message.slice(0, 700)}`);
  }

  if (highRiskTriggers.some((trigger) => /AMG|Germany|Luxembourg|Nuerburgring/i.test(trigger))) {
    questions.push(`Verify Germany trip, Luxembourg, AMG, Affalterbach, and Nuerburgring timeline facts raised by this turn: ${message.slice(0, 700)}`);
  }

  return uniqueQueries(questions);
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
    const call = { tool, arguments: args, ok: false, error: stringifyError(error) };
    toolCalls.push(call);
    return call;
  }
}

async function callText(
  toolCalls: RagToolCall[],
  ragClient: RagMcpClient,
  tool: string,
  args: Record<string, unknown>
): Promise<RagToolCall<string>> {
  try {
    const response = await ragClient.callTextTool(tool, args);
    const call = { tool, arguments: args, ok: true, response };
    toolCalls.push(call);
    return call;
  } catch (error) {
    const call = { tool, arguments: args, ok: false, error: stringifyError(error) };
    toolCalls.push(call);
    return call;
  }
}

function scoreConfidence(
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  highRiskTriggers: string[],
  toolCalls: RagToolCall[]
): number {
  if (toolCalls.some((call) => !call.ok && !OPTIONAL_RAG_TOOLS.has(call.tool))) return 0;

  let score = confidencePoints(preflight?.confidence, 35);
  const bestMemory = memories.reduce((best, current) => Math.max(best, confidencePoints(current.confidence, 40)), 0);
  score += bestMemory;

  if ((preflight?.result_count ?? 0) > 0) score += 10;
  if (memories.some((memory) => (memory.result_count ?? 0) > 0)) score += 10;
  if (highRiskTriggers.length > 0 && memories.some((memory) => (memory.result_count ?? 0) > 0)) score += 5;

  return Math.min(100, Math.max(0, score));
}

function confidencePoints(confidence: string | undefined, highValue: number): number {
  if (confidence === "high") return highValue;
  if (confidence === "medium") return Math.round(highValue * 0.7);
  if (confidence === "low") return Math.round(highValue * 0.4);
  return 0;
}

function determineRetrievalStatus(
  preflight: RagToolCall<RagRetrieveResponse>,
  memories: RagRetrieveResponse[],
  toolCalls: RagToolCall[]
): "success" | "partial" | "failed" {
  const mandatoryFailed = toolCalls.some((call) => !call.ok && !OPTIONAL_RAG_TOOLS.has(call.tool));
  if (mandatoryFailed || !preflight.response || memories.length === 0) return "failed";

  const preflightHasResults = (preflight.response.result_count ?? 0) > 0;
  const memoryHasResults = memories.some((memory) => (memory.result_count ?? 0) > 0);
  if (preflightHasResults && memoryHasResults) return "success";
  return "partial";
}

function collectCriticalPrecedents(memories: RagRetrieveResponse[]): CriticalPrecedent[] {
  const allResults = memories.flatMap((memory) => memory.results ?? []);
  return allResults.slice(0, 5).map((result) => ({
    topic: result.section ?? result.source_role ?? "Retrieved precedent",
    details: truncate(result.text ?? result.explanation ?? "Relevant memory result returned.", 1200),
    must_respect: "Use only this retrieved evidence for continuity. Do not turn it into new canon beyond what the source supports.",
    source_file: result.source_file,
    section: result.section
  }));
}

function summarizeCurrentState(preflight: RagRetrieveResponse | undefined): string {
  if (!preflight) return "No live-scene preflight was retrieved.";
  const resultText = preflight.results?.[0]?.text;
  return truncate(preflight.summary || resultText || "Live-scene context retrieved, but no compact summary was provided.", 1500);
}

function buildToneGuidance(preflight: RagRetrieveResponse | undefined, memories: RagRetrieveResponse[]): string {
  const summaries = [preflight?.summary, ...memories.map((memory) => memory.summary)].filter(Boolean);
  if (summaries.length === 0) {
    return "Proceed cautiously as retrieval did not provide clear observational context.";
  }

  return truncate(summaries.join("\n\n"), 1000);
}

function buildThingsToAvoid(highRiskTriggers: string[], retrievalStatus: string): string[] {
  const avoid = [
    "Do not skip tools for narrative flow, emotional momentum, or because the scene feels continuous.",
    "Do not mention tools, JSON, retrieval scores, connector mechanics, or this Guardian report in Scarlett's prose.",
    "Do not invent pre-thread facts, emotional precedents, internal reactions, names, dates, family details, or relationship history.",
    "Do not read Benjamin's private thoughts; infer only from speech, visible behavior, and retrieved context.",
    "Do not flatten Scarlett into generic romance, bland reassurance, cold autonomy, cruelty, or passive caretaking.",
    "CRITICAL CANON: Scarlett is a pre-op trans woman. NEVER forget her gender identity, anatomy, or transition history. It is fundamental to who she is."
  ];

  if (highRiskTriggers.includes("Benjamin attributes Scarlett internal state")) {
    avoid.push("If Benjamin attributes an internal state to Scarlett and retrieval does not support it, treat it as Benjamin's perception rather than confirmed truth.");
  }

  if (retrievalStatus !== "success") {
    avoid.push("Do not write in-character prose as if retrieval was complete; either stop OOC or proceed only with explicit caution.");
  }

  return avoid;
}

function collectOpenThreads(preflight: RagRetrieveResponse | undefined, memories: RagRetrieveResponse[]): string[] {
  const followups = [
    ...(preflight?.recommended_follow_up_queries ?? []),
    ...memories.flatMap((memory) => memory.recommended_follow_up_queries ?? [])
  ];

  const nextActions = [preflight?.next_action, ...memories.map((memory) => memory.next_action)].filter(Boolean) as string[];
  return uniqueQueries([...followups, ...nextActions]).slice(0, 8);
}

function buildHardFlags(
  retrievalStatus: string,
  highRiskTriggers: string[],
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  factChecks: FactCheck[],
  llmAssessment?: { enabled?: boolean; should_block_prose?: boolean; unsupported_or_risky_claims?: string[]; error?: string }
): string[] {
  const flags: string[] = [];
  if (retrievalStatus === "failed") {
    flags.push("MANDATORY_RETRIEVAL_FAILED: Grok must not write Scarlett prose until retrieval is repaired.");
  }
  if (retrievalStatus === "partial") {
    flags.push("PARTIAL_RETRIEVAL: Use caution and avoid unsupported continuity claims.");
  }
  if (preflight?.should_answer_now === false) {
    flags.push("PREFLIGHT_NOT_SUFFICIENT: Live-scene retrieval itself says more memory work is needed.");
  }
  if (memories.every((memory) => (memory.result_count ?? 0) === 0)) {
    flags.push("NO_DEEP_MEMORY_RESULTS: Deep search did not return usable precedent.");
  }
  for (const factCheck of factChecks) {
    if (factCheck.status === "ambiguous" || factCheck.status === "not_found") {
      flags.push(`FACT_CHECK_${factCheck.status.toUpperCase()}: ${truncate(factCheck.claim_or_question ?? "Exact continuity fact", 140)}`);
    }
  }
  if (llmAssessment?.should_block_prose) {
    flags.push("LLM_GUARDIAN_BLOCK: Guardian assessment recommends blocking prose until continuity is repaired.");
  }
  if (llmAssessment?.unsupported_or_risky_claims?.length) {
    flags.push(...llmAssessment.unsupported_or_risky_claims.slice(0, 3).map((claim) => `LLM_RISKY_CLAIM: ${truncate(claim, 160)}`));
  }
  if (llmAssessment?.enabled && llmAssessment.error) {
    flags.push(`LLM_GUARDIAN_ERROR: ${truncate(llmAssessment.error, 180)}`);
  }
  for (const trigger of highRiskTriggers) {
    flags.push(`HIGH_RISK_TRIGGER: ${trigger}`);
  }
  return flags;
}

function buildRetrievalNotes(
  indexStatus: string | undefined,
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  toolCalls: RagToolCall[]
): string {
  const failed = toolCalls.filter((call) => !call.ok);
  const parts = [
    `Tool calls attempted: ${toolCalls.map((call) => `${call.tool}:${call.ok ? "ok" : "failed"}`).join(", ")}.`,
    preflight ? `Preflight status: ${preflight.status ?? "unknown"} / confidence: ${preflight.confidence ?? "unknown"} / results: ${preflight.result_count ?? 0}.` : "Preflight missing.",
    `Deep memory searches: ${memories.length}; result counts: ${memories.map((memory) => memory.result_count ?? 0).join(", ") || "none"}.`
  ];

  if (failed.length > 0) {
    parts.push(`Failures: ${failed.map((call) => `${call.tool}: ${call.error}`).join(" | ")}`);
  }

  if (indexStatus) {
    parts.push(`Index status checked: ${truncate(indexStatus, 500)}`);
  }

  return parts.join(" ");
}

function uniqueQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  return queries
    .map((query) => compactWhitespace(query))
    .filter((query) => {
      const key = query.toLowerCase();
      if (!query || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 3)}...` : trimmed;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

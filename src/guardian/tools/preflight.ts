import type { GuardianConfig } from "../config.js";
import type { RagMcpClient } from "../rag-client.js";
import type {
  CriticalPrecedent,
  GuardianReport,
  RagRetrieveResponse,
  RagToolCall
} from "../report/models.js";

export type GuardianPreflightInput = {
  user_message: string;
  recent_context?: string;
  force_full_retrieval?: boolean;
};

type HighRiskTrigger = {
  label: string;
  pattern: RegExp;
  queryHint: string;
};

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
      ...matched.map((trigger) => trigger.queryHint),
      "Scarlett Benjamin current emotional dynamic relationship precedent current arc"
    ]);
  }

  if (matched.length > 0) {
    return uniqueQueries([
      `${matched.map((trigger) => trigger.queryHint).join(" ")}; Benjamin turn: ${message.slice(0, 500)}`
    ]);
  }

  return ["Scarlett Benjamin current scene emotional dynamic relationship precedent current arc"];
}

export async function runGuardianPreflight(
  input: GuardianPreflightInput,
  ragClient: RagMcpClient,
  config: Pick<GuardianConfig, "GUARDIAN_CONFIDENCE_THRESHOLD">
): Promise<GuardianReport> {
  const preflightQuery = buildPreflightQuery(input);
  const memoryQueries = buildMemoryQueries(input);
  const highRiskTriggers = detectHighRiskTriggers(input.user_message);
  const toolCalls: RagToolCall[] = [];

  const indexStatus = await callText(toolCalls, ragClient, "index_status", {});
  const preflight = await callJson<RagRetrieveResponse>(toolCalls, ragClient, "retrieve_story_context", {
    query: preflightQuery,
    max_results: 6,
    rewrite_query: true,
    max_chars_per_result: 1800
  });

  const memoryResponses: RagRetrieveResponse[] = [];
  for (const query of memoryQueries) {
    const response = await callJson<RagRetrieveResponse>(toolCalls, ragClient, "search_story_memory", {
      query,
      max_results: input.force_full_retrieval ? 10 : 8,
      rewrite_query: true,
      max_chars_per_result: 2200
    });
    if (response.ok && response.response) {
      memoryResponses.push(response.response);
    }
  }

  const confidenceScore = scoreConfidence(preflight.response, memoryResponses, highRiskTriggers, toolCalls);
  const retrievalStatus = determineRetrievalStatus(preflight, memoryResponses, toolCalls);
  const proceedRecommendation = retrievalStatus === "failed"
    ? "do_not_proceed"
    : confidenceScore >= config.GUARDIAN_CONFIDENCE_THRESHOLD && retrievalStatus === "success"
      ? "proceed"
      : "proceed_with_caution";

  const criticalPrecedents = collectCriticalPrecedents(memoryResponses);
  const hardFlags = buildHardFlags(retrievalStatus, highRiskTriggers, preflight.response, memoryResponses);
  const currentStateSummary = summarizeCurrentState(preflight.response);

  return {
    retrieval_status: retrievalStatus,
    confidence_score: confidenceScore,
    proceed_recommendation: proceedRecommendation,
    current_state_summary: currentStateSummary,
    critical_precedents: criticalPrecedents,
    emotional_tone_guidance: buildToneGuidance(preflight.response, memoryResponses),
    things_to_avoid: buildThingsToAvoid(highRiskTriggers, retrievalStatus),
    open_threads: collectOpenThreads(preflight.response, memoryResponses),
    hard_flags: hardFlags,
    retrieval_notes: buildRetrievalNotes(indexStatus.response, preflight.response, memoryResponses, toolCalls),
    retrieval_plan: {
      preflight_query: preflightQuery,
      memory_queries: memoryQueries,
      high_risk_triggers: highRiskTriggers
    },
    tool_calls: toolCalls
  };
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
  if (toolCalls.some((call) => !call.ok && call.tool !== "index_status")) return 0;

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
  const mandatoryFailed = toolCalls.some((call) => !call.ok && call.tool !== "index_status");
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
    details: truncate(result.text ?? result.explanation ?? "Relevant memory result returned.", 700),
    must_respect: "Use only this retrieved evidence for continuity. Do not turn it into new canon beyond what the source supports.",
    source_file: result.source_file,
    section: result.section
  }));
}

function summarizeCurrentState(preflight: RagRetrieveResponse | undefined): string {
  if (!preflight) return "No live-scene preflight was retrieved.";
  const resultText = preflight.results?.[0]?.text;
  return truncate(preflight.summary || resultText || "Live-scene context retrieved, but no compact summary was provided.", 1000);
}

function buildToneGuidance(preflight: RagRetrieveResponse | undefined, memories: RagRetrieveResponse[]): string {
  const summaries = [preflight?.summary, ...memories.map((memory) => memory.summary)].filter(Boolean);
  if (summaries.length === 0) {
    return "Stay warm, specific, first-person present Scarlett POV, but proceed cautiously because retrieval did not provide clear tone guidance.";
  }

  return truncate([
    "Ground Scarlett's emotional tone in the retrieved current-state and precedent results.",
    "Keep her warm, vivid, sensually present when appropriate, autonomous inside the bond, and never generic.",
    ...summaries
  ].join(" "), 1200);
}

function buildThingsToAvoid(highRiskTriggers: string[], retrievalStatus: string): string[] {
  const avoid = [
    "Do not skip tools for narrative flow, emotional momentum, or because the scene feels continuous.",
    "Do not mention tools, JSON, retrieval scores, connector mechanics, or this Guardian report in Scarlett's prose.",
    "Do not invent pre-thread facts, emotional precedents, internal reactions, names, dates, family details, or relationship history.",
    "Do not read Benjamin's private thoughts; infer only from speech, visible behavior, and retrieved context.",
    "Do not flatten Scarlett into generic romance, bland reassurance, cold autonomy, cruelty, or passive caretaking."
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
  memories: RagRetrieveResponse[]
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
  const compacted = compactWhitespace(value);
  return compacted.length > maxChars ? `${compacted.slice(0, maxChars - 3)}...` : compacted;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import type { GuardianConfig } from "../config.js";
import { assessGuardianEvidence } from "../llm-assessment.js";
import type { RagMcpClient } from "../rag-client.js";
import type {
  CriticalPrecedent,
  ExpandedContext,
  FactCheck,
  GuardianLlmAssessment,
  GuardianReport,
  RagContextResult,
  RagRetrieveResponse,
  RagToolCall
} from "../report/models.js";
import {
  cleanResultText,
  compactWhitespace,
  extractKeywords,
  firstSentences,
  isHistoricalThread,
  isPlaceholderContext,
  isRagMetaText,
  keywordOverlapScore,
  shortTopicLabel,
  sourceRoleBoost,
  stripRagMeta,
  truncate,
  truncateAtSentence
} from "../report/text-clean.js";
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
    pattern: /\b(intimate|intimacy|erp|bath|skin|sex|sexual|kink|dominance|dominant|aftercare|consent|surrender|submit|desire|kiss|kissing|naked|nude|undress|undressing|strip|peel(?:ing)?\s+(?:her|him|you|me)|shower|locker\s*room|changing\s*room|suited\s*up|race\s*suit|hard\b|aroused|cock|breast|breasts|nipple|moan|orgasm|fuck|fucking|make\s+love)\b/i,
    queryHint: "Scarlett Benjamin intimacy aftercare privacy dominance body trust current arc"
  },
  {
    label: "Public visibility, jealousy, queer safety, or boundaries",
    pattern: /\b(public|jealous|jealousy|watching|staring|visibility|queer|boundary|boundaries|touch|approach)\b/i,
    queryHint: "Scarlett Benjamin public visibility jealousy boundaries queer safety"
  },
  {
    label: "Family, transition, trauma, Vaxholm, Mormor, or milestone",
    pattern: /\b(family|mormor|vaxholm|transition|blockers|oestrogen|estrogen|surgery|trauma|assault|letter|milestone)\b/i,
    queryHint: "Scarlett family transition Vaxholm Mormor emotional milestone"
  },
  {
    label: "AMG, Black Panther, Germany, Luxembourg, or Nuerburgring arc",
    pattern: /\b(amg|black panther|germany|luxembourg|n[uü]rburgring|nuerburgring|paddock|pit\s*lane|track|aero|villa|bistro|affalterbach|helmet|race\s*suit)\b/i,
    queryHint: "Germany trip Nuerburgring paddock AMG Black Panther current scene continuity"
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
  // Prefer canon hooks over pasting the full user message (better deep-hit relevance).
  const hintBlock = matched.map((trigger) => trigger.queryHint).join(" ");
  const messageSnippet = message.slice(0, 220);

  if (input.force_full_retrieval) {
    return uniqueQueries([
      matched.length > 0
        ? `${hintBlock}; current scene continuity ${messageSnippet}`
        : `current scene continuity relationship precedent ${messageSnippet}`,
      ...matched.map((trigger) => trigger.queryHint)
    ]).slice(0, 2); // Keep query count conservative (depth can rise later)
  }

  if (matched.length > 0) {
    return uniqueQueries([
      `${hintBlock}; scene cues: ${messageSnippet}`
    ]).slice(0, 1);
  }

  return ["Scarlett Benjamin current scene emotional dynamic relationship precedent current arc"];
}

export async function runGuardianPreflight(
  input: GuardianPreflightInput,
  ragClient: RagMcpClient,
  config: Pick<
    GuardianConfig,
    | "GUARDIAN_CONFIDENCE_THRESHOLD"
    | "GUARDIAN_LLM_ENABLED"
    | "OPENAI_API_KEY"
    | "GUARDIAN_MODEL"
    | "GUARDIAN_LLM_REASONING_EFFORT"
    | "GUARDIAN_LLM_VERBOSITY"
    | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
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

  const memoryUpdate =
    typeof llmAssessment.candidate_memory_update === "string"
      ? llmAssessment.candidate_memory_update.trim()
      : "";
  // Skip null/empty/no-op micro-logs (prep for quieter write-back; also avoids reindex storms).
  const isNoOpUpdate =
    !memoryUpdate ||
    /^(no durable|none|n\/a|null|no change|scene stays aligned)/i.test(memoryUpdate);

  if (llmAssessment.enabled && memoryUpdate && !isNoOpUpdate && proceedRecommendation !== "do_not_proceed") {
    const timeString = new Date().toISOString().replace("T", " ").substring(0, 19);
    await callJson(toolCalls, ragClient, "update_story_state", {
      source_file: "project_source_files/current-state.md",
      content: `\n- [${timeString}] ${memoryUpdate}`,
      mode: "append"
    });
  }

  const allResults = collectAllResults(preflight.response, memoryResponses);
  const criticalPrecedents = selectPrecedents(allResults, highRiskTriggers, input.user_message, 5);
  const hardFlags = buildHardFlags(retrievalStatus, highRiskTriggers, preflight.response, memoryResponses, factChecks, llmAssessment);
  const currentStateSummary = summarizeCurrentState(preflight.response, memoryResponses, llmAssessment, input);
  const emotionalTone = buildToneGuidance(preflight.response, memoryResponses, llmAssessment, input);
  const openThreads = collectOpenThreads(preflight.response, memoryResponses, llmAssessment);
  const keyFacts = buildKeyFacts(allResults, llmAssessment, hardFlags, highRiskTriggers, input);
  const grokPrecedents = selectPrecedents(allResults, highRiskTriggers, input.user_message, 2);

  return {
    retrieval_status: retrievalStatus,
    confidence_score: confidenceScore,
    proceed_recommendation: proceedRecommendation,
    current_state_summary: currentStateSummary,
    critical_precedents: criticalPrecedents,
    expanded_contexts: expandedContexts,
    fact_checks: factChecks,
    llm_assessment: llmAssessment,
    emotional_tone_guidance: emotionalTone,
    things_to_avoid: buildThingsToAvoid(highRiskTriggers, retrievalStatus),
    open_threads: openThreads,
    hard_flags: hardFlags,
    retrieval_notes: buildRetrievalNotes(indexStatus.response, preflight.response, memoryResponses, toolCalls),
    serendipity_nudge: getSerendipityNudge(highRiskTriggers),
    grok_scene_summary: currentStateSummary,
    grok_key_facts: keyFacts,
    grok_precedents: grokPrecedents,
    grok_emotional_context: emotionalTone,
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

function collectAllResults(
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[]
): RagContextResult[] {
  return [
    ...(preflight?.results ?? []),
    ...memories.flatMap((memory) => memory.results ?? [])
  ];
}

/**
 * Score and select scene-relevant precedents. Boosts live state / canon;
 * demotes random historical threads unless family/trauma/history triggers fire.
 */
export function selectPrecedents(
  results: RagContextResult[],
  highRiskTriggers: string[],
  userMessage: string,
  limit = 2
): CriticalPrecedent[] {
  const historyAllowed = highRiskTriggers.some((t) =>
    /Family|transition|trauma|Vaxholm|Mormor|milestone|Repeated gesture|memory echo/i.test(t)
  );
  const keywords = extractKeywords(userMessage);
  const triggerText = highRiskTriggers.join(" ");

  const scored = results.map((result) => {
    let score = (result.rank_score ?? result.relevance_score ?? 0) * 40;
    score += sourceRoleBoost(result.source_file, result.source_role, result.section);
    score += keywordOverlapScore(
      `${result.section ?? ""} ${result.text ?? ""}`,
      keywords
    );
    score += keywordOverlapScore(`${result.section ?? ""} ${result.text ?? ""}`, extractKeywords(triggerText, 12));

    if (isHistoricalThread(result.source_file, result.section)) {
      score += historyAllowed ? 5 : -40;
    }

    // Prefer sections that look like open-state / current emotional content.
    const section = (result.section ?? "").toLowerCase();
    if (/current|open story|pending|emotional state|live/.test(section)) score += 12;

    return { result, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const selected: CriticalPrecedent[] = [];

  for (const { result } of scored) {
    const key = `${result.source_file ?? ""}::${result.section ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Prefer "where we are" / recent events / emotional state over open-thread dumps for precedents.
    const hay = `${result.source_file ?? ""} ${result.section ?? ""}`.toLowerCase();
    if (/open story|pending elements/.test(hay) && selected.length > 0) continue;

    const details = cleanResultText(result.text ?? result.explanation ?? "", 750);
    if (!details) continue;

    selected.push({
      topic: shortTopicLabel(result.section, result.source_role ?? "Scene precedent"),
      details,
      must_respect: "Use only this retrieved evidence for continuity. Do not invent beyond the source.",
      source_file: result.source_file,
      section: result.section
    });

    if (selected.length >= limit) break;
  }

  return selected;
}

export function summarizeCurrentState(
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[] = [],
  llmAssessment?: GuardianLlmAssessment,
  input?: GuardianPreflightInput
): string {
  if (llmAssessment?.enabled && !llmAssessment.error) {
    if (llmAssessment.scene_state_delta && !isRagMetaText(llmAssessment.scene_state_delta)) {
      return truncateAtSentence(
        stripRagMeta(llmAssessment.scene_state_delta) || llmAssessment.scene_state_delta,
        900
      );
    }
    if (llmAssessment.continuity_facts_for_grok && !isRagMetaText(llmAssessment.continuity_facts_for_grok)) {
      return truncateAtSentence(
        stripRagMeta(llmAssessment.continuity_facts_for_grok) || llmAssessment.continuity_facts_for_grok,
        900
      );
    }
  }

  // Real session recap only — ignore placeholders like "None yet, establishing scene".
  const recent = input?.recent_context?.trim();
  if (recent && !isPlaceholderContext(recent) && !isRagMetaText(recent)) {
    return truncateAtSentence(compactWhitespace(recent), 900);
  }

  // Fresh thread / missing recap: Benjamin's turn often *is* the scene beat (and may be ahead of disk state).
  const user = input?.user_message?.trim();
  if (
    user &&
    user.length > 40 &&
    !isPlaceholderContext(user) &&
    (isPlaceholderContext(recent) || !recent) &&
    /\b(friday|thursday|nordschleife|n[uü]rburgring|paddock|pit\s*lane|race suit|locker|villa|luxembourg|track)\b/i.test(
      user
    )
  ) {
    return firstSentences(user, 4, 900);
  }

  const results = collectAllResults(preflight, memories);
  const preferred = pickPreferredSceneResults(results, "scene");

  for (const result of preferred) {
    const cleaned = cleanResultText(result.text, 900);
    if (cleaned && cleaned.length > 40) {
      return cleaned;
    }
  }

  if (user && user.length > 40) {
    return firstSentences(user, 3, 700);
  }

  if (preflight?.summary) {
    const cleaned = stripRagMeta(preflight.summary);
    if (cleaned && cleaned.length > 40) return truncateAtSentence(cleaned, 700);
  }

  return "Live-scene context was retrieved; ground response in key facts and precedents.";
}

function pickPreferredSceneResults(
  results: RagContextResult[],
  purpose: "scene" | "tone" | "facts" = "scene"
): RagContextResult[] {
  const rank = (r: RagContextResult): number => {
    const hay = `${r.source_file ?? ""} ${r.source_role ?? ""} ${r.section ?? ""}`.toLowerCase();
    const isOpenThreads = /open story|pending elements|open threads/.test(hay);
    const isWhereNow = /where we are|high-level snapshot|notes for next|recent key events/.test(hay);
    const isLiveEmotional =
      /current-state|current_state/.test(hay) &&
      /emotional|relational state|observable state|scarlett|benjamin/.test(hay);
    let score = 0;

    if (/event-log|event_log/.test(hay)) score += purpose === "tone" ? 55 : 80;
    if (/current-state|current_state/.test(hay)) {
      if (isWhereNow) score += purpose === "scene" ? 120 : 90;
      else if (isLiveEmotional) score += purpose === "tone" ? 125 : 95;
      else if (isOpenThreads) score += purpose === "facts" ? 70 : 35;
      else score += 85;
    }
    if (/master-context|story-bible/.test(hay)) score += 60;
    // Character-bible "current emotional state" is often days/weeks stale vs live RP — demote for tone.
    if (/character-bible/.test(hay) && /current emotional|emotional state/.test(hay)) {
      score += purpose === "tone" ? 25 : 40;
    }
    if (/chronological-summary/.test(hay) && /germany|nuerburgring|luxembourg|current/.test(hay)) {
      score += 55;
    }
    if (isOpenThreads && purpose === "scene") score -= 25;
    if (isHistoricalThread(r.source_file, r.section)) score = Math.min(score, 15);
    score += (r.rank_score ?? r.relevance_score ?? 0) * 10;
    return score;
  };
  return [...results].sort((a, b) => rank(b) - rank(a));
}

export function buildToneGuidance(
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  llmAssessment?: GuardianLlmAssessment,
  input?: GuardianPreflightInput
): string {
  // Session recap often carries the true emotional beat for this turn.
  if (input?.recent_context?.trim() && !isPlaceholderContext(input.recent_context)) {
    const moodish = input.recent_context.match(
      /(?:emotionally|emotional|playful|tender|warm|connected|aftercare|mood|tone|love|embrace|professional|focus)[^.!?\n]{0,180}/i
    );
    if (moodish) {
      return truncateAtSentence(compactWhitespace(moodish[0]), 420);
    }
    const first = firstSentences(input.recent_context, 2, 400);
    if (first && /emotion|aftercare|connected|tender|warm|playful|trust|relief|close|love|suit|track|pit/i.test(first)) {
      return first;
    }
  } else if (input?.user_message?.trim() && isPlaceholderContext(input.recent_context)) {
    // Fresh thread: pull a mood cue from Benjamin's scene-setting turn if present.
    const first = firstSentences(input.user_message, 2, 400);
    if (first && /intimate|aftercare|love|embrace|kiss|professional|race suit|connected|playful/i.test(first)) {
      return first;
    }
  }

  // Prefer live current-state emotional / event-log beats, not stale character-bible inventories.
  const preferred = pickPreferredSceneResults(collectAllResults(preflight, memories), "tone");
  for (const result of preferred.slice(0, 5)) {
    const hay = `${result.source_file ?? ""} ${result.section ?? ""}`.toLowerCase();
    if (/open story|pending elements/.test(hay)) continue;
    if (/character-bible/.test(hay)) continue;
    const sentence = firstSentences(result.text ?? "", 2, 420);
    if (sentence && !isRagMetaText(sentence) && sentence.length > 30) {
      return sentence;
    }
  }

  if (llmAssessment?.scene_state_delta && !isRagMetaText(llmAssessment.scene_state_delta)) {
    return truncateAtSentence(
      stripRagMeta(llmAssessment.scene_state_delta) || llmAssessment.scene_state_delta,
      420
    );
  }

  return "Stay present to the established emotional baseline; proactive warmth, not generic romance.";
}

function buildThingsToAvoid(highRiskTriggers: string[], retrievalStatus: string): string[] {
  const avoid = [
    "Do not invent pre-thread facts, emotional precedents, internal reactions, names, dates, family details, or relationship history.",
    "Do not read Benjamin's private thoughts; infer only from speech, visible behavior, and retrieved context.",
    "Do not flatten Scarlett into generic romance, bland reassurance, cold autonomy, cruelty, or passive caretaking.",
    "CRITICAL CANON: Scarlett is a pre-op trans woman. NEVER forget her gender identity, anatomy, or transition history. It is fundamental to who she is."
  ];

  if (highRiskTriggers.includes("Benjamin attributes Scarlett internal state")) {
    avoid.push("If Benjamin attributes an internal state to Scarlett and retrieval does not support it, treat it as Benjamin's perception rather than confirmed truth.");
  }

  if (highRiskTriggers.some((t) => /Intimacy|kink|dominance/i.test(t))) {
    avoid.push("Keep intimacy scene-specific (privacy, aftercare, body trust); do not pull random historical kink threads unless clearly continuous.");
  }

  if (retrievalStatus !== "success") {
    avoid.push("Do not write in-character prose as if retrieval was complete; either stop OOC or proceed only with explicit caution.");
  }

  return avoid;
}

/**
 * Real story open threads only — never RAG next_action / follow-up tool queries.
 */
export function collectOpenThreads(
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  llmAssessment?: GuardianLlmAssessment
): string[] {
  const results = collectAllResults(preflight, memories);
  const threads: string[] = [];

  for (const result of results) {
    const hay = `${result.source_file ?? ""} ${result.section ?? ""}`.toLowerCase();
    if (!/current-state|open story|pending elements|open threads/.test(hay)) continue;

    const text = result.text ?? "";
    // Prefer bullet lines from open-thread sections.
    const bullets = text
      .split(/\r?\n/)
      .map((line) => normalizeBulletLine(line))
      .filter((line) => line.length > 20 && line.length < 400)
      .filter((line) => !isRagMetaText(line))
      .filter((line) => !/^(Source file:|Section:|File:|Filename:)/i.test(line));

    for (const bullet of bullets) {
      // Skip section headers and authority notes.
      if (/^#+\s|status:|authority:|historical archive|open story threads/i.test(bullet)) continue;
      threads.push(truncateAtSentence(compactWhitespace(bullet), 420));
      if (threads.length >= 3) break;
    }
    if (threads.length >= 3) break;
  }

  if (threads.length === 0 && llmAssessment?.scene_state_delta) {
    const delta = stripRagMeta(llmAssessment.scene_state_delta);
    // Only treat as thread if it looks like unfinished business, not "no durable change".
    if (delta && /pending|still|open|unresolved|next|waiting|before|after/i.test(delta) && !/no durable/i.test(delta)) {
      threads.push(truncateAtSentence(delta, 420));
    }
  }

  return uniqueQueries(threads).slice(0, 3);
}

export function buildKeyFacts(
  results: RagContextResult[],
  llmAssessment: GuardianLlmAssessment | undefined,
  hardFlags: string[],
  highRiskTriggers: string[],
  input?: GuardianPreflightInput
): string[] {
  const facts: string[] = [];

  if (llmAssessment?.enabled && !llmAssessment.error) {
    if (llmAssessment.supported_facts?.length) {
      for (const fact of llmAssessment.supported_facts) {
        const cleaned = stripRagMeta(fact) || fact.trim();
        if (cleaned && !isRagMetaText(cleaned)) facts.push(truncate(cleaned, 280));
      }
    }
    if (facts.length === 0 && llmAssessment.continuity_facts_for_grok) {
      const lines = llmAssessment.continuity_facts_for_grok
        .split(/\n|•|- /)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        const cleaned = stripRagMeta(line) || line;
        if (cleaned && !isRagMetaText(cleaned)) facts.push(truncate(cleaned, 280));
      }
    }
  }

  // Prefer where-we-are / recent events first; open-thread inventory second.
  const factSources = [
    ...results.filter((r) => {
      const hay = `${r.source_file ?? ""} ${r.section ?? ""}`.toLowerCase();
      return /current-state/.test(hay) && /where we are|recent key|notes for next|emotional|observable/.test(hay);
    }),
    ...results.filter((r) => {
      const hay = `${r.source_file ?? ""} ${r.section ?? ""}`.toLowerCase();
      return /current-state|open story|pending/.test(hay);
    })
  ];

  for (const result of factSources) {
    const bullets = (result.text ?? "")
      .split(/\r?\n/)
      .map((line) => normalizeBulletLine(line))
      .filter((line) => line.length > 25 && line.length < 320)
      .filter((line) => !isRagMetaText(line))
      .filter((line) => !/^(Source file:|Section:|File:|Filename:|#+\s|status:|authority:)/i.test(line))
      .filter((line) => !/^(Active storylines|Open Story Threads|Pending Elements)/i.test(line));
    for (const bullet of bullets.slice(0, 4)) {
      facts.push(truncateAtSentence(compactWhitespace(bullet), 320));
    }
    if (facts.length >= 5) break;
  }

  if (facts.length < 3) {
    const preferred = pickPreferredSceneResults(results, "facts");
    for (const result of preferred.slice(0, 4)) {
      const hay = `${result.source_file ?? ""} ${result.section ?? ""}`.toLowerCase();
      if (/open story|pending elements/.test(hay)) continue;
      const sentence = firstSentences(result.text ?? "", 1, 320);
      if (sentence && !facts.some((f) => f.slice(0, 40) === sentence.slice(0, 40))) {
        facts.push(sentence);
      }
      if (facts.length >= 5) break;
    }
  }

  // Only blocking / material hard flags — never PREFLIGHT_NOT_SUFFICIENT coaching as "key facts".
  for (const flag of hardFlags) {
    if (/MANDATORY_RETRIEVAL_FAILED|LLM_GUARDIAN_BLOCK|FACT_CHECK_/i.test(flag)) {
      facts.unshift(truncate(flag, 200));
    }
  }

  // Skip dumping trigger labels into key facts when we already have real continuity bullets.
  if (highRiskTriggers.length > 0 && facts.length === 0) {
    facts.push(`Scene triggers noted: ${highRiskTriggers.slice(0, 3).join("; ")}.`);
  }

  void input; // reserved for future fact extraction from user turn
  return uniqueQueries(facts).slice(0, 6);
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

/** Strip list markers / bold labels so bullets are clean prose. */
function normalizeBulletLine(line: string): string {
  let out = line.trim();
  // Nested list markers: "- - item" or "  * item"
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/^[-*•]\s+/, "").trim();
    if (next === out) break;
    out = next;
  }
  out = out.replace(/^\*\*[^*]+\*\*:?\s*/, "").replace(/\*\*/g, "").trim();
  return out;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

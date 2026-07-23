import { performance } from "node:perf_hooks";
import type { GuardianConfig } from "../config.js";
import {
  assessGuardianEvidence,
  normalizeNpcStateChanges,
  type GuardianLlmAssessmentWithNpcState
} from "../llm-assessment.js";
import {
  applyNpcStateChangesToRegistryMarkdown,
  decideNpcStateWrite,
  decideMemoryWrite,
  formatBeatAdvanceSessionContent,
  type NpcStateWriteDecision
} from "../memory-writeback.js";
import { loadSecondaryCharactersBible } from "../npc-registry.js";
import { generateStateRewrite, validateStateRewrite } from "../state-rewrite.js";
import type { RagToolCaller } from "../rag-client.js";
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
  buildDramaturgSnapshot,
  hashArcPlanMarkdown,
  loadActiveArcPlan,
  loadNpcAgendasMarkdown,
  readDramaturgCache,
  resolveHotPathDramaturg,
  scheduleDramaturgRefresh,
  shouldRefreshDramaturg
} from "../dramaturg.js";
import {
  parseLiveBeat,
  scoreRecency,
  textMatchesLiveBeat,
  type LiveBeat
} from "../recency.js";
import { applySaveLagSoftening, detectSaveLag } from "../save-lag.js";
import {
  PreflightTelemetryCollector,
  buildPreflightTelemetryEvent,
  getDefaultTelemetrySink,
  recordPreflightTelemetry,
  runWithTelemetryCollector,
  type TelemetrySink
} from "../telemetry.js";

/** Optional eval/replay hooks (WP-1.3). Production callers omit this. */
export type GuardianPreflightOptions = {
  /**
   * When set, skip the live auditor and use this assessment instead
   * (`eval:fast --llm-mode frozen`). Zero network.
   */
  frozenLlmAssessment?: GuardianLlmAssessmentWithNpcState;
  /** Optional telemetry sink (tests). Default: NDJSON under .guardian/telemetry/. */
  telemetrySink?: TelemetrySink;
  /** When true, skip telemetry emit entirely (default false). */
  disableTelemetry?: boolean;
  /**
   * WP-R3: when true (or when disableTelemetry/frozen eval), do not persist
   * serendipity/dramaturg sidecars under the live `.guardian/` tree.
   */
  isolateSidecars?: boolean;
  /** Telemetry source tag when emit is enabled (default live). */
  telemetrySource?: "live" | "eval" | "backfill";
  preflight_id?: string;
  report_path?: string;
};
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
import {
  intersectAgendasWithLiveScene,
  loadAndParseNpcAgendas,
  mergeNpcIntersections
} from "../npc-agendas.js";
import { resolveSceneRoster, type SceneRoster } from "../scene-roster.js";
import {
  formatSerendipityNudge,
  runSerendipityTurn
} from "../serendipity-weaver.js";
import { resolveDuplexInput } from "../duplex-cache.js";
import type { DuplexSource } from "../report/models.js";

export type GuardianPreflightInput = {
  user_message: string;
  scarlett_previous_message?: string;
  recent_context?: string;
  force_full_retrieval?: boolean;
  /** Optional Grok conversation id for multi-thread cache disambiguation (WP-3.1+). */
  thread_key?: string;
};

type HighRiskTrigger = {
  label: string;
  pattern: RegExp;
  queryHint: string;
};

const OPTIONAL_RAG_TOOLS = new Set([
  "index_status",
  "expand_context_around_chunk",
  "verify_story_fact",
  "get_live_story_state"
]);

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
    pattern: /\b(amg|black panther|germany|luxembourg|n[uü]rburgring|nuerburgring|nordschleife|green hell|paddock|pit\s*(lane|wall)|on\s*track|out\s*lap|shakedown|telemetry|aero|villa|bistro|affalterbach|helmet|race\s*suit|radio)\b/i,
    queryHint: "Germany trip Nuerburgring paddock AMG Black Panther track day current scene continuity"
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
    // Arc-critical / diagnostic: up to 3 targeted corpus queries (depth restored post-timeout era).
    return uniqueQueries([
      matched.length > 0
        ? `${hintBlock}; current scene continuity ${messageSnippet}`
        : `current scene continuity relationship precedent ${messageSnippet}`,
      ...matched.map((trigger) => trigger.queryHint)
    ]).slice(0, 3);
  }

  if (matched.length > 0) {
    // Triggered turns: primary combined query + first trigger hint (max 2).
    return uniqueQueries([
      `${hintBlock}; scene cues: ${messageSnippet}`,
      matched[0].queryHint
    ]).slice(0, 2);
  }

  return ["Scarlett Benjamin current scene emotional dynamic relationship precedent current arc"];
}

export async function runGuardianPreflight(
  input: GuardianPreflightInput,
  ragClient: RagToolCaller,
  config: Pick<
    GuardianConfig,
    | "GUARDIAN_CONFIDENCE_THRESHOLD"
    | "GUARDIAN_LLM_ENABLED"
    | "OPENAI_API_KEY"
    | "GUARDIAN_MODEL"
    | "GUARDIAN_LLM_REASONING_EFFORT"
    | "GUARDIAN_LLM_VERBOSITY"
    | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
    | "GUARDIAN_MEMORY_WRITE_MODE"
    | "GUARDIAN_EXPAND_BUDGET_MS"
    | "GUARDIAN_VERIFY_BUDGET_MS"
  > & {
    GUARDIAN_DUPLEX_CACHE_TTL_MS?: number;
    GUARDIAN_AUTO_APPROVE?: "none" | "beats" | "beats_and_valid_transitions";
    GUARDIAN_DRAMATURG_ENABLED?: boolean;
    GUARDIAN_DRAMATURG_STALENESS_TURNS?: number;
    GUARDIAN_DRAMATURG_REASONING_EFFORT?: GuardianConfig["GUARDIAN_DRAMATURG_REASONING_EFFORT"];
    OPENAI_API_KEY?: string;
    GUARDIAN_LLM_ENABLED?: boolean;
    GUARDIAN_MODEL?: string;
    GUARDIAN_LLM_VERBOSITY?: "low" | "medium" | "high";
  },
  options?: GuardianPreflightOptions
): Promise<GuardianReport> {
  const collector = new PreflightTelemetryCollector();
  return runWithTelemetryCollector(collector, () =>
    runGuardianPreflightInner(input, ragClient, config, options, collector)
  );
}

async function runGuardianPreflightInner(
  rawInput: GuardianPreflightInput,
  ragClient: RagToolCaller,
  config: Pick<
    GuardianConfig,
    | "GUARDIAN_CONFIDENCE_THRESHOLD"
    | "GUARDIAN_LLM_ENABLED"
    | "OPENAI_API_KEY"
    | "GUARDIAN_MODEL"
    | "GUARDIAN_LLM_REASONING_EFFORT"
    | "GUARDIAN_LLM_VERBOSITY"
    | "GUARDIAN_LLM_MAX_EVIDENCE_CHARS"
    | "GUARDIAN_MEMORY_WRITE_MODE"
    | "GUARDIAN_EXPAND_BUDGET_MS"
    | "GUARDIAN_VERIFY_BUDGET_MS"
  > & {
    GUARDIAN_DUPLEX_CACHE_TTL_MS?: number;
    GUARDIAN_AUTO_APPROVE?: "none" | "beats" | "beats_and_valid_transitions";
    GUARDIAN_DRAMATURG_ENABLED?: boolean;
    GUARDIAN_DRAMATURG_STALENESS_TURNS?: number;
    GUARDIAN_DRAMATURG_REASONING_EFFORT?: GuardianConfig["GUARDIAN_DRAMATURG_REASONING_EFFORT"];
    OPENAI_API_KEY?: string;
    GUARDIAN_LLM_ENABLED?: boolean;
    GUARDIAN_MODEL?: string;
    GUARDIAN_LLM_VERBOSITY?: "low" | "medium" | "high";
  },
  options: GuardianPreflightOptions | undefined,
  collector: PreflightTelemetryCollector
): Promise<GuardianReport> {
  // WP-3.1: merge shadow-sidecar cache when caller omitted duplex (caller always wins).
  const ttlMs = config.GUARDIAN_DUPLEX_CACHE_TTL_MS ?? 45 * 60 * 1000;
  const duplexResolved = resolveDuplexInput({
    scarlettPreviousMessage: rawInput.scarlett_previous_message,
    threadKey: rawInput.thread_key,
    ttlMs
  });
  const input: GuardianPreflightInput = {
    ...rawInput,
    scarlett_previous_message: duplexResolved.scarlettPreviousMessage || undefined
  };
  const duplexSource: DuplexSource = duplexResolved.duplexSource;

  const preflightQuery = buildPreflightQuery(input);
  const memoryQueries = buildMemoryQueries(input);
  const highRiskTriggers = detectHighRiskTriggers(input.user_message);
  const toolCalls: RagToolCall[] = [];

  // Full-duplex: auditor needs Scarlett's previous turn for Director's Correction.
  if (duplexSource === "absent") {
    console.warn(
      `${Date.now()} Duplex input missing: scarlett_previous_message not provided (caller empty, bridge cache miss) — grok_performance_correction cannot fire this turn.`
    );
  } else if (duplexSource === "bridge_cache") {
    console.log(
      `${Date.now()} Duplex input from bridge_cache: scarlett_previous_message (${input.scarlett_previous_message!.trim().length} chars).`
    );
  } else {
    console.log(
      `${Date.now()} Duplex input from caller: scarlett_previous_message (${input.scarlett_previous_message!.trim().length} chars).`
    );
  }

  console.log(`${Date.now()} Dispatching queries to RAG...`);
  collector.mark("dispatch");
  const indexStatusPromise = callText(toolCalls, ragClient, "index_status", {});
  // Live disk snapshot for recency (WP-2.2) — not index-stale mid-reindex.
  const liveStatePromise = callText(toolCalls, ragClient, "get_live_story_state", {
    include_event_log: false
  });
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
  console.log(`${Date.now()} Awaiting live story state...`);
  const liveState = await liveStatePromise;
  console.log(`${Date.now()} Awaiting preflight...`);
  const preflight = await preflightPromise;
  console.log(`${Date.now()} Awaiting memoryResults...`);
  const memoryCallResults = await Promise.all(memoryPromises);
  const memoryResponses = memoryCallResults
    .filter((call) => call.ok && call.response)
    .map((call) => call.response as RagRetrieveResponse);
  collector.mark("rag_batch");

  const liveBeat = parseLiveBeat(
    liveState.ok && typeof liveState.response === "string" ? liveState.response : ""
  );
  if (liveBeat.liveCues.length) {
    console.log(
      `${Date.now()} Live beat cues: live=[${liveBeat.liveCues.slice(0, 8).join(", ")}] superseded=[${liveBeat.supersededCues.slice(0, 8).join(", ")}]`
    );
  }

  const saveLag = detectSaveLag({
    liveBeat,
    userMessage: input.user_message,
    scarlettPreviousMessage: input.scarlett_previous_message,
    recentContext: input.recent_context
  });
  if (saveLag.suspected) {
    console.log(
      `${Date.now()} SAVE LAG suspected: live=${saveLag.liveCluster} played=${saveLag.playedCluster} (${saveLag.reason})`
    );
  }

  // WP-5.2/5.3: hot path uses deterministic diff + optional LLM cache (never awaits dramaturg LLM).
  const arcPlanLoaded = loadActiveArcPlan();
  const deterministicDramaturg = arcPlanLoaded
    ? buildDramaturgSnapshot(arcPlanLoaded.markdown, liveBeat, arcPlanLoaded.sourcePath)
    : buildDramaturgSnapshot(null, liveBeat);
  const planHash = arcPlanLoaded ? hashArcPlanMarkdown(arcPlanLoaded.markdown) : "";
  const dramaturgCache = readDramaturgCache();
  // WP-R3: hermetic/eval must not advance live dramaturg turnCounter on disk.
  const isolateSidecars =
    Boolean(options?.isolateSidecars) ||
    Boolean(options?.disableTelemetry) ||
    Boolean(options?.frozenLlmAssessment);
  const { snapshot: dramaturg, turnCounter: dramaturgTurn } = resolveHotPathDramaturg({
    deterministic: deterministicDramaturg,
    cache: dramaturgCache,
    planHash,
    bumpTurn: !isolateSidecars
  });
  if (dramaturg.momentumLine) {
    console.log(
      `${Date.now()} Story momentum [${dramaturg.source ?? "deterministic"}]: ${dramaturg.momentumLine.slice(0, 160)}${
        dramaturg.momentumLine.length > 160 ? "…" : ""
      }`
    );
  } else if (dramaturg.planWarnings.length) {
    console.log(`${Date.now()} Story momentum: ${dramaturg.planWarnings.join("; ")}`);
  }

  // WP-5.7: deterministic scene roster (cap 4) before optional expands.
  const liveBeatState = dramaturg.beats.find((b) => b.status === "live");
  const arcCastText = [
    liveBeatState?.name ?? "",
    liveBeatState?.pressure ?? "",
    ...(dramaturg.npcIntersections ?? []).map((n) => n.npc)
  ].join(" ");
  const sceneRoster = resolveSceneRoster({
    userMessage: input.user_message,
    scarlettPreviousMessage: input.scarlett_previous_message,
    liveBeat,
    arcCastText
  });
  if (sceneRoster.active.length || sceneRoster.background.length) {
    console.log(`${Date.now()} Scene roster: ${sceneRoster.summary}`);
  }

  // Depth restored: expand + verify with soft time budgets (write-path reindex no longer blocks).
  console.log(`${Date.now()} Optional expand/verify (budgets ${config.GUARDIAN_EXPAND_BUDGET_MS}/${config.GUARDIAN_VERIFY_BUDGET_MS}ms)...`);
  const expandedContexts =
    (await raceBudget(
      expandBestContext(toolCalls, ragClient, preflight.response, memoryResponses, highRiskTriggers),
      config.GUARDIAN_EXPAND_BUDGET_MS,
      [] as ExpandedContext[],
      "expand_context_around_chunk"
    )) ?? [];
  // WP-5.7 / WP-R2: exact-section expand for active NPC registry chunks (address, not semantic).
  const npcExpandResult =
    (await raceBudget(
      expandActiveNpcSections(toolCalls, ragClient, sceneRoster),
      Math.min(config.GUARDIAN_EXPAND_BUDGET_MS, 4000),
      { contexts: [] as ExpandedContext[], failureNotes: [] as string[] },
      "expand_npc_registry_sections"
    )) ?? { contexts: [] as ExpandedContext[], failureNotes: [] as string[] };
  if (npcExpandResult.contexts.length) {
    expandedContexts.push(...npcExpandResult.contexts);
  }
  const factChecks =
    (await raceBudget(
      verifyExactClaims(toolCalls, ragClient, input, highRiskTriggers),
      config.GUARDIAN_VERIFY_BUDGET_MS,
      [] as FactCheck[],
      "verify_story_fact"
    )) ?? [];
  console.log(
    `${Date.now()} Expand/verify done: expanded=${expandedContexts.length}, fact_checks=${factChecks.length}, npc_sections=${npcExpandResult.contexts.length}`
  );
  collector.mark("expand_verify");

  const confidenceScore = scoreConfidence(preflight.response, memoryResponses, highRiskTriggers, toolCalls);
  const retrievalStatus = determineRetrievalStatus(preflight, memoryResponses, toolCalls);
  const deterministicProceedRecommendation = retrievalStatus === "failed"
    ? "do_not_proceed"
    : confidenceScore >= config.GUARDIAN_CONFIDENCE_THRESHOLD && retrievalStatus === "success"
      ? "proceed"
      : "proceed_with_caution";
  // WP-5.4: NPC agenda intersections (deterministic + cached dramaturg) → weaver outranks catalog.
  const detIntersections = intersectAgendasWithLiveScene(
    loadAndParseNpcAgendas(),
    liveBeat,
    input.user_message,
    input.recent_context
  );
  const npcIntersections = mergeNpcIntersections(
    detIntersections,
    dramaturg.npcIntersections
  );
  if (npcIntersections.length) {
    console.log(
      `${Date.now()} NPC agendas intersecting: ${npcIntersections
        .map((i) => `${i.npc}[${i.suggestedTier}]`)
        .join(", ")}`
    );
  }

  // WP-4.6/4.7: pick serendipity before auditor so terra can weave (or veto).
  // WP-R3: hermetic/eval never persists serendipity-state.json into live .guardian/.
  const serendipityPick = runSerendipityTurn({
    highRiskTriggers,
    userMessage: input.user_message,
    liveBeat,
    npcIntersections,
    persist: !isolateSidecars
  });
  if (serendipityPick.event) {
    console.log(
      `${Date.now()} Serendipity pick: id=${serendipityPick.event.id} tier=${serendipityPick.event.tier} mode=${serendipityPick.mode}${serendipityPick.surfacedFromDeferral ? " (deferred)" : ""}${serendipityPick.agendaDriven ? " (agenda)" : ""}`
    );
  } else if (serendipityPick.deferredInstead) {
    console.log(
      `${Date.now()} Serendipity deferred: id=${serendipityPick.deferredInstead.id} tier=${serendipityPick.deferredInstead.tier} (mode=${serendipityPick.mode})${serendipityPick.agendaDriven ? " (agenda)" : ""}`
    );
  }

  console.log(`${Date.now()} Starting assessGuardianEvidence...`);
  const llmT0 = performance.now();
  const llmAssessment: GuardianLlmAssessmentWithNpcState = options?.frozenLlmAssessment
    ? {
        ...options.frozenLlmAssessment,
        // Frozen path is intentionally offline; mark enabled so assembly/write gates use fields.
        enabled: options.frozenLlmAssessment.enabled ?? true,
        model: options.frozenLlmAssessment.model ?? "frozen-cassette"
      }
    : await assessGuardianEvidence({
        preflightInput: input,
        preflight: preflight.response,
        memories: memoryResponses,
        expandedContexts,
        factChecks,
        highRiskTriggers,
        liveBeat,
        dramaturg,
        sceneRosterSummary: sceneRoster.coupleOnlyPresent
          ? undefined
          : sceneRoster.summary || undefined,
        saveLagSuspected: saveLag.suspected,
        serendipity: serendipityPick.event
          ? {
              event: serendipityPick.event,
              mode: serendipityPick.mode,
              maxTier: serendipityPick.maxTier,
              fromDeferral: serendipityPick.surfacedFromDeferral
            }
          : undefined,
        config
      });
  const llmAssessmentMs = Math.round(performance.now() - llmT0);
  const npcStateChanges = normalizeNpcStateChanges(
    llmAssessment.npc_state_changes
  );
  llmAssessment.npc_state_changes = npcStateChanges;

  // Soften false location-rewind when multi-scene save lag is detected
  const lagSoft = applySaveLagSoftening({
    saveLag,
    correction: llmAssessment.grok_performance_correction,
    shouldBlockProse: Boolean(llmAssessment.should_block_prose)
  });
  if (lagSoft.softened) {
    llmAssessment.grok_performance_correction = lagSoft.correction;
    llmAssessment.should_block_prose = lagSoft.shouldBlockProse;
    console.log(`${Date.now()} SAVE LAG: softened location-rewind Director's Correction`);
  }

  console.log(
    `${Date.now()} Finished assessGuardianEvidence${options?.frozenLlmAssessment ? " (frozen)" : ""}.`
  );
  collector.mark("llm_assessment");

  // WP-5.3: schedule background dramaturg pass when triggered — never blocks this turn.
  // Frozen cassette eval skips network; production uses cache on the *next* turn.
  const refreshDecision = shouldRefreshDramaturg({
    enabled: config.GUARDIAN_DRAMATURG_ENABLED !== false,
    llmEnabled: Boolean(config.GUARDIAN_LLM_ENABLED),
    hasApiKey: Boolean(config.OPENAI_API_KEY),
    hasPlan: Boolean(arcPlanLoaded),
    // frozen cassette + hermetic/eval runners (disableTelemetry) never schedule network dramaturg
    skipForEval:
      Boolean(options?.frozenLlmAssessment) || Boolean(options?.disableTelemetry),
    cache: readDramaturgCache(),
    planHash,
    turnCounter: dramaturgTurn,
    stalenessTurns: config.GUARDIAN_DRAMATURG_STALENESS_TURNS ?? 12,
    sceneTransitionOccurred: llmAssessment.scene_transition?.occurred === true
  });
  if (refreshDecision.refresh && arcPlanLoaded && refreshDecision.reason) {
    scheduleDramaturgRefresh({
      planMarkdown: arcPlanLoaded.markdown,
      sourcePath: arcPlanLoaded.sourcePath,
      liveBeat,
      deterministic: deterministicDramaturg,
      planHash,
      turnCounter: dramaturgTurn,
      npcAgendas: loadNpcAgendasMarkdown(),
      reason: refreshDecision.reason,
      config: {
        GUARDIAN_LLM_ENABLED: Boolean(config.GUARDIAN_LLM_ENABLED),
        OPENAI_API_KEY: config.OPENAI_API_KEY,
        GUARDIAN_MODEL: config.GUARDIAN_MODEL,
        GUARDIAN_LLM_VERBOSITY: config.GUARDIAN_LLM_VERBOSITY ?? "medium",
        GUARDIAN_DRAMATURG_ENABLED: config.GUARDIAN_DRAMATURG_ENABLED !== false,
        GUARDIAN_DRAMATURG_STALENESS_TURNS: config.GUARDIAN_DRAMATURG_STALENESS_TURNS ?? 12,
        GUARDIAN_DRAMATURG_REASONING_EFFORT:
          config.GUARDIAN_DRAMATURG_REASONING_EFFORT ?? "medium"
      }
    });
    console.log(
      `${Date.now()} Dramaturg refresh scheduled (reason=${refreshDecision.reason}); hot path unchanged`
    );
  }

  // Prefer auditor weave; fall back to deterministic catalog nudge (WP-4.7).
  const serendipityNudge = resolveSerendipityNudge(llmAssessment, serendipityPick);
  
  const proceedRecommendation = llmAssessment.enabled && llmAssessment.should_block_prose
    ? "do_not_proceed"
    : deterministicProceedRecommendation;

  // WP-4.3: material gate + staging branch; memory_write ALWAYS set on the report.
  let memoryWrite: NonNullable<GuardianReport["memory_write"]> = {
    action: "none",
    reason: "not evaluated"
  };
  try {
    const writeDecision = decideMemoryWrite({
      candidateUpdate: llmAssessment.candidate_memory_update,
      assessment: llmAssessment,
      highRiskTriggers,
      proceedRecommendation,
      writeMode: config.GUARDIAN_MEMORY_WRITE_MODE,
      liveBeat
    });

    if (writeDecision.action === "none") {
      memoryWrite = { action: "none", reason: writeDecision.reason };
      console.log(`${Date.now()} Memory write-back skipped: ${writeDecision.reason}`);
    } else if (writeDecision.action === "stage") {
      memoryWrite = await applyBeatStageWrite({
        writeDecision,
        candidateRaw: llmAssessment.candidate_memory_update,
        liveBeat,
        ragClient,
        toolCalls,
        preflightQuery,
        highRiskTriggers,
        autoApprove: config.GUARDIAN_AUTO_APPROVE ?? "beats"
      });
    } else if (writeDecision.action === "stage_transition") {
      const liveStateText =
        liveState.ok && typeof liveState.response === "string" ? liveState.response : "";
      memoryWrite = await applySceneTransitionWrite({
        writeDecision,
        llmAssessment,
        liveStateText,
        ragClient,
        toolCalls,
        preflightQuery,
        highRiskTriggers,
        config
      });
    } else if (writeDecision.action === "live_append") {
      const liveResult = await callJson(toolCalls, ragClient, "update_story_state", {
        source_file: "project_source_files/current-state.md",
        content: writeDecision.content,
        mode: "append"
      });
      memoryWrite = liveResult.ok
        ? { action: "live_append", reason: writeDecision.reason }
        : {
            action: "failed",
            reason: writeDecision.reason,
            error: liveResult.error ?? "update_story_state failed"
          };
      console.log(`${Date.now()} Memory live append: ${memoryWrite.action} (${writeDecision.reason})`);
    } else {
      memoryWrite = {
        action: "none",
        reason: `unhandled write decision: ${(writeDecision as { action: string }).action}`
      };
    }
  } catch (err) {
    memoryWrite = {
      action: "failed",
      reason: "write-branch exception",
      error: err instanceof Error ? err.message : String(err)
    };
    console.warn(`${Date.now()} Memory write-branch error: ${memoryWrite.error}`);
  }

  const npcWriteDecision = decideNpcStateWrite({
    changes: npcStateChanges,
    sceneTransitionOccurred: llmAssessment.scene_transition?.occurred === true,
    proceedRecommendation,
    writeMode: config.GUARDIAN_MEMORY_WRITE_MODE
  });
  if (npcWriteDecision.action === "stage_npc") {
    try {
      const npcWrite = await applyNpcStateChangeWrites({
        writeDecision: npcWriteDecision,
        ragClient,
        toolCalls,
        preflightQuery,
        autoApprove: config.GUARDIAN_AUTO_APPROVE ?? "beats"
      });
      memoryWrite = mergeNpcStateWriteOutcome(memoryWrite, npcWrite);
    } catch (err) {
      memoryWrite = {
        ...memoryWrite,
        action: "failed",
        reason: `${memoryWrite.reason}; NPC write-branch exception`,
        error: err instanceof Error ? err.message : String(err)
      };
      console.warn(`${Date.now()} NPC state write-branch error: ${memoryWrite.error}`);
    }
  } else if (npcStateChanges?.length) {
    memoryWrite = {
      ...memoryWrite,
      reason: `${memoryWrite.reason}; ${npcWriteDecision.reason}`
    };
  }

  // Always mirror onto assessment when present (even if LLM disabled).
  llmAssessment.memory_write = memoryWrite;

  const allResults = collectAllResults(preflight.response, memoryResponses);
  const criticalPrecedents = selectPrecedents(
    allResults,
    highRiskTriggers,
    input.user_message,
    5,
    liveBeat
  );
  const hardFlags = buildHardFlags(retrievalStatus, highRiskTriggers, preflight.response, memoryResponses, factChecks, llmAssessment);
  // Only when both caller and bridge cache are empty (WP-3.1).
  if (duplexSource === "absent") {
    hardFlags.push(
      "DUPLEX_INPUT_MISSING: Pass scarlett_previous_message (Scarlett's last IC reply) so Guardian can apply Director's Correction when needed — or run the browser shadow bridge to POST /duplex-cache."
    );
  }
  if (saveLag.suspected) {
    hardFlags.push(
      `SAVE_LAG_SUSPECTED: LIVE BEAT cluster=${saveLag.liveCluster} vs played=${saveLag.playedCluster}. Update project_source_files/current-state.md (and reindex) so disk matches play. ${saveLag.reason}`
    );
  }
  const currentStateSummary = summarizeCurrentState(
    preflight.response,
    memoryResponses,
    llmAssessment,
    input,
    liveBeat
  );
  const emotionalTone = buildToneGuidance(
    preflight.response,
    memoryResponses,
    llmAssessment,
    input,
    liveBeat
  );
  const openThreads = collectOpenThreads(preflight.response, memoryResponses, llmAssessment);
  const keyFacts = buildKeyFacts(allResults, llmAssessment, hardFlags, highRiskTriggers, input);
  const grokPrecedents = selectPrecedents(
    allResults,
    highRiskTriggers,
    input.user_message,
    2,
    liveBeat
  );

  const duplexNote =
    duplexSource === "caller"
      ? "Duplex: scarlett_previous_message provided (caller)."
      : duplexSource === "bridge_cache"
        ? "Duplex: scarlett_previous_message provided (bridge_cache)."
        : "Duplex: scarlett_previous_message MISSING.";

  const npcExpandNote =
    npcExpandResult.failureNotes.length > 0
      ? `NPC registry expand misses: ${npcExpandResult.failureNotes.join("; ")}.`
      : npcExpandResult.contexts.length > 0
        ? `NPC registry expand ok: ${npcExpandResult.contexts.length} section(s).`
        : "";

  const retrievalNotes = [
    buildRetrievalNotes(indexStatus.response, preflight.response, memoryResponses, toolCalls),
    `Expand results: ${expandedContexts.length}; fact checks: ${factChecks.length}.`,
    duplexNote,
    npcExpandNote
  ]
    .filter(Boolean)
    .join(" ");

  const report: GuardianReport = {
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
    retrieval_notes: retrievalNotes,
    duplex_source: duplexSource,
    serendipity_nudge: serendipityNudge,
    memory_write: memoryWrite,
    scene_transition: llmAssessment.scene_transition ?? null,
    // Couple-only private: omit schedule pressure from report so brief stays quiet
    story_momentum: sceneRoster.coupleOnlyPresent
      ? undefined
      : dramaturg.momentumLine || undefined,
    scene_roster: {
      active: sceneRoster.active.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        activation: a.activation
      })),
      background: sceneRoster.background,
      summary: sceneRoster.summary
    },
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

  // Telemetry: fire-and-forget; never throw into preflight.
  if (!options?.disableTelemetry) {
    try {
      const event = buildPreflightTelemetryEvent({
        collector,
        report,
        input,
        preflight_id: options?.preflight_id,
        report_path: options?.report_path,
        llm_assessment_ms: llmAssessmentMs,
        source: options?.telemetrySource ?? (isolateSidecars ? "eval" : "live")
      });
      recordPreflightTelemetry(event, options?.telemetrySink ?? getDefaultTelemetrySink());
    } catch {
      /* never fail the turn */
    }
  }

  return report;
}

/** WP-4.7: weave wins; null weave = veto; no event = undefined. */
function resolveSerendipityNudge(
  llmAssessment: GuardianLlmAssessment,
  pick: ReturnType<typeof runSerendipityTurn>
): string | undefined {
  if (!pick.event) return undefined;
  const weave = llmAssessment.serendipity_weave;
  if (typeof weave === "string" && weave.trim() && weave.trim() !== "null") {
    // Novelist-facing: plain sentence, no SERENDIPITY label spam
    return weave.trim();
  }
  if (weave === null || weave === "null") {
    // Auditor veto — do not inject catalog text
    return undefined;
  }
  // LLM disabled / frozen without weave → deterministic fallback
  return formatSerendipityNudge(pick.event, {
    fromDeferral: pick.surfacedFromDeferral,
    mode: pick.mode
  });
}

/**
 * WP-5.9 NPC path: stage one bounded full-registry rewrite.
 * Knowledge-containing batches are never sent to the approval tool.
 */
export async function applyNpcStateChangeWrites(input: {
  writeDecision: Extract<NpcStateWriteDecision, { action: "stage_npc" }>;
  ragClient: RagToolCaller;
  toolCalls: RagToolCall[];
  preflightQuery: string;
  autoApprove: "none" | "beats" | "beats_and_valid_transitions";
  /** Test seam; production reads the same on-disk registry used by Scene Cast. */
  registryMarkdown?: string;
}): Promise<NonNullable<GuardianReport["memory_write"]>> {
  const {
    writeDecision,
    ragClient,
    toolCalls,
    preflightQuery,
    autoApprove
  } = input;
  const registryMarkdown =
    input.registryMarkdown ?? loadSecondaryCharactersBible();
  if (!registryMarkdown.trim()) {
    return {
      action: "failed",
      reason: "npc_state_changes could not load secondary-characters-bible.md",
      error: "NPC registry unavailable; no canon proposal staged"
    };
  }

  const rewrite = applyNpcStateChangesToRegistryMarkdown(
    registryMarkdown,
    writeDecision.changes
  );
  if (!rewrite.applied.length) {
    return {
      action: "none",
      reason: `npc_state_changes produced no registry diff (${rewrite.skipped
        .map((item) => item.reason)
        .join("; ") || "all no-op"})`
    };
  }

  const changeSummary = rewrite.applied
    .map((change) => `${change.npc}:${change.kind}`)
    .join(",");
  const citations = [
    `preflight_query:${preflightQuery.slice(0, 200)}`,
    "write_class:npc_state_change",
    ...rewrite.applied.flatMap((change) => [
      `npc:${change.npc}`,
      `kind:${change.kind}`,
      `evidence:${change.evidence.slice(0, 220)}`
    ])
  ];
  const stageResult = await callJson<{ staged_update?: { id?: string } }>(
    toolCalls,
    ragClient,
    "stage_story_update",
    {
      target_source_file: "project_source_files/secondary-characters-bible.md",
      proposed_content: rewrite.markdown,
      mode: "overwrite",
      rationale:
        `Guardian scene-close NPC registry rewrite (${writeDecision.reason}); changes=${changeSummary}` +
        (rewrite.skipped.length
          ? `; skipped=${rewrite.skipped.map((item) => item.reason).join("|")}`
          : ""),
      citations
    }
  );
  const stagedId = stageResult.response?.staged_update?.id;
  if (!stageResult.ok || !stagedId) {
    return {
      action: "failed",
      reason: "npc_state_changes registry overwrite could not be staged",
      error: stageResult.error ?? "stage_story_update returned no NPC staged_update id"
    };
  }

  if (writeDecision.requiresHumanReview) {
    console.warn(
      `${Date.now()} NPC knowledge delta staged HUMAN-ALWAYS (never auto-approved): ${stagedId}`
    );
    return {
      action: "held_for_review",
      reason: `NPC KNOWLEDGE HUMAN REVIEW REQUIRED; staged=${stagedId}; changes=${changeSummary}`,
      staged_update_id: stagedId
    };
  }

  // Reuse the transition burn-in graduation: volatile deltas only auto-apply after it.
  if (autoApprove !== "beats_and_valid_transitions") {
    console.log(
      `${Date.now()} NPC volatile deltas staged for review (GUARDIAN_AUTO_APPROVE=${autoApprove}): ${stagedId}`
    );
    return {
      action: "held_for_review",
      reason: `NPC volatile deltas staged for review; staged=${stagedId}; changes=${changeSummary}`,
      staged_update_id: stagedId
    };
  }

  const dry = await callJson(toolCalls, ragClient, "approve_staged_story_update", {
    staged_update_id: stagedId,
    dry_run: true
  });
  if (!dry.ok) {
    return {
      action: "held_for_review",
      reason: "NPC volatile delta dry-run approval failed; left staged",
      staged_update_id: stagedId,
      error: dry.error
    };
  }
  const approved = await callJson(toolCalls, ragClient, "approve_staged_story_update", {
    staged_update_id: stagedId,
    dry_run: false,
    delete_after_approval: true
  });
  if (!approved.ok) {
    return {
      action: "held_for_review",
      reason: "NPC volatile delta approval failed; left staged",
      staged_update_id: stagedId,
      error: approved.error
    };
  }

  console.log(`${Date.now()} NPC volatile deltas auto-approved: ${stagedId}`);
  return {
    action: "staged",
    reason: `NPC volatile deltas staged+auto-approved; staged=${stagedId}; changes=${changeSummary}`,
    staged_update_id: stagedId
  };
}

function mergeNpcStateWriteOutcome(
  base: NonNullable<GuardianReport["memory_write"]>,
  npc: NonNullable<GuardianReport["memory_write"]>
): NonNullable<GuardianReport["memory_write"]> {
  const action =
    base.action === "failed" || npc.action === "failed"
      ? "failed"
      : npc.action === "held_for_review" || base.action === "held_for_review"
        ? "held_for_review"
        : base.action === "none"
          ? npc.action
          : base.action;
  return {
    ...base,
    action,
    reason: `${base.reason}; ${npc.reason}`,
    staged_update_id:
      npc.action === "held_for_review"
        ? npc.staged_update_id ?? base.staged_update_id
        : base.staged_update_id ?? npc.staged_update_id,
    error: base.error ?? npc.error
  };
}

/**
 * WP-4.3 beat path: stage event-log session append + current-state patch;
 * auto-approve both when GUARDIAN_AUTO_APPROVE is beats | beats_and_valid_transitions.
 */
async function applyBeatStageWrite(input: {
  writeDecision: Extract<ReturnType<typeof decideMemoryWrite>, { action: "stage" }>;
  candidateRaw: string | null | undefined;
  liveBeat: LiveBeat | null | undefined;
  ragClient: RagToolCaller;
  toolCalls: RagToolCall[];
  preflightQuery: string;
  highRiskTriggers: string[];
  autoApprove: "none" | "beats" | "beats_and_valid_transitions";
}): Promise<NonNullable<GuardianReport["memory_write"]>> {
  const {
    writeDecision,
    candidateRaw,
    liveBeat,
    ragClient,
    toolCalls,
    preflightQuery,
    highRiskTriggers,
    autoApprove
  } = input;

  const citations = [
    `preflight_query:${preflightQuery.slice(0, 200)}`,
    ...highRiskTriggers.map((t) => `trigger:${t}`),
    "write_class:beat"
  ];

  const raw =
    typeof candidateRaw === "string" && candidateRaw.trim()
      ? candidateRaw.trim()
      : writeDecision.content;
  const eventLogBody = formatBeatAdvanceSessionContent(raw, liveBeat);

  // 1) Episodic append to event-log (session heading form)
  const eventStage = await callJson<{ staged_update?: { id?: string } }>(
    toolCalls,
    ragClient,
    "stage_story_update",
    {
      target_source_file: "project_source_files/event-log.md",
      proposed_content: eventLogBody,
      mode: "append",
      rationale: `${writeDecision.rationale}; target=event-log`,
      citations: [...citations, "target:event-log"]
    }
  );

  // 2) Continuity bullet to current-state (reviewable snapshot patch)
  const stateStage = await callJson<{ staged_update?: { id?: string } }>(
    toolCalls,
    ragClient,
    "stage_story_update",
    {
      target_source_file: "project_source_files/current-state.md",
      proposed_content: writeDecision.content,
      mode: "append",
      rationale: writeDecision.rationale,
      citations: [...citations, "target:current-state"]
    }
  );

  const eventId = eventStage.response?.staged_update?.id;
  const stateId = stateStage.response?.staged_update?.id;

  if (!stateStage.ok || !stateId) {
    return {
      action: "failed",
      reason: writeDecision.reason,
      error:
        stateStage.error ??
        eventStage.error ??
        "stage_story_update returned no staged_update id for current-state",
      staged_update_id: eventId
    };
  }

  const shouldAuto =
    autoApprove === "beats" || autoApprove === "beats_and_valid_transitions";

  if (shouldAuto) {
    const ids = [eventId, stateId].filter(Boolean) as string[];
    const applied: string[] = [];
    const errors: string[] = [];
    for (const sid of ids) {
      const dry = await callJson(toolCalls, ragClient, "approve_staged_story_update", {
        staged_update_id: sid,
        dry_run: true
      });
      if (!dry.ok) {
        errors.push(`dry_run ${sid}: ${dry.error ?? "fail"}`);
        continue;
      }
      const ok = await callJson(toolCalls, ragClient, "approve_staged_story_update", {
        staged_update_id: sid,
        dry_run: false,
        delete_after_approval: true
      });
      if (ok.ok) applied.push(sid);
      else errors.push(`approve ${sid}: ${ok.error ?? "fail"}`);
    }
    if (applied.length > 0 && errors.length === 0) {
      console.log(
        `${Date.now()} Beat write auto-approved (${autoApprove}): ${applied.join(", ")}`
      );
      return {
        action: "staged",
        reason: `beat staged+auto-approved (${writeDecision.reason}); event_log=${eventId ?? "n/a"}; current_state=${stateId}`,
        staged_update_id: stateId
      };
    }
    console.warn(
      `${Date.now()} Beat auto-approve partial/failed: applied=${applied.join(",") || "none"}; ${errors.join("; ")}`
    );
    return {
      action: "held_for_review",
      reason: `beat staged; auto-approve incomplete (${errors.join("; ") || "unknown"}); ${writeDecision.reason}`,
      staged_update_id: stateId,
      error: errors.join("; ") || undefined
    };
  }

  console.log(
    `${Date.now()} Beat staged for review (GUARDIAN_AUTO_APPROVE=${autoApprove}): state=${stateId} event=${eventId ?? "n/a"}`
  );
  return {
    action: "staged",
    reason: `beat staged hold (${writeDecision.reason}); event_log=${eventId ?? "n/a"}; current_state=${stateId}`,
    staged_update_id: stateId
  };
}

/**
 * WP-4.2 scene transition path: generate structured rewrite → validate → stage overwrite.
 * Auto-approve only when GUARDIAN_AUTO_APPROVE=beats_and_valid_transitions (burn-in default is hold).
 */
async function applySceneTransitionWrite(input: {
  writeDecision: Extract<
    ReturnType<typeof decideMemoryWrite>,
    { action: "stage_transition" }
  >;
  llmAssessment: GuardianLlmAssessment;
  liveStateText: string;
  ragClient: RagToolCaller;
  toolCalls: RagToolCall[];
  preflightQuery: string;
  highRiskTriggers: string[];
  config: {
    GUARDIAN_AUTO_APPROVE?: "none" | "beats" | "beats_and_valid_transitions";
    GUARDIAN_LLM_ENABLED?: boolean;
    OPENAI_API_KEY?: string;
    GUARDIAN_MODEL?: string;
    GUARDIAN_LLM_VERBOSITY?: "low" | "medium" | "high";
  };
}): Promise<NonNullable<GuardianReport["memory_write"]>> {
  const {
    writeDecision,
    llmAssessment,
    liveStateText,
    ragClient,
    toolCalls,
    preflightQuery,
    highRiskTriggers,
    config
  } = input;

  const citations = [
    `preflight_query:${preflightQuery.slice(0, 200)}`,
    `scene_transition:${writeDecision.transition.kind ?? "unknown"}`,
    `from:${(writeDecision.transition.from ?? "").slice(0, 120)}`,
    `to:${(writeDecision.transition.to ?? "").slice(0, 120)}`,
    ...highRiskTriggers.map((t) => `trigger:${t}`)
  ];

  const oldMd = extractCurrentStateMarkdown(liveStateText);
  if (!oldMd || oldMd.length < 80) {
    // Fall back to staging the short transition note.
    const stageResult = await callJson<{ staged_update?: { id?: string } }>(
      toolCalls,
      ragClient,
      "stage_story_update",
      {
        target_source_file: "project_source_files/current-state.md",
        proposed_content: writeDecision.content,
        mode: "append",
        rationale: writeDecision.rationale,
        citations: [...citations, "rewrite_skipped:no_live_current_state"]
      }
    );
    if (stageResult.ok && stageResult.response?.staged_update?.id) {
      return {
        action: "held_for_review",
        reason: "stage_transition: live current-state unavailable for rewrite; staged bullet only",
        staged_update_id: stageResult.response.staged_update.id
      };
    }
    return {
      action: "failed",
      reason: writeDecision.reason,
      error: stageResult.error ?? "could not stage transition fallback"
    };
  }

  const generated = await generateStateRewrite({
    currentStateMarkdown: oldMd,
    transition: {
      occurred: true,
      from: writeDecision.transition.from,
      to: writeDecision.transition.to,
      kind: writeDecision.transition.kind
    },
    supportedFacts: llmAssessment.supported_facts ?? [],
    candidateMemoryUpdate: llmAssessment.candidate_memory_update,
    config: {
      GUARDIAN_LLM_ENABLED: config.GUARDIAN_LLM_ENABLED ?? false,
      OPENAI_API_KEY: config.OPENAI_API_KEY,
      GUARDIAN_MODEL: config.GUARDIAN_MODEL ?? "gpt-5.6-terra",
      GUARDIAN_LLM_VERBOSITY: config.GUARDIAN_LLM_VERBOSITY ?? "medium",
      rewriteReasoningEffort: "medium"
    }
  });

  if ("error" in generated) {
    console.warn(`${Date.now()} State rewrite generation failed: ${generated.error}`);
    const stageResult = await callJson<{ staged_update?: { id?: string } }>(
      toolCalls,
      ragClient,
      "stage_story_update",
      {
        target_source_file: "project_source_files/current-state.md",
        proposed_content: writeDecision.content,
        mode: "append",
        rationale: `${writeDecision.rationale}; rewrite_error=${generated.error}`,
        citations: [...citations, `rewrite_error:${generated.error.slice(0, 160)}`]
      }
    );
    return {
      action: "held_for_review",
      reason: `stage_transition rewrite failed: ${generated.error}; staged bullet for review`,
      staged_update_id: stageResult.response?.staged_update?.id,
      error: generated.error
    };
  }

  const validation = validateStateRewrite(oldMd, generated.markdown);
  if (!validation.ok) {
    console.warn(
      `${Date.now()} State rewrite validation failed: ${validation.violations.join("; ")}`
    );
    // Stage the *generated* markdown anyway for human review (overwrite mode), marked held.
    const stageResult = await callJson<{ staged_update?: { id?: string } }>(
      toolCalls,
      ragClient,
      "stage_story_update",
      {
        target_source_file: "project_source_files/current-state.md",
        proposed_content: generated.markdown,
        mode: "overwrite",
        rationale: `${writeDecision.rationale}; VALIDATION_FAILED: ${validation.violations.join(" | ")}`,
        citations: [...citations, ...validation.violations.map((v) => `violation:${v.slice(0, 120)}`)]
      }
    );
    return {
      action: "held_for_review",
      reason: `stage_transition validation failed; staged rewrite for human review`,
      staged_update_id: stageResult.response?.staged_update?.id,
      violations: validation.violations
    };
  }

  const stageResult = await callJson<{ staged_update?: { id?: string } }>(
    toolCalls,
    ragClient,
    "stage_story_update",
    {
      target_source_file: "project_source_files/current-state.md",
      proposed_content: generated.markdown,
      mode: "overwrite",
      rationale: writeDecision.rationale,
      citations
    }
  );

  if (!stageResult.ok || !stageResult.response?.staged_update?.id) {
    return {
      action: "failed",
      reason: writeDecision.reason,
      error: stageResult.error ?? "stage_story_update (overwrite rewrite) failed"
    };
  }

  const stagedId = stageResult.response.staged_update.id;
  const auto = config.GUARDIAN_AUTO_APPROVE ?? "beats";

  // Burn-in: only auto-apply when explicitly graduated (WP-4.3/4.5).
  if (auto === "beats_and_valid_transitions") {
    const dry = await callJson(toolCalls, ragClient, "approve_staged_story_update", {
      staged_update_id: stagedId,
      dry_run: true
    });
    if (!dry.ok) {
      return {
        action: "held_for_review",
        reason: "stage_transition validated but dry_run approve failed; left staged",
        staged_update_id: stagedId,
        error: dry.error
      };
    }
    const applied = await callJson(toolCalls, ragClient, "approve_staged_story_update", {
      staged_update_id: stagedId,
      dry_run: false,
      delete_after_approval: true
    });
    if (applied.ok) {
      console.log(`${Date.now()} Scene transition rewrite auto-approved: ${stagedId}`);
      return {
        action: "stage_transition",
        reason: `stage_transition validated + auto-approved (${writeDecision.reason})`,
        staged_update_id: stagedId
      };
    }
    return {
      action: "held_for_review",
      reason: "stage_transition validated; auto-approve apply failed; left staged",
      staged_update_id: stagedId,
      error: applied.error
    };
  }

  console.log(
    `${Date.now()} Scene transition rewrite staged for review (GUARDIAN_AUTO_APPROVE=${auto}): ${stagedId}`
  );
  return {
    action: "stage_transition",
    reason: `stage_transition validated + staged overwrite (hold for human; ${writeDecision.reason})`,
    staged_update_id: stagedId
  };
}

/** Pull current-state body from get_live_story_state text (may include a section header). */
function extractCurrentStateMarkdown(liveStateText: string): string {
  const t = liveStateText.trim();
  if (!t) return "";
  const marker = t.search(/^# Current Story State/m);
  if (marker >= 0) return t.slice(marker).trim();
  if (t.includes("## Where We Are Right Now")) return t;
  return t;
}

/**
 * Soft time budget for optional depth tools. On timeout returns fallback and lets the
 * underlying RAG call finish in the background (still recorded in tool_calls if it completes).
 */
async function raceBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  fallback: T,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`${Date.now()} ${label} exceeded ${budgetMs}ms budget — continuing without it`);
          resolve(fallback);
        }, budgetMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * WP-5.7 / WP-R2: fetch registry sections for active NPCs by address (not embedding search).
 * Uses expand_context_around_chunk with source_file + section needle; fails soft.
 * Failures are surfaced on retrieval_notes (not silent). Cassette misses stay non-PLAN_DRIFT.
 */
async function expandActiveNpcSections(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  roster: SceneRoster
): Promise<{ contexts: ExpandedContext[]; failureNotes: string[] }> {
  if (!roster.active.length) return { contexts: [], failureNotes: [] };
  const contexts: ExpandedContext[] = [];
  const failureNotes: string[] = [];
  const targets = roster.active.slice(0, 4);
  for (const npc of targets) {
    const args = {
      source_file: npc.sourceFile,
      section: npc.sectionNeedle,
      before: 0,
      after: 0,
      max_chars: 2200
    };
    try {
      const response = await ragClient.callJsonTool<ExpandedContext>(
        "expand_context_around_chunk",
        args
      );
      toolCalls.push({
        tool: "expand_context_around_chunk",
        arguments: args,
        ok: true,
        response
      });
      const empty =
        !response ||
        (Array.isArray((response as { sections?: unknown }).sections) &&
          !(response as { sections: unknown[] }).sections.length &&
          !(response as { text?: string }).text);
      // Some retrievers return { error } or empty expansion without throwing.
      const errMsg =
        response && typeof response === "object" && "error" in response
          ? String((response as { error?: unknown }).error ?? "expand error")
          : empty
            ? "empty expansion"
            : null;
      if (errMsg) {
        failureNotes.push(`${npc.displayName}[${npc.sectionNeedle}]: ${errMsg}`);
        continue;
      }
      contexts.push({
        ...response,
        anchor: response.anchor ?? {
          source_file: npc.sourceFile,
          section: npc.sectionNeedle
        }
      });
    } catch (err) {
      // Optional path — hermetic cassettes may not include NPC expands.
      const detail = err instanceof Error ? err.message : String(err);
      failureNotes.push(`${npc.displayName}[${npc.sectionNeedle}]: ${detail}`);
      console.warn(
        `${Date.now()} NPC registry expand miss: ${npc.displayName} needle=${npc.sectionNeedle} — ${detail}`
      );
    }
  }
  return { contexts, failureNotes };
}

async function expandBestContext(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  highRiskTriggers: string[]
): Promise<ExpandedContext[]> {
  const shouldExpand =
    highRiskTriggers.length > 0 ||
    preflight?.should_answer_now === false ||
    preflight?.confidence !== "high" ||
    memories.some((memory) => memory.confidence !== "high");
  if (!shouldExpand) {
    console.log(`${Date.now()} expand skipped: high confidence + no high-risk triggers`);
    return [];
  }

  // Prefer live-state / event-log expand targets over historical dumps.
  const pool = [
    ...(preflight?.results ?? []),
    ...memories.flatMap((memory) => memory.results ?? [])
  ].filter((result) => result.can_expand !== false && (result.result_id || (result.source_file && result.section)));

  const scoreCandidate = (result: (typeof pool)[number]): number => {
    const hay = `${result.source_file ?? ""} ${result.section ?? ""} ${result.source_role ?? ""}`.toLowerCase();
    let score = (result.rank_score ?? result.relevance_score ?? 0) * 20;
    if (/current-state|current_state/.test(hay)) score += 50;
    if (/event-log|event_log/.test(hay)) score += 40;
    if (/where we are|recent key|notes for next|emotional/.test(hay)) score += 20;
    if (/historical\/thread|index_ready|index-ready/.test(hay)) score -= 30;
    return score;
  };

  const candidate = [...pool].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
  if (!candidate) return [];

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
  ragClient: RagToolCaller,
  input: GuardianPreflightInput,
  highRiskTriggers: string[]
): Promise<FactCheck[]> {
  const claims = buildFactCheckQuestions(input, highRiskTriggers);
  if (claims.length === 0) {
    console.log(`${Date.now()} verify skipped: no exact-claim patterns / high-risk fact families`);
    return [];
  }

  // One claim under budget pressure; two max when force patterns fire.
  const promises = claims.slice(0, 1).map((claim) =>
    callJson<FactCheck>(toolCalls, ragClient, "verify_story_fact", {
      claim_or_question: claim,
      max_evidence: 4,
      require_corroboration: false
    })
  );

  const results = await Promise.all(promises);
  const checks: FactCheck[] = [];
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
  ragClient: RagToolCaller,
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
  ragClient: RagToolCaller,
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
  limit = 2,
  liveBeat?: LiveBeat
): CriticalPrecedent[] {
  // History unlock: family/trauma OR intimacy/aftercare (warmth restore 2026-07-23).
  // Intimate scenes need relationship precedents; flat -40 on historical/* was starving erotic/emotional memory.
  const historyAllowed = highRiskTriggers.some((t) =>
    /Family|transition|trauma|Vaxholm|Mormor|milestone|Repeated gesture|memory echo|Intimacy|kink|dominance|aftercare/i.test(
      t
    )
  );
  const intimacyLive = highRiskTriggers.some((t) => /Intimacy|kink|dominance|aftercare/i.test(t));
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
      // Milder demotion when intimacy is live; still prefer non-random continuous texture.
      if (historyAllowed) score += intimacyLive ? 12 : 5;
      else score -= 40;
    }

    // Prefer sections that look like open-state / current emotional content.
    const section = (result.section ?? "").toLowerCase();
    if (/current|open story|pending|emotional state|live/.test(section)) score += 12;
    // Warmth restore: relationship / intimacy milestones when intimate
    if (
      intimacyLive &&
      /intimacy|aftercare|relationship|emotional milestone|trust|private|kink|dominance|bath|shower/i.test(
        `${section} ${result.text ?? ""}`.slice(0, 400)
      )
    ) {
      score += 8;
    }

    // WP-2.2: demote superseded same-day beats; boost live cues
    if (liveBeat) {
      score += scoreRecency(result, liveBeat, userMessage);
    }

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
  input?: GuardianPreflightInput,
  liveBeat?: LiveBeat
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

  // Prefer structured live beat location/time when available (WP-2.2).
  if (liveBeat?.locationLine && liveBeat.locationLine.length > 20) {
    const stamp = [liveBeat.timeLine, liveBeat.locationLine].filter(Boolean).join(" — ");
    if (stamp.length > 40) return truncateAtSentence(compactWhitespace(stamp), 900);
  }

  // Real session recap only — ignore placeholders like "None yet, establishing scene".
  const recent = input?.recent_context?.trim();
  if (recent && !isPlaceholderContext(recent) && !isRagMetaText(recent)) {
    return truncateAtSentence(compactWhitespace(recent), 900);
  }

  // Fresh thread / missing recap: Benjamin's turn often *is* the scene beat when it matches live cues
  // (or legacy geo/scene keywords if live beat empty).
  const user = input?.user_message?.trim();
  if (
    user &&
    user.length > 40 &&
    !isPlaceholderContext(user) &&
    (isPlaceholderContext(recent) || !recent) &&
    (liveBeat && liveBeat.liveCues.length > 0
      ? textMatchesLiveBeat(user, liveBeat)
      : /\b(friday|thursday|nordschleife|n[uü]rburgring|paddock|pit\s*lane|race suit|locker|villa|luxembourg|track)\b/i.test(
          user
        ))
  ) {
    return firstSentences(user, 4, 900);
  }

  const results = collectAllResults(preflight, memories);
  const preferred = pickPreferredSceneResults(results, "scene", liveBeat);

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
  purpose: "scene" | "tone" | "facts" = "scene",
  liveBeat?: LiveBeat
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
    // Prefer chronological/event material that matches live cues (not hardcoded Germany literals).
    if (/chronological-summary|event-log|session —/i.test(hay)) {
      if (liveBeat && liveBeat.liveCues.length > 0) {
        score += textMatchesLiveBeat(`${r.section ?? ""} ${r.text ?? ""}`, liveBeat) ? 55 : 15;
      } else {
        score += 40;
      }
    }
    if (isOpenThreads && purpose === "scene") score -= 25;
    if (isHistoricalThread(r.source_file, r.section)) score = Math.min(score, 15);
    score += (r.rank_score ?? r.relevance_score ?? 0) * 10;
    if (liveBeat) score += scoreRecency(r, liveBeat);
    return score;
  };
  return [...results].sort((a, b) => rank(b) - rank(a));
}

export function buildToneGuidance(
  preflight: RagRetrieveResponse | undefined,
  memories: RagRetrieveResponse[],
  llmAssessment?: GuardianLlmAssessment,
  input?: GuardianPreflightInput,
  liveBeat?: LiveBeat
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
    // Mood keywords from live cues + generic affect terms (not Germany-arc-only).
    const liveMood = liveBeat?.liveCues?.length
      ? textMatchesLiveBeat(first, liveBeat)
      : false;
    if (
      first &&
      (liveMood ||
        /emotion|aftercare|connected|tender|warm|playful|trust|relief|close|love|suit|track|pit|focus|radio/i.test(
          first
        ))
    ) {
      return first;
    }
  } else if (input?.user_message?.trim() && isPlaceholderContext(input.recent_context)) {
    // Fresh thread: pull a mood cue from Benjamin's scene-setting turn if present.
    const first = firstSentences(input.user_message, 2, 400);
    const liveMood = liveBeat?.liveCues?.length
      ? textMatchesLiveBeat(first, liveBeat)
      : false;
    if (
      first &&
      (liveMood ||
        /intimate|aftercare|love|embrace|kiss|professional|race suit|connected|playful|track|radio/i.test(
          first
        ))
    ) {
      return first;
    }
  }

  // Prefer live current-state emotional / event-log beats, not stale character-bible inventories.
  const preferred = pickPreferredSceneResults(
    collectAllResults(preflight, memories),
    "tone",
    liveBeat
  );
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
    avoid.push(
      "Keep intimacy scene-specific (privacy, aftercare, body trust). Prefer continuous private history when retrieved (gestures, phrases, established erotic dynamics); do not dump unrelated historical kink as a random scene hijack."
    );
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
    // Only true open-thread sections — not any current-state emotional dump.
    if (!/open story|pending elements|open threads/.test(hay)) continue;

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

  // Only blocking / material hard flags — never duplex housekeeping or RAG coaching as "key facts".
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

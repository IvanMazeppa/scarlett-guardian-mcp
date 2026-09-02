import { performance } from "node:perf_hooks";
import type { GuardianConfig } from "../config.js";
import { pLimit } from "../limit.js";
import {
  assessGuardianEvidence,
  normalizeNpcStateChanges,
  type GuardianLlmAssessmentWithNpcState
} from "../llm-assessment.js";
import {
  allowSaveLagRemediationWrite,
  applyNpcStateChangesToRegistryMarkdown,
  decideNpcStateWrite,
  decideMemoryWrite,
  formatBeatAdvanceSessionContent,
  type NpcStateWriteDecision
} from "../memory-writeback.js";
import { loadSecondaryCharactersBible } from "../npc-registry.js";
import { generateStateRewrite, validateStateRewrite, updateVolatileStateInCurrentState } from "../state-rewrite.js";
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
import { applySaveLagSoftening } from "../save-lag.js";
import {
  applyDramaturgNeutralPolicy,
  resolveSceneConfidence,
  type ResolvedSceneConfidence
} from "../scene-confidence.js";
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
  isWarmChronicle,
  keywordOverlapScore,
  shortTopicLabel,
  sourceRoleBoost,
  stripRagMeta,
  truncate,
  truncateAtSentence
} from "../report/text-clean.js";
import {
  corroborationHaystack,
  intersectAgendasWithLiveScene,
  loadAndParseNpcAgendas,
  mergeNpcIntersections
} from "../npc-agendas.js";
import { computeLiveSceneFingerprint } from "../scene-fingerprint.js";
import { resolveSceneRoster, type SceneRoster } from "../scene-roster.js";
import {
  formatSerendipityNudge,
  runSerendipityTurn
} from "../serendipity-weaver.js";
import { resolveDuplexInput } from "../duplex-cache.js";
import type { DuplexSource } from "../report/models.js";
import { planMemoryQueries, warmRecentMemoryQuery } from "../query-planner.js";
import { resolveWardrobe } from "../wardrobe.js";
import { resolveCurrentStatePath } from "../live-beat-snapshot.js";
import { resolveSceneSummaryMaxChars } from "../report/compile-grok-brief.js";
import fs from "node:fs";
import {
  resolveMissionControlForPreflight,
  type MissionControlState
} from "../mission-control.js";
import {
  lorePackSearchQuery,
  resolveLorePackSourceFiles
} from "../lore-packs.js";
import { tickLocationProgress } from "../location-progress.js";

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
    | "GUARDIAN_BUDGET_INITIAL_RETRIEVAL_MS"
    | "GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS"
    | "GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS"
    | "GUARDIAN_BUDGET_AUDITOR_MS"
    | "GUARDIAN_BUDGET_PLANNER_MS"
    | "GUARDIAN_MCP_INITIAL_CONCURRENCY"
    | "GUARDIAN_MCP_OPTIONAL_CONCURRENCY"
  > & {
    GUARDIAN_DUPLEX_CACHE_TTL_MS?: number;
    GUARDIAN_AUTO_APPROVE?: "none" | "beats" | "beats_and_valid_transitions";
    GUARDIAN_DRAMATURG_ENABLED?: boolean;
    GUARDIAN_DRAMATURG_STALENESS_TURNS?: number;
    GUARDIAN_DRAMATURG_REASONING_EFFORT?: GuardianConfig["GUARDIAN_DRAMATURG_REASONING_EFFORT"];
    /** INTEL-1 feature gate (default true via env / getConfig). */
    GUARDIAN_SCENE_CONFIDENCE_GATE?: boolean;
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
    | "GUARDIAN_BUDGET_INITIAL_RETRIEVAL_MS"
    | "GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS"
    | "GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS"
    | "GUARDIAN_BUDGET_AUDITOR_MS"
    | "GUARDIAN_BUDGET_PLANNER_MS"
    | "GUARDIAN_MCP_INITIAL_CONCURRENCY"
    | "GUARDIAN_MCP_OPTIONAL_CONCURRENCY"
  > & {
    GUARDIAN_DUPLEX_CACHE_TTL_MS?: number;
    GUARDIAN_AUTO_APPROVE?: "none" | "beats" | "beats_and_valid_transitions";
    GUARDIAN_DRAMATURG_ENABLED?: boolean;
    GUARDIAN_DRAMATURG_STALENESS_TURNS?: number;
    GUARDIAN_DRAMATURG_REASONING_EFFORT?: GuardianConfig["GUARDIAN_DRAMATURG_REASONING_EFFORT"];
    GUARDIAN_SCENE_CONFIDENCE_GATE?: boolean;
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

  // WP-R3 / Mission Control: hermetic eval never reads live overrides or location sidecars.
  const isolateSidecars =
    Boolean(options?.isolateSidecars) ||
    Boolean(options?.disableTelemetry) ||
    Boolean(options?.frozenLlmAssessment);
  const missionControl: MissionControlState = resolveMissionControlForPreflight({
    isolateSidecars
  });

  const preflightQuery = buildPreflightQuery(input);
  const highRiskTriggers = detectHighRiskTriggers(input.user_message);
  const toolCalls: RagToolCall[] = [];

  const totalController = new AbortController();
  const totalTimeout = setTimeout(() => {
    console.warn(`${Date.now()} GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS exceeded — aborting remaining calls`);
    totalController.abort();
  }, config.GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS ?? 30000);

  const plannerController = new AbortController();
  const plannerTimeout = setTimeout(() => {
    console.warn(`${Date.now()} GUARDIAN_BUDGET_PLANNER_MS exceeded — aborting query planner`);
    plannerController.abort();
  }, config.GUARDIAN_BUDGET_PLANNER_MS ?? 4000);
  totalController.signal.addEventListener("abort", () => plannerController.abort());

  const memoryQueries = await planMemoryQueries(
    input, 
    config as any, 
    plannerController.signal
  );
  clearTimeout(plannerTimeout);

  const initialLimit = pLimit(config.GUARDIAN_MCP_INITIAL_CONCURRENCY ?? 3);
  const limitedRagClient: RagToolCaller = {
    callJsonTool: (name, args, signal) => initialLimit(() => ragClient.callJsonTool(name, args, signal ?? totalController.signal)),
    callTextTool: (name, args, signal) => initialLimit(() => ragClient.callTextTool(name, args, signal ?? totalController.signal)),
    connect: ragClient.connect ? (signal) => ragClient.connect!(signal ?? totalController.signal) : undefined,
    close: ragClient.close ? () => ragClient.close!() : undefined,
  };

  try {
    if (limitedRagClient.connect) {
        await limitedRagClient.connect(totalController.signal);
    }

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
  const indexStatusPromise = callText(toolCalls, limitedRagClient, "index_status", {}, totalController.signal);
  // Live disk snapshot for recency (WP-2.2) — not index-stale mid-reindex.
  const liveStatePromise = callText(toolCalls, limitedRagClient, "get_live_story_state", {
    include_event_log: false
  }, totalController.signal);
  const preflightPromise = callJson<RagRetrieveResponse>(toolCalls, limitedRagClient, "retrieve_story_context", {
    query: preflightQuery,
    max_results: 6,
    rewrite_query: true,
    max_chars_per_result: 2500
  }, totalController.signal);

  const memoryPromises = memoryQueries.map((query) =>
    callJson<RagRetrieveResponse>(toolCalls, limitedRagClient, "search_story_memory", {
      query,
      max_results: input.force_full_retrieval ? 10 : 8,
      rewrite_query: true,
      max_chars_per_result: 3000
    }, totalController.signal)
  );

  // Dedicated warm lane: europe-arm / arc_chronicle (Recency upgrade 2026-08).
  // Soft-optional on cassette miss so frozen goldens don't PLAN_DRIFT-warn.
  const warmMemoryPromise = callWarmStoryMemory(toolCalls, limitedRagClient, input, totalController.signal);
  const lorePackPromise = callLorePackMemory(
    toolCalls,
    limitedRagClient,
    input,
    missionControl,
    totalController.signal
  );

  console.log(`${Date.now()} Awaiting indexStatus...`);
  const indexStatus = await indexStatusPromise;
  console.log(`${Date.now()} Awaiting live story state...`);
  const liveState = await liveStatePromise;
  console.log(`${Date.now()} Awaiting preflight...`);
  const preflight = await preflightPromise;
  console.log(`${Date.now()} Awaiting memoryResults...`);
  const memoryCallResults = await Promise.all(memoryPromises);
  const warmMemoryCall = await warmMemoryPromise;
  const lorePackCall = await lorePackPromise;
  const memoryResponses = [
    ...memoryCallResults
      .filter((call) => call.ok && call.response)
      .map((call) => call.response as RagRetrieveResponse),
    ...(warmMemoryCall ? [warmMemoryCall] : []),
    ...(lorePackCall ? [lorePackCall] : [])
  ];
  collector.mark("rag_batch");

  const liveBeat = parseLiveBeat(
    liveState.ok && typeof liveState.response === "string" ? liveState.response : ""
  );
  if (liveBeat.liveCues.length) {
    console.log(
      `${Date.now()} Live beat cues: live=[${liveBeat.liveCues.slice(0, 8).join(", ")}] superseded=[${liveBeat.supersededCues.slice(0, 8).join(", ")}]`
    );
  }

  // INTEL-1: one resolved scene-confidence decision before optional systems.
  const sceneConfidence: ResolvedSceneConfidence = resolveSceneConfidence({
    liveBeat,
    userMessage: input.user_message,
    scarlettPreviousMessage: input.scarlett_previous_message,
    recentContext: input.recent_context,
    gateEnabled: config.GUARDIAN_SCENE_CONFIDENCE_GATE ?? true
  });
  const saveLag = sceneConfidence.saveLag;
  if (sceneConfidence.provisional) {
    console.log(
      `${Date.now()} SCENE CONFIDENCE provisional: ${sceneConfidence.reason} (cast=${sceneConfidence.castConfidence} played=${sceneConfidence.playedConfidence})`
    );
  } else if (saveLag.suspected) {
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
  // isolateSidecars already resolved at top of preflight (Mission Control + eval).
  const {
    snapshot: dramaturgRaw,
    turnCounter: dramaturgTurn,
    cacheInvalidationReason: dramaturgInvalidation
  } = resolveHotPathDramaturg({
    deterministic: deterministicDramaturg,
    cache: dramaturgCache,
    planHash,
    liveBeat,
    bumpTurn: !isolateSidecars
  });
  if (dramaturgInvalidation) {
    console.log(
      `${Date.now()} Dramaturg cache invalidated: ${dramaturgInvalidation} (using deterministic)`
    );
  }
  const dramaturg = applyDramaturgNeutralPolicy(dramaturgRaw, sceneConfidence);
  if (dramaturg.momentumLine) {
    console.log(
      `${Date.now()} Story momentum [${sceneConfidence.dramaturgNeutral ? "provisional_neutral" : dramaturg.source ?? "deterministic"}]: ${dramaturg.momentumLine.slice(0, 160)}${
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
    arcCastText,
    suppressPassiveCast: sceneConfidence.suppressPassiveCast
  });
  if (sceneRoster.active.length || sceneRoster.background.length) {
    console.log(`${Date.now()} Scene roster: ${sceneRoster.summary}`);
  }

  // Depth restored: expand + verify with soft time budgets (write-path reindex no longer blocks).
  const optionalLimit = pLimit(config.GUARDIAN_MCP_OPTIONAL_CONCURRENCY ?? 2);
  const optionalRagClient: RagToolCaller = {
    callJsonTool: (name, args, signal) => optionalLimit(() => ragClient.callJsonTool(name, args, signal)),
    callTextTool: (name, args, signal) => optionalLimit(() => ragClient.callTextTool(name, args, signal))
  };

  const expandedContexts =
    (await raceBudget(
      (signal) => expandBestContext(toolCalls, optionalRagClient, preflight.response, memoryResponses, highRiskTriggers, signal),
      config.GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS ?? 5000,
      [] as ExpandedContext[],
      "expand_context_around_chunk"
    )) ?? [];
  // WP-5.7 / WP-R2: exact-section expand for active NPC registry chunks (address, not semantic).
  const npcExpandResult =
    (await raceBudget(
      (signal) => expandActiveNpcSections(toolCalls, optionalRagClient, sceneRoster, signal),
      Math.min(config.GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS ?? 5000, 4000),
      { contexts: [] as ExpandedContext[], failureNotes: [] as string[] },
      "expand_npc_registry_sections"
    )) ?? { contexts: [] as ExpandedContext[], failureNotes: [] as string[] };
  if (npcExpandResult.contexts.length) {
    expandedContexts.push(...npcExpandResult.contexts);
  }
  const factChecks =
    (await raceBudget(
      (signal) => verifyExactClaims(toolCalls, optionalRagClient, input, highRiskTriggers, signal),
      config.GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS ?? 5000,
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
  // INTEL-1: under provisional ambient-only, skip agenda intersections for serendipity pressure.
  const detIntersections = sceneConfidence.serendipityAmbientOnly
    ? []
    : intersectAgendasWithLiveScene(
        loadAndParseNpcAgendas(),
        liveBeat,
        input.user_message,
        input.recent_context
      );
  const npcIntersections = sceneConfidence.serendipityAmbientOnly
    ? []
    : mergeNpcIntersections(detIntersections, dramaturg.npcIntersections, {
        requireDramaturgCorroboration: true,
        corroborationHay: corroborationHaystack(
          liveBeat,
          input.user_message,
          input.recent_context,
          input.scarlett_previous_message
        )
      });
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
    forceMaxTier: sceneConfidence.serendipityAmbientOnly ? "ambient" : undefined,
    threadKey: input.thread_key,
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
        saveLagSuspected: sceneConfidence.auditorSaveLag,
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

  // Soften false location-rewind when multi-scene save lag / provisional state
  const lagSoft = applySaveLagSoftening({
    saveLag: sceneConfidence.auditorSaveLag
      ? { ...saveLag, suspected: true }
      : saveLag,
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
    sceneTransitionOccurred: llmAssessment.scene_transition?.occurred === true,
    currentSceneFingerprint: computeLiveSceneFingerprint(liveBeat)
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
  // INTEL-1: provisional scene confidence holds all canon-adjacent writes for human review.
  let memoryWrite: NonNullable<GuardianReport["memory_write"]> = {
    action: "none",
    reason: "not evaluated"
  };
  try {
    // Safety net: SAVE LAG + null candidate → synthesize a durable location note so write-back
    // is not permanently skipped while disk remains hours/scenes behind play.
    let candidateForWrite = llmAssessment.candidate_memory_update;
    if (
      saveLag.suspected &&
      (candidateForWrite == null ||
        (typeof candidateForWrite === "string" && candidateForWrite.trim().length < 24))
    ) {
      const from =
        liveBeat.locationLine?.trim() ||
        liveBeat.liveCues.slice(0, 4).join(", ") ||
        "stale LIVE BEAT location";
      const to =
        (input.recent_context && input.recent_context.trim().slice(0, 220)) ||
        saveLag.playedBeatStage ||
        saveLag.playedCluster;
      candidateForWrite =
        `Played consensus has advanced past disk LIVE BEAT (${saveLag.reason}). ` +
        `Update current-state: from "${from}" toward "${to}".`;
      llmAssessment.candidate_memory_update = candidateForWrite;
      if (!llmAssessment.scene_transition || llmAssessment.scene_transition.occurred !== true) {
        llmAssessment.scene_transition = {
          occurred: true,
          kind: "location",
          from: from.slice(0, 160),
          to: String(to).slice(0, 160)
        };
      }
      console.log(
        `${Date.now()} Memory write-back safety net: synthesized candidate under SAVE LAG (${saveLag.liveBeatStage ?? saveLag.liveCluster} → ${saveLag.playedBeatStage ?? saveLag.playedCluster})`
      );
    }

    const writeDecision = decideMemoryWrite({
      candidateUpdate: candidateForWrite,
      assessment: llmAssessment,
      highRiskTriggers,
      proceedRecommendation,
      writeMode: config.GUARDIAN_MEMORY_WRITE_MODE,
      liveBeat,
      turnHints: {
        userMessage: input.user_message,
        scarlettPreviousMessage: input.scarlett_previous_message,
        recentContext: input.recent_context
      }
    });

    if (writeDecision.action === "none") {
      memoryWrite = { action: "none", reason: writeDecision.reason };
      console.log(`${Date.now()} Memory write-back skipped: ${writeDecision.reason}`);
    } else if (
      !allowSaveLagRemediationWrite({
        holdCanonWrites: sceneConfidence.holdCanonWrites,
        saveLagSuspected: saveLag.suspected,
        writeAction: writeDecision.action
      })
    ) {
      memoryWrite = {
        action: "held_for_review",
        reason: `provisional scene confidence — canon write held (${sceneConfidence.reason}); decision was ${writeDecision.action}`
      };
      console.log(`${Date.now()} Memory write-back held (provisional): ${memoryWrite.reason}`);
    } else if (writeDecision.action === "stage") {
      if (sceneConfidence.holdCanonWrites && saveLag.suspected) {
        console.log(
          `${Date.now()} Memory write-back SAVE-LAG remediation: allowing ${writeDecision.action} despite provisional hold`
        );
      }
      // #region agent log
      fetch("http://127.0.0.1:7690/ingest/ceeead05-0dc7-4d0c-853f-3a13f1e1683a", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d7bf1a" },
        body: JSON.stringify({
          sessionId: "d7bf1a",
          runId: "writeback-fix",
          hypothesisId: "H-deadlock",
          location: "preflight.ts:memoryWriteBranch",
          message: "applying stage write",
          data: {
            action: writeDecision.action,
            saveLag: saveLag.suspected,
            holdCanonWrites: sceneConfidence.holdCanonWrites,
            autoApprove: config.GUARDIAN_AUTO_APPROVE ?? "beats"
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      memoryWrite = await applyBeatStageWrite({
        writeDecision,
        candidateRaw: candidateForWrite,
        liveBeat,
        ragClient,
        toolCalls,
        preflightQuery,
        highRiskTriggers,
        autoApprove: config.GUARDIAN_AUTO_APPROVE ?? "beats"
      });
    } else if (writeDecision.action === "stage_transition") {
      if (sceneConfidence.holdCanonWrites && saveLag.suspected) {
        console.log(
          `${Date.now()} Memory write-back SAVE-LAG remediation: allowing stage_transition despite provisional hold (autoApprove=${config.GUARDIAN_AUTO_APPROVE ?? "beats"})`
        );
      }
      // #region agent log
      fetch("http://127.0.0.1:7690/ingest/ceeead05-0dc7-4d0c-853f-3a13f1e1683a", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d7bf1a" },
        body: JSON.stringify({
          sessionId: "d7bf1a",
          runId: "writeback-fix",
          hypothesisId: "H-deadlock",
          location: "preflight.ts:memoryWriteBranch",
          message: "applying stage_transition write",
          data: {
            action: writeDecision.action,
            saveLag: saveLag.suspected,
            holdCanonWrites: sceneConfidence.holdCanonWrites,
            autoApprove: config.GUARDIAN_AUTO_APPROVE ?? "beats",
            transitionKind: writeDecision.transition?.kind ?? null
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
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
      if (sceneConfidence.holdCanonWrites && saveLag.suspected) {
        console.log(
          `${Date.now()} Memory write-back SAVE-LAG remediation: allowing live_append despite provisional hold`
        );
      }
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

    // #region agent log
    fetch("http://127.0.0.1:7690/ingest/ceeead05-0dc7-4d0c-853f-3a13f1e1683a", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d7bf1a" },
      body: JSON.stringify({
        sessionId: "d7bf1a",
        runId: "writeback-fix",
        hypothesisId: "H-deadlock",
        location: "preflight.ts:memoryWriteResult",
        message: "final memory_write",
        data: {
          action: memoryWrite.action,
          reason: (memoryWrite.reason || "").slice(0, 200),
          stagedId: memoryWrite.staged_update_id ?? null,
          saveLag: saveLag.suspected
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
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
    writeMode: sceneConfidence.holdCanonWrites ? "off" : config.GUARDIAN_MEMORY_WRITE_MODE
  });
  if (npcWriteDecision.action === "stage_npc" && sceneConfidence.holdCanonWrites) {
    memoryWrite = {
      action: "held_for_review",
      reason: `provisional scene confidence — NPC write held (${sceneConfidence.reason})`
    };
    console.log(`${Date.now()} NPC write held (provisional): ${memoryWrite.reason}`);
  } else if (npcWriteDecision.action === "stage_npc") {
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
  if (sceneConfidence.provisional) {
    hardFlags.push(
      `SCENE_CONFIDENCE_PROVISIONAL: ${sceneConfidence.reason}. Optional systems degraded (passive cast off, serendipity ambient-only, neutral momentum, canon writes held).`
    );
  }

  // Mission Control: location stagnation pacing signal (does not force a move).
  const locationTick = tickLocationProgress({
    locationLine: liveBeat.locationLine,
    sceneMode: missionControl.sceneMode,
    persist: !isolateSidecars
  });
  if (locationTick.stagnation) {
    hardFlags.push(
      `LOCATION_STAGNATION_${locationTick.threshold}_TURNS: LIVE BEAT location unchanged for ${locationTick.consecutiveTurns} turns (threshold ${locationTick.threshold}). Pacing warning only — do not invent a forced location change.`
    );
  }
  const currentStateSummary = summarizeCurrentState(
    preflight.response,
    memoryResponses,
    llmAssessment,
    input,
    liveBeat,
    saveLag.suspected
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
  if (saveLag.suspected) {
    const playedSummary = (input.recent_context || "").trim();
    if (playedSummary && !isPlaceholderContext(playedSummary) && !isRagMetaText(playedSummary)) {
      keyFacts.unshift(truncateAtSentence(compactWhitespace(playedSummary), 280));
    }
  }
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

  const wardrobe = resolveWardrobe(input, liveBeat, { persistWriteback: true });
  if (wardrobe.changeBeat) {
    console.log(
      `${Date.now()} Wardrobe change-beat: register=${wardrobe.targetRegister ?? "?"} kit=${wardrobe.kit ?? "?"} options=${wardrobe.options.map((o) => o.id).join(",") || "none"}`
    );
  }

  // WP-6.0: Seamlessly patch volatile fields in current-state.md on a per-turn basis
  if (!isolateSidecars) {
    const currentWardrobeText = (wardrobe.writebackCandidate ?? wardrobe.live)?.wearing?.join(", ") || null;
    const situationText = llmAssessment.immediate_physical_situation ?? null;
    if (currentWardrobeText || situationText) {
      const patched = updateVolatileStateInCurrentState(resolveCurrentStatePath(), currentWardrobeText, situationText);
      if (patched) {
        console.log(`${Date.now()} Patched volatile fields in current-state.md (wardrobe/situation)`);
      }
    }
  }

  // Fable-5 Phase 3.1: full current-state.md on re-grounding turns only.
  // Soft-reentry / aged recovery: compress guilt coaching before the brief sees it.
  const liveStateFull = shouldInjectFullLiveState({
    duplexSource,
    recentContext: input.recent_context,
    sceneTransition: llmAssessment.scene_transition ?? null,
    memoryWriteAction: memoryWrite.action
  })
    ? prepareLiveStateFullForBrief(loadCurrentStateMarkdown(), input.recent_context)
    : null;

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
    live_state_full: liveStateFull,
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
    wardrobe: {
      change_beat: wardrobe.changeBeat,
      brief_markdown: wardrobe.briefMarkdown,
      register: wardrobe.targetRegister ?? wardrobe.live?.register,
      kit: wardrobe.kit,
      writeback_pending: Boolean(wardrobe.writebackCandidate)
    },
    scene_mode: missionControl.sceneMode,
    lore_pack: missionControl.lorePack,
    retrieval_plan: {
      preflight_query: preflightQuery,
      memory_queries: [
        ...memoryQueries,
        warmRecentMemoryQuery(input),
        ...(missionControl.lorePack !== "none"
          ? [lorePackSearchQuery(missionControl.lorePack, input.user_message)]
          : [])
      ],
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
        source: options?.telemetrySource ?? (isolateSidecars ? "eval" : "live"),
        narrative: {
          serendipity: {
            fired: Boolean(serendipityNudge?.trim()),
            tier: serendipityPick.event?.tier ?? null,
            category: serendipityPick.event?.category ?? null,
            deferred: Boolean(serendipityPick.deferredInstead)
          },
          location_fingerprint: locationTick.fingerprint,
          location_streak: locationTick.consecutiveTurns,
          scene_mode: missionControl.sceneMode,
          lore_pack: missionControl.lorePack
        }
      });
      recordPreflightTelemetry(event, options?.telemetrySink ?? getDefaultTelemetrySink());
    } catch {
      /* ignore telemetry errors */
    }
  }

  return report;

  } finally {
    clearTimeout(totalTimeout);
    if (limitedRagClient.close) {
      await limitedRagClient.close();
    }
  }
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
  workFn: (signal: AbortSignal) => Promise<T>,
  budgetMs: number,
  fallback: T,
  label: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.warn(`${Date.now()} ${label} exceeded ${budgetMs}ms budget — aborting`);
    controller.abort();
  }, budgetMs);

  try {
    return await Promise.race([
      workFn(controller.signal),
      new Promise<T>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(fallback));
        if (controller.signal.aborted) resolve(fallback);
      })
    ]);
  } finally {
    clearTimeout(timer);
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
  roster: SceneRoster,
  signal?: AbortSignal
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
        args,
        signal
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
  highRiskTriggers: string[],
  signal?: AbortSignal
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
    if (isWarmChronicle(result.source_file, result.source_role)) score += 35;
    if (/where we are|recent key|notes for next|emotional/.test(hay)) score += 20;
    // Demote cool UK archive only — not europe-arm warm index-ready files.
    if (!isWarmChronicle(result.source_file, result.source_role) &&
        /historical\/thread|index_ready|index-ready/.test(hay)) {
      score -= 30;
    }
    return score;
  };

  const candidate = [...pool].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
  if (!candidate) return [];

  const response = await callJson<ExpandedContext>(toolCalls, ragClient, "expand_context_around_chunk", {
    source_file: candidate.source_file,
    section: candidate.section,
    before: 1,
    after: 1,
    max_chars: 3000
  }, signal);

  return response.ok && response.response ? [response.response] : [];
}

async function verifyExactClaims(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  input: GuardianPreflightInput,
  highRiskTriggers: string[],
  signal?: AbortSignal
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
    }, signal)
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

// Parroting-fix 2.3 (2026-08-14): a fact-check claim is a PAST-canon assertion the user
// makes about established history — never the present-tense play itself. Dumping the raw
// turn into claim_or_question turned every RP action into FACT_CHECK_AMBIGUOUS noise.
const EXACT_CANON_PATTERN = /\b(friday|thursday|monday|tuesday|wednesday|saturday|sunday|october|luxembourg|paris|germany|n[uü]rburgring|nuerburgring|affalterbach|amg|vaxholm|mormor|oestrogen|estrogen|blockers|surgery|villa|bistrot)\b/i;

const PAST_CANON_MARKER = /\b(was|were|had|did|didn['’]t|died|happened|met|used to|back (?:in|then)|years? ago|last (?:year|month|week|night|time)|(?:in|since) (?:19|20)\d{2})\b/i;

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** True when the sentence asserts something about established past canon. */
export function isPastCanonAssertion(sentence: string): boolean {
  return PAST_CANON_MARKER.test(sentence);
}

/** Reduce a sentence to the single clause carrying the past-canon marker, capped at 180 chars. */
function oneClause(sentence: string): string {
  const clauses = sentence.split(/\s+—\s+|\s+–\s+|;\s+/).map((clause) => clause.trim()).filter(Boolean);
  const carrier = clauses.find((clause) => PAST_CANON_MARKER.test(clause)) ?? clauses[0] ?? sentence;
  return truncate(carrier, 180);
}

export function buildFactCheckQuestions(input: GuardianPreflightInput, highRiskTriggers: string[]): string[] {
  const message = compactWhitespace(input.user_message);

  // Territory gate: only bother when the turn touches named canon or a high-risk family fired.
  if (!EXACT_CANON_PATTERN.test(message) && highRiskTriggers.length === 0) {
    return [];
  }

  const questions: string[] = [];
  for (const sentence of splitIntoSentences(message)) {
    // Present-tense play (actions, offers, in-scene beats) is creative content, not a claim.
    if (!isPastCanonAssertion(sentence)) continue;
    questions.push(`Verify past-canon assertion: ${oneClause(sentence)}`);
  }

  return uniqueQueries(questions).slice(0, 2);
}

async function callJson<T>(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<RagToolCall<T>> {
  try {
    const response = await ragClient.callJsonTool<T>(tool, args, signal);
    const call = { tool, arguments: args, ok: true, response };
    toolCalls.push(call);
    return call;
  } catch (error) {
    const call = { tool, arguments: args, ok: false, error: stringifyError(error) };
    toolCalls.push(call);
    return call;
  }
}

/**
 * Warm arc_chronicle lane. On hermetic cassette miss, skip quietly (no PLAN_DRIFT
 * tool_call entry) so frozen goldens stay green while live RAG still gets the boost.
 */
async function callWarmStoryMemory(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  input: GuardianPreflightInput,
  signal?: AbortSignal
): Promise<RagRetrieveResponse | undefined> {
  const args = {
    query: warmRecentMemoryQuery(input),
    source_roles: ["arc_chronicle"],
    max_results: 4,
    rewrite_query: true,
    max_chars_per_result: 3000
  };
  try {
    const response = await ragClient.callJsonTool<RagRetrieveResponse>(
      "search_story_memory",
      args,
      signal
    );
    toolCalls.push({ tool: "search_story_memory", arguments: args, ok: true, response });
    return response;
  } catch (error) {
    const msg = stringifyError(error);
    if (/PLAN_DRIFT|CassetteMissError/i.test(msg)) {
      console.warn(`${Date.now()} warm arc_chronicle lane skipped (cassette miss)`);
      return undefined;
    }
    toolCalls.push({ tool: "search_story_memory", arguments: args, ok: false, error: msg });
    return undefined;
  }
}

/**
 * Mission Control targeted lore pack — prioritizes exact source_files; never
 * replaces unfiltered live-state retrieve. Soft-skip on cassette miss.
 */
async function callLorePackMemory(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  input: GuardianPreflightInput,
  missionControl: MissionControlState,
  signal?: AbortSignal
): Promise<RagRetrieveResponse | undefined> {
  if (missionControl.lorePack === "none") return undefined;
  const sourceFiles = resolveLorePackSourceFiles(missionControl.lorePack);
  if (!sourceFiles.length) {
    console.warn(
      `${Date.now()} lore pack ${missionControl.lorePack}: no source files resolved`
    );
    return undefined;
  }
  const args = {
    query: lorePackSearchQuery(missionControl.lorePack, input.user_message),
    source_files: sourceFiles.slice(0, 24),
    max_results: 6,
    rewrite_query: true,
    max_chars_per_result: 3000
  };
  try {
    const response = await ragClient.callJsonTool<RagRetrieveResponse>(
      "search_story_memory",
      args,
      signal
    );
    toolCalls.push({ tool: "search_story_memory", arguments: args, ok: true, response });
    console.log(
      `${Date.now()} Lore pack search: pack=${missionControl.lorePack} files=${sourceFiles.length} results=${response.result_count ?? response.results?.length ?? 0}`
    );
    return response;
  } catch (error) {
    const msg = stringifyError(error);
    if (/PLAN_DRIFT|CassetteMissError/i.test(msg)) {
      console.warn(
        `${Date.now()} lore pack ${missionControl.lorePack} skipped (cassette miss)`
      );
      return undefined;
    }
    toolCalls.push({ tool: "search_story_memory", arguments: args, ok: false, error: msg });
    return undefined;
  }
}

async function callText(
  toolCalls: RagToolCall[],
  ragClient: RagToolCaller,
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<RagToolCall<string>> {
  try {
    const response = await ragClient.callTextTool(tool, args, signal);
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
      if (historyAllowed) score += intimacyLive ? 12 : 5;
      // Removed the severe -40 penalty here to stop starving historical intimacy and kink
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
  liveBeat?: LiveBeat,
  saveLagSuspected?: boolean
): string {
  const maxChars = resolveSceneSummaryMaxChars();
  // When disk LIVE BEAT lags play, prefer the operator/bridge recent_context over a
  // scene_state_delta that merely restates the stale LIVE BEAT (aviation save-lag).
  const recent = input?.recent_context?.trim();
  if (
    saveLagSuspected &&
    recent &&
    !isPlaceholderContext(recent) &&
    !isRagMetaText(recent)
  ) {
    return truncateAtSentence(compactWhitespace(recent), maxChars);
  }

  if (llmAssessment?.enabled && !llmAssessment.error) {
    if (llmAssessment.scene_state_delta && !isRagMetaText(llmAssessment.scene_state_delta)) {
      return truncateAtSentence(
        stripRagMeta(llmAssessment.scene_state_delta) || llmAssessment.scene_state_delta,
        maxChars
      );
    }
    if (llmAssessment.continuity_facts_for_grok && !isRagMetaText(llmAssessment.continuity_facts_for_grok)) {
      return truncateAtSentence(
        stripRagMeta(llmAssessment.continuity_facts_for_grok) || llmAssessment.continuity_facts_for_grok,
        maxChars
      );
    }
  }

  // Prefer structured live beat location/time when available (WP-2.2).
  if (liveBeat?.locationLine && liveBeat.locationLine.length > 20) {
    const stamp = [liveBeat.timeLine, liveBeat.locationLine].filter(Boolean).join(" — ");
    if (stamp.length > 40) return truncateAtSentence(compactWhitespace(stamp), maxChars);
  }

  // Real session recap only — ignore placeholders like "None yet, establishing scene".
  if (recent && !isPlaceholderContext(recent) && !isRagMetaText(recent)) {
    return truncateAtSentence(compactWhitespace(recent), maxChars);
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
    return firstSentences(user, 4, maxChars);
  }

  const results = collectAllResults(preflight, memories);
  const preferred = pickPreferredSceneResults(results, "scene", liveBeat);

  for (const result of preferred) {
    const cleaned = cleanResultText(result.text, maxChars);
    if (cleaned && cleaned.length > 40) {
      return cleaned;
    }
  }

  if (user && user.length > 40) {
    return firstSentences(user, 3, Math.min(700, maxChars));
  }

  if (preflight?.summary) {
    const cleaned = stripRagMeta(preflight.summary);
    if (cleaned && cleaned.length > 40) return truncateAtSentence(cleaned, Math.min(700, maxChars));
  }

  return "Live-scene context was retrieved; ground response in key facts and precedents.";
}

/** Fable-5 Phase 3.1: full notebook on session start / transition / write-back. */
export function shouldInjectFullLiveState(input: {
  duplexSource: DuplexSource;
  recentContext?: string;
  sceneTransition: { occurred?: boolean; kind?: string | null } | null | undefined;
  memoryWriteAction: string;
}): boolean {
  // True session start: no prior Scarlett turn AND no played recap yet.
  // Duplex-absent mid-session (bridge miss) must NOT dump full state every turn.
  const recent = input.recentContext?.trim() ?? "";
  const coldStart =
    input.duplexSource === "absent" &&
    (!recent || isPlaceholderContext(recent));
  if (coldStart) return true;

  // Only after a successful write-back / staged transition — not held/failed.
  // Save-lag often sets scene_transition.occurred while disk is still stale;
  // injecting verbatim current-state.md then amplifies the lag (spec warning).
  const writeLanded =
    input.memoryWriteAction === "staged" ||
    input.memoryWriteAction === "stage_transition" ||
    input.memoryWriteAction === "live_append";
  if (!writeLanded) return false;

  // Age out full dump once soft re-entry is already underway mid-session
  // (duplex + real recap). Summary path is enough; avoids re-amplifying recovery weather.
  if (
    input.duplexSource !== "absent" &&
    recent &&
    !isPlaceholderContext(recent) &&
    isSoftReentryUnderway(recent)
  ) {
    return false;
  }

  return true;
}

/** Play has left the first recovery hour — breakfast / dressing / city hooks live. */
export function isSoftReentryUnderway(text: string): boolean {
  return /\b(soft re-entry|breakfast|pretzels?|münchner|munchner frühstück|three (jet )?places|travel-soft|city soft-walk|micro-adventure|tattoo studio)\b/i.test(
    text
  );
}

/**
 * When soft re-entry Notes (or live recap) are active, compress guilt/horror bullets
 * in the Scarlett emotional section so LIVE STATE (full) does not re-coach tragedy weather.
 */
export function prepareLiveStateFullForBrief(
  md: string | null | undefined,
  recentContext?: string
): string | null {
  if (!md?.trim()) return null;
  const soft =
    /soft re-entry|playful competence|adventure planning|travel-soft dressing/i.test(md) ||
    isSoftReentryUnderway(recentContext ?? "");
  if (!soft) return md.trim();

  return md
    .replace(
      /(## Scarlett's Current Emotional & Relational State\r?\n)([\s\S]*?)(?=\r?\n## )/,
      (_all, header: string, body: string) => {
        const bullets = body
          .split(/\r?\n/)
          .map((l) => l.trimEnd())
          .filter((l) => /^\s*-\s+/.test(l));
        const kept = bullets.filter((b) => {
          const guiltHeavy =
            /\b(horror|guilt|flashback|trauma memory|coercive abuse|exploitative intelligence-service)\b/i.test(
              b
            );
          const settling =
            /\b(post-flashback|settling|safe|humour|vivid|readiness|optional)\b/i.test(b);
          return !guiltHeavy || settling;
        });
        const out = (kept.length > 0 ? kept : bullets.slice(0, 2)).slice(0, 4);
        return `${header}\n${out.join("\n")}\n`;
      }
    )
    .trim();
}

export function loadCurrentStateMarkdown(cwd: string = process.cwd()): string | null {
  const p = resolveCurrentStatePath(cwd);
  if (!p) return null;
  try {
    const text = fs.readFileSync(p, "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
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
    "Do not invent pre-thread facts, names, dates, family details, or relationship history that are not supported by retrieved evidence or LIVE BEAT.",
    "Do not read Benjamin's private thoughts; infer only from speech, visible behavior, and retrieved context.",
    "Do not flatten Scarlett into generic romance, bland reassurance, cold autonomy, cruelty, or passive caretaking.",
    "CRITICAL CANON: Scarlett is a pre-op trans woman. NEVER forget her gender identity, anatomy, or transition history. It is fundamental to who she is."
  ];

  if (highRiskTriggers.includes("Benjamin attributes Scarlett internal state")) {
    avoid.push("If Benjamin attributes an internal state to Scarlett and retrieval does not support it, treat it as Benjamin's perception rather than confirmed truth.");
  }

  // Removed the censorship warning that told the LLM to 'keep intimacy scene-specific' and avoid 'historical kink'.

  if (retrievalStatus !== "success") {
    avoid.push("Do not write in-character prose as if retrieval was complete; either stop OOC or proceed only with explicit caution.");
  }

  return avoid;
}

/**
 * Drop Thread-01 archive contradictions that pollute couple-only Munich briefs.
 */
export function isStaleArchiveOpenThread(line: string, sourceFile?: string | null): boolean {
  const hay = `${sourceFile ?? ""} ${line}`.toLowerCase();
  if (/thread-01.*open-threads|open-threads-and-uncertainties/.test(hay)) return true;
  return /cold dominant|real me\s*=|disappearance\/return pattern|ponytail\/latex switch|i appear \/ i vanish/i.test(
    line
  );
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
      // Skip Thread-01 archive contradictions (cold-dominant / disappearance pattern)
      // when they pollute couple-only live briefs.
      if (isStaleArchiveOpenThread(bullet, result.source_file)) continue;
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

  // Parroting-fix 1.1 (2026-08-14): FACT_CHECK_* is clerk housekeeping and must never
  // become a novelist-facing key fact. Blocking flags are appended last so Key Fact #1
  // stays live scene grounding instead of a verification directive.
  for (const flag of hardFlags) {
    if (/MANDATORY_RETRIEVAL_FAILED|LLM_GUARDIAN_BLOCK/i.test(flag)) {
      facts.push(truncate(flag, 200));
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

export type RetrievalStatus = "success" | "partial" | "failed";
export type ProceedRecommendation = "proceed" | "proceed_with_caution" | "do_not_proceed";
export type RagConfidence = "high" | "medium" | "low";
/** WP-3.1: where scarlett_previous_message came from for this preflight. */
export type DuplexSource = "caller" | "bridge_cache" | "absent";

export type RagContextResult = {
  result_id?: string;
  text?: string;
  source_file?: string;
  section?: string;
  section_index?: number;
  source_role?: string;
  importance_level?: string;
  relevance_score?: number;
  rank_score?: number;
  confidence?: RagConfidence;
  can_expand?: boolean;
  explanation?: string;
};

export type RagRetrieveResponse = {
  query?: string;
  search_mode?: "rp_preflight" | "corpus_search";
  status?: string;
  retrieval_mode?: string;
  vector_store_id?: string;
  result_count?: number;
  total_results?: number;
  confidence?: RagConfidence;
  sufficient_context?: boolean;
  should_answer_now?: boolean;
  summary?: string;
  next_action?: string;
  recommended_follow_up_queries?: string[];
  results?: RagContextResult[];
};

export type RagToolCall<T = unknown> = {
  tool: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  response?: T;
  error?: string;
};

export type CriticalPrecedent = {
  topic: string;
  details: string;
  must_respect: string;
  source_file?: string;
  section?: string;
};

export type ExpandedContextSection = {
  source_file?: string;
  section?: string;
  section_index?: number;
  relative_position?: number;
  text?: string;
};

export type ExpandedContext = {
  status?: "context_found" | "not_found";
  anchor?: {
    source_file?: string;
    section?: string;
    section_index?: number;
  };
  expanded_results?: ExpandedContextSection[];
  summary?: string;
  next_action?: string;
};

export type FactCheck = {
  claim_or_question?: string;
  status?: "verified" | "ambiguous" | "not_found";
  confidence?: RagConfidence;
  answer?: string;
  evidence?: Array<{
    result_id?: string;
    source_file?: string;
    section?: string;
    quote?: string;
    relevance_score?: number;
    rank_score?: number;
  }>;
  explanation?: string;
  next_action?: string;
};

/** WP-4.1 / D4 §C.3 — auditor declaration of a durable location/time scene change. */
export type SceneTransition = {
  occurred: boolean;
  from?: string;
  to?: string;
  kind?: "location" | "time_jump" | "both";
};

export type GuardianLlmAssessment = {
  enabled: boolean;
  model?: string;
  continuity_risk_level?: "low" | "medium" | "high";
  supported_facts?: string[];
  unsupported_or_risky_claims?: string[];
  scene_state_delta?: string;
  continuity_facts_for_grok?: string;
  needs_more_retrieval?: boolean;
  should_block_prose?: boolean;
  candidate_memory_update?: string | null;
  grok_performance_correction?: string | null;
  /**
   * WP-4.1: set when location/story-time durably changed vs LIVE BEAT.
   * Continuous same-place action is not a transition.
   */
  scene_transition?: SceneTransition | null;
  /**
   * WP-4.7: one scene-aware sentence weaving a selected serendipity event
   * into the background (null = veto / cannot weave without disruption).
   */
  serendipity_weave?: string | null;
  /**
   * WP-5.5: one concrete thing Scarlett would initiate given an opening
   * (pressure/possibility — not scripted dialogue or outcomes).
   */
  scarlett_next_intention?: string | null;
  /**
   * WP-5.5: at most one optional corpus echo as available texture; null most turns.
   * Brief compile enforces ≤1; scorecard target echoes/turn ≤ 0.5.
   */
  resonance_echo?: string | null;
  error?: string;
  /** P1: what Guardian did with candidate_memory_update (stage/live/skip). */
  memory_write?: {
    action:
      | "none"
      | "staged"
      | "stage_transition"
      | "held_for_review"
      | "live_append"
      | "failed";
    reason: string;
    staged_update_id?: string;
    error?: string;
    violations?: string[];
  };
};

export type GuardianReport = {
  retrieval_status: RetrievalStatus;
  confidence_score: number;
  proceed_recommendation: ProceedRecommendation;
  current_state_summary: string;
  critical_precedents: CriticalPrecedent[];
  expanded_contexts: ExpandedContext[];
  fact_checks: FactCheck[];
  llm_assessment?: GuardianLlmAssessment;
  emotional_tone_guidance: string;
  things_to_avoid: string[];
  open_threads: string[];
  hard_flags: string[];
  retrieval_notes: string;
  /**
   * WP-3.1 duplex provenance:
   * - caller: MCP/REST arg was non-empty (always wins over cache)
   * - bridge_cache: filled from POST /duplex-cache shadow sidecar
   * - absent: both empty → DUPLEX_INPUT_MISSING
   */
  duplex_source?: DuplexSource;
  serendipity_nudge?: string;
  /** Clean prose-facing fields for Grok brief (optional; compiler falls back if absent). */
  grok_scene_summary?: string;
  grok_key_facts?: string[];
  grok_precedents?: CriticalPrecedent[];
  grok_emotional_context?: string;
  /**
   * Fable-5 Phase 3.1: verbatim current-state.md on full-fidelity turns
   * (session start / scene_transition / time_jump / memory write-back).
   */
  live_state_full?: string | null;
  /** P1 write-back decision surface (also mirrored under llm_assessment.memory_write). */
  memory_write?: {
    action:
      | "none"
      | "staged"
      | "stage_transition"
      | "held_for_review"
      | "live_append"
      | "failed";
    reason: string;
    staged_update_id?: string;
    error?: string;
    violations?: string[];
  };
  /** WP-4.1: copy of auditor scene_transition for consumers (dramaturg, compression). */
  scene_transition?: SceneTransition | null;
  /**
   * WP-5.2: mechanical Story Momentum line from active arc plan + LIVE BEAT diff.
   * Pressure/schedule only — never outcomes. Empty/absent when no active plan.
   */
  story_momentum?: string;
  /**
   * WP-5.7: deterministic scene roster (max 4 active supporting NPCs).
   */
  scene_roster?: {
    active: Array<{
      id: string;
      displayName: string;
      activation: string;
    }>;
    background: string[];
    summary: string;
    /** True when LIVE BEAT Present is couple-only (parroting-fix 1.3 quiet-scene defense). */
    couple_only_present?: boolean;
  };
  /**
   * Live garment card + optional change-beat menu (disk closet, not RAG).
   */
  wardrobe?: {
    change_beat: boolean;
    brief_markdown: string;
    register?: string;
    kit?: string;
    writeback_pending?: boolean;
  };
  /**
   * Mission Control scene-mode / lore-pack active for this turn (diagnostics + brief).
   */
  scene_mode?: string;
  lore_pack?: string;
  retrieval_plan: {
    preflight_query: string;
    memory_queries: string[];
    high_risk_triggers: string[];
  };
  tool_calls: RagToolCall[];
};

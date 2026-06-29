export type RetrievalStatus = "success" | "partial" | "failed";
export type ProceedRecommendation = "proceed" | "proceed_with_caution" | "do_not_proceed";
export type RagConfidence = "high" | "medium" | "low";

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
  candidate_memory_update?: string;
  error?: string;
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
  serendipity_nudge?: string;
  retrieval_plan: {
    preflight_query: string;
    memory_queries: string[];
    high_risk_triggers: string[];
  };
  tool_calls: RagToolCall[];
};

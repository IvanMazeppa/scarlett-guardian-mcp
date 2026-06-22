export type RetrievalStatus = "success" | "partial" | "failed";
export type ProceedRecommendation = "proceed" | "proceed_with_caution" | "do_not_proceed";
export type RagConfidence = "high" | "medium" | "low";

export type RagContextResult = {
  text?: string;
  source_file?: string;
  section?: string;
  source_role?: string;
  importance_level?: string;
  relevance_score?: number;
  rank_score?: number;
  confidence?: RagConfidence;
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

export type GuardianReport = {
  retrieval_status: RetrievalStatus;
  confidence_score: number;
  proceed_recommendation: ProceedRecommendation;
  current_state_summary: string;
  critical_precedents: CriticalPrecedent[];
  emotional_tone_guidance: string;
  things_to_avoid: string[];
  open_threads: string[];
  hard_flags: string[];
  retrieval_notes: string;
  retrieval_plan: {
    preflight_query: string;
    memory_queries: string[];
    high_risk_triggers: string[];
  };
  tool_calls: RagToolCall[];
};

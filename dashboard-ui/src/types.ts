export type SceneModeId =
  | "default"
  | "explicit_slow_burn"
  | "tactical"
  | "banter";

export type LorePackId =
  | "none"
  | "europe-arm"
  | "thread-01"
  | "thread-02"
  | "thread-03"
  | "thread-05"
  | "letters"
  | string;

export type TelemetryEvent = {
  v: number;
  ts: string;
  preflight_id?: string;
  source?: "live" | "backfill" | "eval";
  latency_ms: {
    total: number;
    rag: {
      index_status?: number;
      retrieve?: number;
      search: number[];
      expand?: number;
      verify?: number;
      other: Array<{ tool: string; ms: number }>;
    };
    llm_assessment?: number;
    phases?: Record<string, number>;
  };
  quality: {
    confidence_score: number;
    proceed_recommendation: string;
    retrieval_status: string;
    llm_facts_count: number;
    scene_delta_present: boolean;
    brief_chars?: number;
    meta_pollution: boolean;
  };
  duplex: {
    source: "caller" | "bridge_cache" | "absent";
    previous_message_chars: number;
    correction_fired: boolean;
  };
  save_lag?: { suspected: boolean };
  intention?: string;
  correction_kind?: string;
  tools_invoked?: string[];
  scene_mode?: string;
  lore_pack?: string;
  memory_write: { action: string; reason_short: string };
  triggers: string[];
};

export type ControlState = {
  ok?: boolean;
  sceneMode: SceneModeId;
  lorePack: LorePackId;
  updatedAt: string;
  live_beat?: {
    story_clock?: string | null;
    time_in_story?: string | null;
    last_updated?: string | null;
    location?: string | null;
    present?: string[];
    source_path?: string | null;
  };
  location?: {
    fingerprint?: string;
    consecutiveTurns?: number;
    locationLine?: string | null;
    updatedAt?: string;
  } | null;
};

export type LorePacksResponse = {
  ok: boolean;
  packs: Array<{ id: string; label: string }>;
};

export type TelemetryHealth = {
  ok?: boolean;
  last_event_ts?: string | null;
  event_file_count?: number;
  [key: string]: unknown;
};

export type TelemetrySummary = {
  event_count: number;
  backfill_count: number;
  live_count: number;
  quality: {
    avg_facts: number | null;
    scene_delta_rate: number;
    meta_pollution_rate: number;
    avg_confidence: number | null;
    avg_brief_chars: number | null;
  };
  duplex: {
    present_rate: number;
    present_count: number;
    absent_count: number;
    correction_rate: number;
    correction_count: number;
  };
  latency: {
    live_with_timing: number;
    p50_total_ms: number | null;
    p95_total_ms: number | null;
  };
  save_lag: {
    suspected_rate: number;
    suspected_count: number;
  };
  memory: {
    avg_max_chunk_chars: number | null;
    max_chunk_chars_p95: number | null;
  };
  reports_dir_count: number;
};

export type NarrativeSummary = {
  serendipity_parroting?: Record<string, number>;
  location?: {
    current_streak?: number;
    threshold?: number;
    stagnation?: boolean;
    current_location_line?: string | null;
    streak_series?: Array<{ ts: string; streak: number }>;
  };
  tools?: { counts?: Record<string, number> };
  corrections?: {
    rate?: number;
    total_fired?: number;
    by_kind?: Record<string, number>;
  };
};

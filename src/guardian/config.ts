import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  GUARDIAN_HOST: z.string().default("0.0.0.0"),
  GUARDIAN_PORT: z.coerce.number().int().positive().default(8790),
  GUARDIAN_MCP_BEARER_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  RAG_MCP_URL: z.string().url().default("http://127.0.0.1:8787/mcp-v2"),
  RAG_MCP_BEARER_TOKEN: z.string().optional(),
  RAG_MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  GUARDIAN_CONFIDENCE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(70),
  GUARDIAN_LLM_ENABLED: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean().default(false)
  ),
  OPENAI_API_KEY: z.string().optional(),
  // GPT-5.6 mini-tier equivalent (OpenAI: terra ≈ prior mini; luna ≈ nano; sol ≈ flagship)
  GUARDIAN_MODEL: z.string().default("gpt-5.6-terra"),
  // Terra list rates > 5.4-mini; start low (5.4-mini often ran effort=none). Override via env if needed.
  GUARDIAN_LLM_REASONING_EFFORT: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
    .default("low"),
  GUARDIAN_LLM_VERBOSITY: z.enum(["low", "medium", "high"]).default("medium"),
  // Auditor should see most retrieved evidence (~2 searches × results); 12k starved weave (Fable audit).
  GUARDIAN_LLM_MAX_EVIDENCE_CHARS: z.coerce.number().int().positive().default(32000),
  /** INTEL-3 explicit budgets (ms). */
  GUARDIAN_BUDGET_INITIAL_RETRIEVAL_MS: z.coerce.number().int().positive().default(14000),
  GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS: z.coerce.number().int().positive().default(5000),
  GUARDIAN_BUDGET_AUDITOR_MS: z.coerce.number().int().positive().default(12000),
  GUARDIAN_BUDGET_PLANNER_MS: z.coerce.number().int().positive().default(4000),
  GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS: z.coerce.number().int().positive().default(30000),
  /** Concurrency limits */
  GUARDIAN_MCP_INITIAL_CONCURRENCY: z.coerce.number().int().positive().default(3),
  GUARDIAN_MCP_OPTIONAL_CONCURRENCY: z.coerce.number().int().positive().default(2),
  /**
   * How autonomous LLM memory proposals are applied after preflight:
   * - stage (default): stage_story_update only — no live canon write
   * - live: append to current-state.md via update_story_state (legacy; prefer stage)
   * - off: never write or stage from preflight
   */
  GUARDIAN_MEMORY_WRITE_MODE: z.enum(["stage", "live", "off"]).default("stage"),
  /**
   * Shadow-sidecar duplex cache TTL (WP-3.1). Stale entries are ignored rather than
   * guessing — wrong-turn critique is worse than missing duplex.
   * Default 45 minutes.
   */
  GUARDIAN_DUPLEX_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(45 * 60 * 1000),
  /**
   * WP-4.2/4.3 burn-in:
   * - none: never auto-approve staged writes from preflight
   * - beats (default): auto path only for ordinary beat stages if implemented; transitions stage-and-hold
   * - beats_and_valid_transitions: also auto-approve validated current-state rewrites after dry-run
   */
  GUARDIAN_AUTO_APPROVE: z
    .enum(["none", "beats", "beats_and_valid_transitions"])
    .default("beats"),
  /**
   * WP-5.3: background LLM dramaturg pass (scene-level). Hot path still one auditor call;
   * dramaturg runs async after the turn when triggers fire and never blocks the response.
   */
  GUARDIAN_DRAMATURG_ENABLED: z.preprocess(
    (value) => {
      if (value === "false" || value === false) return false;
      if (value === "true" || value === true) return true;
      return true; // default on once shipped
    },
    z.boolean().default(true)
  ),
  /** Turns since last dramaturg pass before background refresh (default 12). */
  GUARDIAN_DRAMATURG_STALENESS_TURNS: z.coerce.number().int().positive().default(12),
  /** Reasoning effort for runDramaturgPass (scene-level; default medium). */
  GUARDIAN_DRAMATURG_REASONING_EFFORT: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
    .default("medium"),
  /** WP-5.5: max resonance echoes rendered per turn (code-enforced; design default 1). */
  GUARDIAN_ECHO_MAX_PER_TURN: z.coerce.number().int().min(0).max(1).default(1),
  /**
   * INTEL-1: resolved scene-confidence gate. When true (default), provisional
   * save-lag / stale-present state degrades roster/serendipity/dramaturg/write-back.
   * Set false to restore pre-INTEL-1 consumer behavior without deleting telemetry.
   */
  GUARDIAN_SCENE_CONFIDENCE_GATE: z.preprocess((value) => {
    if (value === "false" || value === false || value === "0") return false;
    if (value === "true" || value === true || value === "1") return true;
    return true;
  }, z.boolean().default(true))
});

export type GuardianConfig = z.infer<typeof EnvSchema>;

export function getConfig(): GuardianConfig {
  return EnvSchema.parse(process.env);
}

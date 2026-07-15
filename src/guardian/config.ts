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
  /** Soft budget for optional expand_context_around_chunk (ms). */
  GUARDIAN_EXPAND_BUDGET_MS: z.coerce.number().int().positive().default(10000),
  /** Soft budget for optional verify_story_fact batch (ms). */
  GUARDIAN_VERIFY_BUDGET_MS: z.coerce.number().int().positive().default(10000),
  /**
   * How autonomous LLM memory proposals are applied after preflight:
   * - stage (default): stage_story_update only — no live canon write
   * - live: append to current-state.md via update_story_state (legacy; prefer stage)
   * - off: never write or stage from preflight
   */
  GUARDIAN_MEMORY_WRITE_MODE: z.enum(["stage", "live", "off"]).default("stage")
});

export type GuardianConfig = z.infer<typeof EnvSchema>;

export function getConfig(): GuardianConfig {
  return EnvSchema.parse(process.env);
}

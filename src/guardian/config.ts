import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  GUARDIAN_HOST: z.string().default("0.0.0.0"),
  GUARDIAN_PORT: z.coerce.number().int().positive().default(8790),
  GUARDIAN_MCP_BEARER_TOKEN: z.string().min(1).optional(),
  RAG_MCP_URL: z.string().url().default("http://127.0.0.1:8787/mcp-v2"),
  RAG_MCP_BEARER_TOKEN: z.string().optional(),
  RAG_MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  GUARDIAN_CONFIDENCE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(70)
});

export type GuardianConfig = z.infer<typeof EnvSchema>;

export function getConfig(): GuardianConfig {
  return EnvSchema.parse(process.env);
}

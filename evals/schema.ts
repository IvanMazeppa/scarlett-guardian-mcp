/**
 * Golden-case schema + loader for the Guardian eval harness (WP-1.1).
 * Spec: docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md §2
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Categories map 1:1 onto audit failure modes / roadmap pillars. */
export const GOLDEN_CATEGORIES = [
  "continuous-scene",
  "fresh-thread",
  "high-risk-intimacy",
  "exact-fact",
  "temporal-mud",
  "duplex",
  "write-back",
  "serendipity",
  "other"
] as const;

export type GoldenCategory = (typeof GOLDEN_CATEGORIES)[number];

/**
 * Recorded RAG response body. Production callJsonTool returns parsed objects;
 * callTextTool returns strings (e.g. index_status). Cassettes store either.
 */
export const CassetteResponseSchema = z.union([
  z.string(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown())
]);

export type CassetteResponse = z.infer<typeof CassetteResponseSchema>;

/**
 * Per-tool cassette payload:
 * - single response object/string (one call of that tool)
 * - array of responses (FIFO for multi-call tools like search_story_memory)
 * - map of stable-args-hash → response (exact match; preferred when curated)
 */
export const CassetteToolEntrySchema = z.union([
  CassetteResponseSchema,
  z.array(CassetteResponseSchema),
  z.record(z.string(), CassetteResponseSchema)
]);

export type CassetteToolEntry = z.infer<typeof CassetteToolEntrySchema>;

export const CassetteSchema = z.record(z.string(), CassetteToolEntrySchema);

export type GoldenCassette = z.infer<typeof CassetteSchema>;

const PhraseGroupSchema = z.array(z.string()).min(1);

export const GoldenExpectationsSchema = z.object({
  /** Outer AND, inner OR — at least one phrase/regex per group must match. */
  brief_must_include: z.array(PhraseGroupSchema).default([]),
  brief_must_not_include: z.array(z.string()).default([]),
  flags_expected: z.array(z.string()).default([]),
  flags_forbidden: z.array(z.string()).default([]),
  /** Regex strings; none of the selected precedent texts may match. */
  precedents_must_not_match: z.array(z.string()).default([]),
  correction_expected: z.enum(["none", "required", "either"]).default("either"),
  write_action_expected: z
    .enum(["none", "stage", "stage_transition", "either"])
    .default("either"),
  brief_chars: z
    .object({
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().positive().optional()
    })
    .optional(),
  /** Consumed only by L3 auditor tier (WP later). */
  llm: z
    .object({
      facts_min: z.number().int().nonnegative().optional(),
      facts_must_cover: z.array(PhraseGroupSchema).optional(),
      scene_delta_required: z.boolean().optional()
    })
    .optional()
});

export type GoldenExpectations = z.infer<typeof GoldenExpectationsSchema>;

export const GoldenInputSchema = z.object({
  user_message: z.string().min(1),
  recent_context: z.string().optional().nullable(),
  scarlett_previous_message: z.string().optional().nullable(),
  force_full_retrieval: z.boolean().optional()
});

export type GoldenInput = z.infer<typeof GoldenInputSchema>;

/**
 * Optional frozen auditor output for `--llm-mode frozen` (WP-1.3).
 * Stored as a loose object so schema stays decoupled from llm-assessment evolution.
 */
export const FrozenLlmAssessmentSchema = z.record(z.string(), z.unknown()).optional();

export const GoldenCaseSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^gt-[\w-]+$/, "golden id must look like gt-025-track-vs-morning"),
  category: z.enum(GOLDEN_CATEGORIES),
  description: z.string().min(1),
  source_report: z.string().optional(),
  /** When set, case is skipped by eval:fast (kept as historical trap). */
  retired: z.string().optional(),
  input: GoldenInputSchema,
  cassette: CassetteSchema,
  expectations: GoldenExpectationsSchema.default(() =>
    GoldenExpectationsSchema.parse({})
  ),
  /** Injected when runner uses llm-mode frozen. */
  frozen_llm_assessment: FrozenLlmAssessmentSchema,
  tags: z.array(z.string()).optional()
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export class GoldenSchemaError extends Error {
  readonly code = "GOLDEN_SCHEMA";
  constructor(
    message: string,
    readonly filePath?: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "GoldenSchemaError";
  }
}

export function parseGoldenCase(raw: unknown, filePath?: string): GoldenCase {
  const result = GoldenCaseSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new GoldenSchemaError(
      `Invalid golden case${filePath ? ` (${filePath})` : ""}: ${detail}`,
      filePath,
      result.error
    );
  }
  return result.data;
}

export function loadGoldenCase(filePath: string): GoldenCase {
  const abs = path.resolve(filePath);
  let text: string;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (error) {
    throw new GoldenSchemaError(
      `Cannot read golden case: ${abs}`,
      abs,
      error
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new GoldenSchemaError(`Golden case is not valid JSON: ${abs}`, abs, error);
  }
  return parseGoldenCase(raw, abs);
}

export type LoadGoldenOptions = {
  category?: GoldenCategory | GoldenCategory[];
  includeRetired?: boolean;
  /** If set, only load cases whose id is in this list. */
  ids?: string[];
};

function listJsonFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsonFilesRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Load all golden cases under a root (typically `evals/golden`).
 * Category subfolders are optional — cases also declare `category` in JSON.
 */
export function loadGoldenCases(
  rootDir: string,
  options: LoadGoldenOptions = {}
): GoldenCase[] {
  const absRoot = path.resolve(rootDir);
  const files = listJsonFilesRecursive(absRoot);
  const categoryFilter = options.category
    ? new Set(Array.isArray(options.category) ? options.category : [options.category])
    : null;
  const idFilter = options.ids ? new Set(options.ids) : null;

  const cases: GoldenCase[] = [];
  for (const file of files) {
    const gc = loadGoldenCase(file);
    if (gc.retired && !options.includeRetired) continue;
    if (categoryFilter && !categoryFilter.has(gc.category)) continue;
    if (idFilter && !idFilter.has(gc.id)) continue;
    cases.push(gc);
  }
  return cases;
}

/** Default golden root relative to Guardian repo cwd. */
export function defaultGoldenRoot(cwd: string = process.cwd()): string {
  return path.join(cwd, "evals", "golden");
}

/**
 * Guardian L1 eval runner (WP-1.3).
 *
 * Usage:
 *   npx tsx evals/runner.ts --llm-mode off
 *   npx tsx evals/runner.ts --llm-mode frozen --category duplex
 *   npx tsx evals/runner.ts --llm-mode off --write-baseline main
 *   npm run eval:fast
 *   npm run eval:baseline -- --tag main
 *
 * Spec: docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md §3 L1, §4
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianConfig } from "../src/guardian/config.js";
import type { GuardianLlmAssessment, GuardianReport } from "../src/guardian/report/models.js";
import { runGuardianPreflight } from "../src/guardian/tools/preflight.js";
import { CassetteRagClient, PLAN_DRIFT } from "./cassette-client.js";
import {
  evaluateL1Expectations,
  summarizeAssertions,
  type AssertionResult
} from "./expectations.js";
import {
  defaultGoldenRoot,
  isGoldenCategory,
  loadGoldenCases,
  type GoldenCase,
  type GoldenCategory
} from "./schema.js";

export type LlmMode = "off" | "frozen";

export type CaseResult = {
  id: string;
  category: string;
  llm_mode: LlmMode;
  passed: boolean;
  duration_ms: number;
  brief_chars: number;
  assertions: AssertionResult[];
  memory_write_action?: string;
  plan_drift: boolean;
  error?: string;
};

export type SuiteResult = {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  llm_mode: LlmMode;
  case_count: number;
  passed_count: number;
  failed_count: number;
  warn_count: number;
  meta_pollution_fails: number;
  cases: CaseResult[];
  baseline_tag?: string;
  regressions?: string[];
  improvements?: string[];
};

export type EvalConfig = Pick<
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
  | "GUARDIAN_AUTO_APPROVE"
>;

export function hermeticEvalConfig(): EvalConfig {
  return {
    GUARDIAN_CONFIDENCE_THRESHOLD: 70,
    GUARDIAN_LLM_ENABLED: false,
    OPENAI_API_KEY: undefined,
    GUARDIAN_MODEL: "eval-hermetic",
    GUARDIAN_LLM_REASONING_EFFORT: "low",
    GUARDIAN_LLM_VERBOSITY: "medium",
    GUARDIAN_LLM_MAX_EVIDENCE_CHARS: 32000,
    GUARDIAN_MEMORY_WRITE_MODE: "stage",
    // Keep budgets short so optional tools bail quickly if cassette is thin.
    GUARDIAN_EXPAND_BUDGET_MS: 200,
    GUARDIAN_VERIFY_BUDGET_MS: 200,
    // Hermetic: do not auto-approve staged writes (cassette has no stage tools)
    GUARDIAN_AUTO_APPROVE: "none"
  };
}

function collectPlanDrift(report: GuardianReport): string[] {
  const msgs: string[] = [];
  for (const call of report.tool_calls ?? []) {
    if (call.ok) continue;
    const err = call.error ?? "";
    if (err.includes(PLAN_DRIFT) || err.includes("CassetteMissError")) {
      msgs.push(`${call.tool}: ${err}`);
    }
  }
  return msgs;
}

async function withQuietLogs<T>(quiet: boolean, fn: () => Promise<T>): Promise<T> {
  if (!quiet) return fn();
  const log = console.log;
  const warn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    return await fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

function frozenFromCase(gc: GoldenCase): GuardianLlmAssessment | undefined {
  if (!gc.frozen_llm_assessment) return undefined;
  return gc.frozen_llm_assessment as unknown as GuardianLlmAssessment;
}

export async function runL1Case(
  gc: GoldenCase,
  options: { llmMode: LlmMode; quiet?: boolean; config?: EvalConfig }
): Promise<CaseResult> {
  const t0 = performance.now();
  const config = options.config ?? hermeticEvalConfig();
  const client = new CassetteRagClient(gc.cassette, { caseId: gc.id });

  try {
    const frozen =
      options.llmMode === "frozen" ? frozenFromCase(gc) : undefined;
    if (options.llmMode === "frozen" && !frozen) {
      const assertions: AssertionResult[] = [
        {
          name: "frozen_llm_assessment",
          pass: false,
          severity: "hard",
          detail: "llm-mode frozen but case has no frozen_llm_assessment"
        }
      ];
      return {
        id: gc.id,
        category: gc.category,
        llm_mode: options.llmMode,
        passed: false,
        duration_ms: Math.round(performance.now() - t0),
        brief_chars: 0,
        assertions,
        plan_drift: false,
        error: "missing frozen_llm_assessment"
      };
    }

    const report = await withQuietLogs(options.quiet !== false, () =>
      runGuardianPreflight(
        {
          user_message: gc.input.user_message,
          recent_context: gc.input.recent_context ?? undefined,
          scarlett_previous_message: gc.input.scarlett_previous_message ?? undefined,
          force_full_retrieval: gc.input.force_full_retrieval
        },
        client,
        config,
        {
          ...(frozen ? { frozenLlmAssessment: frozen } : {}),
          // Hermetic eval stays disk-free; telemetry is exercised in unit tests.
          disableTelemetry: true
        }
      )
    );

    const brief = compileGrokBrief(report);
    const planDriftMessages = collectPlanDrift(report);
    const assertions = evaluateL1Expectations({
      golden: gc,
      brief,
      report,
      planDriftMessages
    });
    const summary = summarizeAssertions(assertions);

    return {
      id: gc.id,
      category: gc.category,
      llm_mode: options.llmMode,
      passed: summary.passed,
      duration_ms: Math.round(performance.now() - t0),
      brief_chars: brief.length,
      assertions,
      memory_write_action: report.memory_write?.action,
      plan_drift: planDriftMessages.length > 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const assertions = evaluateL1Expectations({
      golden: gc,
      brief: "",
      report: {
        retrieval_status: "failed",
        confidence_score: 0,
        proceed_recommendation: "do_not_proceed",
        current_state_summary: "",
        critical_precedents: [],
        expanded_contexts: [],
        fact_checks: [],
        emotional_tone_guidance: "",
        things_to_avoid: [],
        open_threads: [],
        hard_flags: [],
        retrieval_notes: "",
        retrieval_plan: { preflight_query: "", memory_queries: [], high_risk_triggers: [] },
        tool_calls: []
      },
      crashMessage: message
    });
    return {
      id: gc.id,
      category: gc.category,
      llm_mode: options.llmMode,
      passed: false,
      duration_ms: Math.round(performance.now() - t0),
      brief_chars: 0,
      assertions,
      plan_drift: message.includes(PLAN_DRIFT),
      error: message
    };
  }
}

export async function runL1Suite(options: {
  goldenRoot?: string;
  llmMode: LlmMode;
  category?: GoldenCategory | GoldenCategory[];
  ids?: string[];
  quiet?: boolean;
}): Promise<SuiteResult> {
  const started = new Date();
  const t0 = performance.now();
  const root = options.goldenRoot ?? defaultGoldenRoot();
  const cases = loadGoldenCases(root, {
    category: options.category,
    ids: options.ids,
    includeRetired: false
  });

  const results: CaseResult[] = [];
  for (const gc of cases) {
    results.push(
      await runL1Case(gc, { llmMode: options.llmMode, quiet: options.quiet })
    );
  }

  const finished = new Date();
  let warn_count = 0;
  let meta_pollution_fails = 0;
  for (const c of results) {
    for (const a of c.assertions) {
      if (a.severity === "warn" && !a.pass) warn_count++;
      if (a.name === "brief_must_not_include" && !a.pass) meta_pollution_fails++;
    }
  }

  const passed_count = results.filter((r) => r.passed).length;
  return {
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_ms: Math.round(performance.now() - t0),
    llm_mode: options.llmMode,
    case_count: results.length,
    passed_count,
    failed_count: results.length - passed_count,
    warn_count,
    meta_pollution_fails,
    cases: results
  };
}

// --- baselines & scorecards ---

export type BaselineSnapshot = {
  tag: string;
  created_at: string;
  llm_mode: LlmMode;
  cases: Array<{
    id: string;
    passed: boolean;
    assertion_fails: string[];
    brief_chars: number;
  }>;
};

export function suiteToBaseline(suite: SuiteResult, tag: string): BaselineSnapshot {
  return {
    tag,
    created_at: suite.finished_at,
    llm_mode: suite.llm_mode,
    cases: suite.cases.map((c) => ({
      id: c.id,
      passed: c.passed,
      assertion_fails: c.assertions.filter((a) => !a.pass && a.severity === "hard").map((a) => a.name),
      brief_chars: c.brief_chars
    }))
  };
}

export function diffAgainstBaseline(
  suite: SuiteResult,
  baseline: BaselineSnapshot
): { regressions: string[]; improvements: string[] } {
  const baseById = new Map(baseline.cases.map((c) => [c.id, c]));
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const c of suite.cases) {
    const prev = baseById.get(c.id);
    if (!prev) continue;
    if (prev.passed && !c.passed) {
      const fails = c.assertions
        .filter((a) => !a.pass && a.severity === "hard")
        .map((a) => a.detail)
        .join("; ");
      regressions.push(`${c.id} ${c.category}: was passing, now failing — ${fails}`);
    }
    if (!prev.passed && c.passed) {
      improvements.push(`${c.id} ${c.category}: was failing, now passing`);
    }
  }
  return { regressions, improvements };
}

export function renderScorecardMd(suite: SuiteResult): string {
  const lines: string[] = [];
  lines.push(`# Guardian Eval Scorecard — ${suite.finished_at}`);
  lines.push(
    `Tiers: L1 (${suite.case_count} cases, llm-mode=${suite.llm_mode}) · duration ${suite.duration_ms} ms`
  );
  lines.push("");
  if (suite.baseline_tag) {
    lines.push(`Baseline: \`${suite.baseline_tag}\``);
    lines.push("");
  }
  if (suite.regressions?.length) {
    lines.push(`## Regressions (${suite.regressions.length}) ← read this first`);
    for (const r of suite.regressions) lines.push(`- ${r}`);
    lines.push("");
  }
  if (suite.improvements?.length) {
    lines.push(`## Improvements (${suite.improvements.length})`);
    for (const r of suite.improvements) lines.push(`- ${r}`);
    lines.push("");
  }
  lines.push("## Aggregate metrics");
  lines.push("");
  lines.push("| metric | value |");
  lines.push("|--------|------:|");
  lines.push(`| cases | ${suite.case_count} |`);
  lines.push(`| passed | ${suite.passed_count} |`);
  lines.push(`| failed | ${suite.failed_count} |`);
  lines.push(`| warn (PLAN_DRIFT etc.) | ${suite.warn_count} |`);
  lines.push(`| meta_pollution_fails | ${suite.meta_pollution_fails} |`);
  const briefs = suite.cases.map((c) => c.brief_chars).filter((n) => n > 0).sort((a, b) => a - b);
  if (briefs.length) {
    const p50 = briefs[Math.floor(briefs.length / 2)];
    lines.push(`| brief_chars p50 | ${p50} |`);
  }
  lines.push("");
  lines.push("## Cases");
  lines.push("");
  for (const c of suite.cases) {
    const mark = c.passed ? "PASS" : "FAIL";
    lines.push(`### ${c.id} — ${mark} (${c.duration_ms} ms, ${c.category})`);
    if (c.error) lines.push(`- crash: ${c.error}`);
    if (c.plan_drift) lines.push(`- PLAN_DRIFT: yes`);
    if (c.memory_write_action) lines.push(`- memory_write: ${c.memory_write_action}`);
    lines.push(`- brief_chars: ${c.brief_chars}`);
    const fails = c.assertions.filter((a) => !a.pass);
    if (fails.length) {
      for (const a of fails) {
        lines.push(`- **${a.severity.toUpperCase()}** \`${a.name}\`: ${a.detail}`);
      }
    } else {
      lines.push(`- all ${c.assertions.length} assertions green`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function writeScorecard(
  suite: SuiteResult,
  runsDir: string
): { mdPath: string; jsonPath: string } {
  fs.mkdirSync(runsDir, { recursive: true });
  const stamp = suite.finished_at.replace(/[:.]/g, "-");
  const mdPath = path.join(runsDir, `${stamp}-scorecard.md`);
  const jsonPath = path.join(runsDir, `${stamp}-scorecard.json`);
  fs.writeFileSync(mdPath, renderScorecardMd(suite), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(suite, null, 2) + "\n", "utf8");
  return { mdPath, jsonPath };
}

export function writeBaseline(
  snapshot: BaselineSnapshot,
  baselinesDir: string
): string {
  fs.mkdirSync(baselinesDir, { recursive: true });
  const safe = snapshot.tag.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const out = path.join(baselinesDir, `${safe}.json`);
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return out;
}

export function loadBaseline(baselinesDir: string, tag: string): BaselineSnapshot | null {
  const safe = tag.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const p = path.join(baselinesDir, `${safe}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as BaselineSnapshot;
}

// --- CLI ---

function printHelp(): never {
  console.log(`Guardian L1 eval runner (WP-1.3)

Usage:
  npx tsx evals/runner.ts [options]
  npm run eval:fast
  npm run eval:baseline -- --tag <name>

Options:
  --llm-mode off|frozen   Default: off (heuristic assembly). frozen uses case frozen_llm_assessment.
  --category <cat>        Filter (repeatable via comma list).
  --id <gt-...>           Run only these ids (comma list).
  --golden-root <dir>     Default: evals/golden
  --baseline <tag>        Diff against evals/baselines/<tag>.json
  --write-baseline <tag>  After run, snapshot results to baselines/<tag>.json
  --tag <tag>             Alias for --write-baseline (npm run eval:baseline -- --tag main)
  --no-write-scorecard    Skip evals/runs scorecard files
  --verbose               Do not silence preflight logs
  -h, --help
`);
  process.exit(0);
}

function parseCli(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      flags.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (["no-write-scorecard", "verbose", "help"].includes(key)) {
        flags[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        // allow --write-baseline without value → "latest"
        if (key === "write-baseline") {
          flags[key] = "latest";
          continue;
        }
        throw new Error(`Missing value for --${key}`);
      }
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

async function mainCli(): Promise<void> {
  const flags = parseCli(process.argv.slice(2));
  if (flags.help) printHelp();

  const llmMode = (String(flags["llm-mode"] ?? "off") as LlmMode);
  if (llmMode !== "off" && llmMode !== "frozen") {
    console.error("--llm-mode must be off or frozen");
    process.exit(2);
  }

  // Resolve baseline write tag:
  //   npm run eval:baseline -- --tag main  → package.json already passes --write-baseline
  //   --tag wins over bare/default "latest"
  if (flags.tag) {
    flags["write-baseline"] = String(flags.tag);
  } else if (flags["write-baseline"] === true) {
    flags["write-baseline"] = "latest";
  }

  let category: GoldenCategory | GoldenCategory[] | undefined;
  if (flags.category) {
    const parts = String(flags.category)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      if (!isGoldenCategory(p)) {
        console.error(`Unknown category: ${p}`);
        process.exit(2);
      }
    }
    category = parts.length === 1 ? (parts[0] as GoldenCategory) : (parts as GoldenCategory[]);
  }

  const ids = flags.id
    ? String(flags.id)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const cwd = process.cwd();
  const goldenRoot = flags["golden-root"]
    ? path.resolve(String(flags["golden-root"]))
    : defaultGoldenRoot(cwd);
  const runsDir = path.join(cwd, "evals", "runs");
  const baselinesDir = path.join(cwd, "evals", "baselines");

  const suite = await runL1Suite({
    goldenRoot,
    llmMode,
    category,
    ids,
    quiet: !flags.verbose
  });

  if (flags.baseline) {
    const tag = String(flags.baseline);
    const baseline = loadBaseline(baselinesDir, tag);
    if (!baseline) {
      console.warn(`Warning: baseline "${tag}" not found under ${baselinesDir}`);
    } else {
      const diff = diffAgainstBaseline(suite, baseline);
      suite.baseline_tag = tag;
      suite.regressions = diff.regressions;
      suite.improvements = diff.improvements;
    }
  }

  if (!flags["no-write-scorecard"] && suite.case_count > 0) {
    const { mdPath, jsonPath } = writeScorecard(suite, runsDir);
    console.log(`scorecard: ${mdPath}`);
    console.log(`scorecard: ${jsonPath}`);
  }

  if (flags["write-baseline"]) {
    const tag = String(flags["write-baseline"]);
    const snap = suiteToBaseline(suite, tag);
    const out = writeBaseline(snap, baselinesDir);
    console.log(`baseline written: ${out}`);
  }

  console.log(
    `L1 ${llmMode}: ${suite.passed_count}/${suite.case_count} passed, ${suite.failed_count} failed, ${suite.warn_count} warns, ${suite.duration_ms} ms`
  );
  if (suite.regressions?.length) {
    console.log(`regressions vs baseline: ${suite.regressions.length}`);
    for (const r of suite.regressions) console.log(`  - ${r}`);
  }
  for (const c of suite.cases.filter((x) => !x.passed)) {
    console.log(`FAIL ${c.id}`);
    for (const a of c.assertions.filter((x) => !x.pass && x.severity === "hard")) {
      console.log(`  [${a.name}] ${a.detail}`);
    }
  }

  // Empty suite is green (no goldens yet is ok until WP-1.4 seeds them).
  // Hard failures → exit 1. PLAN_DRIFT warns alone → exit 0.
  if (suite.failed_count > 0) process.exit(1);
  if (suite.regressions && suite.regressions.length > 0) process.exit(1);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).includes(`${path.sep}evals${path.sep}runner`);

if (isMain) {
  mainCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

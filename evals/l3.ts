/**
 * WP-4.8 — L3 auditor eval: live terra on cassette-frozen retrieval, N trials.
 *
 * Usage:
 *   npm run eval:llm -- --category duplex --trials 3
 *   npx tsx evals/runner.ts --llm-mode live --category duplex,write-back --trials 3
 *
 * Requires OPENAI_API_KEY (+ GUARDIAN_LLM_ENABLED effective true in liveConfig).
 * Spec: guardian-eval-harness-design-2026-07.md §3 L3
 */
import "dotenv/config";
import { performance } from "node:perf_hooks";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport } from "../src/guardian/report/models.js";
import { runGuardianPreflight } from "../src/guardian/tools/preflight.js";
import { CassetteRagClient, PLAN_DRIFT } from "./cassette-client.js";
import {
  evaluateL1Expectations,
  evaluateL3Expectations,
  majorityVoteTrials,
  summarizeAssertions,
  type AssertionResult
} from "./expectations.js";
import type { CaseResult, EvalConfig } from "./runner.js";
import { hermeticEvalConfig as baseHermetic } from "./runner.js";
import {
  defaultGoldenRoot,
  loadGoldenCases,
  type GoldenCase,
  type GoldenCategory
} from "./schema.js";

export type L3CaseResult = CaseResult & {
  trials: number;
  trial_pass_count: number;
  flaky_assertions: string[];
  avg_facts?: number;
};

export type L3SuiteResult = {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  trials: number;
  case_count: number;
  passed_count: number;
  failed_count: number;
  flaky_case_count: number;
  skipped_no_key: boolean;
  cases: L3CaseResult[];
  correction_precision?: number;
  correction_recall?: number;
};

export function liveEvalConfig(overrides?: Partial<EvalConfig>): EvalConfig {
  const key = process.env.OPENAI_API_KEY;
  const auditorMs = Number(process.env.GUARDIAN_BUDGET_AUDITOR_MS);
  return {
    ...baseHermetic(),
    GUARDIAN_LLM_ENABLED: true,
    OPENAI_API_KEY: key,
    GUARDIAN_MODEL: process.env.GUARDIAN_MODEL ?? "gpt-5.6-terra",
    GUARDIAN_LLM_REASONING_EFFORT: "low",
    GUARDIAN_MEMORY_WRITE_MODE: "off", // L3: do not stage during eval
    GUARDIAN_AUTO_APPROVE: "none",
    // Hermetic config uses 200ms so llm-off never waits; live terra needs the real budget.
    GUARDIAN_BUDGET_AUDITOR_MS:
      Number.isFinite(auditorMs) && auditorMs > 1000 ? auditorMs : 12000,
    GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS: 45000,
    ...overrides
  };
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

export async function runL3Case(
  gc: GoldenCase,
  options: { trials: number; quiet?: boolean; config?: EvalConfig }
): Promise<L3CaseResult> {
  const t0 = performance.now();
  const trials = Math.max(1, options.trials);
  const config = options.config ?? liveEvalConfig();
  const client = new CassetteRagClient(gc.cassette, { caseId: gc.id });

  if (!config.OPENAI_API_KEY) {
    return {
      id: gc.id,
      category: gc.category,
      llm_mode: "live",
      passed: false,
      duration_ms: Math.round(performance.now() - t0),
      brief_chars: 0,
      assertions: [
        {
          name: "openai_api_key",
          pass: false,
          severity: "hard",
          detail: "OPENAI_API_KEY required for L3 live auditor trials"
        }
      ],
      plan_drift: false,
      trials,
      trial_pass_count: 0,
      flaky_assertions: [],
      error: "missing OPENAI_API_KEY"
    };
  }

  const trialAssertions: AssertionResult[][] = [];
  const trialPassed: boolean[] = [];
  let lastBriefChars = 0;
  let factsSum = 0;
  let lastError: string | undefined;

  for (let t = 0; t < trials; t++) {
    try {
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
          { disableTelemetry: true }
        )
      );
      const brief = compileGrokBrief(report);
      lastBriefChars = brief.length;
      factsSum += report.llm_assessment?.supported_facts?.length ?? 0;
      const planDrift = collectPlanDrift(report);
      const llmErr = report.llm_assessment?.error;
      const l1 = evaluateL1Expectations({
        golden: gc,
        brief,
        report,
        planDriftMessages: planDrift
      });
      const l3 = evaluateL3Expectations({ golden: gc, report });
      // L3: meta pollution + correction + llm block; write_action skipped (mode off)
      const combined: AssertionResult[] = [
        ...l1.filter((a) =>
          ["brief_must_not_include", "correction_expected", "PLAN_DRIFT", "pipeline_crash"].includes(
            a.name
          )
        ),
        ...l3
      ];
      if (llmErr) {
        combined.push({
          name: "llm_assessment_error",
          pass: false,
          severity: "hard",
          detail: String(llmErr)
        });
      } else if (report.llm_assessment?.enabled === false) {
        combined.push({
          name: "llm_assessment_error",
          pass: false,
          severity: "hard",
          detail: "llm_assessment.enabled=false during L3 live run"
        });
      }
      trialAssertions.push(combined);
      trialPassed.push(summarizeAssertions(combined).passed);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      trialAssertions.push([
        {
          name: "pipeline_crash",
          pass: false,
          severity: "hard",
          detail: lastError
        }
      ]);
      trialPassed.push(false);
    } finally {
      // Reset cassette FIFO/map between trials so trial N+1 replays from the start
      client.reset();
    }
  }

  const voted = majorityVoteTrials(trialAssertions);
  const summary = summarizeAssertions(voted.assertions);
  const trial_pass_count = trialPassed.filter(Boolean).length;

  return {
    id: gc.id,
    category: gc.category,
    llm_mode: "live",
    passed: summary.passed,
    duration_ms: Math.round(performance.now() - t0),
    brief_chars: lastBriefChars,
    assertions: voted.assertions,
    plan_drift: voted.assertions.some((a) => a.name === "PLAN_DRIFT" && !a.pass),
    trials,
    trial_pass_count,
    flaky_assertions: voted.flaky,
    avg_facts: trials > 0 ? factsSum / trials : 0,
    error: lastError
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

export async function runL3Suite(options: {
  goldenRoot?: string;
  category?: GoldenCategory | GoldenCategory[];
  ids?: string[];
  trials?: number;
  quiet?: boolean;
  /** If true, only cases that have expectations.llm or category duplex/write-back */
  preferLlmCases?: boolean;
}): Promise<L3SuiteResult> {
  const started = new Date();
  const t0 = performance.now();
  const trials = options.trials ?? 3;
  const root = options.goldenRoot ?? defaultGoldenRoot();
  let cases = loadGoldenCases(root, {
    category: options.category,
    ids: options.ids,
    includeRetired: false
  });

  if (options.preferLlmCases !== false && !options.ids) {
    const filtered = cases.filter(
      (c) =>
        c.expectations.llm != null ||
        c.category === "duplex" ||
        c.category === "write-back"
    );
    if (filtered.length) cases = filtered;
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      started_at: started.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Math.round(performance.now() - t0),
      trials,
      case_count: 0,
      passed_count: 0,
      failed_count: 0,
      flaky_case_count: 0,
      skipped_no_key: true,
      cases: []
    };
  }

  const results: L3CaseResult[] = [];
  for (const gc of cases) {
    results.push(
      await runL3Case(gc, { trials, quiet: options.quiet })
    );
  }

  // Duplex precision/recall: required→true positive when correction fires (assert pass);
  // none→false positive when correction incorrectly fires (assert fail).
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const c of results) {
    const gc = cases.find((g) => g.id === c.id);
    if (!gc || gc.category !== "duplex") continue;
    const exp = gc.expectations.correction_expected;
    if (exp === "either") continue;
    const correctionOk = c.assertions.find((a) => a.name.includes("correction"))?.pass;
    if (exp === "required") {
      if (correctionOk) tp++;
      else fn++;
    } else if (exp === "none") {
      // pass ⇒ correctly withheld (true negative); fail ⇒ false positive
      if (!correctionOk) fp++;
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : undefined;
  const recall = tp + fn > 0 ? tp / (tp + fn) : undefined;

  const finished = new Date();
  return {
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_ms: Math.round(performance.now() - t0),
    trials,
    case_count: results.length,
    passed_count: results.filter((r) => r.passed).length,
    failed_count: results.filter((r) => !r.passed).length,
    flaky_case_count: results.filter((r) => r.flaky_assertions.length > 0).length,
    skipped_no_key: false,
    cases: results,
    correction_precision: precision,
    correction_recall: recall
  };
}

export function renderL3ScorecardMd(suite: L3SuiteResult): string {
  const lines: string[] = [];
  lines.push(`# Guardian L3 Eval Scorecard — ${suite.finished_at}`);
  lines.push(
    `Trials/case: ${suite.trials} · cases ${suite.case_count} · duration ${suite.duration_ms} ms`
  );
  if (suite.skipped_no_key) {
    lines.push("");
    lines.push("**Skipped:** OPENAI_API_KEY not set.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push("| metric | value |");
  lines.push("|--------|------:|");
  lines.push(`| passed | ${suite.passed_count}/${suite.case_count} |`);
  lines.push(`| flaky cases | ${suite.flaky_case_count} |`);
  if (suite.correction_precision != null) {
    lines.push(`| duplex correction precision | ${suite.correction_precision.toFixed(2)} |`);
  }
  if (suite.correction_recall != null) {
    lines.push(`| duplex correction recall | ${suite.correction_recall.toFixed(2)} |`);
  }
  const avgFacts =
    suite.cases.reduce((s, c) => s + (c.avg_facts ?? 0), 0) / Math.max(1, suite.cases.length);
  lines.push(`| avg facts (L3) | ${avgFacts.toFixed(2)} |`);
  lines.push("");
  lines.push("## Cases");
  for (const c of suite.cases) {
    lines.push(`### ${c.id} — ${c.passed ? "PASS" : "FAIL"} (${c.trial_pass_count}/${c.trials} trials)`);
    if (c.flaky_assertions.length) {
      lines.push(`- flaky: ${c.flaky_assertions.join(", ")}`);
    }
    if (c.avg_facts != null) lines.push(`- avg_facts: ${c.avg_facts.toFixed(2)}`);
    for (const a of c.assertions.filter((x) => !x.pass)) {
      lines.push(`- **${a.severity}** \`${a.name}\`: ${a.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

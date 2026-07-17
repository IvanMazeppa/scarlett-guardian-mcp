/**
 * L1 expectation engine (WP-1.3).
 * Spec: docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md §2.2, §4.3
 */
import type { GuardianReport } from "../src/guardian/report/models.js";
import type { GoldenCase, GoldenExpectations } from "./schema.js";

export type AssertionSeverity = "hard" | "warn";

export type AssertionResult = {
  name: string;
  pass: boolean;
  severity: AssertionSeverity;
  detail: string;
};

/** Match phrase as case-insensitive substring, or /regex/flags form. */
export function textMatches(haystack: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return true;
  const reForm = trimmed.match(/^\/(.+)\/([a-z]*)$/i);
  if (reForm) {
    try {
      return new RegExp(reForm[1], reForm[2] || "i").test(haystack);
    } catch {
      return haystack.toLowerCase().includes(trimmed.toLowerCase());
    }
  }
  return haystack.toLowerCase().includes(trimmed.toLowerCase());
}

/** Outer AND, inner OR. */
export function matchesPhraseGroups(haystack: string, groups: string[][]): boolean {
  return groups.every((group) => group.some((phrase) => textMatches(haystack, phrase)));
}

function correctionPresent(report: GuardianReport): boolean {
  const c = report.llm_assessment?.grok_performance_correction;
  return typeof c === "string" && c.trim().length > 0 && c.trim() !== "null";
}

function writeActionClass(report: GuardianReport): "none" | "stage" | "stage_transition" | "other" {
  const action = report.memory_write?.action ?? "none";
  if (action === "none") return "none";
  if (action === "stage_transition") return "stage_transition";
  if (action === "staged") {
    const reason = report.memory_write?.reason ?? "";
    if (/stage_transition|scene.?transition|scene.?advance/i.test(reason)) return "stage_transition";
    return "stage";
  }
  return "other";
}

function precedentBlob(report: GuardianReport): string {
  const parts = [
    ...(report.critical_precedents ?? []),
    ...(report.grok_precedents ?? [])
  ].map((p) => `${p.topic}\n${p.details}\n${p.must_respect ?? ""}`);
  return parts.join("\n---\n");
}

/**
 * Evaluate every L1 expectation (everything except the `llm` block).
 * PLAN_DRIFT is supplied by the runner as a warn-level synthetic assertion.
 */
export function evaluateL1Expectations(input: {
  golden: GoldenCase;
  brief: string;
  report: GuardianReport;
  planDriftMessages?: string[];
  crashMessage?: string;
}): AssertionResult[] {
  const exp: GoldenExpectations = input.golden.expectations;
  const results: AssertionResult[] = [];
  const brief = input.brief ?? "";
  const flags = input.report.hard_flags ?? [];

  if (input.crashMessage) {
    results.push({
      name: "pipeline_crash",
      pass: false,
      severity: "hard",
      detail: input.crashMessage
    });
    return results;
  }

  for (const msg of input.planDriftMessages ?? []) {
    results.push({
      name: "PLAN_DRIFT",
      pass: false,
      severity: "warn",
      detail: msg
    });
  }

  if (exp.brief_must_include.length > 0) {
    const ok = matchesPhraseGroups(brief, exp.brief_must_include);
    results.push({
      name: "brief_must_include",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `all ${exp.brief_must_include.length} phrase group(s) matched`
        : `missing phrase group(s): ${JSON.stringify(exp.brief_must_include)}`
    });
  }

  for (const banned of exp.brief_must_not_include) {
    const hit = textMatches(brief, banned);
    results.push({
      name: "brief_must_not_include",
      pass: !hit,
      severity: "hard",
      detail: hit ? `brief contains forbidden: ${banned}` : `ok: absent "${banned}"`
    });
  }

  for (const flag of exp.flags_expected) {
    const hit = flags.some((f) => textMatches(f, flag));
    results.push({
      name: "flags_expected",
      pass: hit,
      severity: "hard",
      detail: hit ? `flag present: ${flag}` : `missing expected flag: ${flag}`
    });
  }

  for (const flag of exp.flags_forbidden) {
    const hit = flags.some((f) => textMatches(f, flag));
    results.push({
      name: "flags_forbidden",
      pass: !hit,
      severity: "hard",
      detail: hit ? `forbidden flag present: ${flag}` : `ok: no "${flag}"`
    });
  }

  const precText = precedentBlob(input.report);
  for (const pattern of exp.precedents_must_not_match) {
    let hit = false;
    try {
      hit = new RegExp(pattern, "i").test(precText);
    } catch {
      hit = precText.toLowerCase().includes(pattern.toLowerCase());
    }
    results.push({
      name: "precedents_must_not_match",
      pass: !hit,
      severity: "hard",
      detail: hit
        ? `precedent text matched forbidden /${pattern}/`
        : `ok: no precedent match for /${pattern}/`
    });
  }

  // L1 hermetic (LLM off) has no auditor correction — skip unless assessment is enabled
  // (frozen injection or live). L3 always scores correction via evaluateL3Expectations.
  if (
    exp.correction_expected !== "either" &&
    input.report.llm_assessment?.enabled
  ) {
    const present = correctionPresent(input.report);
    const ok =
      exp.correction_expected === "required" ? present : !present;
    results.push({
      name: "correction_expected",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `correction ${present ? "present" : "absent"} as expected (${exp.correction_expected})`
        : `expected correction=${exp.correction_expected}, present=${present}`
    });
  }

  if (exp.write_action_expected !== "either") {
    const actual = writeActionClass(input.report);
    let ok = false;
    if (exp.write_action_expected === "none") ok = actual === "none";
    else if (exp.write_action_expected === "stage") ok = actual === "stage" || actual === "stage_transition";
    else if (exp.write_action_expected === "stage_transition") ok = actual === "stage_transition" || actual === "stage";
    results.push({
      name: "write_action_expected",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `write action ${actual} matches ${exp.write_action_expected}`
        : `expected write=${exp.write_action_expected}, got memory_write.action=${input.report.memory_write?.action ?? "none"} (${actual})`
    });
  }

  if (exp.brief_chars) {
    const len = brief.length;
    const min = exp.brief_chars.min ?? 0;
    const max = exp.brief_chars.max ?? Number.POSITIVE_INFINITY;
    const ok = len >= min && len <= max;
    results.push({
      name: "brief_chars",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `brief length ${len} within [${min}, ${max === Number.POSITIVE_INFINITY ? "∞" : max}]`
        : `brief length ${len} outside [${min}, ${max}]`
    });
  }

  return results;
}

/**
 * L3 — score the optional `expectations.llm` block against auditor output (WP-4.8).
 * Used with live terra trials on cassette-frozen retrieval.
 */
export function evaluateL3Expectations(input: {
  golden: GoldenCase;
  report: GuardianReport;
}): AssertionResult[] {
  const llmExp = input.golden.expectations.llm;
  const results: AssertionResult[] = [];
  if (!llmExp) {
    results.push({
      name: "llm_block",
      pass: true,
      severity: "warn",
      detail: "no expectations.llm block — L3 checks skipped for this case"
    });
    return results;
  }

  const assessment = input.report.llm_assessment;
  const facts = assessment?.supported_facts ?? [];
  const factsBlob = facts.join("\n");

  if (llmExp.facts_min != null) {
    const ok = facts.length >= llmExp.facts_min;
    results.push({
      name: "llm.facts_min",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `facts_count ${facts.length} >= ${llmExp.facts_min}`
        : `facts_count ${facts.length} < min ${llmExp.facts_min}`
    });
  }

  if (llmExp.facts_must_cover?.length) {
    const ok = matchesPhraseGroups(factsBlob, llmExp.facts_must_cover);
    results.push({
      name: "llm.facts_must_cover",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `covered ${llmExp.facts_must_cover.length} phrase group(s)`
        : `facts missing coverage for ${JSON.stringify(llmExp.facts_must_cover)}`
    });
  }

  if (llmExp.scene_delta_required) {
    const delta = assessment?.scene_state_delta?.trim() ?? "";
    const ok = delta.length > 0 && delta !== "null";
    results.push({
      name: "llm.scene_delta_required",
      pass: ok,
      severity: "hard",
      detail: ok ? "scene_state_delta present" : "scene_state_delta missing/empty"
    });
  }

  // Duplex correction (reuse top-level correction_expected when llm block present)
  const corrExp = input.golden.expectations.correction_expected;
  if (corrExp !== "either") {
    const present = correctionPresent(input.report);
    const ok = corrExp === "required" ? present : !present;
    results.push({
      name: "llm.correction_expected",
      pass: ok,
      severity: "hard",
      detail: ok
        ? `correction ${present ? "present" : "absent"} (${corrExp})`
        : `expected correction=${corrExp}, present=${present}`
    });
  }

  return results;
}

export function summarizeAssertions(assertions: AssertionResult[]): {
  hardFail: number;
  hardPass: number;
  warnFail: number;
  passed: boolean;
} {
  let hardFail = 0;
  let hardPass = 0;
  let warnFail = 0;
  for (const a of assertions) {
    if (a.severity === "hard") {
      if (a.pass) hardPass++;
      else hardFail++;
    } else if (!a.pass) {
      warnFail++;
    }
  }
  return { hardFail, hardPass, warnFail, passed: hardFail === 0 };
}

/**
 * Collapse same-named assertions within one trial: hard fails if any hard fails;
 * otherwise pass if all pass. Prevents multi-row gates (e.g. brief_must_not_include × N)
 * from inflating majority counts.
 */
export function collapseAssertionsByName(list: AssertionResult[]): AssertionResult[] {
  const byName = new Map<string, AssertionResult[]>();
  for (const a of list) {
    const arr = byName.get(a.name) ?? [];
    arr.push(a);
    byName.set(a.name, arr);
  }
  const out: AssertionResult[] = [];
  for (const [name, arr] of byName) {
    if (arr.length === 1) {
      out.push(arr[0]!);
      continue;
    }
    const hardFails = arr.filter((a) => a.severity === "hard" && !a.pass);
    const anyFail = arr.filter((a) => !a.pass);
    const severity: AssertionResult["severity"] = hardFails.length
      ? "hard"
      : arr.some((a) => a.severity === "hard")
        ? "hard"
        : "warn";
    const pass = hardFails.length === 0 && anyFail.length === 0;
    out.push({
      name,
      pass,
      severity,
      detail: pass
        ? `${arr.length} sub-assertions ok`
        : anyFail.map((a) => a.detail).join(" | ")
    });
  }
  return out;
}

/**
 * Majority vote across N trials: each hard assertion passes if ≥ minPass trials pass it.
 * Default minPass = ceil(2N/3). Same-named assertions within a trial are collapsed first.
 */
export function majorityVoteTrials(
  trialAssertions: AssertionResult[][],
  minPass?: number
): { assertions: AssertionResult[]; flaky: string[]; trials: number } {
  const trials = trialAssertions.length;
  const need = minPass ?? Math.ceil((trials * 2) / 3);
  const collapsed = trialAssertions.map(collapseAssertionsByName);
  const byName = new Map<string, AssertionResult[]>();
  for (const list of collapsed) {
    for (const a of list) {
      const arr = byName.get(a.name) ?? [];
      arr.push(a);
      byName.set(a.name, arr);
    }
  }
  const assertions: AssertionResult[] = [];
  const flaky: string[] = [];
  for (const [name, arr] of byName) {
    const passCount = arr.filter((a) => a.pass).length;
    const severity = arr[0]?.severity ?? "hard";
    const ok = passCount >= need;
    if (passCount > 0 && passCount < trials) flaky.push(name);
    assertions.push({
      name,
      pass: ok,
      severity,
      detail: `${passCount}/${trials} trials passed (need ≥${need}); last: ${arr[arr.length - 1]?.detail ?? ""}`
    });
  }
  return { assertions, flaky, trials };
}

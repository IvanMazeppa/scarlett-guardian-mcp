#!/usr/bin/env npx tsx
/**
 * WP-1.2 — Extract a golden-case skeleton from a saved preflight-full report.
 *
 * Usage:
 *   npx tsx scripts/curate-golden.ts docs/guardian-reports/preflight-full-<ts>.json \
 *     --category temporal-mud
 *   npx tsx scripts/curate-golden.ts <report.json> --category duplex --id gt-030-passive-prior
 *   npx tsx scripts/curate-golden.ts <report.json> --category write-back --stdout
 *   npx tsx scripts/curate-golden.ts <report.json> --category continuous-scene --dry-run
 *
 * Acceptance: one case extracted from a real report in < 10 min (expectations still human-authored).
 */
import fs from "node:fs";
import path from "node:path";
import {
  curateGoldenFromReport,
  defaultOutputPath,
  isGoldenCategory,
  type PreflightReportLike
} from "../evals/curate-from-report.js";
import { GOLDEN_CATEGORIES } from "../evals/schema.js";

function printHelp(): never {
  console.log(`curate-golden — report JSON → golden skeleton (WP-1.2)

Usage:
  npx tsx scripts/curate-golden.ts <preflight-full.json> --category <cat> [options]

Categories:
  ${GOLDEN_CATEGORIES.join(", ")}

Options:
  --category <cat>   Required. Golden category folder + field.
  --id <gt-...>      Optional. Default derived from report timestamp + category.
  --out <path>       Optional. Default evals/golden/<category>/<id>.json
  --description <t>  Optional one-line description override.
  --sequence <n>     Optional number embedded in auto id (e.g. 25 → gt-025-...).
  --no-frozen-llm    Omit frozen_llm_assessment (smaller files).
  --stdout           Print JSON to stdout (still writes unless --dry-run).
  --dry-run          Do not write a file; print summary + path that would be used.
  --force            Overwrite existing output file.
  -h, --help         This help.
`);
  process.exit(0);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      flags.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const boolFlags = new Set([
        "stdout",
        "dry-run",
        "force",
        "no-frozen-llm",
        "help"
      ]);
      if (boolFlags.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      flags[key] = next;
      i++;
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

function main(): void {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || positional.length === 0) printHelp();

  const reportPath = path.resolve(positional[0]);
  const categoryRaw = String(flags.category ?? "");
  if (!categoryRaw || !isGoldenCategory(categoryRaw)) {
    console.error(
      `Error: --category is required and must be one of:\n  ${GOLDEN_CATEGORIES.join(", ")}`
    );
    process.exit(2);
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`Error: report not found: ${reportPath}`);
    process.exit(2);
  }

  let report: PreflightReportLike;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as PreflightReportLike;
  } catch (error) {
    console.error(
      `Error: cannot parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }

  const sequence =
    flags.sequence !== undefined ? Number(flags.sequence) : undefined;
  if (flags.sequence !== undefined && !Number.isFinite(sequence)) {
    console.error("Error: --sequence must be a number");
    process.exit(2);
  }

  const result = curateGoldenFromReport(report, {
    category: categoryRaw,
    id: flags.id ? String(flags.id) : undefined,
    description: flags.description ? String(flags.description) : undefined,
    sourceReportPath: reportPath,
    includeFrozenLlm: !flags["no-frozen-llm"],
    sequence: sequence as number | undefined
  });

  const outPath = flags.out
    ? path.resolve(String(flags.out))
    : defaultOutputPath(categoryRaw, result.golden.id);

  const json = JSON.stringify(result.golden, null, 2) + "\n";

  console.log("=== curate-golden ===");
  console.log(`source:     ${reportPath}`);
  console.log(`id:         ${result.golden.id}`);
  console.log(`category:   ${result.golden.category}`);
  console.log(`out:        ${outPath}`);
  console.log(`tools:      ${JSON.stringify(result.tool_summary)}`);
  console.log(`user chars: ${result.golden.input.user_message.length}`);
  console.log(
    `recent:     ${
      result.golden.input.recent_context
        ? `${String(result.golden.input.recent_context).slice(0, 80)}…`
        : "(none)"
    }`
  );
  console.log(`parse notes:`);
  for (const n of result.parse_notes) console.log(`  - ${n}`);
  if (result.duplex_noted_but_text_missing) {
    console.log(
      "NOTE: duplex was provided at capture but text is not in the report — fill scarlett_previous_message manually."
    );
  }
  console.log(
    "NEXT: author expectations.brief_must_include (+ case-specific must_not / precedents) then commit under evals/golden/."
  );

  if (flags.stdout) {
    process.stdout.write(json);
  }

  if (flags["dry-run"]) {
    console.log("dry-run: no file written");
    return;
  }

  if (fs.existsSync(outPath) && !flags.force) {
    console.error(
      `Error: output exists (${outPath}). Pass --force to overwrite, or --out / --id.`
    );
    process.exit(3);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json, "utf8");
  console.log(`wrote: ${outPath} (${json.length} bytes)`);
}

try {
  main();
} catch (error) {
  console.error(`curate-golden failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

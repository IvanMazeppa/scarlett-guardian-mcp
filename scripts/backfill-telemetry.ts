#!/usr/bin/env npx tsx
/**
 * WP-1.7 — Backfill NDJSON telemetry from docs/guardian-reports/preflight-full-*.json
 *
 * Usage:
 *   npm run telemetry:backfill
 *   npx tsx scripts/backfill-telemetry.ts --days 30
 *   npx tsx scripts/backfill-telemetry.ts --force
 *   npx tsx scripts/backfill-telemetry.ts --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import {
  eventFromSavedReport,
  parsePreflightIdFromFilename,
  timestampFromPreflightId
} from "../src/guardian/telemetry-aggregate.js";
import {
  appendEventLineSync,
  defaultReportsDir,
  defaultTelemetryDir
} from "../src/guardian/telemetry.js";

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (["force", "dry-run", "help"].includes(key)) {
      flags[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    flags[key] = next;
    i++;
  }
  return flags;
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`backfill-telemetry — reports → .guardian/telemetry NDJSON

Options:
  --reports-dir <path>   default docs/guardian-reports
  --out-dir <path>       default .guardian/telemetry
  --days <n>             only reports with ts within last n days (default: all)
  --force                wipe events-*.ndjson in out-dir before write
  --dry-run              count only
`);
    process.exit(0);
  }

  const reportsDir = path.resolve(String(flags["reports-dir"] ?? defaultReportsDir()));
  const outDir = path.resolve(String(flags["out-dir"] ?? defaultTelemetryDir()));
  const days = flags.days != null ? Number(flags.days) : null;
  const dryRun = Boolean(flags["dry-run"]);
  const force = Boolean(flags.force);

  if (!fs.existsSync(reportsDir)) {
    console.error(`Reports dir not found: ${reportsDir}`);
    process.exit(2);
  }

  if (force && !dryRun && fs.existsSync(outDir)) {
    for (const f of fs.readdirSync(outDir)) {
      if (f.startsWith("events-") && f.endsWith(".ndjson")) {
        fs.unlinkSync(path.join(outDir, f));
      }
    }
    console.log(`cleared existing events-*.ndjson under ${outDir}`);
  }

  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => f.startsWith("preflight-full-") && f.endsWith(".json"))
    .sort();

  const cutoff =
    days != null && Number.isFinite(days) ? Date.now() - days * 86400000 : null;

  let written = 0;
  let skipped = 0;
  let errors = 0;
  const t0 = Date.now();

  for (const name of files) {
    const id = parsePreflightIdFromFilename(name);
    if (!id) {
      skipped++;
      continue;
    }
    const ts = timestampFromPreflightId(id);
    if (cutoff != null) {
      const t = Date.parse(ts);
      if (!Number.isNaN(t) && t < cutoff) {
        skipped++;
        continue;
      }
    }
    const fullPath = path.join(reportsDir, name);
    try {
      const report = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const event = eventFromSavedReport(report, {
        preflight_id: id,
        report_path: path.relative(process.cwd(), fullPath),
        ts
      });
      if (!dryRun) appendEventLineSync(outDir, event);
      written++;
    } catch (error) {
      errors++;
      console.warn(
        `skip ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log(
    `backfill ${dryRun ? "(dry-run) " : ""}done: written=${written} skipped=${skipped} errors=${errors} in ${Date.now() - t0}ms → ${outDir}`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

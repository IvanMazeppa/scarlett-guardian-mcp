import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type Finding = {
  severity: "error" | "warn" | "info";
  file: string;
  message: string;
};

const summaryRoot = path.resolve("summarisation");
const minEvidenceBytes = 10_000;
const minIndexReadyBytes = 2_500;
const findings: Finding[] = [];

async function main() {
  const files = await collectMarkdownFiles(summaryRoot);

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(process.cwd(), filePath));
    const bytes = (await stat(filePath)).size;
    const firstHeading = await readFirstHeading(filePath);

    if (relativePath.includes("/index_ready/") && !relativePath.includes("/backups/")) {
      if (!firstHeading.startsWith("# Index-Ready Extract:")) {
        findings.push({
          severity: "error",
          file: relativePath,
          message: `expected index-ready heading, found "${firstHeading || "(none)"}"`
        });
      }

      if (bytes < minIndexReadyBytes) {
        findings.push({
          severity: "warn",
          file: relativePath,
          message: `small index-ready extract (${bytes} bytes)`
        });
      }
    }

    if (relativePath.includes("/evidence_summaries/") && !relativePath.includes("/backups/")) {
      const filename = path.basename(relativePath);
      if (filename.includes("narrative_emotional_record") || firstHeading.startsWith("# Narrative & Emotional Record:")) {
        findings.push({
          severity: "warn",
          file: relativePath,
          message: "narrative record is stored under evidence_summaries"
        });
      }

      if (bytes < minEvidenceBytes) {
        findings.push({
          severity: "warn",
          file: relativePath,
          message: `small evidence summary (${bytes} bytes)`
        });
      }
    }
  }

  printFindings();
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "chunks" || entry.name === "raw_text") continue;
      files.push(...await collectMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function readFirstHeading(filePath: string): Promise<string> {
  const markdown = await readFile(filePath, "utf8");
  return markdown.split(/\r?\n/).find((line) => line.startsWith("# ")) ?? "";
}

function printFindings() {
  if (findings.length === 0) {
    console.log("Summarisation artifact audit passed.");
    return;
  }

  for (const severity of ["error", "warn", "info"] as const) {
    const matching = findings.filter((finding) => finding.severity === severity);
    if (matching.length === 0) continue;

    console.log(`\n${severity.toUpperCase()} (${matching.length})`);
    for (const finding of matching) {
      console.log(`- ${finding.file}: ${finding.message}`);
    }
  }

  if (findings.some((finding) => finding.severity === "error")) {
    process.exitCode = 1;
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

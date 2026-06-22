import "dotenv/config";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { getIndexConfig } from "../src/config.js";
import { sectionToUploadMarkdown, slugify, splitMarkdownSections } from "../src/markdown.js";
import { getSourceProfile } from "../src/source-priority.js";

type IndexedSection = {
  uploadPath: string;
  sourceFile: string;
  section: string;
  sourceRole: string;
  priority: number;
  sectionIndex: number;
};

type UploadedSection = IndexedSection & {
  openaiFileId: string;
};

type MemoryFile = {
  filePath: string;
  sourceFile: string;
};

const args = new Map<string, Array<string | boolean>>();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (!next || next.startsWith("--")) {
    addArg(key, true);
  } else {
    addArg(key, next);
    index += 1;
  }
}

const memoryDirs = getStringArgValues("memory-dir").map((memoryDir) => path.resolve(memoryDir));
const memoryRoots = memoryDirs.length > 0 ? memoryDirs : [path.resolve("./memory")];
const sourceRoot = commonAncestor(memoryRoots);
const storeName = getStringArg("name", "scarlett-benjamin-story-memory");
const reuseExisting = hasFlag("reuse");
const dryRun = hasFlag("dry-run");
const dryRunSummaryOnly = hasFlag("dry-run-summary") || hasFlag("dry-run-count-only");
const uploadConcurrency = clampNumber(getNumberArg("upload-concurrency", 8), 1, 32);
const uploadDelayMs = clampNumber(getNumberArg("upload-delay-ms", 0), 0, 10_000);
const batchSize = clampNumber(getNumberArg("batch-size", 500), 1, 500);
const pollIntervalMs = clampNumber(getNumberArg("poll-interval-ms", 2000), 250, 60_000);
const excludedDirNames = new Set([
  "node_modules",
  "backups",
  "chunks",
  "raw_text",
  ...getStringArgValues("exclude-dir")
]);
const workDir = path.resolve(".rag-memory-mcp");
const uploadDir = path.join(workDir, "upload");
const manifestPath = path.join(workDir, "last-index.json");

let client: OpenAI;

async function main() {
  const memoryFiles = sortMemoryFiles(await findMarkdownFiles(memoryRoots, sourceRoot));

  if (memoryFiles.length === 0) {
    throw new Error(`No Markdown memory files found in ${memoryRoots.join(", ")}`);
  }

  await rm(uploadDir, { recursive: true, force: true });
  await mkdir(uploadDir, { recursive: true });

  const sections = await buildSectionUploads(memoryFiles);

  console.log(`Prepared ${sections.length} indexed sections from ${memoryFiles.length} memory files.`);
  if (dryRun) {
    if (!dryRunSummaryOnly) {
      console.log(JSON.stringify(sections.map(({ uploadPath: _uploadPath, ...section }) => section), null, 2));
    }
    return;
  }

  client = new OpenAI({ apiKey: getIndexConfig().OPENAI_API_KEY });

  const vectorStoreId = reuseExisting && process.env.OPENAI_VECTOR_STORE_ID
    ? process.env.OPENAI_VECTOR_STORE_ID
    : await createVectorStore();

  console.log(
    `Uploading ${sections.length} section files with concurrency ${uploadConcurrency}` +
    (uploadDelayMs > 0 ? ` and ${uploadDelayMs}ms per-worker delay.` : ".")
  );
  const uploadedSections = await uploadSections(sections);

  console.log(`Attaching ${uploadedSections.length} files in batches of ${batchSize}.`);
  const indexedFiles = await attachBatches(vectorStoreId, uploadedSections);

  await mkdir(workDir, { recursive: true });
  await writeFile(manifestPath, JSON.stringify({
    vector_store_id: vectorStoreId,
    indexed_at: new Date().toISOString(),
    memory_dirs: memoryRoots,
    excluded_dirs: [...excludedDirNames].sort(),
    upload_concurrency: uploadConcurrency,
    upload_delay_ms: uploadDelayMs,
    batch_size: batchSize,
    files: indexedFiles
  }, null, 2));

  console.log("");
  console.log("Index complete.");
  console.log(`OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);
  console.log(`Manifest: ${manifestPath}`);
}

async function uploadSections(sections: IndexedSection[]): Promise<UploadedSection[]> {
  let completed = 0;

  return mapLimit(sections, uploadConcurrency, async (section) => {
    if (uploadDelayMs > 0) await sleep(uploadDelayMs);

    const file = await retryRateLimited(() => client.files.create({
      file: createReadStream(section.uploadPath),
      purpose: "assistants"
    }));

    completed += 1;
    if (completed % 25 === 0 || completed === sections.length) {
      console.log(`Uploaded ${completed}/${sections.length} section files.`);
    }

    return {
      ...section,
      openaiFileId: file.id
    };
  });
}

async function retryRateLimited<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === maxAttempts) {
        throw error;
      }

      const backoffMs = 15_000 * attempt;
      console.warn(`Rate limit hit; retrying in ${Math.round(backoffMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts}).`);
      await sleep(backoffMs);
    }
  }

  throw new Error("retryRateLimited exhausted unexpectedly.");
}

function isRateLimitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const maybeError = error as { status?: unknown; code?: unknown };
  return maybeError.status === 429 || maybeError.code === "rate_limit_exceeded";
}

async function createVectorStore(): Promise<string> {
  const vectorStore = await client.vectorStores.create({
    name: storeName,
    metadata: {
      project: "long-form-roleplay-memory",
      owner: "scarlett-benjamin-guardian"
    },
    chunking_strategy: {
      type: "static",
      static: {
        max_chunk_size_tokens: 700,
        chunk_overlap_tokens: 120
      }
    }
  } as never);

  return vectorStore.id;
}

async function attachBatches(vectorStoreId: string, sections: UploadedSection[]) {
  const indexedFiles = [];
  const batches = chunkArray(sections, batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    const batchSections = batches[index];
    const fileBatch = await client.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
      files: batchSections.map((section) => ({
        file_id: section.openaiFileId,
        attributes: sectionAttributes(section)
      }))
    }, { pollIntervalMs });

    if (fileBatch.file_counts.failed > 0 || fileBatch.file_counts.cancelled > 0) {
      throw new Error(
        `Vector store batch ${fileBatch.id} ended with ${fileBatch.file_counts.failed} failed ` +
        `and ${fileBatch.file_counts.cancelled} cancelled files.`
      );
    }

    console.log(
      `Attached batch ${index + 1}/${batches.length}: ` +
      `${fileBatch.file_counts.completed}/${fileBatch.file_counts.total} completed.`
    );

    for (const section of batchSections) {
      indexedFiles.push({
        openai_file_id: section.openaiFileId,
        vector_store_file_id: section.openaiFileId,
        source_file: section.sourceFile,
        section: section.section,
        batch_id: fileBatch.id
      });
    }
  }

  return indexedFiles;
}

async function buildSectionUploads(memoryFiles: MemoryFile[]): Promise<IndexedSection[]> {
  const uploads: IndexedSection[] = [];

  for (const memoryFile of memoryFiles) {
    const markdown = await readFile(memoryFile.filePath, "utf8");
    const profile = getSourceProfile(memoryFile.filePath);
    const sections = splitMarkdownSections(memoryFile.filePath, markdown, memoryFile.sourceFile);

    for (const section of sections) {
      const fileBase = slugify(memoryFile.sourceFile.replace(/\.md$/i, ""));
      const sectionBase = slugify(section.section);
      const uploadPath = path.join(
        uploadDir,
        `${String(uploads.length).padStart(4, "0")}-${fileBase}-${sectionBase}.md`
      );

      await writeFile(uploadPath, sectionToUploadMarkdown(section));
      uploads.push({
        uploadPath,
        sourceFile: section.sourceFile,
        section: section.section,
        sourceRole: profile.role,
        priority: profile.priority,
        sectionIndex: section.sectionIndex
      });
    }
  }

  return uploads;
}

async function findMarkdownFiles(roots: string[], rootForLabels: string): Promise<MemoryFile[]> {
  const files: MemoryFile[] = [];

  for (const root of roots) {
    files.push(...await findMarkdownFilesInRoot(root, rootForLabels));
  }

  return files;
}

async function findMarkdownFilesInRoot(root: string, rootForLabels: string): Promise<MemoryFile[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: MemoryFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirNames.has(entry.name) || entry.name.startsWith(".")) continue;
      files.push(...await findMarkdownFilesInRoot(fullPath, rootForLabels));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push({
        filePath: fullPath,
        sourceFile: toSourceFileLabel(rootForLabels, fullPath)
      });
    }
  }

  return files;
}

function sortMemoryFiles(files: MemoryFile[]): MemoryFile[] {
  return [...files].sort((a, b) => {
    const profileDelta = getSourceProfile(b.filePath).priority - getSourceProfile(a.filePath).priority;
    if (profileDelta !== 0) return profileDelta;
    return a.sourceFile.localeCompare(b.sourceFile);
  });
}

function addArg(key: string, value: string | boolean) {
  const values = args.get(key) ?? [];
  values.push(value);
  args.set(key, values);
}

function getStringArg(key: string, fallback: string): string {
  const value = getStringArgValues(key)[0];
  return value ?? fallback;
}

function getStringArgValues(key: string): string[] {
  return (args.get(key) ?? [])
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasFlag(key: string): boolean {
  return (args.get(key) ?? []).includes(true);
}

function getNumberArg(key: string, fallback: number): number {
  const value = getStringArgValues(key)[0];
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function commonAncestor(paths: string[]): string {
  if (paths.length === 1) return paths[0];

  const [firstPath, ...restPaths] = paths.map((filePath) => path.resolve(filePath).split(path.sep));
  let index = 0;

  while (
    index < firstPath.length &&
    restPaths.every((parts) => parts[index] === firstPath[index])
  ) {
    index += 1;
  }

  return firstPath.slice(0, index).join(path.sep) || path.sep;
}

function toSourceFileLabel(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function sectionAttributes(section: UploadedSection): Record<string, string | number | boolean> {
  return {
    source_file: truncateAttribute(section.sourceFile),
    section: truncateAttribute(section.section),
    source_role: section.sourceRole,
    priority: section.priority,
    section_index: section.sectionIndex
  };
}

function truncateAttribute(value: string): string {
  return value.length <= 512 ? value : value.slice(0, 512);
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapLimit<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

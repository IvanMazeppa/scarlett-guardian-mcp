/**
 * Targeted lore packs for Mission Control — expand pack id → exact source_files
 * for an extra search_story_memory call (prioritize, do not isolate live-state).
 */
import fs from "node:fs";
import path from "node:path";
import type { LorePackId } from "./mission-control.js";

export type LorePackMeta = {
  id: LorePackId;
  label: string;
  /** Relative dirs under rag-memory-mcp/project_source_files (or absolute pack roots). */
  roots: string[];
  /** Optional query bias when searching this pack. */
  queryHint: string;
};

const PACK_META: LorePackMeta[] = [
  {
    id: "none",
    label: "None (default retrieval)",
    roots: [],
    queryHint: ""
  },
  {
    id: "europe-arm",
    label: "Europe arm (Paris → Stuttgart)",
    roots: ["historical/europe-arm"],
    queryHint:
      "europe-arm warm continuity Stuttgart Lieser Nordschleife Luxembourg Paris anklet Scarlett Benjamin"
  },
  {
    id: "thread-01",
    label: "Thread 01 — origin / early relationship",
    roots: ["historical/thread-01"],
    queryHint: "early relationship origin Scarlett Benjamin first years continuity"
  },
  {
    id: "thread-02",
    label: "Thread 02 — Cotswolds / family visit",
    roots: ["historical/thread-02"],
    queryHint: "Cotswolds family visit Scarlett Benjamin continuity"
  },
  {
    id: "thread-03",
    label: "Thread 03 — South Cerney / sobriety",
    roots: ["historical/thread-03"],
    queryHint: "South Cerney Lakes sobriety recovery future-building Scarlett Benjamin"
  },
  {
    id: "thread-05",
    label: "Thread 05 — UK / Bournemouth arm",
    roots: ["historical/thread-05"],
    queryHint: "Bournemouth spa aero presentation UK arm Scarlett Benjamin"
  },
  {
    id: "letters",
    label: "Letters from Scarlett",
    roots: ["letters-from-scarlett"],
    queryHint: "Scarlett family letters father mother Mormor Vaxholm transition"
  }
];

export function listLorePacks(): LorePackMeta[] {
  return PACK_META.map((p) => ({ ...p, roots: [...p.roots] }));
}

export function getLorePackMeta(id: LorePackId): LorePackMeta {
  return PACK_META.find((p) => p.id === id) ?? PACK_META[0];
}

function defaultProjectSourceRoot(cwd = process.cwd()): string {
  return path.resolve(cwd, "../rag-memory-mcp/project_source_files");
}

function walkMarkdownFiles(absDir: string, out: string[]): void {
  if (!fs.existsSync(absDir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      walkMarkdownFiles(full, out);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      // Skip README / manifest routing aids
      if (/^README\.md$/i.test(ent.name)) continue;
      if (/HISTORICAL_SOURCE_MANIFEST/i.test(ent.name)) continue;
      out.push(full);
    }
  }
}

/**
 * Expand a lore pack to RAG `source_files` paths using the
 * `project_source_files/...` metadata shape the vector store stores.
 */
export function resolveLorePackSourceFiles(
  packId: LorePackId,
  options?: { cwd?: string; projectSourceRoot?: string; maxFiles?: number }
): string[] {
  if (packId === "none") return [];
  const meta = getLorePackMeta(packId);
  const root = options?.projectSourceRoot ?? defaultProjectSourceRoot(options?.cwd);
  const absFiles: string[] = [];
  for (const rel of meta.roots) {
    walkMarkdownFiles(path.join(root, rel), absFiles);
  }
  absFiles.sort();
  const max = options?.maxFiles ?? 40;
  return absFiles.slice(0, max).map((abs) => {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    return `project_source_files/${rel}`;
  });
}

export function lorePackSearchQuery(
  packId: LorePackId,
  userMessage: string
): string {
  const meta = getLorePackMeta(packId);
  const hint = meta.queryHint.trim();
  const user = (userMessage || "").trim().slice(0, 280);
  if (hint && user) return `${hint}; ${user}`;
  return hint || user || "Scarlett Benjamin continuity";
}

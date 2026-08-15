/**
 * Read LIVE BEAT story time/location from disk for Mission Control.
 * Story calendar is NEVER wall-clock — only current-state.md (or RAG live snapshot).
 */
import fs from "node:fs";
import path from "node:path";
import { parseLiveBeat, type LiveBeat } from "./recency.js";

export type LiveBeatSnapshot = {
  lastUpdated: string;
  timeLine: string;
  locationLine: string;
  presentCast: string[];
  /** Human-facing story clock line for Mission Control. */
  storyClock: string;
  sourcePath: string | null;
};

function candidateCurrentStatePaths(cwd = process.cwd()): string[] {
  return [
    path.resolve(cwd, "../rag-memory-mcp/project_source_files/current-state.md"),
    path.resolve(cwd, "project_source_files/current-state.md"),
    path.resolve(cwd, "../../rag-memory-mcp/project_source_files/current-state.md")
  ];
}

export function resolveCurrentStatePath(cwd = process.cwd()): string | null {
  for (const p of candidateCurrentStatePaths(cwd)) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function readLiveBeatFromDisk(cwd = process.cwd()): LiveBeatSnapshot {
  const sourcePath = resolveCurrentStatePath(cwd);
  let beat: LiveBeat = parseLiveBeat("");
  if (sourcePath) {
    try {
      beat = parseLiveBeat(fs.readFileSync(sourcePath, "utf8"));
    } catch {
      /* empty beat */
    }
  }
  const storyClock =
    [beat.timeLine, beat.lastUpdated].filter(Boolean).join(" · ") ||
    "(story time missing from current-state.md)";
  return {
    lastUpdated: beat.lastUpdated,
    timeLine: beat.timeLine,
    locationLine: beat.locationLine,
    presentCast: beat.presentCast ?? [],
    storyClock,
    sourcePath
  };
}

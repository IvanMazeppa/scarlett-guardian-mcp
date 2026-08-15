/**
 * Location stagnation tracker for Mission Control pacing gauge.
 * Fingerprint = hash of locationLine only (time/Present must not reset streak).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  locationStagnationThreshold,
  type SceneModeId
} from "./mission-control.js";

export type LocationProgressState = {
  fingerprint: string;
  consecutiveTurns: number;
  locationLine: string;
  updatedAt: string;
};

export function locationProgressPath(cwd = process.cwd()): string {
  return path.join(cwd, ".guardian", "location-progress-state.json");
}

export function computeLocationFingerprint(locationLine: string | null | undefined): string {
  const norm = (locationLine ?? "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return "empty";
  return createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 16);
}

export function readLocationProgress(cwd = process.cwd()): LocationProgressState | null {
  const file = locationProgressPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as LocationProgressState;
  } catch {
    return null;
  }
}

export async function writeLocationProgress(
  state: LocationProgressState,
  cwd = process.cwd()
): Promise<void> {
  const dir = path.dirname(locationProgressPath(cwd));
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(locationProgressPath(cwd), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export type LocationProgressTick = {
  fingerprint: string;
  consecutiveTurns: number;
  locationLine: string;
  stagnation: boolean;
  threshold: number;
};

/**
 * Advance streak for this turn. When persist=false (eval), compute in-memory only.
 */
export function tickLocationProgress(input: {
  locationLine: string;
  sceneMode: SceneModeId;
  persist?: boolean;
  cwd?: string;
}): LocationProgressTick {
  const fingerprint = computeLocationFingerprint(input.locationLine);
  const threshold = locationStagnationThreshold(input.sceneMode);
  const prev = input.persist === false ? null : readLocationProgress(input.cwd);
  let consecutiveTurns = 1;
  if (prev && prev.fingerprint === fingerprint && fingerprint !== "empty") {
    consecutiveTurns = (prev.consecutiveTurns || 0) + 1;
  }
  const next: LocationProgressState = {
    fingerprint,
    consecutiveTurns,
    locationLine: (input.locationLine || "").trim().slice(0, 240),
    updatedAt: new Date().toISOString()
  };
  if (input.persist !== false) {
    try {
      const file = locationProgressPath(input.cwd);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    } catch {
      /* observability only */
    }
  }
  return {
    fingerprint,
    consecutiveTurns,
    locationLine: next.locationLine,
    stagnation: consecutiveTurns >= threshold && fingerprint !== "empty",
    threshold
  };
}

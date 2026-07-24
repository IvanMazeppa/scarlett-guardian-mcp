/**
 * INTEL-2 — live-scene fingerprints for dramaturg / serendipity sidecar validity.
 * Stable short hash of location, story time, Present, and live cues.
 */
import { createHash } from "node:crypto";
import type { LiveBeat } from "./recency.js";

export type SceneFingerprintParts = {
  location: string;
  time: string;
  present: string;
  liveCues: string;
  /** Optional operator/thread id for serendipity isolation */
  threadKey?: string;
};

function norm(s: string | undefined | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a compact fingerprint string (16-hex sha256 prefix).
 * Empty/sparse LIVE BEAT still yields a deterministic "empty" fingerprint.
 */
export function computeLiveSceneFingerprint(
  liveBeat: LiveBeat | null | undefined,
  options?: { threadKey?: string }
): string {
  const parts: SceneFingerprintParts = {
    location: norm(liveBeat?.locationLine),
    time: norm([liveBeat?.timeLine, liveBeat?.lastUpdated].filter(Boolean).join(" ")),
    present: norm((liveBeat?.presentCast ?? []).join(" ")),
    liveCues: norm((liveBeat?.liveCues ?? []).slice().sort().join(" ")),
    threadKey: options?.threadKey ? norm(options.threadKey) : undefined
  };
  const blob = [
    parts.location,
    parts.time,
    parts.present,
    parts.liveCues,
    parts.threadKey ?? ""
  ].join("|");
  return createHash("sha256").update(blob, "utf8").digest("hex").slice(0, 16);
}

/** True when fingerprints match (both must be non-empty strings). */
export function fingerprintsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return a === b;
}

/**
 * Human-readable invalidation reason for logs / telemetry.
 */
export function sceneFingerprintInvalidationReason(
  cached: string | null | undefined,
  current: string | null | undefined
): string | null {
  if (!cached) return "missing_cached_fingerprint";
  if (!current) return "missing_current_fingerprint";
  if (cached !== current) return "live_scene_changed";
  return null;
}

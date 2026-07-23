/**
 * INTEL-1 — Resolved scene-confidence gate.
 * One early decision consumed by roster, serendipity, dramaturg, auditor, write-back.
 */
import { createHash } from "node:crypto";
import type { LiveBeat } from "./recency.js";
import { detectSaveLag, type SaveLagResult } from "./save-lag.js";
import { isCoupleOnlyPresent } from "./scene-roster.js";

export type CastConfidence = "couple_only" | "named_support" | "unknown";
export type PlayedConfidence = "high" | "medium" | "low" | "none";

export type ResolvedSceneConfidence = {
  /** When true, optional systems must degrade (provisional policy). */
  provisional: boolean;
  reason: string;
  diskLiveBeatAvailable: boolean;
  diskStateHash: string | null;
  saveLag: SaveLagResult;
  playedConfidence: PlayedConfidence;
  castConfidence: CastConfidence;
  /** Suppress Present/arc/cue-only roster activation. */
  suppressPassiveCast: boolean;
  /** Cap serendipity at ambient (defer engaging/disruptive/NPC). */
  serendipityAmbientOnly: boolean;
  /** Use neutral dramaturg line instead of exact beat pressure. */
  dramaturgNeutral: boolean;
  /** Soften location rewinds / prefer played consensus in auditor. */
  auditorSaveLag: boolean;
  /** Hold transitions/NPC canon writes for human review. */
  holdCanonWrites: boolean;
  provenance: {
    disk: boolean;
    userMessage: boolean;
    duplex: boolean;
    recentContext: boolean;
  };
};

export const NEUTRAL_DRAMATURG_LINE =
  "Continue the played scene as established in the live exchange; preserve downstream arc pressure without rewinding location or cast.";

const PRIVATE_PLAYED =
  /\b(suite|shower|towel|doorway|aftercare|bed|duvet|hotel|schloss|bathroom|kiss|coffee|pastr)/i;

/**
 * Feature gate — env GUARDIAN_SCENE_CONFIDENCE_GATE=false disables policy (detection still available).
 */
export function isSceneConfidenceGateEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const v = env.GUARDIAN_SCENE_CONFIDENCE_GATE;
  if (v === "false" || v === "0") return false;
  return true;
}

function hashLiveBeat(liveBeat: LiveBeat | null | undefined): string | null {
  if (!liveBeat) return null;
  const blob = [
    liveBeat.lastUpdated,
    liveBeat.locationLine,
    liveBeat.timeLine,
    ...(liveBeat.liveCues ?? []),
    ...(liveBeat.presentCast ?? [])
  ].join("|");
  if (!blob.replace(/\|/g, "").trim()) return null;
  return createHash("sha256").update(blob).digest("hex").slice(0, 16);
}

function playedConfidenceFromScores(saveLag: SaveLagResult): PlayedConfidence {
  if (saveLag.playedScore >= 3) return "high";
  if (saveLag.playedScore >= 2) return "medium";
  if (saveLag.playedScore >= 1) return "low";
  return "none";
}

function castConfidence(liveBeat: LiveBeat | null | undefined): CastConfidence {
  if (!liveBeat?.presentCast?.length) return "unknown";
  if (isCoupleOnlyPresent(liveBeat.presentCast)) return "couple_only";
  return "named_support";
}

/**
 * Stale Present names supporting NPCs while played IC is private couple and does not address them.
 */
export function detectStalePresentBleed(input: {
  liveBeat: LiveBeat | null | undefined;
  userMessage: string;
  scarlettPreviousMessage?: string;
  recentContext?: string;
}): boolean {
  const present = input.liveBeat?.presentCast ?? [];
  if (!present.length || isCoupleOnlyPresent(present)) return false;

  const played = [
    input.userMessage ?? "",
    input.scarlettPreviousMessage ?? "",
    input.recentContext ?? ""
  ].join(" ");
  if (!PRIVATE_PLAYED.test(played)) return false;

  // Supporting names on Present must appear in played text to count as live
  const presentBlob = present.join(" ").toLowerCase();
  const supportingTokens = presentBlob
    .replace(/\bscarlett\b/g, " ")
    .replace(/\bbenjamin\b/g, " ")
    .replace(/\band\b|\bonly\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  if (!supportingTokens.length) return false;
  const playedLower = played.toLowerCase();
  const anyMentioned = supportingTokens.some((t) => playedLower.includes(t));
  return !anyMentioned;
}

/**
 * Build one resolved scene-confidence decision for the preflight turn.
 */
export function resolveSceneConfidence(input: {
  liveBeat: LiveBeat | null | undefined;
  userMessage: string;
  scarlettPreviousMessage?: string;
  recentContext?: string;
  /** When false, always return non-provisional policy (rollback). */
  gateEnabled?: boolean;
}): ResolvedSceneConfidence {
  const gateEnabled = input.gateEnabled ?? isSceneConfidenceGateEnabled();
  const liveBeat = input.liveBeat;
  const diskLiveBeatAvailable = Boolean(
    liveBeat &&
      (liveBeat.locationLine?.trim() ||
        liveBeat.liveCues?.length ||
        liveBeat.presentCast?.length ||
        liveBeat.lastUpdated?.trim())
  );

  const saveLag = detectSaveLag({
    liveBeat,
    userMessage: input.userMessage,
    scarlettPreviousMessage: input.scarlettPreviousMessage,
    recentContext: input.recentContext
  });

  const stalePresent = detectStalePresentBleed(input);
  const cast = castConfidence(liveBeat);
  const playedConf = playedConfidenceFromScores(saveLag);

  const provenance = {
    disk: diskLiveBeatAvailable,
    userMessage: Boolean(input.userMessage?.trim()),
    duplex: Boolean(input.scarlettPreviousMessage?.trim()),
    recentContext: Boolean(input.recentContext?.trim())
  };

  const reasons: string[] = [];
  if (!diskLiveBeatAvailable) reasons.push("missing_or_sparse_live_beat");
  if (saveLag.suspected) reasons.push(`save_lag:${saveLag.liveCluster}->${saveLag.playedCluster}`);
  if (stalePresent) reasons.push("stale_present_bleed");

  let provisional = reasons.length > 0;
  // Strong disk/user agreement: not provisional unless save lag or stale present
  if (
    diskLiveBeatAvailable &&
    !saveLag.suspected &&
    !stalePresent &&
    saveLag.liveCluster !== "unknown" &&
    saveLag.liveCluster === saveLag.playedCluster &&
    saveLag.playedScore >= 1
  ) {
    provisional = false;
    reasons.length = 0;
    reasons.push("disk_played_aligned");
  }

  if (!gateEnabled) {
    return {
      provisional: false,
      reason: provisional
        ? `gate_disabled (would be: ${reasons.join("; ") || "provisional"})`
        : reasons.join("; ") || "fresh",
      diskLiveBeatAvailable,
      diskStateHash: hashLiveBeat(liveBeat),
      saveLag,
      playedConfidence: playedConf,
      castConfidence: cast,
      suppressPassiveCast: isCoupleOnlyPresent(liveBeat?.presentCast),
      serendipityAmbientOnly: false,
      dramaturgNeutral: false,
      auditorSaveLag: saveLag.suspected,
      holdCanonWrites: false,
      provenance
    };
  }

  const suppressPassiveCast =
    provisional || isCoupleOnlyPresent(liveBeat?.presentCast) || stalePresent;

  return {
    provisional,
    reason: reasons.join("; ") || "fresh",
    diskLiveBeatAvailable,
    diskStateHash: hashLiveBeat(liveBeat),
    saveLag,
    playedConfidence: playedConf,
    castConfidence: cast,
    suppressPassiveCast,
    serendipityAmbientOnly: provisional,
    dramaturgNeutral: provisional,
    auditorSaveLag: provisional || saveLag.suspected,
    holdCanonWrites: provisional,
    provenance
  };
}

/** Apply provisional dramaturg policy without mutating unrelated snapshot fields. */
export function applyDramaturgNeutralPolicy<T extends { momentumLine?: string }>(
  snapshot: T,
  scene: ResolvedSceneConfidence
): T {
  if (!scene.dramaturgNeutral) return snapshot;
  return {
    ...snapshot,
    momentumLine: NEUTRAL_DRAMATURG_LINE
  };
}

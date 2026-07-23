/**
 * Save-lag detection — when played IC (user + Scarlett + recent_context) agrees
 * on a location cluster that conflicts with disk LIVE BEAT.
 *
 * Does not rewrite current-state; softens false Director pullback and flags the operator.
 */
import type { LiveBeat } from "./recency.js";

export type LocationClusterId =
  | "car_cabin"
  | "paddock"
  | "suite_hotel"
  | "drive_road"
  | "unknown";

export type SaveLagResult = {
  suspected: boolean;
  liveCluster: LocationClusterId;
  playedCluster: LocationClusterId;
  liveScore: number;
  playedScore: number;
  reason: string;
};

type ClusterDef = {
  id: LocationClusterId;
  tokens: string[];
};

const CLUSTERS: ClusterDef[] = [
  {
    id: "car_cabin",
    tokens: [
      "black panther",
      "cabin",
      "engine off",
      "parked",
      "passenger seat",
      "driver seat",
      "hand-holding",
      "hands joined",
      "not yet out of the car"
    ]
  },
  {
    id: "paddock",
    tokens: [
      "changing room",
      "pit box",
      "pit wall",
      "paddock",
      "industry pool",
      "nomex",
      "race suit",
      "telemetry debrief"
    ]
  },
  {
    id: "suite_hotel",
    tokens: [
      "suite",
      "shower",
      "towel",
      "towels",
      "bathroom",
      "doorway",
      "chandelier",
      "marble",
      "schloss lieser",
      "hotel",
      "lobby",
      "staircase",
      "living area",
      "aftercare",
      "steam",
      "gilded"
    ]
  },
  {
    id: "drive_road",
    tokens: ["night drive", "autobahn", "eifel", "moselle valley road", "winding", "transmission into drive"]
  }
];

function scoreCluster(text: string, tokens: string[]): number {
  const t = text.toLowerCase();
  let n = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) n += 1;
  }
  return n;
}

function bestCluster(text: string): { id: LocationClusterId; score: number } {
  let best: LocationClusterId = "unknown";
  let bestScore = 0;
  for (const c of CLUSTERS) {
    const s = scoreCluster(text, c.tokens);
    if (s > bestScore) {
      bestScore = s;
      best = c.id;
    }
  }
  return { id: best, score: bestScore };
}

/**
 * Detect when played text points at a different place than LIVE BEAT.
 * Requires played score ≥ 2 and live score ≥ 1 and clusters differ.
 */
export function detectSaveLag(input: {
  liveBeat: LiveBeat | null | undefined;
  userMessage: string;
  scarlettPreviousMessage?: string;
  recentContext?: string;
}): SaveLagResult {
  const liveText = [
    input.liveBeat?.lastUpdated ?? "",
    input.liveBeat?.locationLine ?? "",
    input.liveBeat?.timeLine ?? "",
    ...(input.liveBeat?.liveCues ?? [])
  ].join(" ");

  const playedText = [
    input.userMessage ?? "",
    input.scarlettPreviousMessage ?? "",
    input.recentContext ?? ""
  ].join(" ");

  const live = bestCluster(liveText);
  const played = bestCluster(playedText);

  if (
    live.id !== "unknown" &&
    played.id !== "unknown" &&
    live.id !== played.id &&
    live.score >= 1 &&
    played.score >= 2
  ) {
    return {
      suspected: true,
      liveCluster: live.id,
      playedCluster: played.id,
      liveScore: live.score,
      playedScore: played.score,
      reason: `Played IC consensus (${played.id}, score=${played.score}) conflicts with LIVE BEAT (${live.id}, score=${live.score})`
    };
  }

  return {
    suspected: false,
    liveCluster: live.id,
    playedCluster: played.id,
    liveScore: live.score,
    playedScore: played.score,
    reason: "no multi-cluster conflict"
  };
}

/** Location-rewind corrections that should not win during save lag. */
export function isLocationRewindCorrection(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  return /return (scarlett )?to|ignored the live scene|invented (the )?(suite|shower|drive|hotel)|do not invent.*suite|changing room|parked cabin|engine off cabin|still in the (car|cabin|changing room)|unwind|reset to (the )?(cabin|car|paddock)/i.test(
    text
  );
}

/**
 * When save lag is suspected, replace location-rewind corrections with an operator-facing note.
 * Clears block-on-prose if the only issue was that rewind.
 */
export function applySaveLagSoftening(input: {
  saveLag: SaveLagResult;
  correction: string | null | undefined;
  shouldBlockProse: boolean;
}): { correction: string | null; shouldBlockProse: boolean; softened: boolean } {
  if (!input.saveLag.suspected) {
    return {
      correction: input.correction?.trim() ? input.correction.trim() : null,
      shouldBlockProse: input.shouldBlockProse,
      softened: false
    };
  }

  const corr = input.correction?.trim() || null;
  if (corr && isLocationRewindCorrection(corr)) {
    return {
      correction: `SAVE LAG: disk LIVE BEAT still looks like ${input.saveLag.liveCluster} while played turns agree on ${input.saveLag.playedCluster}. Prefer the played scene for location; do not unwind suite/shower/hotel already established. Operator should update current-state.md.`,
      shouldBlockProse: false,
      softened: true
    };
  }

  // Lag suspected but correction is about something else (or null) — still clear location-only blocks is N/A
  return {
    correction: corr,
    shouldBlockProse: input.shouldBlockProse,
    softened: false
  };
}

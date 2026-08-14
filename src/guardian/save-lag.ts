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
  /** Set on intra-cluster beat lag (parroting-fix 1.4): which micro-beat each side is on. */
  liveBeatStage?: string;
  playedBeatStage?: string;
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

/**
 * Parroting-fix 1.4 (2026-08-14) — intra-suite micro-beat progression.
 * Sofa, shower, dressing, and doorway all score `suite_hotel`, so cross-cluster
 * detection stayed silent on 14 Aug while the auditor rewound forward play
 * ("Rewind to the live sofa beat"). Stages are ordered; played consensus ahead
 * of disk within the same cluster is beat lag and gets the same softening +
 * candidate_memory_update mandate as cross-cluster lag.
 *
 * Tokens are substring-matched: keep them free of substrings of unrelated words
 * (e.g. no bare "suit" — it matches "suite"; no bare "dressing" — it matches
 * "dressing gown", a pre-shower garment).
 */
type BeatStageDef = {
  id: string;
  order: number;
  tokens: string[];
};

const SUITE_BEAT_STAGES: BeatStageDef[] = [
  {
    id: "sofa_living",
    order: 0,
    tokens: ["sofa", "living area", "have not dressed", "not dressed", "dressing gown"]
  },
  {
    id: "shower_bath",
    order: 1,
    tokens: ["shower", "bathroom", "steam", "water off", "shampoo", "rinse", "towel"]
  },
  {
    id: "dressing",
    order: 2,
    tokens: [
      "getting dressed",
      "shirt",
      "trousers",
      "blouse",
      "cufflinks",
      "buttoning",
      "stockings",
      "heels",
      "blazer",
      "jacket"
    ]
  },
  {
    id: "departure",
    order: 3,
    tokens: ["doorway", "leaving the suite", "leave the suite", "elevator", "lobby", "corridor"]
  }
];

function bestBeatStage(text: string): { def: BeatStageDef; score: number } | null {
  const t = text.toLowerCase();
  let best: { def: BeatStageDef; score: number } | null = null;
  for (const def of SUITE_BEAT_STAGES) {
    let score = 0;
    for (const tok of def.tokens) {
      if (t.includes(tok)) score += 1;
    }
    // Furthest stage with any evidence wins — play only moves forward within a scene.
    if (score > 0 && (!best || def.order > best.def.order)) {
      best = { def, score };
    }
  }
  return best;
}

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

  // Parroting-fix 1.4: same cluster, but play has advanced past the disk micro-beat
  // (sofa -> shower -> dressing -> departure inside suite_hotel).
  if (live.id === "suite_hotel" && played.id === "suite_hotel") {
    const liveStage = bestBeatStage(liveText);
    const playedStage = bestBeatStage(playedText);
    if (
      liveStage &&
      playedStage &&
      playedStage.def.order > liveStage.def.order &&
      liveStage.score >= 1 &&
      playedStage.score >= 2
    ) {
      return {
        suspected: true,
        liveCluster: live.id,
        playedCluster: played.id,
        liveScore: liveStage.score,
        playedScore: playedStage.score,
        liveBeatStage: liveStage.def.id,
        playedBeatStage: playedStage.def.id,
        reason: `Intra-suite beat lag: LIVE BEAT still at '${liveStage.def.id}' (score=${liveStage.score}) while played consensus reached '${playedStage.def.id}' (score=${playedStage.score})`
      };
    }
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

/** Location/beat-rewind corrections that should not win during save lag. */
export function isLocationRewindCorrection(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  // Anatomy/identity rewinds ("Rewind the turn: restore her pre-op anatomy") must NOT
  // match — they stay in force even during save lag. Patterns here require a place/beat.
  return /return (scarlett )?to|rewind (scarlett )?to|rewind to (the )?live|ignored the live scene|invented (the )?(suite|shower|drive|hotel)|do not invent.*suite|changing room|parked cabin|engine off cabin|still in the (car|cabin|changing room)|still on the (sofa|bed)|back to (the )?(sofa|living area)|(sofa|living[- ]area) beat|unwind|reset to (the )?(cabin|car|paddock)/i.test(
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
    const isBeatLag = input.saveLag.liveCluster === input.saveLag.playedCluster;
    return {
      correction: isBeatLag
        ? `SAVE LAG (intra-scene beat): disk LIVE BEAT still shows '${input.saveLag.liveBeatStage ?? "an earlier beat"}' while played turns agree on '${input.saveLag.playedBeatStage ?? "a later beat"}' in the same ${input.saveLag.liveCluster}. Prefer the played beat; do not rewind forward motion already established in play. Operator should update current-state.md.`
        : `SAVE LAG: disk LIVE BEAT still looks like ${input.saveLag.liveCluster} while played turns agree on ${input.saveLag.playedCluster}. Prefer the played scene for location; do not unwind suite/shower/hotel already established. Operator should update current-state.md.`,
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

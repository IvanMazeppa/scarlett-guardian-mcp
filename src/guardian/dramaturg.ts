/**
 * WP-5.2 — Dramaturg P0 (LLM-free): parse arc plans, deterministic beat-diff, mechanical momentum line.
 * WP-5.3 — Dramaturg P1: runDramaturgPass (LLM) + disk cache + background refresh triggers.
 * Spec: docs/fable-5-roadmaps-audits/guardian-dramaturg-design-2026-07.md §2–4
 *
 * Design law: propose pressure, never outcomes. No field here can express how a beat resolves.
 * Hot path: never await the dramaturg LLM — current turn uses cache/deterministic only.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type { GuardianConfig } from "./config.js";
import type { NpcIntersection } from "./npc-agendas.js";
import { extractCues, type LiveBeat } from "./recency.js";
import type { Intrusiveness } from "./serendipity-weaver.js";
import {
  computeLiveSceneFingerprint,
  fingerprintsMatch,
  sceneFingerprintInvalidationReason
} from "./scene-fingerprint.js";

export type BeatKind = "fixed" | "open" | "conditional";
export type BeatStatus = "done" | "live" | "next" | "dormant";

export type ParsedBeat = {
  /** 1-based index in plan order */
  index: number;
  name: string;
  kind: BeatKind;
  setting: string;
  cast: string;
  dynamics: string;
  pressure: string;
  condition?: string;
  /** Heading-anchored cues for diffing against LiveBeat */
  cues: string[];
};

export type ParsedArcPlan = {
  slug: string;
  status: string;
  arcWindow: string;
  title: string;
  beats: ParsedBeat[];
  sourcePath?: string;
};

export type BeatState = {
  index: number;
  name: string;
  kind: BeatKind;
  status: BeatStatus;
  pressure: string;
  cues: string[];
};

export type DramaturgSnapshot = {
  arcSlug: string;
  planStatus: string;
  beats: BeatState[];
  /** Single brief/auditor line — mechanical or cached LLM */
  momentumLine: string;
  planWarnings: string[];
  sourcePath?: string;
  /** WP-5.3 provenance for the hot-path snapshot */
  source?: "deterministic" | "llm_cache";
  /** WP-5.4: from LLM dramaturg pass when cache is warm */
  npcIntersections?: NpcIntersection[];
  generatedAtTurn?: number;
};

export type { NpcIntersection };

/** Cached dramaturg context (D7 §3.2). */
export type DramaturgContext = {
  arcSlug: string;
  beats: BeatState[];
  momentumLine: string;
  npcIntersections: NpcIntersection[];
  planWarnings: string[];
  generatedAtTurn: number;
  source: "llm" | "deterministic";
  planHash: string;
  refreshedAt: string;
  /** INTEL-2: LIVE BEAT scene fingerprint at last LLM/deterministic seed. */
  liveSceneFingerprint?: string;
  /** INTEL-2: last reason cache was not used (observability only). */
  lastInvalidationReason?: string;
};

export type DramaturgCacheFile = {
  version: 1;
  /** Monotonic preflight counter (incremented each hot-path resolve). */
  turnCounter: number;
  context: DramaturgContext;
};

export type DramaturgRefreshReason =
  | "no_cache"
  | "plan_changed"
  | "scene_transition"
  | "staleness"
  | "force"
  | "scene_fingerprint";

export type DramaturgPassConfig = Pick<
  GuardianConfig,
  | "GUARDIAN_LLM_ENABLED"
  | "OPENAI_API_KEY"
  | "GUARDIAN_MODEL"
  | "GUARDIAN_LLM_VERBOSITY"
  | "GUARDIAN_DRAMATURG_ENABLED"
  | "GUARDIAN_DRAMATURG_STALENESS_TURNS"
  | "GUARDIAN_DRAMATURG_REASONING_EFFORT"
>;

const EMPTY_SNAPSHOT: DramaturgSnapshot = {
  arcSlug: "",
  planStatus: "",
  beats: [],
  momentumLine: "",
  planWarnings: ["no active arc plan"],
  source: "deterministic"
};

const TIERS: Intrusiveness[] = ["ambient", "peripheral", "engaging", "disruptive"];
const BEAT_STATUSES: BeatStatus[] = ["done", "live", "next", "dormant"];
const BEAT_KINDS: BeatKind[] = ["fixed", "open", "conditional"];

/** In-flight guard so concurrent preflights don't stack dramaturg LLM calls. */
let dramaturgRefreshInFlight: Promise<void> | null = null;

function extractBoldField(body: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\*\\*${esc}:?\\*\\*:?\\s*([^\\n]+)`, "i");
  const m = body.match(re);
  return m?.[1]?.trim() ?? "";
}

function extractMetaField(markdown: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\*\\*${esc}:\\*\\*\\s*([^\\n]+)`, "i");
  return markdown.match(re)?.[1]?.trim() ?? "";
}

function parseKind(raw: string): BeatKind {
  const k = raw.toLowerCase().trim();
  if (k.startsWith("open")) return "open";
  if (k.startsWith("conditional")) return "conditional";
  return "fixed";
}

export function parseArcPlan(markdown: string, sourcePath?: string): ParsedArcPlan {
  const md = (markdown ?? "").replace(/\r\n/g, "\n");
  const title =
    md.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    "Arc Plan";
  const slug =
    extractMetaField(md, "Slug") ||
    sourcePath?.match(/arc-\d+[\w-]*/i)?.[0] ||
    title.replace(/^Arc Plan:\s*/i, "").trim() ||
    "unknown-arc";
  const status = (extractMetaField(md, "Status") || "draft").toLowerCase();
  const arcWindow = extractMetaField(md, "Arc window") || extractMetaField(md, "Arc Window") || "";

  const beats: ParsedBeat[] = [];
  
  const lines = md.split("\n");
  const beatBlocks: { index: number; name: string; body: string }[] = [];
  let currentBeat: { index: number; name: string; bodyLines: string[] } | null = null;
  
  // Highly resilient matcher for Beat headings (e.g. "## Beat 1 - Intro", "### Beat 2: Tension", "#Beat 3")
  const beatHeaderRe = /^#{1,6}\s*Beat\s*(\d+)[\s:—–-]*([^\n]*)$/i;
  
  for (const line of lines) {
    const match = line.match(beatHeaderRe);
    if (match) {
      if (currentBeat) {
        beatBlocks.push({ index: currentBeat.index, name: currentBeat.name, body: currentBeat.bodyLines.join("\n") });
      }
      currentBeat = {
        index: Number(match[1]),
        name: match[2].trim(),
        bodyLines: []
      };
    } else if (currentBeat) {
      currentBeat.bodyLines.push(line);
    }
  }
  if (currentBeat) {
    beatBlocks.push({ index: currentBeat.index, name: currentBeat.name, body: currentBeat.bodyLines.join("\n") });
  }

  for (let i = 0; i < beatBlocks.length; i++) {
    const block = beatBlocks[i];
    const body = block.body;
    const index = block.index;
    const name = block.name;
    const kind = parseKind(extractBoldField(body, "kind") || "fixed");
    const setting = extractBoldField(body, "setting");
    const cast = extractBoldField(body, "cast");
    const dynamics = extractBoldField(body, "dynamics");
    const pressure = extractBoldField(body, "pressure");
    const condition = extractBoldField(body, "condition") || undefined;
    const cueSource = [name, setting, cast, dynamics, pressure, condition ?? ""].join(" ");
    const cues = extractCues(cueSource, 20);
    beats.push({
      index: Number.isFinite(index) ? index : i + 1,
      name,
      kind,
      setting,
      cast,
      dynamics,
      pressure,
      condition,
      cues
    });
  }

  return { slug, status, arcWindow, title, beats, sourcePath };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function overlapCount(cues: string[], haystackParts: string[]): number {
  if (!cues.length) return 0;
  const hay = normalize(haystackParts.filter(Boolean).join(" "));
  if (!hay) return 0;
  let n = 0;
  for (const c of cues) {
    const cue = normalize(c);
    if (cue.length < 3) continue;
    if (hay.includes(cue)) n += 1;
  }
  return n;
}

/**
 * Deterministic beat-diff (no LLM).
 * - presentness from liveCues + location + time
 * - pastness from supersededCues
 * - live = highest-index beat with presentness > 0 (else first with pastness == 0, else beat 1)
 * - indices before live → done; live+1 → next; rest → dormant
 */
export function diffBeatsAgainstLive(
  plan: ParsedArcPlan,
  liveBeat: LiveBeat | undefined | null
): BeatState[] {
  const beatList = plan.beats;
  if (!beatList.length) return [];

  const live = liveBeat ?? {
    lastUpdated: "",
    locationLine: "",
    timeLine: "",
    liveCues: [],
    supersededCues: [],
    antiResetNotes: []
  };

  const presentHay = [
    ...live.liveCues,
    live.locationLine,
    live.timeLine,
    live.lastUpdated
  ];
  const pastHay = [...live.supersededCues, ...live.antiResetNotes];

  const scored = beatList.map((b, i) => ({
    i,
    present: overlapCount(b.cues, presentHay),
    past: overlapCount(b.cues, pastHay)
  }));

  let liveIdx = -1;
  let bestPresent = 0;
  for (const s of scored) {
    // Prefer later beats when presentness ties (story has advanced)
    if (s.present > bestPresent || (s.present === bestPresent && s.present > 0 && s.i > liveIdx)) {
      if (s.present > 0) {
        bestPresent = s.present;
        liveIdx = s.i;
      }
    }
  }

  if (liveIdx < 0) {
    // No present cue match against the active plan: do NOT invent Beat 1 as live.
    // Unmatched plans (e.g. completed Friday Nürburgring while LIVE BEAT is Monday aviation)
    // must stay dormant so the hot path does not pressure the wrong schedule.
    return beatList.map((b) => ({
      index: b.index,
      name: b.name,
      kind: b.kind,
      status: "dormant" as BeatStatus,
      pressure: b.pressure,
      cues: b.cues
    }));
  }

  // If early beats have strong past and weak present, force them done even if liveIdx is early
  for (let i = 0; i < liveIdx; i++) {
    /* classified done below */
  }

  return beatList.map((b, i) => {
    let status: BeatStatus;
    if (i < liveIdx) status = "done";
    else if (i === liveIdx) status = "live";
    else if (i === liveIdx + 1) status = "next";
    else status = "dormant";
    return {
      index: b.index,
      name: b.name,
      kind: b.kind,
      status,
      pressure: b.pressure,
      cues: b.cues
    };
  });
}

/**
 * Mechanical one-line momentum for brief + auditor (no outcome language).
 */
export function composeMomentumLine(
  plan: ParsedArcPlan,
  beats: BeatState[]
): string {
  if (!beats.length) {
    return "No beat map for the active arc plan.";
  }
  const total = beats.length;
  const live = beats.find((b) => b.status === "live");
  const next = beats.find((b) => b.status === "next");
  const remaining = beats.filter((b) => b.status === "next" || b.status === "dormant");

  const liveBit = live
    ? `Beat ${live.index} of ${total} (${shortName(live.name)}) is live`
    : `Beat map loaded (${total} beats); live beat unclear`;

  const remainingBit =
    remaining.length === 0
      ? "no further plan beats today"
      : next
        ? `remaining today: ${shortName(next.name)}${
            remaining.length > 1
              ? `, then ${remaining
                  .slice(1)
                  .map((b) => shortName(b.name))
                  .join(", ")}`
              : ""
          }`
        : `remaining: ${remaining.map((b) => shortName(b.name)).join(", ")}`;

  const pressureBit = live?.pressure
    ? ` Pressure now: ${trimPressure(live.pressure)}`
    : next?.pressure
      ? ` Next pressure: ${trimPressure(next.pressure)}`
      : "";

  return `${liveBit}; ${remainingBit}.${pressureBit} The world is ready to move when the scene is.`.replace(
    /\s+/g,
    " "
  ).trim();
}

function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim().slice(0, 72);
}

function trimPressure(p: string): string {
  const t = p.replace(/\*\*/g, "").trim();
  return t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t;
}

/**
 * Full snapshot from plan markdown + live beat.
 */
export function buildDramaturgSnapshot(
  planMarkdown: string | null | undefined,
  liveBeat: LiveBeat | undefined | null,
  sourcePath?: string
): DramaturgSnapshot {
  if (!planMarkdown?.trim()) {
    return { ...EMPTY_SNAPSHOT };
  }
  const plan = parseArcPlan(planMarkdown, sourcePath);
  const warnings: string[] = [];
  if (!plan.beats.length) warnings.push("arc plan has no Beat headings");
  if (plan.status && plan.status !== "active" && plan.status !== "draft") {
    warnings.push(`plan status is '${plan.status}' (expected active for live momentum)`);
  }
  const beats = diffBeatsAgainstLive(plan, liveBeat);
  const momentumLine = composeMomentumLine(plan, beats);
  if (!beats.some((b) => b.status === "live") && liveBeat?.liveCues?.length) {
    warnings.push(
      "No plan beat matches LIVE BEAT cues; deterministic momentum stays dormant (do not invent a live schedule beat)."
    );
  }
  return {
    arcSlug: plan.slug,
    planStatus: plan.status,
    beats,
    momentumLine,
    planWarnings: warnings,
    sourcePath: sourcePath ?? plan.sourcePath
  };
}

/** Auditor block: schedule pressure only (below LIVE BEAT, above evidence). */
export function formatStoryMomentumBlock(
  snapshot: DramaturgSnapshot | undefined | null
): string {
  if (!snapshot?.momentumLine?.trim()) {
    return [
      "### STORY MOMENTUM",
      "(no active arc plan — day schedule pressure unavailable this turn)"
    ].join("\n");
  }
  const lines = [
    "### STORY MOMENTUM",
    "Day/arc schedule pressure only. Never invent outcomes for open beats. LIVE BEAT still wins for present location/time."
  ];
  if (snapshot.arcSlug) lines.push(`- Arc: ${snapshot.arcSlug} (${snapshot.planStatus || "unknown"})`);
  if (snapshot.source === "llm_cache") {
    lines.push("- Source: cached dramaturg pass (scene-level; not re-run this turn)");
  } else {
    lines.push("- Source: deterministic beat-diff (LLM pass may refresh in background)");
  }
  lines.push(`- ${snapshot.momentumLine}`);
  const live = snapshot.beats.find((b) => b.status === "live");
  const next = snapshot.beats.find((b) => b.status === "next");
  if (live?.pressure) lines.push(`- Live pressure: ${trimPressure(live.pressure)}`);
  if (next?.pressure) lines.push(`- Next pressure: ${trimPressure(next.pressure)}`);
  if (snapshot.npcIntersections?.length) {
    lines.push(
      `- NPC pressure: ${snapshot.npcIntersections
        .slice(0, 3)
        .map((n) => `${n.npc} (${n.suggestedTier})`)
        .join("; ")}`
    );
  }
  if (snapshot.planWarnings.length) {
    lines.push(`- Warnings: ${snapshot.planWarnings.join("; ")}`);
  }
  return lines.join("\n");
}

/**
 * Candidate directories for arc-plans/ (Guardian may live beside rag-memory-mcp).
 */
export function arcPlanSearchDirs(cwd: string = process.cwd()): string[] {
  const dirs: string[] = [];
  const envPath = process.env.GUARDIAN_ARC_PLAN_DIR?.trim();
  if (envPath) dirs.push(path.resolve(envPath));
  const mem = process.env.GUARDIAN_MEMORY_DIR?.trim();
  if (mem) dirs.push(path.resolve(mem, "arc-plans"));
  dirs.push(path.resolve(cwd, "project_source_files/arc-plans"));
  dirs.push(path.resolve(cwd, "../rag-memory-mcp/project_source_files/arc-plans"));
  dirs.push(path.resolve(cwd, "../../rag-memory-mcp/project_source_files/arc-plans"));
  return [...new Set(dirs)];
}

/**
 * Load the active arc plan from disk. Prefer **Status:** active only.
 * Do NOT fall back to completed/draft plans (that pulled Nürburgring Beat 1 into Monday aviation).
 * Returns null if none found (momentum omitted gracefully).
 */
export function loadActiveArcPlan(
  cwd: string = process.cwd()
): { markdown: string; sourcePath: string } | null {
  const single = process.env.GUARDIAN_ARC_PLAN_PATH?.trim();
  if (single && fs.existsSync(single)) {
    return { markdown: fs.readFileSync(single, "utf8"), sourcePath: single };
  }

  for (const dir of arcPlanSearchDirs(cwd)) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
      .sort();
    const candidates = files.map((f) => path.join(dir, f));
    for (const fp of candidates) {
      const markdown = fs.readFileSync(fp, "utf8");
      const status = (extractMetaField(markdown, "Status") || "").toLowerCase();
      if (status === "active") {
        return { markdown, sourcePath: fp };
      }
    }
  }
  return null;
}

/** Convenience: load + build snapshot for preflight. */
export function loadDramaturgSnapshot(
  liveBeat: LiveBeat | undefined | null,
  cwd: string = process.cwd()
): DramaturgSnapshot {
  const loaded = loadActiveArcPlan(cwd);
  if (!loaded) return { ...EMPTY_SNAPSHOT };
  return buildDramaturgSnapshot(loaded.markdown, liveBeat, loaded.sourcePath);
}

// ─── WP-5.3: cache + LLM pass + background refresh ───────────────────────────

export function hashArcPlanMarkdown(markdown: string): string {
  return createHash("sha256").update(markdown ?? "", "utf8").digest("hex").slice(0, 16);
}

export function dramaturgCachePath(rootDir: string = process.cwd()): string {
  return path.resolve(rootDir, ".guardian/dramaturg-context.json");
}

export function readDramaturgCache(
  rootDir: string = process.cwd()
): DramaturgCacheFile | null {
  const p = dramaturgCachePath(rootDir);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as DramaturgCacheFile;
    if (!raw || raw.version !== 1 || !raw.context?.momentumLine) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeDramaturgCache(
  file: DramaturgCacheFile,
  rootDir: string = process.cwd()
): void {
  const p = dramaturgCachePath(rootDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(file, null, 2), "utf8");
}

/**
 * Resolve the snapshot for *this* turn: prefer valid LLM cache
 * (same plan hash + INTEL-2 live scene fingerprint), else deterministic beat-diff.
 * Never calls the network.
 */
export function resolveHotPathDramaturg(args: {
  deterministic: DramaturgSnapshot;
  cache: DramaturgCacheFile | null;
  planHash: string;
  /** LIVE BEAT for INTEL-2 fingerprint (optional for unit tests). */
  liveBeat?: LiveBeat | null;
  /** When true, bump turnCounter on the returned cache view (persisted lightly). */
  bumpTurn?: boolean;
  rootDir?: string;
}): {
  snapshot: DramaturgSnapshot;
  cache: DramaturgCacheFile | null;
  turnCounter: number;
  /** INTEL-2: why LLM cache was not used, if any */
  cacheInvalidationReason?: string | null;
} {
  const rootDir = args.rootDir ?? process.cwd();
  const currentFp = computeLiveSceneFingerprint(args.liveBeat);
  let cache = args.cache;
  let turnCounter = cache?.turnCounter ?? 0;
  if (args.bumpTurn !== false) {
    turnCounter += 1;
    if (cache) {
      cache = { ...cache, turnCounter };
      try {
        writeDramaturgCache(cache, rootDir);
      } catch {
        /* non-fatal */
      }
    } else {
      // Persist turn counter alone so staleness can start even before first LLM pass.
      try {
        const seed: DramaturgCacheFile = {
          version: 1,
          turnCounter,
          context: {
            arcSlug: args.deterministic.arcSlug,
            beats: args.deterministic.beats,
            momentumLine: args.deterministic.momentumLine,
            npcIntersections: [],
            planWarnings: args.deterministic.planWarnings,
            generatedAtTurn: 0,
            source: "deterministic",
            planHash: args.planHash,
            refreshedAt: new Date().toISOString(),
            liveSceneFingerprint: currentFp
          }
        };
        writeDramaturgCache(seed, rootDir);
        cache = seed;
      } catch {
        /* non-fatal */
      }
    }
  }

  const ctx = cache?.context;
  const fpReason = sceneFingerprintInvalidationReason(
    ctx?.liveSceneFingerprint,
    currentFp
  );
  // Old sidecars without fingerprint: fail conservative (do not use as llm_cache).
  const sceneOk = fingerprintsMatch(ctx?.liveSceneFingerprint, currentFp);
  const cacheUsable =
    Boolean(ctx?.momentumLine) &&
    Boolean(args.planHash) &&
    ctx!.planHash === args.planHash &&
    ctx!.source === "llm" &&
    sceneOk;

  if (cacheUsable && ctx) {
    return {
      turnCounter,
      cache,
      cacheInvalidationReason: null,
      snapshot: {
        arcSlug: ctx.arcSlug || args.deterministic.arcSlug,
        planStatus: args.deterministic.planStatus,
        beats: ctx.beats.length ? ctx.beats : args.deterministic.beats,
        momentumLine: ctx.momentumLine,
        planWarnings: uniqueWarn([
          ...args.deterministic.planWarnings,
          ...ctx.planWarnings
        ]),
        sourcePath: args.deterministic.sourcePath,
        source: "llm_cache",
        npcIntersections: ctx.npcIntersections,
        generatedAtTurn: ctx.generatedAtTurn
      }
    };
  }

  const invalidation =
    ctx?.source === "llm"
      ? fpReason ||
        (ctx.planHash !== args.planHash ? "plan_hash_mismatch" : "cache_not_usable")
      : null;

  // Persist invalidation reason on disk for operator visibility (non-destructive).
  if (invalidation && cache?.context) {
    try {
      const updated: DramaturgCacheFile = {
        ...cache,
        turnCounter,
        context: {
          ...cache.context,
          lastInvalidationReason: invalidation
        }
      };
      writeDramaturgCache(updated, rootDir);
      cache = updated;
    } catch {
      /* non-fatal */
    }
  }

  return {
    turnCounter,
    cache,
    cacheInvalidationReason: invalidation,
    snapshot: {
      ...args.deterministic,
      source: "deterministic"
    }
  };
}

export function shouldRefreshDramaturg(args: {
  enabled: boolean;
  llmEnabled: boolean;
  hasApiKey: boolean;
  hasPlan: boolean;
  /** Skip network during frozen/hermetic eval */
  skipForEval?: boolean;
  cache: DramaturgCacheFile | null;
  planHash: string;
  turnCounter: number;
  stalenessTurns: number;
  sceneTransitionOccurred: boolean;
  /** INTEL-2: current LIVE BEAT fingerprint */
  currentSceneFingerprint?: string;
  force?: boolean;
}): { refresh: boolean; reason: DramaturgRefreshReason | null } {
  if (args.skipForEval) return { refresh: false, reason: null };
  if (!args.enabled || !args.llmEnabled || !args.hasApiKey || !args.hasPlan) {
    return { refresh: false, reason: null };
  }
  if (args.force) return { refresh: true, reason: "force" };
  if (!args.cache?.context || args.cache.context.source !== "llm") {
    return { refresh: true, reason: "no_cache" };
  }
  if (args.planHash && args.cache.context.planHash !== args.planHash) {
    return { refresh: true, reason: "plan_changed" };
  }
  // INTEL-2: fingerprint mismatch or missing → refresh LLM pass when network allowed
  if (
    args.currentSceneFingerprint &&
    !fingerprintsMatch(
      args.cache.context.liveSceneFingerprint,
      args.currentSceneFingerprint
    )
  ) {
    return { refresh: true, reason: "scene_fingerprint" };
  }
  if (args.sceneTransitionOccurred) {
    return { refresh: true, reason: "scene_transition" };
  }
  const age = args.turnCounter - (args.cache.context.generatedAtTurn || 0);
  if (age >= args.stalenessTurns) {
    return { refresh: true, reason: "staleness" };
  }
  return { refresh: false, reason: null };
}

const dramaturgPassSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    beats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          name: { type: "string" },
          kind: { type: "string", enum: BEAT_KINDS },
          status: { type: "string", enum: BEAT_STATUSES },
          pressure: { type: "string" }
        },
        required: ["index", "name", "kind", "status", "pressure"]
      }
    },
    momentum_line: {
      type: "string",
      description:
        "One sentence: which beat is live, what remains today, schedule pressure only — never outcomes."
    },
    npc_intersections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          npc: { type: "string" },
          agenda: { type: "string" },
          suggested_tier: { type: "string", enum: TIERS }
        },
        required: ["npc", "agenda", "suggested_tier"]
      }
    },
    plan_warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["beats", "momentum_line", "npc_intersections", "plan_warnings"]
} as const;

function buildDramaturgPassSystemPrompt(): string {
  return [
    "You are the Scarlett & Benjamin dramaturg (scene-level, not the per-turn continuity auditor).",
    "Classify plan beats as done | live | next | dormant against the LIVE BEAT snapshot.",
    "Write one momentum_line of schedule pressure only.",
    "CRITICAL DESIGN LAW: You propose pressure and possibility. You NEVER decide outcomes, dialogue, lap results, who wins, or how open beats resolve.",
    "Open beats stay open. Conditional beats stay conditional unless LIVE BEAT already shows them done.",
    "npc_intersections: only list NPCs whose agendas clearly intersect the live scene now; usually empty. suggested_tier must be ambient|peripheral|engaging|disruptive.",
    "plan_warnings: e.g. two active plans, no live beat match — or empty array.",
    "Do not invent story facts beyond the plan + LIVE BEAT."
  ].join(" ");
}

function buildDramaturgPassUserMessage(input: {
  plan: ParsedArcPlan;
  liveBeat: LiveBeat;
  npcAgendas: string;
  deterministic: DramaturgSnapshot;
}): string {
  const planBeats = input.plan.beats.map((b) => ({
    index: b.index,
    name: b.name,
    kind: b.kind,
    setting: b.setting,
    cast: b.cast,
    pressure: b.pressure,
    condition: b.condition ?? null
  }));
  const payload = {
    arc_slug: input.plan.slug,
    plan_status: input.plan.status,
    plan_beats: planBeats,
    live_beat: {
      lastUpdated: input.liveBeat.lastUpdated,
      locationLine: input.liveBeat.locationLine,
      timeLine: input.liveBeat.timeLine,
      liveCues: input.liveBeat.liveCues.slice(0, 16),
      supersededCues: input.liveBeat.supersededCues.slice(0, 16)
    },
    deterministic_diff: {
      momentumLine: input.deterministic.momentumLine,
      beats: input.deterministic.beats.map((b) => ({
        index: b.index,
        name: b.name,
        status: b.status,
        pressure: b.pressure
      }))
    },
    npc_agendas_markdown: input.npcAgendas?.trim()
      ? input.npcAgendas.slice(0, 6000)
      : "(none loaded — return empty npc_intersections)"
  };
  return [
    "### DRAMATURG PASS INPUT",
    "Return JSON only per schema. momentum_line must not invent outcomes.",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

/**
 * One terra call (medium effort by default). Schema enforces pressure-only fields.
 */
export async function runDramaturgPass(input: {
  plan: ParsedArcPlan;
  liveBeat: LiveBeat;
  npcAgendas?: string;
  deterministic: DramaturgSnapshot;
  planHash: string;
  turnCounter: number;
  config: DramaturgPassConfig;
}): Promise<DramaturgContext> {
  const { config } = input;
  if (!config.GUARDIAN_DRAMATURG_ENABLED) {
    throw new Error("GUARDIAN_DRAMATURG_ENABLED is false");
  }
  if (!config.GUARDIAN_LLM_ENABLED || !config.OPENAI_API_KEY) {
    throw new Error("Dramaturg pass requires GUARDIAN_LLM_ENABLED and OPENAI_API_KEY");
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: config.GUARDIAN_MODEL,
    reasoning: {
      effort: config.GUARDIAN_DRAMATURG_REASONING_EFFORT ?? "medium"
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildDramaturgPassSystemPrompt() }]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildDramaturgPassUserMessage({
              plan: input.plan,
              liveBeat: input.liveBeat,
              npcAgendas: input.npcAgendas ?? "",
              deterministic: input.deterministic
            })
          }
        ]
      }
    ],
    text: {
      verbosity: config.GUARDIAN_LLM_VERBOSITY ?? "medium",
      format: {
        type: "json_schema",
        name: "dramaturg_context",
        strict: true,
        schema: dramaturgPassSchema
      }
    }
  } as never);

  const outputText =
    (response as unknown as { output_text?: string }).output_text ??
    extractOutputText(response);
  if (!outputText) throw new Error("Dramaturg pass returned empty output_text");

  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  return normalizeDramaturgPassResult(parsed, input);
}

export function normalizeDramaturgPassResult(
  raw: Record<string, unknown>,
  input: {
    plan: ParsedArcPlan;
    deterministic: DramaturgSnapshot;
    planHash: string;
    turnCounter: number;
    liveBeat?: LiveBeat | null;
  }
): DramaturgContext {
  const beatsRaw = Array.isArray(raw.beats) ? raw.beats : [];
  const beats: BeatState[] = beatsRaw
    .map((b, i) => {
      if (!b || typeof b !== "object") return null;
      const o = b as Record<string, unknown>;
      const kind = BEAT_KINDS.includes(o.kind as BeatKind)
        ? (o.kind as BeatKind)
        : "fixed";
      const status = BEAT_STATUSES.includes(o.status as BeatStatus)
        ? (o.status as BeatStatus)
        : "dormant";
      const index =
        typeof o.index === "number" && Number.isFinite(o.index)
          ? o.index
          : i + 1;
      const name =
        typeof o.name === "string" && o.name.trim()
          ? o.name.trim()
          : input.plan.beats[i]?.name ?? `Beat ${index}`;
      const pressure =
        typeof o.pressure === "string" ? o.pressure.trim() : "";
      // Refuse outcome-y pressure language lightly: still accept string; tests check momentum
      return {
        index,
        name,
        kind,
        status,
        pressure: pressure || input.deterministic.beats[i]?.pressure || "",
        cues: input.plan.beats.find((pb) => pb.index === index)?.cues ?? []
      } satisfies BeatState;
    })
    .filter((b): b is BeatState => b !== null);

  const finalBeats = beats.length ? beats : input.deterministic.beats;

  let momentumLine =
    typeof raw.momentum_line === "string" ? raw.momentum_line.trim() : "";
  if (!momentumLine || /she will (win|crash|succeed)|must succeed/i.test(momentumLine)) {
    momentumLine = input.deterministic.momentumLine;
  }

  const npcRaw = Array.isArray(raw.npc_intersections) ? raw.npc_intersections : [];
  const npcIntersections: NpcIntersection[] = npcRaw
    .map((n) => {
      if (!n || typeof n !== "object") return null;
      const o = n as Record<string, unknown>;
      const tier = TIERS.includes(o.suggested_tier as Intrusiveness)
        ? (o.suggested_tier as Intrusiveness)
        : "ambient";
      const npc = typeof o.npc === "string" ? o.npc.trim() : "";
      const agenda = typeof o.agenda === "string" ? o.agenda.trim() : "";
      if (!npc || !agenda) return null;
      return { npc, agenda, suggestedTier: tier };
    })
    .filter((n): n is NpcIntersection => n !== null);

  const warningsRaw = Array.isArray(raw.plan_warnings) ? raw.plan_warnings : [];
  const planWarnings = warningsRaw
    .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
    .map((w) => w.trim())
    .slice(0, 8);

  return {
    arcSlug: input.plan.slug,
    beats: finalBeats,
    momentumLine,
    npcIntersections,
    planWarnings,
    generatedAtTurn: input.turnCounter,
    source: "llm",
    planHash: input.planHash,
    refreshedAt: new Date().toISOString(),
    liveSceneFingerprint: computeLiveSceneFingerprint(input.liveBeat)
  };
}

/**
 * Fire-and-forget dramaturg refresh. Never awaited on the hot path.
 * Concurrent calls coalesce into one in-flight promise.
 */
export function scheduleDramaturgRefresh(args: {
  planMarkdown: string;
  sourcePath?: string;
  liveBeat: LiveBeat;
  deterministic: DramaturgSnapshot;
  planHash: string;
  turnCounter: number;
  npcAgendas?: string;
  config: DramaturgPassConfig;
  rootDir?: string;
  reason: DramaturgRefreshReason;
}): void {
  if (dramaturgRefreshInFlight) {
    console.log(
      `${Date.now()} Dramaturg refresh already in flight; skip schedule (${args.reason})`
    );
    return;
  }

  const rootDir = args.rootDir ?? process.cwd();
  const plan = parseArcPlan(args.planMarkdown, args.sourcePath);

  dramaturgRefreshInFlight = (async () => {
    console.log(
      `${Date.now()} Dramaturg pass starting (reason=${args.reason}, turn=${args.turnCounter})…`
    );
    try {
      const ctx = await runDramaturgPass({
        plan,
        liveBeat: args.liveBeat,
        npcAgendas: args.npcAgendas ?? "",
        deterministic: args.deterministic,
        planHash: args.planHash,
        turnCounter: args.turnCounter,
        config: args.config
      });
      const prev = readDramaturgCache(rootDir);
      writeDramaturgCache(
        {
          version: 1,
          turnCounter: Math.max(prev?.turnCounter ?? 0, args.turnCounter),
          context: ctx
        },
        rootDir
      );
      console.log(
        `${Date.now()} Dramaturg pass cached: ${ctx.momentumLine.slice(0, 120)}${
          ctx.momentumLine.length > 120 ? "…" : ""
        }`
      );
    } catch (err) {
      console.warn(
        `${Date.now()} Dramaturg pass failed:`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      dramaturgRefreshInFlight = null;
    }
  })();

  // Prevent unhandled rejection noise
  void dramaturgRefreshInFlight;
}

/** Test helper: clear in-flight lock. */
export function _resetDramaturgRefreshLockForTests(): void {
  dramaturgRefreshInFlight = null;
}

/** Optional: load npc-agendas.md if present (WP-5.4 authors content). */
export function loadNpcAgendasMarkdown(cwd: string = process.cwd()): string {
  const candidates = [
    process.env.GUARDIAN_NPC_AGENDAS_PATH?.trim(),
    path.resolve(cwd, "project_source_files/npc-agendas.md"),
    path.resolve(cwd, "../rag-memory-mcp/project_source_files/npc-agendas.md")
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    } catch {
      /* continue */
    }
  }
  return "";
}

function uniqueWarn(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function extractOutputText(response: unknown): string | undefined {
  const output =
    (response as { output?: Array<{ content?: Array<{ text?: string }> }> }).output ??
    [];
  for (const item of output) {
    const textPart = item.content?.find((c) => typeof c.text === "string");
    if (textPart?.text) return textPart.text;
  }
  return undefined;
}

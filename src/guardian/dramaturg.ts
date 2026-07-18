/**
 * WP-5.2 — Dramaturg P0 (LLM-free): parse arc plans, deterministic beat-diff, mechanical momentum line.
 * Spec: docs/fable-5-roadmaps-audits/guardian-dramaturg-design-2026-07.md §2.1–2.2, §4 P0
 *
 * Design law: propose pressure, never outcomes. No field here can express how a beat resolves.
 */

import fs from "node:fs";
import path from "node:path";
import { extractCues, type LiveBeat } from "./recency.js";

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
  /** Single brief/auditor line — mechanical, no LLM */
  momentumLine: string;
  planWarnings: string[];
  sourcePath?: string;
};

const EMPTY_SNAPSHOT: DramaturgSnapshot = {
  arcSlug: "",
  planStatus: "",
  beats: [],
  momentumLine: "",
  planWarnings: ["no active arc plan"]
};

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

/**
 * Parse an arc-plan markdown document (heading-anchored, like parseLiveBeat).
 * Expects `## Beat N — Name` sections with kind/setting/cast/pressure bullets.
 */
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
  // Split on ## Beat headings
  const beatRe = /^##\s+Beat\s+(\d+)\s*[—–-]\s*(.+)$/gim;
  const matches = [...md.matchAll(beatRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : md.length;
    const body = md.slice(start, end);
    const index = Number(m[1]);
    const name = m[2].trim();
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
    // No live cue match: first beat that is not clearly past-only
    liveIdx = scored.findIndex((s) => s.past === 0);
    if (liveIdx < 0) liveIdx = 0;
    // If early beats are strongly past and a later has any past+present zero, still start at first non-past-heavy
    for (let i = scored.length - 1; i >= 0; i--) {
      if (scored[i].past > 0 && scored[i].present === 0) {
        // mark as candidate done — live is after last pure-past
        liveIdx = Math.min(i + 1, scored.length - 1);
      } else {
        break;
      }
    }
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
  lines.push(`- ${snapshot.momentumLine}`);
  const live = snapshot.beats.find((b) => b.status === "live");
  const next = snapshot.beats.find((b) => b.status === "next");
  if (live?.pressure) lines.push(`- Live pressure: ${trimPressure(live.pressure)}`);
  if (next?.pressure) lines.push(`- Next pressure: ${trimPressure(next.pressure)}`);
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
 * Load the active arc plan from disk. Prefer **Status:** active; else first arc-*.md.
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
    let fallback: { markdown: string; sourcePath: string } | null = null;
    for (const fp of candidates) {
      const markdown = fs.readFileSync(fp, "utf8");
      const status = (extractMetaField(markdown, "Status") || "").toLowerCase();
      if (status === "active") {
        return { markdown, sourcePath: fp };
      }
      if (!fallback && /^arc-/i.test(path.basename(fp))) {
        fallback = { markdown, sourcePath: fp };
      }
    }
    if (fallback) return fallback;
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

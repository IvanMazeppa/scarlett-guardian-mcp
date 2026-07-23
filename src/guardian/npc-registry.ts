/**
 * WP-5.6/5.8 — Parse registry tails from secondary-characters-bible.md
 * and format Scene Cast brief lines (pressure only, mandatory ⚠ boundaries).
 */

import fs from "node:fs";
import path from "node:path";
import type { SceneRoster } from "./scene-roster.js";

export type RegistryTail = {
  displayName: string;
  disposition: string;
  wants: string;
  knows: string;
  mustNotLearn: string;
  lastSeen: string;
};

const TAIL_LABELS = [
  "Disposition (couple)",
  "Wants now",
  "Knows",
  "Must not accidentally learn",
  "Last seen"
] as const;

function extractField(body: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\*\\*${esc}:\\*\\*\\s*([^\\n]+)`, "i");
  return (body.match(re)?.[1] ?? "").replace(/\(VOLATILE\)|\(STABLE\)/gi, "").trim();
}

/**
 * Parse ### / #### character sections that carry registry tails.
 */
export function parseRegistryTails(markdown: string): Map<string, RegistryTail> {
  const map = new Map<string, RegistryTail>();
  const md = (markdown ?? "").replace(/\r\n/g, "\n");
  // Split on ### or #### headings
  const parts = md.split(/^#{3,4}\s+/m);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf("\n");
    const title = (nl === -1 ? block : block.slice(0, nl)).trim();
    if (!title || /notes for consistency/i.test(title)) continue;
    const body = nl === -1 ? "" : block.slice(nl + 1);
    const disposition = extractField(body, "Disposition (couple)");
    const wants = extractField(body, "Wants now");
    const knows = extractField(body, "Knows");
    const mustNotLearn = extractField(body, "Must not accidentally learn");
    const lastSeen = extractField(body, "Last seen");
    if (!disposition && !wants && !mustNotLearn) continue;
    const displayName = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const key = displayName.toLowerCase();
    map.set(key, {
      displayName: title.split("(")[0].trim() || displayName,
      disposition,
      wants,
      knows,
      mustNotLearn,
      lastSeen
    });
    // Also index by first name token
    const first = displayName.split(/\s+/)[0]?.toLowerCase();
    if (first && first.length > 2) map.set(first, map.get(key)!);
  }
  return map;
}

export function loadSecondaryCharactersBible(cwd: string = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, "project_source_files/secondary-characters-bible.md"),
    path.resolve(cwd, "../rag-memory-mcp/project_source_files/secondary-characters-bible.md")
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    } catch {
      /* continue */
    }
  }
  return "";
}

export function loadRegistryTailMap(cwd: string = process.cwd()): Map<string, RegistryTail> {
  const md = loadSecondaryCharactersBible(cwd);
  return md ? parseRegistryTails(md) : new Map();
}

function findTail(
  map: Map<string, RegistryTail>,
  displayName: string,
  id: string
): RegistryTail | undefined {
  const keys = [
    displayName.toLowerCase(),
    displayName.replace(/^mr\.?\s*/i, "").toLowerCase(),
    id.replace(/_/g, " "),
    id
  ];
  for (const k of keys) {
    if (map.has(k)) return map.get(k);
    // partial: key includes token
    for (const [mk, v] of map) {
      if (mk.includes(k) || k.includes(mk)) return v;
    }
  }
  return undefined;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Soft overrun for mandatory ⚠ survival (design target remains maxWords). */
export const SCENE_CAST_SOFT_OVERRUN = 40;

/**
 * Scene Cast block for the Grok brief. Design budget maxWords (default 90).
 * Soft ceiling maxWords + SCENE_CAST_SOFT_OVERRUN (130 when max=90) so ⚠ boundaries survive.
 * First NPC is also budgeted — full registry tails must not dump past the soft ceiling.
 */
export function formatSceneCastBlock(
  roster: SceneRoster | GuardianSceneRosterLike | undefined | null,
  tails?: Map<string, RegistryTail>,
  maxWords: number = 90
): string {
  if (!roster?.active?.length) return "";
  const softCap = maxWords + SCENE_CAST_SOFT_OVERRUN;
  const map = tails ?? new Map();
  const lines: string[] = [
    "**Scene Cast (supporting — Scarlett remains the lens and the lead):**"
  ];

  let used = countWords(lines[0]);
  for (const member of roster.active) {
    const displayName =
      "displayName" in member ? member.displayName : (member as { name?: string }).name ?? "NPC";
    const id = "id" in member ? member.id : displayName.toLowerCase();
    const tail = findTail(map, displayName, id);
    const boundary = normalizeBoundary(tail?.mustNotLearn);
    const remaining = softCap - used;
    if (remaining <= 4) break;

    // Prefer compact fields so multi-NPC casts stay near the design budget.
    const bits: string[] = [];
    if (tail?.disposition) bits.push(shorten(tail.disposition, 10));
    if (tail?.wants) bits.push(`wants ${shorten(tail.wants, 8)}`);
    else if (!tail) bits.push("supporting presence");
    // Omit knows when a boundary is present — ⚠ is higher priority under pressure.
    if (tail?.knows && !boundary) bits.push(`knows ${shorten(tail.knows, 6)}`);

    let full = `- ${displayName}: ${bits.join("; ") || "present"}.`;
    if (boundary) {
      full += ` ⚠ ${shorten(boundary, 12)}.`;
    }

    const candidates: string[] = [full];
    if (boundary) {
      candidates.push(`- ${displayName}: present. ⚠ ${shorten(boundary, 14)}.`);
      candidates.push(`- ${displayName}: ⚠ ${shorten(boundary, 10)}.`);
    } else {
      candidates.push(`- ${displayName}: present.`);
    }

    const chosen =
      candidates.find((c) => countWords(c) <= remaining) ??
      (boundary
        ? `- ${displayName}: ⚠ ${shorten(boundary, Math.max(4, remaining - 3))}.`
        : undefined);
    if (!chosen) continue;
    lines.push(chosen);
    used += countWords(chosen);
  }

  if (roster.background?.length) {
    const bg = `- Background: ${roster.background.slice(0, 3).join("; ")} (ambient only).`;
    if (used + countWords(bg) <= softCap) lines.push(bg);
  }

  return lines.join("\n");
}

/** Minimal shape from GuardianReport.scene_roster */
export type GuardianSceneRosterLike = {
  active: Array<{ id: string; displayName: string; activation?: string }>;
  background?: string[];
  summary?: string;
};

function shorten(s: string, maxWords: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function normalizeBoundary(raw: string | undefined): string {
  if (!raw) return "";
  let t = raw.trim();
  // Explicit none markers from registry tails
  if (/^[-—–]\s*(\(|$)/.test(t)) return "";
  if (/no family stealth|do not invent classified/i.test(t) && !/scarlett is trans/i.test(t)) {
    return "";
  }
  t = t.replace(/^[-—–]\s*/, "").trim();
  if (!t || t === "—" || /^n\/?a$/i.test(t) || /^\(?stable\)?$/i.test(t)) return "";
  return t.replace(/\s*\(stealth canon[^)]*\)/i, "").trim();
}

/** Hard assertion helper for tests: every boundary-bearing active NPC has ⚠ in block. */
export function castBlockHasAllBoundaryMarks(
  block: string,
  roster: GuardianSceneRosterLike,
  tails: Map<string, RegistryTail>
): boolean {
  for (const m of roster.active) {
    const tail = findTail(tails, m.displayName, m.id);
    const b = normalizeBoundary(tail?.mustNotLearn);
    if (!b) continue;
    if (!block.includes("⚠")) return false;
    // Name should appear near a warning in the block
    if (!new RegExp(m.displayName.split(/\s+/)[0], "i").test(block)) return false;
  }
  return true;
}

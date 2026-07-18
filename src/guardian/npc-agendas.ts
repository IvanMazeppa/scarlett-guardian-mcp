/**
 * WP-5.4 — NPC agendas corpus parse + deterministic live-scene intersection.
 * Spec: guardian-dramaturg-design-2026-07.md §2.3; master roadmap 5.4
 *
 * Pressure only — agendas never decide outcomes or dialogue.
 */

import fs from "node:fs";
import path from "node:path";
import type { LiveBeat } from "./recency.js";
import type { Intrusiveness, SerendipityCategory } from "./serendipity-weaver.js";

/** Shared with dramaturg cache / serendipity weaver. */
export type NpcIntersection = {
  npc: string;
  agenda: string;
  suggestedTier: Intrusiveness;
};

export type NpcAgenda = {
  name: string;
  wants: string;
  schedule: string;
  disposition: string;
  offstageClock: string;
  sceneCues: string[];
  defaultTier: Intrusiveness;
  pressureHint: string;
  /** Optional serendipity category hint */
  categoryHint?: SerendipityCategory;
};

const TIERS: Intrusiveness[] = ["ambient", "peripheral", "engaging", "disruptive"];

function extractField(body: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\*\\*${esc}:\\*\\*\\s*([^\\n]+)`, "i");
  return body.match(re)?.[1]?.trim() ?? "";
}

function parseTier(raw: string): Intrusiveness {
  const t = raw.toLowerCase().trim();
  if (TIERS.includes(t as Intrusiveness)) return t as Intrusiveness;
  return "peripheral";
}

function parseCueList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2);
}

/**
 * Parse `npc-agendas.md` (`## Name` blocks with bold fields).
 */
export function parseNpcAgendas(markdown: string): NpcAgenda[] {
  const md = (markdown ?? "").replace(/\r\n/g, "\n");
  const parts = md.split(/^##\s+/m);
  const agendas: NpcAgenda[] = [];
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf("\n");
    const name = (nl === -1 ? block : block.slice(0, nl)).trim();
    if (!name || /^operator notes/i.test(name)) continue;
    const body = nl === -1 ? "" : block.slice(nl + 1);
    const wants = extractField(body, "wants");
    if (!wants && !extractField(body, "scene_cues")) continue;
    const cuesRaw = extractField(body, "scene_cues");
    agendas.push({
      name,
      wants,
      schedule: extractField(body, "schedule"),
      disposition: extractField(body, "disposition toward the couple") ||
        extractField(body, "disposition"),
      offstageClock: extractField(body, "offstage clock"),
      sceneCues: parseCueList(cuesRaw),
      defaultTier: parseTier(extractField(body, "default_tier") || "peripheral"),
      pressureHint: extractField(body, "pressure_hint"),
      categoryHint: guessCategory(name)
    });
  }
  return agendas;
}

function guessCategory(name: string): SerendipityCategory | undefined {
  const n = name.toLowerCase();
  if (n.includes("ryan")) return "ryan_arc";
  if (n.includes("shevchenko") || n.includes("albion")) return "work_albion";
  if (n.includes("chris") || n.includes("deb") || n.includes("lynn") || n.includes("family")) {
    return "phone_family";
  }
  if (n.includes("amg") || n.includes("engineer")) return "tech";
  return "environment";
}

function haystack(
  liveBeat: LiveBeat | null | undefined,
  userMessage: string,
  recentContext?: string
): string {
  return [
    userMessage,
    recentContext ?? "",
    liveBeat?.locationLine ?? "",
    liveBeat?.timeLine ?? "",
    liveBeat?.lastUpdated ?? "",
    ...(liveBeat?.liveCues ?? []),
    ...(liveBeat?.supersededCues ?? [])
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[-_]+/g, " ");
}

/** Word-aware cue match — avoids "uk" in random tokens / "deb" inside longer words. */
export function cueMatchesHay(hay: string, cue: string): boolean {
  const c = cue.toLowerCase().trim();
  if (c.length < 3) return false;
  if (c.includes(" ")) return hay.includes(c);
  // whole-token match for short/single words
  const re = new RegExp(`(?:^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
  return re.test(hay);
}

/**
 * Deterministic intersections: agenda scene_cues vs LIVE BEAT + user message.
 * Caps to 3; prefers on-site / high cue-hit NPCs.
 */
export function intersectAgendasWithLiveScene(
  agendas: NpcAgenda[],
  liveBeat: LiveBeat | null | undefined,
  userMessage: string,
  recentContext?: string
): NpcIntersection[] {
  if (!agendas.length) return [];
  const hay = haystack(liveBeat, userMessage, recentContext);
  if (!hay.trim()) return [];

  const scored = agendas
    .map((a) => {
      const hits = a.sceneCues.filter((c) => cueMatchesHay(hay, c));
      const isOffstageThreat = /ryan/i.test(a.name);
      const onSiteBoost =
        /on-?site|pit|paddock|industry pool/i.test(a.schedule) &&
        /paddock|pit box|pit wall|nordschleife|nürburgring|nuerburgring|telemetry|debrief|industry pool/i.test(
          hay
        )
          ? 1
          : 0;
      const score = hits.length + onSiteBoost;
      if (hits.length === 0 && onSiteBoost === 0) return null;
      // Offstage threat (Ryan): require a strong identity cue, never onSiteBoost alone
      if (isOffstageThreat) {
        const strong = hits.some((h) =>
          /ryan|brother|cheltenham|drugs/.test(h.toLowerCase())
        );
        if (!strong) return null;
      }
      const agendaText = [a.wants, a.pressureHint].filter(Boolean).join(" — ");
      return {
        score,
        intersection: {
          npc: a.name,
          agenda: agendaText || a.wants,
          suggestedTier: a.defaultTier
        } satisfies NpcIntersection
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((s) => s.intersection);
}

/**
 * Merge deterministic + dramaturg LLM intersections (LLM wins on same NPC name).
 */
export function mergeNpcIntersections(
  deterministic: NpcIntersection[],
  fromDramaturg: NpcIntersection[] | undefined | null
): NpcIntersection[] {
  const map = new Map<string, NpcIntersection>();
  for (const i of deterministic) {
    map.set(i.npc.toLowerCase(), i);
  }
  for (const i of fromDramaturg ?? []) {
    if (!i?.npc?.trim()) continue;
    map.set(i.npc.toLowerCase(), i);
  }
  return [...map.values()].slice(0, 4);
}

export function loadNpcAgendasFile(cwd: string = process.cwd()): {
  markdown: string;
  sourcePath: string;
} | null {
  const candidates = [
    process.env.GUARDIAN_NPC_AGENDAS_PATH?.trim(),
    path.resolve(cwd, "project_source_files/npc-agendas.md"),
    path.resolve(cwd, "../rag-memory-mcp/project_source_files/npc-agendas.md")
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return { markdown: fs.readFileSync(p, "utf8"), sourcePath: p };
      }
    } catch {
      /* continue */
    }
  }
  return null;
}

export function loadAndParseNpcAgendas(cwd: string = process.cwd()): NpcAgenda[] {
  const file = loadNpcAgendasFile(cwd);
  if (!file) return [];
  return parseNpcAgendas(file.markdown);
}

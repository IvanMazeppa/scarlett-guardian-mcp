/**
 * WP-5.7 — Deterministic scene roster (who is in the ensemble shot).
 * Spec: guardian-npc-state-management-design-2026-07.md §4–5
 *
 * No LLM. Cap 4 active; overflow = background ambient.
 */

import type { LiveBeat } from "./recency.js";

export type RosterActivation =
  | "addressed"
  | "speaker"
  | "present_cast"
  | "arc_cast"
  | "mentioned";

export type RegistryNpc = {
  id: string;
  displayName: string;
  /** Lowercase match tokens (names + aliases) */
  aliases: string[];
  sourceFile: string;
  /** Substring to match manifest section label */
  sectionNeedle: string;
};

export type RosterMember = {
  id: string;
  displayName: string;
  activation: RosterActivation;
  rank: number;
  sourceFile: string;
  sectionNeedle: string;
};

export type SceneRoster = {
  active: RosterMember[];
  background: string[];
  /** Human-readable one-liner for logs / notes */
  summary: string;
};

const ACTIVATION_RANK: Record<RosterActivation, number> = {
  addressed: 100,
  speaker: 90,
  present_cast: 70,
  arc_cast: 50,
  mentioned: 30
};

const MAX_ACTIVE = 4;

/** Top registry (WP-5.6 tails) + common aliases. */
export const DEFAULT_NPC_REGISTRY: RegistryNpc[] = [
  {
    id: "shevchenko",
    displayName: "Mr. Shevchenko",
    aliases: ["shevchenko", "shev", "his boss", "benjamin's boss", "albion boss"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Mr Shevchenko"
  },
  {
    id: "ryan",
    displayName: "Ryan",
    aliases: ["ryan", "his brother", "benjamin's brother", "older brother"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Ryan (Older Brother)"
  },
  {
    id: "lynn",
    displayName: "Lynn",
    aliases: ["lynn", "his mum", "his mom", "benjamin's mother", "mum loughrey"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Lynn Loughrey"
  },
  {
    id: "chris",
    displayName: "Chris Evans",
    aliases: ["chris", "uncle chris", "chris evans"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Chris Evans"
  },
  {
    id: "debbie",
    displayName: "Debbie Evans",
    aliases: ["debbie", "deb", "aunt deb", "aunt debbie", "chris & deb", "chris and deb"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Debbie Evans"
  },
  {
    id: "dan",
    displayName: "Dan Evans",
    aliases: ["dan", "dan evans", "cousin dan"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Dan Evans"
  },
  {
    id: "maya",
    displayName: "Maya",
    aliases: ["maya"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Maya"
  },
  {
    id: "priya",
    displayName: "Priya",
    aliases: ["priya"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Priya"
  },
  {
    id: "theo",
    displayName: "Theo",
    aliases: ["theo"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Theo"
  },
  {
    id: "karin",
    displayName: "Karin",
    aliases: ["karin", "vaxholm"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Karin"
  },
  {
    id: "dr_berg",
    displayName: "Dr Berg",
    aliases: ["dr berg", "doctor berg", "berg"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Dr Berg"
  },
  {
    id: "rafael",
    displayName: "Rafael",
    aliases: ["rafael", "soho bar"],
    sourceFile: "project_source_files/secondary-characters-bible.md",
    sectionNeedle: "Rafael"
  },
  {
    id: "amg_engineers",
    displayName: "AMG engineers",
    aliases: [
      "amg engineer",
      "amg engineers",
      "telemetry engineer",
      "telemetry technicians",
      "german engineers",
      "the engineers"
    ],
    sourceFile: "project_source_files/npc-agendas.md",
    sectionNeedle: "AMG telemetry engineers"
  }
];

const CROWD_PATTERNS = [
  /paddock staff/i,
  /telemetry technicians/i,
  /albion personnel/i,
  /crowd/i,
  /team of/i
];

function hayIncludesAlias(hay: string, alias: string): boolean {
  const a = alias.toLowerCase().trim();
  if (a.length < 2) return false;
  if (a.includes(" ")) return hay.includes(a);
  const re = new RegExp(
    `(?:^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`,
    "i"
  );
  return re.test(hay);
}

function normalizeHay(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build scene roster from messages + live beat + optional arc-plan cast text.
 */
export function resolveSceneRoster(input: {
  userMessage: string;
  scarlettPreviousMessage?: string;
  liveBeat?: LiveBeat | null;
  /** e.g. dramaturg live beat cast line or arc-plan beat cast */
  arcCastText?: string;
  registry?: RegistryNpc[];
  maxActive?: number;
}): SceneRoster {
  const registry = input.registry ?? DEFAULT_NPC_REGISTRY;
  const maxActive = input.maxActive ?? MAX_ACTIVE;
  const userHay = normalizeHay(input.userMessage);
  const scarlettHay = normalizeHay(input.scarlettPreviousMessage ?? "");
  const presentHay = normalizeHay(...(input.liveBeat?.presentCast ?? []));
  const arcHay = normalizeHay(input.arcCastText ?? "");
  const cueHay = normalizeHay(
    input.liveBeat?.locationLine ?? "",
    ...(input.liveBeat?.liveCues ?? [])
  );
  const combinedMention = normalizeHay(userHay, scarlettHay, presentHay, arcHay, cueHay);

  const hits: RosterMember[] = [];
  for (const npc of registry) {
    let activation: RosterActivation | null = null;
    if (npc.aliases.some((a) => hayIncludesAlias(userHay, a))) {
      activation = "addressed";
    } else if (npc.aliases.some((a) => hayIncludesAlias(scarlettHay, a))) {
      activation = "speaker";
    } else if (npc.aliases.some((a) => hayIncludesAlias(presentHay, a))) {
      activation = "present_cast";
    } else if (npc.aliases.some((a) => hayIncludesAlias(arcHay, a))) {
      activation = "arc_cast";
    } else if (npc.aliases.some((a) => hayIncludesAlias(combinedMention, a))) {
      // location/cue only — weaker
      if (npc.aliases.some((a) => hayIncludesAlias(cueHay, a))) {
        activation = "mentioned";
      }
    }
    if (!activation) continue;
    hits.push({
      id: npc.id,
      displayName: npc.displayName,
      activation,
      rank: ACTIVATION_RANK[activation],
      sourceFile: npc.sourceFile,
      sectionNeedle: npc.sectionNeedle
    });
  }

  hits.sort((a, b) => b.rank - a.rank || a.displayName.localeCompare(b.displayName));

  // Dedupe by id (keep highest rank)
  const seen = new Set<string>();
  const unique: RosterMember[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    unique.push(h);
  }

  const active = unique.slice(0, maxActive);
  const overflow = unique.slice(maxActive).map((m) => m.displayName);

  const background = [...overflow];
  for (const p of CROWD_PATTERNS) {
    if (p.test(combinedMention)) {
      const label = p.source.replace(/\\/g, "");
      if (!background.some((b) => b.toLowerCase().includes(label.slice(0, 8).toLowerCase()))) {
        background.push("paddock / team staff (ambient)");
        break;
      }
    }
  }

  const summary =
    active.length === 0
      ? "No named supporting cast active"
      : `Active: ${active.map((a) => `${a.displayName}(${a.activation})`).join(", ")}` +
        (background.length ? `; background: ${background.slice(0, 3).join(", ")}` : "");

  return { active, background, summary };
}

/**
 * Extract cast names from dramaturg snapshot beats (live beat cast field in plan is not always on snapshot).
 * Fallback: parse "cast:" from plan markdown is done by caller; here accept free text.
 */
export function extractArcCastHints(text: string | undefined | null): string {
  if (!text?.trim()) return "";
  return text;
}

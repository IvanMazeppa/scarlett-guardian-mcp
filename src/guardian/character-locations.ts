/**
 * Parse Scarlett / Benjamin physical rooms from current-state.md
 * for Mission Control's Interactive Floor Plan (Marauder's Map).
 *
 * Prefers the live "Where We Are" snapshot over historical sections.
 * Never throws: missing file, missing character, or ambiguous prose → null.
 */
import fs from "node:fs";
import { splitH2Sections } from "./recency.js";
import { resolveCurrentStatePath } from "./live-beat-snapshot.js";

export type CharacterLocationMap = {
  scarlett: string | null;
  benjamin: string | null;
};

export type CharacterLocationRead = CharacterLocationMap & {
  sourcePath: string | null;
};

type RoomRule = {
  label: string;
  pattern: RegExp;
};

/**
 * Longest / most specific indoor rooms first, then furniture aliases,
 * then distinctive non-apartment scene labels (track, pit wall, café).
 */
const ROOM_RULES: RoomRule[] = [
  { label: "Living Room", pattern: /\bliving\s*room\b/i },
  { label: "Dining Room", pattern: /\bdining\s*room\b|\bdining\s+table\b/i },
  { label: "Kitchen", pattern: /\bkitchens?\b/i },
  { label: "Bathroom", pattern: /\bbathrooms?\b|\ben-?suites?\b/i },
  { label: "Hallway", pattern: /\bhallways?\b|\bcorridors?\b|\blanding\b/i },
  { label: "Study", pattern: /\bstudy\b|\boffices?\b/i },
  { label: "Balcony", pattern: /\bbalcon(?:y|ies)\b|\bterraces?\b/i },
  { label: "Garage", pattern: /\bgarages?\b/i },
  { label: "Basement", pattern: /\bbasements?\b|\bcellars?\b/i },
  { label: "Bedroom", pattern: /\b(?:master\s+|main\s+|guest\s+)?bedrooms?\b/i },
  { label: "Bed", pattern: /\bin\s+bed\b|\bon\s+(?:the\s+)?bed\b|\bthe\s+bed\b|\bbeds?\b/i },
  {
    label: "Living Room",
    pattern: /\bsofas?\b|\bcouch(?:es)?\b|\bhearth\b|\bfireplaces?\b|\bby the fire\b|\broaring fire\b/i
  },
  { label: "Pit Wall", pattern: /\bpit\s*walls?\b/i },
  { label: "Track", pattern: /\bon(?:\s+the)?\s+track\b|\bthe\s+track\b/i },
  { label: "Coffee Shop", pattern: /\bcoffee\s+shops?\b|\bcaf[eé]s?\b/i }
];

const SCARLETT_NAME = /\bscarlett\b/i;
const BENJAMIN_NAME = /\bbenjamin\b/i;
const EITHER_NAME = /\b(?:scarlett|benjamin)\b/i;
const SHARED_ACTOR = /\b(?:they|them|both|together|the two of them)\b/i;

function findSection(sections: Map<string, string>, ...needles: string[]): string {
  for (const [title, body] of sections) {
    const t = title.toLowerCase();
    if (needles.some((n) => t.includes(n.toLowerCase()))) return body;
  }
  return "";
}

function extractBoldField(body: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\*\\*${esc}:?\\*\\*:?\\s*([\\s\\S]*?)(?=\\n\\s*[-*]\\s*\\*\\*|\\n##|$)`,
    "i"
  );
  return body.match(re)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function stripMd(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function matchRoom(text: string): string | null {
  const hay = stripMd(text);
  if (!hay) return null;
  for (const rule of ROOM_RULES) {
    if (rule.pattern.test(hay)) return rule.label;
  }
  return null;
}

function lastNonNull<T>(items: Array<T | null | undefined>): T | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const v = items[i];
    if (v != null && v !== "") return v as T;
  }
  return null;
}

function clausesFor(text: string, self: RegExp, other: RegExp): string[] {
  const hay = stripMd(text);
  if (!hay) return [];
  const clauses: string[] = [];
  const re = new RegExp(self.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) {
    const prefix = hay.slice(Math.max(0, m.index - 100), m.index);
    const before = other.test(prefix) ? "" : prefix;
    const rest = hay.slice(m.index + m[0].length);
    const otherAt = rest.search(other);
    const after = (otherAt === -1 ? rest : rest.slice(0, otherAt)).slice(0, 280);
    clauses.push(`${before} ${after}`.trim());
  }
  return clauses;
}

function roomsFromClauses(text: string, self: RegExp, other: RegExp): string | null {
  const rooms = clausesFor(text, self, other).map(matchRoom);
  return lastNonNull(rooms);
}

const PAIR_NAMES =
  /\bscarlett\s+and\s+benjamin\b|\bbenjamin\s+and\s+scarlett\b/i;

function sharedRoom(text: string): string | null {
  const hay = stripMd(text);
  if (!hay) return null;
  if (!EITHER_NAME.test(hay)) return matchRoom(hay);
  const sentences = hay.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const together = sentences.filter((s) => SHARED_ACTOR.test(s) || PAIR_NAMES.test(s));
  const unnamed = sentences.filter((s) => !EITHER_NAME.test(s));
  return matchRoom(together.join(" ")) || matchRoom(unnamed.join(" "));
}

function lastUpdatedParen(lastUpdated: string): string {
  return lastUpdated.match(/\(([^)]+)\)/)?.[1]?.trim() ?? "";
}

/**
 * Explicit ledger lines, e.g. `- **Scarlett:** Kitchen` or `Scarlett's location: Bed`.
 */
function extractExplicitField(body: string, name: "Scarlett" | "Benjamin"): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `\\*\\*${esc}(?:'s|’s)?(?:\\s+current)?(?:\\s+physical)?\\s+locations?:?\\*\\*:?\\s*([^\\n]+)`,
      "i"
    ),
    new RegExp(
      `\\*\\*${esc}(?:'s|’s)?\\s+locations?:?\\*\\*:?\\s*([^\\n]+)`,
      "i"
    ),
    new RegExp(`^\\s*[-*]\\s*\\*\\*${esc}:?\\*\\*:?\\s*([^\\n]+)`, "im"),
    new RegExp(
      `${esc}(?:'s|’s)?\\s+(?:current\\s+)?(?:physical\\s+)?location:?\\s*([^\\n]+)`,
      "i"
    )
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (!m?.[1]) continue;
    const value = stripMd(m[1]).replace(/[.;]+$/, "").trim();
    if (!value || /^n\/?a$/i.test(value)) continue;
    const room = matchRoom(value);
    if (room) return room;
    if (value.length <= 40 && !EITHER_NAME.test(value) && !/^\d/.test(value)) {
      return value.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

function mergeLayer(
  current: CharacterLocationMap,
  next: CharacterLocationMap
): CharacterLocationMap {
  return {
    scarlett: current.scarlett ?? next.scarlett,
    benjamin: current.benjamin ?? next.benjamin
  };
}

function fromProse(text: string): CharacterLocationMap {
  let scarlett = roomsFromClauses(text, SCARLETT_NAME, BENJAMIN_NAME);
  let benjamin = roomsFromClauses(text, BENJAMIN_NAME, SCARLETT_NAME);
  const hay = stripMd(text);
  const shared = sharedRoom(text);
  const unnamedOnly = !EITHER_NAME.test(hay);
  const pair = PAIR_NAMES.test(hay);

  if (unnamedOnly || pair) {
    scarlett = scarlett ?? shared;
    benjamin = benjamin ?? shared;
  }
  if (pair) {
    const one = scarlett ?? benjamin;
    scarlett = scarlett ?? one;
    benjamin = benjamin ?? one;
  }
  if (scarlett == null && benjamin == null) {
    scarlett = shared;
    benjamin = shared;
  }
  return { scarlett, benjamin };
}

/**
 * Heading-anchored extraction. Historical "Recent Key Events" is ignored
 * so yesterday's kitchen does not override tonight's sofa.
 */
export function parseCharacterLocations(markdown: string): CharacterLocationMap {
  const empty: CharacterLocationMap = { scarlett: null, benjamin: null };
  if (!markdown?.trim()) return empty;

  const md = markdown.replace(/\r\n/g, "\n").replace(/^### Live Current State[^\n]*\n+/i, "");
  const lastUpdated = md.match(/\*\*Last Updated:\*\*\s*([^\n]+)/i)?.[1]?.trim() ?? "";
  const sections = splitH2Sections(md);
  const whereBody = findSection(sections, "Where We Are", "High-Level Snapshot");
  const notesBody = findSection(sections, "Notes for Next Response");

  const locationLine =
    extractBoldField(whereBody, "Location / Setting") ||
    extractBoldField(whereBody, "Location") ||
    "";
  const immediate = extractBoldField(whereBody, "Immediate situation");

  const explicit: CharacterLocationMap = {
    scarlett: extractExplicitField(whereBody, "Scarlett"),
    benjamin: extractExplicitField(whereBody, "Benjamin")
  };

  let result = empty;
  result = mergeLayer(result, explicit);
  result = mergeLayer(result, fromProse(immediate));
  result = mergeLayer(result, fromProse(locationLine));

  const sharedImmediate = sharedRoom(immediate);
  const sharedLocation = sharedRoom(locationLine);
  const sharedUpdated = matchRoom(lastUpdatedParen(lastUpdated)) || matchRoom(lastUpdated);
  const sharedNotes = matchRoom(notesBody);

  result = mergeLayer(result, {
    scarlett: sharedImmediate,
    benjamin: sharedImmediate
  });
  result = mergeLayer(result, {
    scarlett: sharedLocation,
    benjamin: sharedLocation
  });
  result = mergeLayer(result, {
    scarlett: sharedUpdated,
    benjamin: sharedUpdated
  });
  result = mergeLayer(result, {
    scarlett: sharedNotes,
    benjamin: sharedNotes
  });

  return result;
}

export function readCharacterLocations(cwd = process.cwd()): CharacterLocationRead {
  const sourcePath = resolveCurrentStatePath(cwd);
  if (!sourcePath) {
    return { scarlett: null, benjamin: null, sourcePath: null };
  }
  try {
    const parsed = parseCharacterLocations(fs.readFileSync(sourcePath, "utf8"));
    return { ...parsed, sourcePath };
  } catch {
    return { scarlett: null, benjamin: null, sourcePath };
  }
}

export function characterLocationsResponse(cwd = process.cwd()): CharacterLocationMap {
  const { scarlett, benjamin } = readCharacterLocations(cwd);
  return { scarlett, benjamin };
}

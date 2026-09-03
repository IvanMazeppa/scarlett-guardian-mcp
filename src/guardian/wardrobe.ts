/**
 * Live garment continuity for Scarlett.
 * Disk catalog lookup — not RAG. See rag-memory-mcp/docs/visual-lore/wardrobe-system-design.md
 */

import fs from "node:fs";
import path from "node:path";
import type { LiveBeat } from "./recency.js";

export type WardrobeTurnInput = {
  user_message: string;
  scarlett_previous_message?: string;
  recent_context?: string;
};

export type WardrobeRegister =
  | "armour"
  | "travel-soft"
  | "domestic"
  | "sleep"
  | "evening"
  | "kink-private"
  | "track";

export type KitId = "panther" | "suite-drawer" | "london";

/** Dressed dimension — orthogonal to register/kit. */
export type BodyState = "dressed" | "partial" | "undressed";

export type NamedLook = {
  id: string;
  name: string;
  register: WardrobeRegister;
  available: KitId[];
  summary: string;
  shoes: string;
  giftsOnLook: string[];
};

export type LiveOutfitCard = {
  wearing: string[];
  hair: string[];
  makeup: string[];
  nails: string[];
  register: WardrobeRegister | undefined;
  kit: KitId | undefined;
  kitNotes: string;
  /** dressed | partial | undressed — defaults to dressed when absent. */
  bodyState: BodyState;
  /** Free-text body-state line (skin, towel, shirt-off, etc.). */
  bodyStateDetail: string;
  hardware: string[];
  nextLegalChange: string;
  raw: string;
};

export type WardrobeResolution = {
  live: LiveOutfitCard | undefined;
  changeBeat: boolean;
  userLockedLook: boolean;
  targetRegister: WardrobeRegister | undefined;
  kit: KitId | undefined;
  options: NamedLook[];
  excludes: string[];
  briefMarkdown: string;
  writebackCandidate: LiveOutfitCard | undefined;
};

const REGISTERS: WardrobeRegister[] = [
  "armour",
  "travel-soft",
  "domestic",
  "sleep",
  "evening",
  "kink-private",
  "track"
];

const KITS: KitId[] = ["panther", "suite-drawer", "london"];

/** v1 curated looks — register ∩ kit. Not a random closet. */
export const CURATED_LOOKS: NamedLook[] = [
  {
    id: "armour-blazer-off",
    name: "Armour, blazer off",
    register: "travel-soft",
    available: ["panther"],
    summary:
      "Keep the high-waisted black trousers and matte silk camisole; drop only the blazer in the car or cabin.",
    shoes: "professional heels from the Panther kit unless she swaps",
    giftsOnLook: ["anklet", "diamond", "bracelet"]
  },
  {
    id: "travel-cashmere-jeans",
    name: "Troubled Evening Soft / travel-soft",
    register: "travel-soft",
    available: ["panther", "london"],
    summary:
      "Oversized charcoal/grey cashmere (one shoulder slipping) + tight black jeans; leather jacket optional. Bob let loose; makeup softens; anklet and toe ring visible again.",
    shoes: "white trainers or black ankle boots",
    giftsOnLook: ["anklet", "diamond", "bracelet"]
  },
  {
    id: "driving-soft",
    name: "Driving Soft",
    register: "travel-soft",
    available: ["panther", "london"],
    summary:
      "Tight black jeans + his oversized shirt or a loose black tee slipping off-shoulder.",
    shoes: "white trainers",
    giftsOnLook: ["anklet", "diamond", "bracelet"]
  },
  {
    id: "ring-morning-practical",
    name: "'Ring Morning Practical",
    register: "armour",
    available: ["panther"],
    summary: "Fitted black trousers, crisp white shirt, leather jacket.",
    shoes: "professional heels or driving flats from the Panther kit",
    giftsOnLook: ["anklet", "diamond", "bracelet"]
  },
  {
    id: "emerald-evening",
    name: "Deep Emerald Dress",
    register: "evening",
    available: ["panther", "london"],
    summary:
      "Deep emerald above-knee dress + sheer black stockings + crushed-velvet peep-toe pumps (his gift). Only if she chooses evening heat — not a default hop look.",
    shoes: "black crushed-velvet peep-toe pumps",
    giftsOnLook: ["anklet", "diamond", "bracelet", "velvet-peeps"]
  },
  {
    id: "midnight-slip",
    name: "Midnight-Black Silk Slip",
    register: "evening",
    available: ["london", "panther"],
    summary: "Midnight-black silk slip, low/open back — dinner / dangerous elegance.",
    shoes: "stilettos from the trip bag if packed; otherwise do not invent London-only heels",
    giftsOnLook: ["anklet", "diamond", "bracelet"]
  },
  {
    id: "seine-red-latex",
    name: "Custom Red Latex Minidress",
    register: "kink-private",
    available: ["suite-drawer"],
    summary:
      "Custom red latex minidress (Seine). Requires fetching the special suitcase. Not a Gulfstream default.",
    shoes: "strappy black ~5\" stilettos",
    giftsOnLook: ["anklet", "diamond"]
  },
  {
    id: "black-catsuit",
    name: "Black Full Latex Catsuit",
    register: "kink-private",
    available: ["suite-drawer"],
    summary: "Villa Pétrusse zip catsuit. Suite-drawer only. Baby oil. Not travel armour.",
    shoes: "strappy black ~5\" stilettos",
    giftsOnLook: ["anklet", "diamond"]
  },
  {
    id: "domestic-grey-yoga",
    name: "Relaxed Domesticity",
    register: "domestic",
    available: ["london", "panther"],
    summary: "Oversized soft grey sweatshirt (often off one shoulder), black yoga pants.",
    shoes: "white sneakers or barefoot",
    giftsOnLook: ["anklet", "diamond", "bracelet"]
  },
  {
    id: "sleep-robe",
    name: "Hotel / silk robe",
    register: "sleep",
    available: ["panther", "london"],
    summary: "Soft hotel robe or black silk dressing gown; or his Oxford as a nightie.",
    shoes: "barefoot",
    giftsOnLook: ["anklet", "diamond"]
  },
  {
    id: "nomex",
    name: "Nomex race suit",
    register: "track",
    available: ["panther"],
    summary: "Black-and-silver AMG Nomex. Track / paddock only.",
    shoes: "race boots from kit — not peep-toes",
    giftsOnLook: ["anklet", "diamond"]
  }
];

const CHANGE_BEAT =
  /\b(get(?:ting)?\s+(?:dressed|changed|comfortable)|chang(?:e|ing)\s+(?:clothes|into|out)|undress|put(?:ting)?\s+on|take(?:s|n|ing)?\s+off|blazer\s+off|armour\s+on|put\s+the\s+armour|dress(?:ing)?\s+(?:herself|for)|into\s+(?:jeans|cashmere|a\s+dress)|shower.{0,40}(?:dress|clothes|out))\b/i;

const VENUE_CLASS_CHANGE =
  /\b(board(?:ing)?\s+(?:the\s+)?(?:gulfstream|g650|jet)|wheels-?up|leaving\s+(?:hq|the\s+(?:boardroom|office|building))|out\s+of\s+affalterbach|onto\s+the\s+(?:jet|plane)|stepping\s+(?:onto|into)\s+(?:the\s+)?(?:jet|gulfstream|cabin))\b/i;

const USER_LOCKED_OUTFIT =
  /\b(wear(?:ing|s)?|put(?:s|ting)?\s+on|change(?:s|d)?\s+into|dressed\s+in)\b.{0,80}\b(cashmere|jeans|blazer|camisole|trousers|pencil\s+skirt|emerald|latex|catsuit|nomex|robe|yoga|trainers|peep-?toes?)\b/i;

/** Full undress — overrides LIVE dressed state for this turn. */
const UNDRESS_BEAT =
  /\b(undress(?:ed|ing)?|naked|nude|strip(?:ped|ping)?(?:\s+(?:off|down|bare))?|take(?:s|n|ing)?\s+off\s+(?:all\s+)?(?:her\s+|his\s+|the\s+)?clothes|completely\s+(?:naked|nude|bare)|nothing\s+on|skin[- ]to[- ]skin|bare\s+(?:skin|body|against)|fully\s+(?:naked|nude))\b/i;

/** Partial undress — shirt off, robe open, etc. */
const PARTIAL_UNDRESS_BEAT =
  /\b(shirt\s+off|bra\s+off|topless|half[- ]dressed|unbuttoned|robe\s+(?:open|slipping|falling)|camisole\s+off|trousers?\s+(?:around|pooled|off)|jeans\s+(?:around|pooled|off)|towel\s+only|wearing\s+only\s+a\s+towel)\b/i;

/** Redress — restores dressed when play re-clothes her. */
const REDRESS_BEAT =
  /\b(get(?:ting)?\s+dressed|put(?:ting)?\s+(?:her\s+|the\s+)?(?:clothes|outfit|armour)\s+on|dress(?:ed|ing)\s+(?:herself|again)|fully\s+dressed|back\s+(?:into|in)\s+(?:clothes|the\s+armour|trousers))\b/i;

function splitH2(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = markdown.replace(/\r\n/g, "\n");
  const parts = text.split(/^##\s+/m);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nl = block.indexOf("\n");
    const title = (nl === -1 ? block : block.slice(0, nl)).trim();
    const body = nl === -1 ? "" : block.slice(nl + 1);
    if (title) map.set(title, body);
  }
  return map;
}

function bullets(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("**Authority"));
}

function findSection(sections: Map<string, string>, ...needles: string[]): string {
  for (const [title, body] of sections) {
    const t = title.toLowerCase();
    if (needles.some((n) => t.includes(n.toLowerCase()))) return body;
  }
  return "";
}

export function parseLiveOutfitMarkdown(markdown: string): LiveOutfitCard {
  const sections = splitH2(markdown);
  const wearingBody = findSection(sections, "Wearing");
  const hairBody = findSection(sections, "Hair");
  const registerBody = findSection(sections, "Register");
  const bodyStateBody = findSection(sections, "Body state", "Body State");
  const hardwareBody = findSection(sections, "Body hardware", "hardware");
  const nextBody = findSection(sections, "Next legal");

  const hairLines = bullets(hairBody);
  const hair: string[] = [];
  const makeup: string[] = [];
  const nails: string[] = [];
  for (const line of hairLines) {
    if (/nail/i.test(line)) nails.push(line);
    else if (/liner|mouth|makeup|gloss|mascara|lip|bare-faced/i.test(line)) makeup.push(line);
    else hair.push(line);
  }

  let register: WardrobeRegister | undefined;
  let kit: KitId | undefined;
  const kitNotes = bullets(registerBody).join(" ");
  const regMatch = registerBody.match(/\*\*Register:\*\*\s*`([^`]+)`/i);
  const kitMatch = registerBody.match(/\*\*Kit:\*\*\s*`([^`]+)`/i);
  if (regMatch && REGISTERS.includes(regMatch[1] as WardrobeRegister)) {
    register = regMatch[1] as WardrobeRegister;
  }
  if (kitMatch && KITS.includes(kitMatch[1] as KitId)) {
    kit = kitMatch[1] as KitId;
  }

  let bodyState: BodyState = "dressed";
  let bodyStateDetail = "";
  const stateMatch = bodyStateBody.match(/\*\*State:\*\*\s*`([^`]+)`/i);
  const detailMatch = bodyStateBody.match(/\*\*Detail:\*\*\s*(.+)/i);
  if (stateMatch) {
    const s = stateMatch[1].trim().toLowerCase();
    if (s === "dressed" || s === "partial" || s === "undressed") bodyState = s;
  }
  if (detailMatch) {
    bodyStateDetail = detailMatch[1].trim();
  } else {
    const detailBullet = bullets(bodyStateBody).find((l) => !/\*\*State:\*\*/i.test(l));
    if (detailBullet) bodyStateDetail = detailBullet.replace(/^\*\*Detail:\*\*\s*/i, "").trim();
  }
  bodyStateDetail = sanitizeBodyStateDetail(bodyStateDetail, bodyState);

  return {
    wearing: bullets(wearingBody),
    hair,
    makeup,
    nails,
    register,
    kit,
    kitNotes,
    bodyState,
    bodyStateDetail,
    hardware: bullets(hardwareBody),
    nextLegalChange: bullets(nextBody).join(" ") || nextBody.trim(),
    raw: markdown
  };
}

export function resolveWardrobeDir(cwd: string = process.cwd()): string | undefined {
  const candidates = [
    path.resolve(cwd, "project_source_files/wardrobe"),
    path.resolve(cwd, "../rag-memory-mcp/project_source_files/wardrobe"),
    path.resolve(cwd, "../../rag-memory-mcp/project_source_files/wardrobe")
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "live-outfit.md"))) return dir;
    } catch {
      /* continue */
    }
  }
  return undefined;
}

export function loadLiveOutfitMarkdown(cwd: string = process.cwd()): string {
  const dir = resolveWardrobeDir(cwd);
  if (!dir) return "";
  try {
    return fs.readFileSync(path.join(dir, "live-outfit.md"), "utf8");
  } catch {
    return "";
  }
}

export function loadLiveOutfitCard(cwd: string = process.cwd()): LiveOutfitCard | undefined {
  const md = loadLiveOutfitMarkdown(cwd);
  if (!md.trim()) return undefined;
  return parseLiveOutfitMarkdown(md);
}

export function isWardrobeChangeBeat(text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  return CHANGE_BEAT.test(t) || VENUE_CLASS_CHANGE.test(t);
}

export function userSpecifiedOutfit(text: string): boolean {
  return USER_LOCKED_OUTFIT.test(text.replace(/\s+/g, " "));
}

export type BodyStateOverride = {
  bodyState: BodyState;
  detail: string;
  /** True when turn prose overrode the card's dressed state. */
  overridden: boolean;
};

/**
 * Detect undress / partial / redress beats from duplex + user turns.
 * Undress beats override a dressed LIVE card for the current turn.
 */
export function detectBodyStateOverride(
  texts: Array<string | undefined>,
  cardState: BodyState = "dressed",
  cardDetail = ""
): BodyStateOverride {
  const blob = texts.filter(Boolean).join("\n").replace(/\s+/g, " ");
  if (!blob.trim()) {
    return {
      bodyState: cardState,
      detail: sanitizeBodyStateDetail(cardDetail, cardState),
      overridden: false
    };
  }
  // Redress wins when both appear (e.g. shower then get dressed).
  if (REDRESS_BEAT.test(blob) && !UNDRESS_BEAT.test(blob.slice(-200))) {
    return {
      bodyState: "dressed",
      detail: sanitizeBodyStateDetail(cardDetail || "Fully dressed again.", "dressed"),
      overridden: cardState !== "dressed"
    };
  }
  if (UNDRESS_BEAT.test(blob)) {
    return {
      bodyState: "undressed",
      detail: sanitizeBodyStateDetail(
        extractBodyStateDetail(blob, "undressed") || "Undressed — no garments on.",
        "undressed"
      ),
      overridden: cardState !== "undressed"
    };
  }
  if (PARTIAL_UNDRESS_BEAT.test(blob)) {
    return {
      bodyState: "partial",
      detail: sanitizeBodyStateDetail(
        extractBodyStateDetail(blob, "partial") || "Partially undressed.",
        "partial"
      ),
      overridden: cardState !== "partial"
    };
  }
  return {
    bodyState: cardState,
    detail: sanitizeBodyStateDetail(cardDetail, cardState),
    overridden: false
  };
}

function extractBodyStateDetail(blob: string, kind: BodyState): string {
  const sentences = blob.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) =>
    kind === "undressed"
      ? UNDRESS_BEAT.test(s)
      : kind === "partial"
        ? PARTIAL_UNDRESS_BEAT.test(s)
        : REDRESS_BEAT.test(s)
  );
  if (!hit) return "";
  return hit.trim().slice(0, 160);
}

/**
 * Keep body-state free-text as a short operator line.
 * Never paste raw first-person play dumps into the LIVE card / brief.
 */
export function sanitizeBodyStateDetail(detail: string, kind: BodyState): string {
  const t = detail.replace(/\s+/g, " ").trim();
  const fallback =
    kind === "undressed"
      ? "Undressed — no garments on."
      : kind === "partial"
        ? "Partially undressed."
        : "Fully clothed.";
  if (!t) return fallback;

  const looksLikePlayDump =
    t.length > 90 ||
    /^(i |you |we )\b/i.test(t) ||
    /\b(fish around|sohmewhere|britches|mooning|find sohmewhere)\b/i.test(t) ||
    ((t.match(/[,;]/g) || []).length >= 2 && t.length > 60);

  if (looksLikePlayDump) {
    return kind === "undressed"
      ? "Morning bed — undressed."
      : kind === "partial"
        ? "Partially undressed."
        : "Fully dressed.";
  }
  return t.slice(0, 120);
}

export function inferTargetRegister(
  text: string,
  live: LiveOutfitCard | undefined,
  liveBeat?: LiveBeat
): WardrobeRegister | undefined {
  const blob = `${text} ${liveBeat?.locationLine ?? ""}`.toLowerCase();
  if (/\b(latex|catsuit|harness\s+bodysuit)\b/.test(blob)) return "kink-private";
  if (/\b(nomex|race\s+suit|paddock|track\s+day)\b/.test(blob)) return "track";
  if (/\b(robe|nightie|sleepwear|go\s+to\s+(?:bed|sleep))\b/.test(blob)) return "sleep";
  if (/\b(yoga|lounge|sweatshirt|recovery\s+set)\b/.test(blob)) return "domestic";
  if (/\b(dinner|evening\s+dress|emerald|club|silk\s+slip)\b/.test(blob)) return "evening";
  if (/\b(gulfstream|g650|jet\b|flight\b|cabin|get\s+comfortable|cashmere|jeans|trainers)\b/.test(blob)) {
    return "travel-soft";
  }
  if (/\b(boardroom|affalterbach|armour|blazer|presentation)\b/.test(blob)) return "armour";
  if (live?.register === "armour" && VENUE_CLASS_CHANGE.test(blob)) return "travel-soft";
  return live?.register;
}

export function looksFor(register: WardrobeRegister | undefined, kit: KitId | undefined): NamedLook[] {
  if (!register || !kit) return [];
  return CURATED_LOOKS.filter((look) => look.register === register && look.available.includes(kit)).slice(
    0,
    3
  );
}

export function defaultExcludes(live: LiveOutfitCard | undefined, kit: KitId | undefined): string[] {
  const out: string[] = [];
  const wearing = (live?.wearing ?? []).join(" ").toLowerCase();
  if (/trousers|camisole|blazer/.test(wearing)) {
    out.push("Do not rewrite LIVE into a pencil skirt. Thread 15 armour is trousers + camisole + blazer.");
  }
  if (kit && kit !== "suite-drawer") {
    out.push("Do not put her in Seine latex or the black catsuit unless she fetches the suite-drawer suitcase.");
  }
  if (kit === "panther") {
    out.push("London-only closet pieces are not in the Panther kit.");
  }
  out.push("No ponytails. She dresses herself; do not pick off-page.");
  return out;
}

function liveLines(live: LiveOutfitCard): string[] {
  const lines: string[] = [];
  // Authoritative body-state line — one home for dressed/undressed continuity.
  if (live.bodyState === "undressed") {
    lines.push(`Body state: undressed — ${live.bodyStateDetail || "No garments on."}`);
  } else if (live.bodyState === "partial") {
    lines.push(`Body state: partial — ${live.bodyStateDetail || "Partially undressed."}`);
  } else {
    const outfit = live.wearing.length ? live.wearing.join("; ") : "LIVE outfit on card";
    lines.push(`Body state: dressed — ${live.bodyStateDetail || outfit}`);
  }
  if (live.bodyState !== "undressed" && live.wearing.length) {
    lines.push(`LIVE wearing: ${live.wearing.join("; ")}`);
  } else if (live.bodyState === "undressed" && live.wearing.length) {
    lines.push(`LIVE outfit card (not currently worn): ${live.wearing.join("; ")}`);
  }
  const hairMakeup = [...live.hair, ...live.makeup, ...live.nails];
  if (hairMakeup.length) lines.push(`Hair/makeup: ${hairMakeup.join("; ")}`);
  if (live.register || live.kit) {
    lines.push(`Register/kit: ${live.register ?? "unknown"} / ${live.kit ?? "unknown"}`);
  }
  const hidden = live.hardware.filter((h) => /hidden/i.test(h));
  const visibleNote = hidden.length
    ? hidden.join("; ")
    : live.hardware.slice(0, 3).join("; ");
  if (visibleNote) lines.push(`Hardware: ${visibleNote}`);
  return lines;
}

export function formatWardrobeBrief(resolution: Omit<WardrobeResolution, "briefMarkdown" | "writebackCandidate">): string {
  const parts: string[] = ["**Wardrobe (she dresses herself):**"];
  if (!resolution.live) {
    parts.push("- LIVE outfit card missing from disk. Do not invent a generic black dress.");
    return parts.join("\n");
  }
  for (const line of liveLines(resolution.live)) {
    parts.push(`- ${line}`);
  }
  if (resolution.live.nextLegalChange) {
    parts.push(`- Next legal change note: ${resolution.live.nextLegalChange}`);
  }
  if (!resolution.changeBeat) {
    parts.push("- No change-beat this turn. Do not rewrite LIVE. Do not invent a new outfit.");
    return parts.join("\n");
  }
  parts.push(`- KIT: ${resolution.kit ?? "unknown"}`);
  if (resolution.userLockedLook) {
    parts.push("- Benjamin named garments this turn — honour that if it exists in KIT; still do not invent pieces.");
  } else if (resolution.options.length > 0) {
    parts.push("- IF SHE CHANGES, she chooses among:");
    resolution.options.forEach((opt, i) => {
      parts.push(`  ${i + 1}. ${opt.name}: ${opt.summary} Shoes: ${opt.shoes}.`);
    });
  } else {
    parts.push("- Change-beat detected but no legal looks for this register ∩ kit. Stay in LIVE or describe fetching from kit.");
  }
  for (const ex of resolution.excludes) {
    parts.push(`- ${ex}`);
  }
  parts.push("- Always-on hardware stays unless the scene removes it. Do not invent pieces.");
  return parts.join("\n");
}

const LOOK_TOKENS: Array<{ id: string; pattern: RegExp }> = [
  { id: "travel-cashmere-jeans", pattern: /\bcashmere\b.*\bjeans\b|\bjeans\b.*\bcashmere\b/i },
  { id: "armour-blazer-off", pattern: /\bblazer\s+off\b|\bdropped\s+the\s+blazer\b/i },
  { id: "emerald-evening", pattern: /\bemerald\b.*\b(?:dress|stockings|peep)/i },
  { id: "seine-red-latex", pattern: /\bred\s+latex\b/i },
  { id: "black-catsuit", pattern: /\bcatsuit\b/i },
  { id: "nomex", pattern: /\bnomex\b|\brace\s+suit\b/i },
  { id: "sleep-robe", pattern: /\brobe\b|\bdressing\s+gown\b/i }
];

export function detectWornLookId(prose: string): string | undefined {
  for (const row of LOOK_TOKENS) {
    if (row.pattern.test(prose)) return row.id;
  }
  return undefined;
}

export function cardFromLook(look: NamedLook, previous: LiveOutfitCard | undefined): LiveOutfitCard {
  return {
    wearing: [look.summary],
    hair: previous?.hair ?? [],
    makeup: previous?.makeup ?? [],
    nails: previous?.nails ?? [],
    register: look.register,
    kit: previous?.kit,
    kitNotes: previous?.kitNotes ?? "",
    bodyState: "dressed",
    bodyStateDetail: look.summary,
    hardware: previous?.hardware ?? [],
    nextLegalChange: "",
    raw: ""
  };
}

export function renderLiveOutfitMarkdown(card: LiveOutfitCard): string {
  const wearing = card.wearing.map((l) => `- ${l}`).join("\n") || "- (unspecified)";
  const hairMakeup = [...card.hair, ...card.makeup, ...card.nails]
    .map((l) => `- ${l}`)
    .join("\n") || "- (unchanged)";
  const hardware = card.hardware.map((l) => `- ${l}`).join("\n") || "- (see prior card)";
  const kit = card.kit ? `\`${card.kit}\`` : "unknown";
  const register = card.register ? `\`${card.register}\`` : "unknown";
  const bodyState = card.bodyState ?? "dressed";
  const bodyDetail = card.bodyStateDetail || (bodyState === "dressed" ? "Fully clothed." : "");
  return `# Live Outfit — Scarlett

**Authority:** What she is wearing *right now*. Do not invent over this.
**Updated:** auto write-back (Guardian wardrobe module)
**Design:** \`docs/visual-lore/wardrobe-system-design.md\`

## Wearing

${wearing}

## Hair / Makeup

${hairMakeup}

## Register / Kit

- **Register:** ${register}
- **Kit:** ${kit}${card.kitNotes ? ` ${card.kitNotes}` : ""}

## Body state

- **State:** \`${bodyState}\`
- **Detail:** ${bodyDetail}

## Body hardware (always-on)

${hardware}
`;
}

export function persistLiveOutfitCard(card: LiveOutfitCard, cwd: string = process.cwd()): boolean {
  const dir = resolveWardrobeDir(cwd);
  if (!dir) return false;
  try {
    fs.writeFileSync(path.join(dir, "live-outfit.md"), renderLiveOutfitMarkdown(card), "utf8");
    return true;
  } catch {
    return false;
  }
}

export type ResolveWardrobeOptions = {
  cwd?: string;
  persistWriteback?: boolean;
  liveMarkdown?: string;
};

export function resolveWardrobe(
  input: WardrobeTurnInput,
  liveBeat?: LiveBeat,
  options: ResolveWardrobeOptions = {}
): WardrobeResolution {
  const cwd = options.cwd ?? process.cwd();
  const liveMd = options.liveMarkdown ?? loadLiveOutfitMarkdown(cwd);
  const parsed = liveMd.trim() ? parseLiveOutfitMarkdown(liveMd) : undefined;

  const userMessage = input.user_message ?? "";
  const changeBeat = isWardrobeChangeBeat(userMessage);
  const locked = userSpecifiedOutfit(userMessage);
  const kit = parsed?.kit;
  const targetRegister = changeBeat ? inferTargetRegister(userMessage, parsed, liveBeat) : parsed?.register;
  
  let optionsLooks = changeBeat ? looksFor(targetRegister, kit) : [];
  // State-aware idempotency: suppress options if already in target register and no explicitly locked look
  if (changeBeat && !locked && targetRegister && parsed?.register === targetRegister) {
    optionsLooks = [];
  }
  const excludes = defaultExcludes(parsed, kit);

  // Undress beats from duplex + user can override dressed card for this turn.
  const bodyOverride = detectBodyStateOverride(
    [input.scarlett_previous_message, input.user_message],
    parsed?.bodyState ?? "dressed",
    parsed?.bodyStateDetail ?? ""
  );
  const live: LiveOutfitCard | undefined = parsed
    ? {
        ...parsed,
        bodyState: bodyOverride.bodyState,
        bodyStateDetail: bodyOverride.detail || parsed.bodyStateDetail
      }
    : undefined;

  const base = {
    live,
    changeBeat,
    userLockedLook: locked,
    targetRegister,
    kit,
    options: optionsLooks,
    excludes
  };

  let writebackCandidate: LiveOutfitCard | undefined;
  const prev = input.scarlett_previous_message ?? "";
  if (prev && isWardrobeChangeBeat(prev)) {
    const wornId = detectWornLookId(prev);
    const look = CURATED_LOOKS.find((l) => l.id === wornId);
    if (look && live) {
      writebackCandidate = cardFromLook(look, live);
    }
  }
  // Persist body-state override even when no named look was detected.
  if (bodyOverride.overridden && live) {
    writebackCandidate = {
      ...(writebackCandidate ?? live),
      bodyState: bodyOverride.bodyState,
      bodyStateDetail: bodyOverride.detail || live.bodyStateDetail,
      // Keep garment list for redress; when undressed, garments stay as "last worn".
      wearing: writebackCandidate?.wearing ?? live.wearing
    };
  }
  if (writebackCandidate && options.persistWriteback) {
    persistLiveOutfitCard(writebackCandidate, cwd);
  }

  return {
    ...base,
    briefMarkdown: formatWardrobeBrief(base),
    writebackCandidate
  };
}

/**
 * WP-4.6 / Pillar B — Serendipity 2.0 ("The Arc Weaver").
 * Spec: guardian-writeback-recency-serendipity-roadmap-2026-07.md §B
 *
 * Intrusiveness tiers + scene modes + deferral + cooldowns + arc stages.
 * Selection is deterministic given a roll; auditor weave is WP-4.7.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { LiveBeat } from "./recency.js";
import { computeLiveSceneFingerprint } from "./scene-fingerprint.js";

export type Intrusiveness = "ambient" | "peripheral" | "engaging" | "disruptive";
export type SceneMode =
  | "intimate"
  | "vulnerable"
  | "professional"
  | "transit"
  | "social"
  | "downtime";

export type SerendipityCategory =
  | "weather"
  | "environment"
  | "body"
  | "tech"
  | "phone_family"
  | "phone_friends"
  | "work_albion"
  | "network_shadow"
  | "recovery"
  | "ryan_arc";

export interface SerendipityEvent {
  id: string;
  category: SerendipityCategory;
  tier: Intrusiveness;
  text: string;
  grokNote?: string;
  arcThread?: string;
  arcStage?: number;
  cooldownTurns: number;
  weight: number;
}

export interface DeferredEvent {
  eventId: string;
  queuedAtTurn: number;
  expiresAtTurn: number;
  /** INTEL-2: scene fingerprint when deferred (cross-scene blocked). */
  sceneFingerprint?: string;
  /** INTEL-2: thread key when deferred (cross-thread blocked). */
  threadKey?: string;
}

export interface SerendipityState {
  lastFiredTurn: number;
  turnCounter: number;
  eventCooldowns: Record<string, number>;
  categoryLastFired: Record<string, number>;
  arcProgress: Record<string, number>;
  deferred: DeferredEvent[];
  /** INTEL-2: last thread that wrote this sidecar (optional). */
  threadKey?: string;
  /** INTEL-2: last scene fingerprint (optional). */
  sceneFingerprint?: string;
}

export type SelectSerendipityResult = {
  event?: SerendipityEvent;
  deferredInstead?: SerendipityEvent;
  surfacedFromDeferral?: boolean;
  /** WP-5.4: event came from dramaturg/NPC agenda intersection (outranked catalog). */
  agendaDriven?: boolean;
  mode: SceneMode;
  maxTier: Intrusiveness;
  fireChance: number;
  rolled: number;
  state: SerendipityState;
};

/** Minimal intersection shape (avoids circular import with dramaturg). */
export type AgendaIntersectionInput = {
  npc: string;
  agenda: string;
  suggestedTier: Intrusiveness;
};

const TIER_RANK: Record<Intrusiveness, number> = {
  ambient: 0,
  peripheral: 1,
  engaging: 2,
  disruptive: 3
};

const CATEGORY_COOLDOWN_TURNS = 3;
const DEFER_EXPIRY_TURNS = 10;
const BASE_FIRE_CHANCE = 0.3;
const DROUGHT_STEP = 0.05;
const DROUGHT_EVERY = 5;
const MAX_FIRE_CHANCE = 0.6;

export function emptySerendipityState(): SerendipityState {
  return {
    lastFiredTurn: 0,
    turnCounter: 0,
    eventCooldowns: {},
    categoryLastFired: {},
    arcProgress: {},
    deferred: []
  };
}

/** Migrated v1 catalog with tiers + Ryan arc stages. */
export const SERENDIPITY_CATALOG: SerendipityEvent[] = [
  {
    id: "weather_rain",
    category: "weather",
    tier: "ambient",
    text: "It suddenly starts raining heavily outside, or the wind picks up noticeably.",
    cooldownTurns: 8,
    weight: 1.2
  },
  {
    id: "env_smell_sound",
    category: "environment",
    tier: "ambient",
    text: "A distinct smell (rain on asphalt, coffee from downstairs) or sound (distant siren, church bell) briefly registers.",
    cooldownTurns: 6,
    weight: 1.1
  },
  {
    id: "body_need",
    category: "body",
    tier: "peripheral",
    text: "One of them suddenly realizes they are thirsty, hungry, or a limb has fallen asleep.",
    cooldownTurns: 10,
    weight: 0.9
  },
  {
    id: "tech_hiccup",
    category: "tech",
    tier: "peripheral",
    text: "A minor inconvenience (key card needs a second swipe, phone battery warning, room service knock in the corridor).",
    cooldownTurns: 8,
    weight: 1.0
  },
  {
    id: "phone_chris_deb_benjamin",
    category: "phone_family",
    tier: "peripheral",
    text: "Benjamin's phone: a text from Chris & Deb about wedding logistics.",
    grokNote:
      "Benjamin's family does NOT know Scarlett is trans. Maintain strict stealth/straight-passing privilege.",
    cooldownTurns: 12,
    weight: 1.0
  },
  {
    id: "phone_lynn",
    category: "phone_family",
    tier: "peripheral",
    text: "Benjamin's phone: a brief check-in from his Mum (Lynn).",
    grokNote: "Lynn does not know Scarlett is trans.",
    cooldownTurns: 14,
    weight: 0.9
  },
  {
    id: "phone_dan",
    category: "phone_friends",
    tier: "peripheral",
    text: "Benjamin's phone: a minor update from Dan/Daniel.",
    grokNote: "Dan does not know Scarlett is trans.",
    cooldownTurns: 12,
    weight: 0.85
  },
  {
    id: "phone_chris_deb_scarlett",
    category: "phone_friends",
    tier: "peripheral",
    text: "Scarlett's phone: a supportive or logistical check-in from Chris & Deb.",
    cooldownTurns: 12,
    weight: 0.9
  },
  {
    id: "phone_dayn_wife",
    category: "phone_friends",
    tier: "peripheral",
    text: "Scarlett's phone: a message from Dayn's wife.",
    cooldownTurns: 14,
    weight: 0.8
  },
  {
    id: "phone_parents",
    category: "phone_family",
    tier: "engaging",
    text: "Scarlett's phone: a complicated, emotionally heavy text from her Mother or Father that will need addressing.",
    grokNote:
      "Scarlett's parents are highly analytical and lack empathy. Do not make them warm or supportive.",
    cooldownTurns: 16,
    weight: 0.7
  },
  {
    id: "phone_maya_queer",
    category: "phone_friends",
    tier: "engaging",
    text: "Scarlett's phone: Maya (or that group) messages about planning a queer night out.",
    cooldownTurns: 14,
    weight: 0.85
  },
  {
    id: "work_shevchenko",
    category: "work_albion",
    tier: "engaging",
    text: "Albion work: Benjamin receives a secure or unexpected message from Mr. Shevchenko re: Albion AI or the Black Panther aero package.",
    grokNote:
      "Shevchenko is a protective ally, but the AGI military project carries heavy ethical stakes.",
    cooldownTurns: 10,
    weight: 1.1
  },
  {
    id: "network_shadow",
    category: "network_shadow",
    tier: "engaging",
    text: "A whisper from Scarlett's old intelligence network, or a strange echo from the Soho/Ishtar/Rafael incident, gently breaches their peace.",
    grokNote:
      "Scarlett handles this with quiet, hyper-capable discretion to protect Benjamin.",
    arcThread: "network",
    arcStage: 1,
    cooldownTurns: 18,
    weight: 0.75
  },
  {
    id: "recovery_berg",
    category: "recovery",
    tier: "peripheral",
    text: "A discreet administrative or supportive message arrives from Dr. Berg or the recovery clinic regarding Benjamin's ongoing progress.",
    cooldownTurns: 16,
    weight: 0.7
  },
  {
    id: "ryan_arc_1",
    category: "ryan_arc",
    tier: "disruptive",
    text: "The Brother's Shadow (stage 1): a chilling rumor or third-hand update about Ryan and CJ after Cheltenham — distant, not yet at their door.",
    grokNote:
      "Ryan blames Scarlett for the stash/brawl fallout; he previously threatened London. Scarlett is fiercely protective and highly capable.",
    arcThread: "ryan",
    arcStage: 1,
    cooldownTurns: 20,
    weight: 1.0
  },
  {
    id: "ryan_arc_2",
    category: "ryan_arc",
    tier: "disruptive",
    text: "The Brother's Shadow (stage 2): a more concrete sighting or credible threat path involving Ryan — closer to their world, still not face-to-face.",
    grokNote:
      "Escalate carefully; Scarlett protective, Benjamin stressed; no cartoon villainy.",
    arcThread: "ryan",
    arcStage: 2,
    cooldownTurns: 22,
    weight: 1.0
  },
  {
    id: "ryan_arc_3",
    category: "ryan_arc",
    tier: "disruptive",
    text: "The Brother's Shadow (stage 3): a direct threat or message that forces a protective response from Scarlett regarding Ryan.",
    grokNote:
      "Highest escalation; still grounded in established lore. Scarlett hyper-capable, not gore-spectacle.",
    arcThread: "ryan",
    arcStage: 3,
    cooldownTurns: 24,
    weight: 1.0
  }
];

const CATALOG_BY_ID = new Map(SERENDIPITY_CATALOG.map((e) => [e.id, e]));

/** Runtime stash for deferred agenda events (not in static catalog). */
const AGENDA_EVENT_BY_ID = new Map<string, SerendipityEvent>();

function rememberAgendaEvent(ev: SerendipityEvent): void {
  if (ev.id.startsWith("agenda_")) AGENDA_EVENT_BY_ID.set(ev.id, ev);
}

function syntheticAgendaFromId(
  eventId: string,
  intersections?: AgendaIntersectionInput[]
): SerendipityEvent | undefined {
  if (AGENDA_EVENT_BY_ID.has(eventId)) return AGENDA_EVENT_BY_ID.get(eventId);
  if (!eventId.startsWith("agenda_") || !intersections?.length) return undefined;
  const slug = eventId.slice("agenda_".length);
  const match = intersections.find((ix) => {
    const s = ix.npc
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    return s === slug;
  });
  return match ? agendaIntersectionToEvent(match) : undefined;
}

export function tierAdmissible(eventTier: Intrusiveness, maxTier: Intrusiveness): boolean {
  return TIER_RANK[eventTier] <= TIER_RANK[maxTier];
}

export function maxTierFor(mode: SceneMode): Intrusiveness {
  switch (mode) {
    case "intimate":
    case "vulnerable":
      return "ambient";
    case "transit":
      return "peripheral";
    case "professional":
    case "social":
      return "engaging";
    case "downtime":
    default:
      return "disruptive";
  }
}

export function classifySceneMode(
  highRiskTriggers: string[],
  userMessage: string,
  liveBeat?: LiveBeat | null
): SceneMode {
  const blob = [
    ...highRiskTriggers,
    userMessage,
    liveBeat?.locationLine ?? "",
    liveBeat?.timeLine ?? "",
    ...(liveBeat?.liveCues ?? [])
  ]
    .join(" ")
    .toLowerCase();

  if (
    highRiskTriggers.some((t) => /intimacy|dominance|erp|bath|skin|sex/i.test(t)) ||
    /\b(kiss|naked|undress|aftercare|moan|orgasm|make love|erp)\b/i.test(blob)
  ) {
    return "intimate";
  }
  if (
    highRiskTriggers.some((t) => /recovery|soreness|caretaking|trauma|fragile/i.test(t)) ||
    /\b(vomit|motion.?sick|wound|clinic|recovery|aftercare|trembling)\b/i.test(blob)
  ) {
    return "vulnerable";
  }
  if (
    highRiskTriggers.some((t) => /amg|nuerburgring|black panther|paddock|track/i.test(t)) ||
    /\b(telemetry|pit wall|radio|shevchenko|affalterbach|dyno|engineer|briefing)\b/i.test(blob)
  ) {
    return "professional";
  }
  if (/\b(drive|driving|motorway|b-road|airport|flight|gulfstream|train|taxi)\b/i.test(blob)) {
    return "transit";
  }
  if (
    highRiskTriggers.some((t) => /public|jealousy|queer|family/i.test(t)) ||
    /\b(party|dinner|restaurant|club|friends|maya|chris|deb)\b/i.test(blob)
  ) {
    return "social";
  }
  return "downtime";
}

export function fireChance(state: SerendipityState): number {
  const turnsSince =
    state.lastFiredTurn <= 0 ? state.turnCounter : Math.max(0, state.turnCounter - state.lastFiredTurn);
  const droughtBonus = Math.floor(turnsSince / DROUGHT_EVERY) * DROUGHT_STEP;
  return Math.min(MAX_FIRE_CHANCE, BASE_FIRE_CHANCE + droughtBonus);
}

function cloneState(state: SerendipityState): SerendipityState {
  return {
    lastFiredTurn: state.lastFiredTurn,
    turnCounter: state.turnCounter,
    eventCooldowns: { ...state.eventCooldowns },
    categoryLastFired: { ...state.categoryLastFired },
    arcProgress: { ...state.arcProgress },
    deferred: state.deferred.map((d) => ({ ...d })),
    threadKey: state.threadKey,
    sceneFingerprint: state.sceneFingerprint
  };
}

function isOnCooldown(state: SerendipityState, event: SerendipityEvent, turn: number): boolean {
  const until = state.eventCooldowns[event.id] ?? 0;
  if (turn < until) return true;
  const catLast = state.categoryLastFired[event.category] ?? 0;
  if (catLast > 0 && turn - catLast < CATEGORY_COOLDOWN_TURNS) return true;
  return false;
}

function eligibleEvents(
  state: SerendipityState,
  mode: SceneMode,
  maxTier: Intrusiveness,
  turn: number,
  forDeferral = false
): SerendipityEvent[] {
  const out: SerendipityEvent[] = [];
  for (const e of SERENDIPITY_CATALOG) {
    if (isOnCooldown(state, e, turn)) continue;
    if (e.arcThread && e.arcStage != null) {
      const progress = state.arcProgress[e.arcThread] ?? 0;
      // Only next stage in order
      if (e.arcStage !== progress + 1) continue;
    }
    if (!forDeferral && !tierAdmissible(e.tier, maxTier)) continue;
    out.push(e);
  }
  return out;
}

function weightOf(event: SerendipityEvent, state: SerendipityState): number {
  let w = event.weight;
  if (event.arcThread) {
    const p = state.arcProgress[event.arcThread] ?? 0;
    if (p > 0) w *= 1.4; // mid-escalation boost
  }
  return w;
}

function weightedPick(
  events: SerendipityEvent[],
  state: SerendipityState,
  roll01: number
): SerendipityEvent | undefined {
  if (!events.length) return undefined;
  const weights = events.map((e) => weightOf(e, state));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return events[0];
  let r = roll01 * total;
  for (let i = 0; i < events.length; i++) {
    r -= weights[i];
    if (r <= 0) return events[i];
  }
  return events[events.length - 1];
}

function markFired(state: SerendipityState, event: SerendipityEvent): void {
  state.lastFiredTurn = state.turnCounter;
  state.eventCooldowns[event.id] = state.turnCounter + event.cooldownTurns;
  state.categoryLastFired[event.category] = state.turnCounter;
  if (event.arcThread && event.arcStage != null) {
    state.arcProgress[event.arcThread] = Math.max(
      state.arcProgress[event.arcThread] ?? 0,
      event.arcStage
    );
  }
  // Drop this event from deferral if present
  state.deferred = state.deferred.filter((d) => d.eventId !== event.id);
}

/**
 * Map an NPC agenda intersection to a synthetic serendipity event (WP-5.4).
 * Stable id per NPC for cooldowns; no arcStage (does not advance Ryan stages).
 */
export function agendaIntersectionToEvent(
  ix: AgendaIntersectionInput
): SerendipityEvent {
  const slug = ix.npc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  const tier = TIERS_SAFE.includes(ix.suggestedTier) ? ix.suggestedTier : "peripheral";
  const category = categoryForAgendaNpc(ix.npc);
  const text =
    ix.agenda.trim().length > 12
      ? ix.agenda.trim()
      : `${ix.npc} exerts background schedule pressure.`;
  return {
    id: `agenda_${slug || "npc"}`,
    category,
    tier,
    text,
    grokNote:
      "Agenda-driven world pressure (NPC agendas / dramaturg). Pressure only — do not invent outcomes or force a plot resolution." +
      (/chris|deb|lynn|family/i.test(ix.npc)
        ? " Stealth: family does NOT know Scarlett is trans."
        : ""),
    cooldownTurns: tier === "disruptive" ? 16 : tier === "engaging" ? 10 : 8,
    weight: 8
  };
}

const TIERS_SAFE: Intrusiveness[] = ["ambient", "peripheral", "engaging", "disruptive"];

function categoryForAgendaNpc(npc: string): SerendipityCategory {
  const n = npc.toLowerCase();
  if (n.includes("ryan")) return "network_shadow";
  if (n.includes("shevchenko") || n.includes("albion")) return "work_albion";
  if (n.includes("chris") || n.includes("deb") || n.includes("lynn")) return "phone_family";
  if (n.includes("engineer") || n.includes("amg") || n.includes("telemetry")) return "tech";
  return "environment";
}

/**
 * INTEL-2: apply thread/scene isolation before selection.
 * Cross-thread → empty deferred (fail conservative). Cross-scene deferred dropped.
 */
export function prepareSerendipityStateForScene(
  stateIn: SerendipityState,
  options?: { threadKey?: string; sceneFingerprint?: string }
): SerendipityState {
  const threadKey = options?.threadKey?.trim() || undefined;
  const sceneFp = options?.sceneFingerprint?.trim() || undefined;
  let state = cloneState(stateIn);

  // Thread boundary: do not carry deferred events into another conversation.
  if (threadKey && state.threadKey && state.threadKey !== threadKey) {
    state = {
      ...emptySerendipityState(),
      threadKey,
      sceneFingerprint: sceneFp,
      // keep arc progress lightly? plan says fail conservative on missing ids —
      // reset deferred only; keep cooldowns empty on thread switch
      turnCounter: state.turnCounter
    };
  } else if (threadKey) {
    state.threadKey = threadKey;
  }

  if (sceneFp) state.sceneFingerprint = sceneFp;

  // Drop deferred that expired or belong to another scene/thread
  state.deferred = (state.deferred ?? []).filter((d) => {
    if (sceneFp && d.sceneFingerprint && d.sceneFingerprint !== sceneFp) return false;
    if (threadKey && d.threadKey && d.threadKey !== threadKey) return false;
    // Deferred without fingerprint from old sidecars: keep only if scene also empty/unknown
    if (sceneFp && !d.sceneFingerprint) return false;
    return true;
  });

  return state;
}

function pushDeferred(
  state: SerendipityState,
  eventId: string,
  turn: number,
  options?: { sceneFingerprint?: string; threadKey?: string }
): void {
  if (state.deferred.some((d) => d.eventId === eventId)) return;
  state.deferred.push({
    eventId,
    queuedAtTurn: turn,
    expiresAtTurn: turn + DEFER_EXPIRY_TURNS,
    sceneFingerprint: options?.sceneFingerprint ?? state.sceneFingerprint,
    threadKey: options?.threadKey ?? state.threadKey
  });
}

/**
 * Core selector. Pass `rng` for tests (returns [0,1)).
 * WP-5.4: `npcIntersections` outrank the random catalog (after deferred queue).
 */
export function selectSerendipity(
  stateIn: SerendipityState,
  mode: SceneMode,
  _triggers: string[],
  rng: () => number = Math.random,
  options?: {
    npcIntersections?: AgendaIntersectionInput[];
    /** INTEL-1: hard cap (e.g. ambient-only under provisional scene confidence). */
    forceMaxTier?: Intrusiveness;
    /** INTEL-2 */
    threadKey?: string;
    sceneFingerprint?: string;
  }
): SelectSerendipityResult {
  const state = prepareSerendipityStateForScene(stateIn, {
    threadKey: options?.threadKey,
    sceneFingerprint: options?.sceneFingerprint
  });
  state.turnCounter += 1;
  const turn = state.turnCounter;
  const baseMax = maxTierFor(mode);
  // INTEL-1: take the stricter of scene-mode max and optional forceMaxTier
  const maxTier =
    options?.forceMaxTier != null &&
    TIER_RANK[options.forceMaxTier] <= TIER_RANK[baseMax]
      ? options.forceMaxTier
      : baseMax;

  // Expire deferred by turn
  state.deferred = state.deferred.filter((d) => d.expiresAtTurn >= turn);

  // 1) Deferred queue first (includes previously deferred agenda events)
  for (const d of [...state.deferred]) {
    const ev = CATALOG_BY_ID.get(d.eventId) ?? syntheticAgendaFromId(d.eventId, options?.npcIntersections);
    if (!ev) continue;
    if (isOnCooldown(state, ev, turn)) continue;
    if (!tierAdmissible(ev.tier, maxTier)) continue;
    if (ev.arcThread && ev.arcStage != null) {
      const progress = state.arcProgress[ev.arcThread] ?? 0;
      if (ev.arcStage !== progress + 1) continue;
    }
    markFired(state, ev);
    return {
      event: ev,
      surfacedFromDeferral: true,
      agendaDriven: ev.id.startsWith("agenda_"),
      mode,
      maxTier,
      fireChance: 1,
      rolled: 0,
      state
    };
  }

  // 2) WP-5.4 agenda intersections — outrank catalog (no drought roll)
  // INTEL-1: under ambient-only provisional gate, skip NPC agenda pressure entirely.
  const intersections =
    options?.forceMaxTier === "ambient" ? [] : (options?.npcIntersections ?? []);
  for (const ix of intersections) {
    if (!ix?.npc?.trim() || !ix.agenda?.trim()) continue;
    const ev = agendaIntersectionToEvent(ix);
    if (isOnCooldown(state, ev, turn)) continue;
    if (!tierAdmissible(ev.tier, maxTier)) {
      pushDeferred(state, ev.id, turn, {
        sceneFingerprint: options?.sceneFingerprint,
        threadKey: options?.threadKey
      });
      // Stash payload so deferral can rehydrate without catalog
      rememberAgendaEvent(ev);
      return {
        deferredInstead: ev,
        agendaDriven: true,
        mode,
        maxTier,
        fireChance: 1,
        rolled: 0,
        state
      };
    }
    markFired(state, ev);
    rememberAgendaEvent(ev);
    return {
      event: ev,
      agendaDriven: true,
      mode,
      maxTier,
      fireChance: 1,
      rolled: 0,
      state
    };
  }

  const chance = fireChance(state);
  const rolled = rng();
  if (rolled > chance) {
    return { mode, maxTier, fireChance: chance, rolled, state };
  }

  // Prefer admissible pool; if empty, try full pool for deferral candidates
  const admissible = eligibleEvents(state, mode, maxTier, turn, false);
  let pick = weightedPick(admissible, state, rng());

  if (!pick) {
    // Try over-tier for deferral
    const over = eligibleEvents(state, mode, "disruptive", turn, true).filter(
      (e) => !tierAdmissible(e.tier, maxTier)
    );
    pick = weightedPick(over, state, rng());
    if (pick) {
      pushDeferred(state, pick.id, turn, {
        sceneFingerprint: options?.sceneFingerprint,
        threadKey: options?.threadKey
      });
      return {
        deferredInstead: pick,
        mode,
        maxTier,
        fireChance: chance,
        rolled,
        state
      };
    }
    return { mode, maxTier, fireChance: chance, rolled, state };
  }

  if (!tierAdmissible(pick.tier, maxTier)) {
    pushDeferred(state, pick.id, turn, {
      sceneFingerprint: options?.sceneFingerprint,
      threadKey: options?.threadKey
    });
    return {
      deferredInstead: pick,
      mode,
      maxTier,
      fireChance: chance,
      rolled,
      state
    };
  }

  markFired(state, pick);
  return {
    event: pick,
    mode,
    maxTier,
    fireChance: chance,
    rolled,
    state
  };
}

/** Format for brief / preflight serendipity_nudge (deterministic fallback before WP-4.7 weave). */
export function formatSerendipityNudge(
  event: SerendipityEvent,
  opts?: { fromDeferral?: boolean; mode?: SceneMode }
): string {
  const delay = opts?.fromDeferral
    ? " (delayed discovery — was waiting while the scene was closed) "
    : " ";
  const note = event.grokNote ? ` Grok Note: ${event.grokNote}` : "";
  return `SERENDIPITY EVENT (Optional, tier=${event.tier}${opts?.mode ? `, mode=${opts.mode}` : ""}):${delay}${event.text} Weave this naturally into the background of the scene to make the world feel alive.${note}`;
}

// --- Persistence ---

const STATE_FILE = ".guardian/serendipity-state.json";
let memoryCache: SerendipityState | null = null;

export function serendipityStatePath(rootDir: string = process.cwd()): string {
  return path.resolve(rootDir, STATE_FILE);
}

export function loadSerendipityState(rootDir: string = process.cwd()): SerendipityState {
  if (memoryCache) return cloneState(memoryCache);
  const p = serendipityStatePath(rootDir);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<SerendipityState>;
    memoryCache = {
      ...emptySerendipityState(),
      ...parsed,
      eventCooldowns: parsed.eventCooldowns ?? {},
      categoryLastFired: parsed.categoryLastFired ?? {},
      arcProgress: parsed.arcProgress ?? {},
      deferred: parsed.deferred ?? []
    };
    return cloneState(memoryCache);
  } catch {
    memoryCache = emptySerendipityState();
    return cloneState(memoryCache);
  }
}

export function saveSerendipityState(
  state: SerendipityState,
  rootDir: string = process.cwd()
): void {
  memoryCache = cloneState(state);
  const p = serendipityStatePath(rootDir);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(memoryCache, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn(`[serendipity] failed to persist state:`, err);
  }
}

/** Test helper: reset in-memory cache (does not delete file unless clearFile). */
export function resetSerendipityCacheForTests(clearFile = false, rootDir = process.cwd()): void {
  memoryCache = null;
  if (clearFile) {
    try {
      fs.unlinkSync(serendipityStatePath(rootDir));
    } catch {
      /* ignore */
    }
  }
}

/**
 * One-shot helper for preflight: load → select → save → optional nudge text.
 */
export function runSerendipityTurn(input: {
  highRiskTriggers: string[];
  userMessage: string;
  liveBeat?: LiveBeat | null;
  /** WP-5.4: dramaturg/deterministic NPC agenda intersections (outrank catalog). */
  npcIntersections?: AgendaIntersectionInput[];
  /** INTEL-1: provisional ambient-only cap. */
  forceMaxTier?: Intrusiveness;
  /** INTEL-2: conversation/thread id for deferred isolation */
  threadKey?: string;
  rng?: () => number;
  rootDir?: string;
  persist?: boolean;
}): SelectSerendipityResult & { nudge?: string } {
  const root = input.rootDir ?? process.cwd();
  const state = loadSerendipityState(root);
  const sceneFingerprint = computeLiveSceneFingerprint(input.liveBeat, {
    threadKey: input.threadKey
  });
  const mode = classifySceneMode(input.highRiskTriggers, input.userMessage, input.liveBeat);
  const result = selectSerendipity(
    state,
    mode,
    input.highRiskTriggers,
    input.rng ?? Math.random,
    {
      npcIntersections: input.npcIntersections,
      forceMaxTier: input.forceMaxTier,
      threadKey: input.threadKey,
      sceneFingerprint
    }
  );
  if (input.persist !== false) {
    saveSerendipityState(result.state, root);
  }
  // WP-R3: when persist is false (hermetic eval), do not mutate process-global
  // memoryCache or live .guardian/serendipity-state.json.
  const nudge = result.event
    ? formatSerendipityNudge(result.event, {
        fromDeferral: result.surfacedFromDeferral,
        mode: result.mode
      })
    : undefined;
  return { ...result, nudge };
}

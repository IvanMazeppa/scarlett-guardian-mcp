/**
 * Mission Control — live scene-mode / lore-pack overrides for the Grok brief.
 * Sidecar: .guardian/mission-control-state.json
 * Never persist during hermetic/eval isolation.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const SCENE_MODES = [
  "default",
  "explicit_slow_burn",
  "explicit_domination",
  "explicit_vulnerability",
  "explicit_feral",
  "tactical",
  "banter"
] as const;

export type SceneModeId = (typeof SCENE_MODES)[number];

export const LORE_PACK_IDS = [
  "none",
  "europe-arm",
  "thread-01",
  "thread-02",
  "thread-03",
  "thread-05",
  "letters"
] as const;

export type LorePackId = (typeof LORE_PACK_IDS)[number];

export type MissionControlState = {
  sceneMode: SceneModeId;
  lorePack: LorePackId;
  updatedAt: string;
};

export const DEFAULT_MISSION_CONTROL_STATE: MissionControlState = {
  sceneMode: "default",
  lorePack: "none",
  updatedAt: new Date(0).toISOString()
};

const SCENE_MODE_BRIEF: Record<Exclude<SceneModeId, "default">, string> = {
  explicit_slow_burn: [
    "**SCENE MODE (ACTIVE): EXPLICIT / SLOW-BURN**",
    "- Write multi-paragraph prose; do not compress into a short beat.",
    "- At least ~50% of word count must land on psychological tension, sensory environment, and absolute anatomical/hardware continuity.",
    "- Forbid rushing physical escalation; dwell, breathe, and stay continuous with established body/hardware facts."
  ].join("\n"),
  explicit_domination: [
    "**SCENE MODE (ACTIVE): EXPLICIT / DOMINATION**",
    "- Scarlett is in absolute psychological and physical control.",
    "- Ensure explicit commands, rigid rules, and focus on Benjamin's submission and reactions.",
    "- Never flatten her into generic cruelty; her dominance is an expression of deep ownership and safety."
  ].join("\n"),
  explicit_vulnerability: [
    "**SCENE MODE (ACTIVE): EXPLICIT / VULNERABILITY**",
    "- Focus entirely on emotional rawness, aftercare, soft confessions, and deep psychological connection.",
    "- Allow tears, hesitation, and unguarded truth without pressure to perform or escalate physically.",
    "- Words like \"safe\", \"held\", and \"seen\" should define the physical geometry of the scene."
  ].join("\n"),
  explicit_feral: [
    "**SCENE MODE (ACTIVE): EXPLICIT / FERAL**",
    "- High physical intensity, unthinking need, loss of sophisticated restraint.",
    "- Focus on breath, grip, raw instinct, and overwhelming mutual desire.",
    "- Shorten inner-monologue logic and replace it with urgent physical reaction."
  ].join("\n"),
  tactical: [
    "**SCENE MODE (ACTIVE): TACTICAL**",
    "- Before spoken dialogue, include a brief hidden inner-monologue evaluating threat assessment and exit routes.",
    "- Then speak/act in character; keep the tactical read grounded in LIVE BEAT, not invented danger."
  ].join("\n"),
  banter: [
    "**SCENE MODE (ACTIVE): BANTER**",
    "- Disable minimum-length padding. Prefer fast, punchy dialogue and short beats.",
    "- Do not invent filler paragraphs to meet a word count."
  ].join("\n")
};

export function defaultMissionControlDir(cwd = process.cwd()): string {
  return path.join(cwd, ".guardian");
}

export function missionControlStatePath(cwd = process.cwd()): string {
  return path.join(defaultMissionControlDir(cwd), "mission-control-state.json");
}

export function isSceneModeId(value: unknown): value is SceneModeId {
  return typeof value === "string" && (SCENE_MODES as readonly string[]).includes(value);
}

export function isLorePackId(value: unknown): value is LorePackId {
  return typeof value === "string" && (LORE_PACK_IDS as readonly string[]).includes(value);
}

export function normalizeMissionControlState(
  raw: Partial<MissionControlState> | null | undefined
): MissionControlState {
  const sceneMode = isSceneModeId(raw?.sceneMode) ? raw.sceneMode : "default";
  const lorePack = isLorePackId(raw?.lorePack) ? raw.lorePack : "none";
  const updatedAt =
    typeof raw?.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt
      : new Date().toISOString();
  return { sceneMode, lorePack, updatedAt };
}

export function readMissionControlState(cwd = process.cwd()): MissionControlState {
  const file = missionControlStatePath(cwd);
  if (!fs.existsSync(file)) return { ...DEFAULT_MISSION_CONTROL_STATE };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<MissionControlState>;
    return normalizeMissionControlState(parsed);
  } catch {
    return { ...DEFAULT_MISSION_CONTROL_STATE };
  }
}

export async function writeMissionControlState(
  next: Partial<MissionControlState>,
  cwd = process.cwd()
): Promise<MissionControlState> {
  const current = readMissionControlState(cwd);
  const merged = normalizeMissionControlState({
    ...current,
    ...next,
    updatedAt: new Date().toISOString()
  });
  const dir = defaultMissionControlDir(cwd);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(missionControlStatePath(cwd), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

/**
 * Resolve active Mission Control overrides for a preflight turn.
 * Eval/hermetic isolation always returns default/none (no disk read of live overrides).
 */
export function resolveMissionControlForPreflight(options?: {
  isolateSidecars?: boolean;
  cwd?: string;
}): MissionControlState {
  if (options?.isolateSidecars) {
    return {
      sceneMode: "default",
      lorePack: "none",
      updatedAt: new Date(0).toISOString()
    };
  }
  return readMissionControlState(options?.cwd);
}

/** Essential brief block — empty string when mode is default. */
export function formatSceneModeBriefBlock(sceneMode: SceneModeId): string {
  if (sceneMode === "default") return "";
  return SCENE_MODE_BRIEF[sceneMode];
}

/** Stagnation warning threshold — explicit slow-burn may dwell longer. */
export function locationStagnationThreshold(sceneMode: SceneModeId): number {
  return sceneMode === "explicit_slow_burn" ? 25 : 15;
}

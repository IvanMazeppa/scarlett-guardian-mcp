import type { ControlState, LorePackId, SceneModeId } from "../types";
import { formatOpsTs } from "../api";

const MODE_OPTIONS: Array<{ id: SceneModeId; label: string; hint: string }> = [
  { id: "default", label: "Default", hint: "No mode override" },
  { id: "explicit_slow_burn", label: "Explicit / Slow-burn", hint: "Long-form tension" },
  { id: "explicit_domination", label: "Explicit / Domination", hint: "Absolute control" },
  { id: "explicit_vulnerability", label: "Explicit / Vulnerability", hint: "Raw aftercare" },
  { id: "explicit_feral", label: "Explicit / Feral", hint: "Unthinking instinct" },
  { id: "tactical", label: "Tactical", hint: "Threat read first" },
  { id: "banter", label: "Banter", hint: "Punchy, short beats" }
];

type Props = {
  state: ControlState | null;
  packs: Array<{ id: string; label: string }>;
  saving: boolean;
  saveMessage: string | null;
  saveOk: boolean | null;
  onSceneMode: (mode: SceneModeId) => void;
  onLorePack: (pack: LorePackId) => void;
};

export function SteeringPanel({
  state,
  packs,
  saving,
  saveMessage,
  saveOk,
  onSceneMode,
  onLorePack
}: Props) {
  const mode = state?.sceneMode ?? "default";
  const lore = state?.lorePack ?? "none";

  return (
    <aside className="steer panel">
      <div className="panel-head">
        <h2>Steering</h2>
        <p className="panel-sub">Next-turn brief overrides</p>
      </div>

      <div className="steer-block">
        <div className="field-label">Scene mode</div>
        <div className="mode-grid" role="group" aria-label="Scene mode">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-btn ${mode === opt.id ? "active" : ""}`}
              disabled={saving}
              onClick={() => onSceneMode(opt.id)}
              title={opt.hint}
            >
              <span className="mode-label">{opt.label}</span>
              <span className="mode-hint">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="steer-block">
        <label className="field-label" htmlFor="lorePack">
          Targeted lore
        </label>
        <select
          id="lorePack"
          value={lore}
          disabled={saving}
          onChange={(e) => onLorePack(e.target.value)}
        >
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className={`steer-status ${saveOk === true ? "ok" : ""} ${saveOk === false ? "bad" : ""}`}
        aria-live="polite"
      >
        {saving
          ? "Applying…"
          : saveMessage
            ? saveMessage
            : state?.updatedAt
              ? `Last applied ${formatOpsTs(state.updatedAt)}`
              : "Ready"}
      </div>
    </aside>
  );
}

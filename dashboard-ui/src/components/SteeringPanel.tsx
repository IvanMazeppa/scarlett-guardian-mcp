import { useState, useEffect } from "react";
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

  const [directorNote, setDirectorNote] = useState("");

  // Sync internal state if it changes from upstream (e.g., initial load)
  useEffect(() => {
    setDirectorNote(lore !== "none" ? lore : "");
  }, [lore]);

  const isExtremeMode = mode.startsWith("explicit") || mode === "tactical";

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLorePack(directorNote.trim() || "none");
  };

  return (
    <aside className={`steer panel ${isExtremeMode ? "extreme-warning" : ""}`}>
      <div className="panel-head">
        <h2>Steering {isExtremeMode && <span className="warning-badge">⚠️ EXTREME MODE</span>}</h2>
        <p className="panel-sub">Next-turn brief overrides</p>
      </div>

      <div className="steer-block">
        <div className="field-label">
          Scene mode
          {isExtremeMode && <span className="timer-hint"> (Auto-expires soon)</span>}
        </div>
        <div className="mode-grid" role="group" aria-label="Scene mode">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-btn ${mode === opt.id ? "active" : ""} ${opt.id.startsWith("explicit") ? "explicit-btn" : ""}`}
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
          Director's Searchbar (Targeted Lore)
        </label>
        <form onSubmit={handleNoteSubmit} className="director-form">
          <input
            id="lorePack"
            type="text"
            className="director-input"
            placeholder="e.g. Stockholm hate crime, CQC brawl..."
            value={directorNote}
            onChange={(e) => setDirectorNote(e.target.value)}
            disabled={saving}
          />
          <button type="submit" disabled={saving || directorNote === lore} className="apply-btn">
            Ping RAG
          </button>
        </form>
        <div className="quick-tags">
          {packs.filter(p => p.id !== "none").map((p) => (
            <button
              key={p.id}
              type="button"
              className="tag-btn"
              onClick={() => {
                setDirectorNote(p.id);
                onLorePack(p.id);
              }}
              disabled={saving}
            >
              {p.label}
            </button>
          ))}
          <button type="button" className="tag-btn clear-btn" onClick={() => { setDirectorNote(""); onLorePack("none"); }}>
            Clear
          </button>
        </div>
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

      <style>{`
        .extreme-warning { box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.4), inset 0 0 20px rgba(239, 68, 68, 0.05); }
        .warning-badge { color: #ef4444; font-size: 0.75rem; margin-left: 8px; font-weight: bold; letter-spacing: 0.5px; animation: pulse 2s infinite; }
        .timer-hint { color: #f59e0b; font-size: 0.75rem; font-weight: normal; margin-left: 4px; }
        .explicit-btn.active { border-color: #ef4444; background: rgba(239, 68, 68, 0.1); color: #fca5a5; }
        .director-form { display: flex; gap: 8px; margin-bottom: 8px; }
        .director-input { flex: 1; padding: 8px 12px; background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 4px; font-family: monospace; font-size: 0.85rem;}
        .director-input:focus { outline: none; border-color: #3b82f6; }
        .apply-btn { padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.8rem;}
        .apply-btn:hover:not(:disabled) { background: #2563eb; }
        .apply-btn:disabled { background: #1e293b; color: #64748b; cursor: not-allowed; }
        .quick-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .tag-btn { font-size: 0.75rem; padding: 4px 10px; background: #1e293b; border: 1px solid #334155; color: #94a3b8; border-radius: 12px; cursor: pointer; transition: all 0.2s; }
        .tag-btn:hover:not(:disabled) { background: #334155; color: #cbd5e1; border-color: #475569; }
        .clear-btn { background: transparent; border: 1px dashed #475569; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
      `}</style>
    </aside>
  );
}

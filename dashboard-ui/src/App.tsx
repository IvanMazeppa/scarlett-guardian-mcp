import { useCallback, useEffect, useMemo, useState } from "react";
import { formatOpsTs, getJson, postJson } from "./api";
import { HealthAndRecent } from "./components/HealthAndRecent";
import { LatencyBreakdown } from "./components/LatencyBreakdown";
import { NarrativeCharts } from "./components/NarrativeCharts";
import { ParrotingRatio } from "./components/ParrotingRatio";
import { SaveLagBanner } from "./components/SaveLagBanner";
import { StatusStrip } from "./components/StatusStrip";
import { SteeringPanel } from "./components/SteeringPanel";
import { ToolUtilization } from "./components/ToolUtilization";
import { FloorPlanPanel } from "./components/FloorPlanPanel";
import { TriggerFeed } from "./components/TriggerFeed";
import { WardrobePanel } from "./components/WardrobePanel";
import type {
  ControlState,
  LorePackId,
  NarrativeSummary,
  SceneModeId,
  TelemetryEvent,
  TelemetryHealth,
  TelemetrySummary
} from "./types";

type RecentResponse = { days: number; limit: number; events: TelemetryEvent[] };
type LorePacksResponse = { packs: Array<{ id: string; label: string }> };

export default function App() {
  const [days, setDays] = useState(7);
  const [control, setControl] = useState<ControlState | null>(null);
  const [packs, setPacks] = useState<Array<{ id: string; label: string }>>([]);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [narrative, setNarrative] = useState<NarrativeSummary | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [health, setHealth] = useState<TelemetryHealth | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setStatus("Loading…");
    const t0 = performance.now();
    try {
      const [h, s, recent, narr, ctrl] = await Promise.all([
        getJson<TelemetryHealth>("/telemetry/api/health"),
        getJson<TelemetrySummary>(`/telemetry/api/summary?days=${days}`),
        getJson<RecentResponse>(`/telemetry/api/recent?limit=20&days=${days}`),
        getJson<NarrativeSummary>(`/telemetry/api/narrative?days=${days}`),
        getJson<ControlState>("/control/state")
      ]);
      setHealth(h);
      setSummary(s);
      setEvents(recent.events || []);
      setNarrative(narr);
      setControl(ctrl);
      const ms = Math.round(performance.now() - t0);
      setStatus(
        `ok · ${s.event_count} events · load ${ms} ms · last ops event ${formatOpsTs(h.last_event_ts)}`
      );
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getJson<LorePacksResponse>("/control/lore-packs");
        if (!cancelled) setPacks(data.packs || [{ id: "none", label: "None" }]);
      } catch {
        if (!cancelled) setPacks([{ id: "none", label: "None" }]);
      }
      if (!cancelled) await load();
    })();
    const id = window.setInterval(() => {
      void load();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  const patchControl = useCallback(
    async (patch: { sceneMode?: SceneModeId; lorePack?: LorePackId }) => {
      setSaving(true);
      setSaveOk(null);
      setSaveMessage("Saving…");
      try {
        const next = await postJson<ControlState>("/control/state", patch);
        setControl((prev) => ({ ...(prev || next), ...next }));
        setSaveOk(true);
        setSaveMessage(`Applied ${formatOpsTs(next.updatedAt)}`);
        await load();
      } catch (err) {
        setSaveOk(false);
        setSaveMessage("Error");
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const latest = useMemo(() => (events.length ? events[events.length - 1] : null), [events]);

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Scarlett Guardian</p>
          <h1>Mission Control</h1>
          <p className="lede">
            Steer the next turn. Story calendar comes only from LIVE BEAT — never wall-clock today.
          </p>
        </div>
        <div className="ops-controls">
          <label>
            Ops window
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 real days</option>
              <option value={14}>14 real days</option>
              <option value={30}>30 real days</option>
              <option value={90}>90 real days</option>
              <option value={365}>365 real days</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={() => void load()}>
            Refresh
          </button>
          <span className="status-line">{status}</span>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="layout">
        <SteeringPanel
          state={control}
          packs={packs}
          saving={saving}
          saveMessage={saveMessage}
          saveOk={saveOk}
          onSceneMode={(sceneMode) => void patchControl({ sceneMode })}
          onLorePack={(lorePack) => void patchControl({ lorePack })}
        />

        <main className="main">
          <SaveLagBanner control={control} latest={latest} summary={summary} />
          <StatusStrip control={control} narrative={narrative} summary={summary} />

          <div className="metrics-grid">
            <ParrotingRatio events={events} />
            <WardrobePanel />
            <ToolUtilization latest={latest} windowCounts={narrative?.tools?.counts} />
            <TriggerFeed latest={latest} recent={events} />
            <LatencyBreakdown latest={latest} />
            <FloorPlanPanel scarlettLocation="Living Room" benjaminLocation="Kitchen" />
          </div>

          <section className="band">
            <h2 className="band-title">Narrative health</h2>
            <NarrativeCharts narrative={narrative} />
          </section>

          <section className="band">
            <h2 className="band-title">Ops metrics</h2>
            <HealthAndRecent events={events} summary={summary} />
          </section>

          <p className="footer-note">
            Edge Basic Auth (ngrok) protects this UI. MCP paths stay open — see{" "}
            <code>docs/mission-control-ngrok.md</code>. Health probe:{" "}
            {health?.ok === false ? "degraded" : "ok"}.
          </p>
        </main>
      </div>
    </div>
  );
}

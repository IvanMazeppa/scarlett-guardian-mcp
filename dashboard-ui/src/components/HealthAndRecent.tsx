import type { TelemetryEvent, TelemetrySummary } from "../types";
import { formatOpsTs, num, pct } from "../api";

type Props = {
  events: TelemetryEvent[];
  summary: TelemetrySummary | null;
};

export function HealthAndRecent({ events, summary }: Props) {
  const cards = summary
    ? [
        {
          label: "Events",
          value: String(summary.event_count),
          hint: `${summary.backfill_count} backfill · ${summary.live_count} live`
        },
        {
          label: "Avg facts",
          value: num(summary.quality.avg_facts),
          hint: `δ scene ${pct(summary.quality.scene_delta_rate)}`
        },
        {
          label: "Meta pollution",
          value: pct(summary.quality.meta_pollution_rate),
          hint: "lower is better"
        },
        {
          label: "Duplex present",
          value: pct(summary.duplex.present_rate),
          hint: `${summary.duplex.present_count} / ${summary.duplex.absent_count}`
        },
        {
          label: "Latency p50 / p95",
          value:
            summary.latency.live_with_timing > 0
              ? `${num(summary.latency.p50_total_ms)} / ${num(summary.latency.p95_total_ms)}`
              : "—",
          hint:
            summary.latency.live_with_timing > 0
              ? `${summary.latency.live_with_timing} live timed`
              : "backfill has no timings"
        },
        {
          label: "Reports on disk",
          value: String(summary.reports_dir_count),
          hint: "preflight-full-*.json"
        }
      ]
    : [];

  const rows = [...events].reverse();

  return (
    <>
      {cards.length > 0 && (
        <div className="status-grid health-grid">
          {cards.map((c) => (
            <div key={c.label} className="stat-card">
              <div className="stat-label">{c.label}</div>
              <div className="stat-value">{c.value}</div>
              <div className="stat-hint">{c.hint}</div>
            </div>
          ))}
        </div>
      )}

      <section className="card table-card">
        <div className="card-head">
          <h3>Recent events</h3>
          <span className="card-hint">Ops timestamps = when preflight ran (not story date)</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Src</th>
                <th>Conf</th>
                <th>Facts</th>
                <th>Duplex ch</th>
                <th>Tools</th>
                <th>Triggers</th>
                <th>Corr</th>
                <th>ms</th>
                <th>Id</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="muted">
                    No events. Run telemetry:backfill or a live preflight.
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const ms = e.source === "backfill" ? "—" : (e.latency_ms?.total ?? "—");
                  const tools = (e.tools_invoked ?? []).slice(0, 2).join(", ") || "—";
                  const triggers = (e.triggers ?? []).slice(0, 2).join("; ") || "—";
                  return (
                    <tr key={e.preflight_id || e.ts}>
                      <td className="mono">{formatOpsTs(e.ts)}</td>
                      <td>{e.source || "live"}</td>
                      <td>{e.quality?.confidence_score ?? "—"}</td>
                      <td>{e.quality?.llm_facts_count ?? "—"}</td>
                      <td>{e.duplex?.previous_message_chars ?? "—"}</td>
                      <td className="clip" title={tools}>
                        {tools}
                      </td>
                      <td className="clip" title={triggers}>
                        {triggers}
                      </td>
                      <td className={e.duplex?.correction_fired ? "warn-text" : ""}>
                        {e.duplex?.correction_fired ? "yes" : "no"}
                      </td>
                      <td className="mono">{ms}</td>
                      <td className="mono">
                        <code>{(e.preflight_id || "").slice(0, 18)}</code>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

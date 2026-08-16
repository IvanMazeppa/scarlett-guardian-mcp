import type { TelemetryEvent } from "../types";
import { formatOpsTs } from "../api";

type Props = {
  latest: TelemetryEvent | null;
  recent: TelemetryEvent[];
};

export function TriggerFeed({ latest, recent }: Props) {
  const latestTriggers = latest?.triggers ?? [];
  const history = recent
    .slice()
    .reverse()
    .filter((e) => (e.triggers?.length ?? 0) > 0)
    .slice(0, 8);

  return (
    <section className="card metric-card">
      <div className="card-head">
        <h3>Trigger detection</h3>
        <span className="metric-pill">{latestTriggers.length} live</span>
      </div>
      <p className="card-hint">High-risk narrative triggers from the last preflight.</p>

      <div className="pill-row">
        {latestTriggers.length === 0 ? (
          <span className="pill muted-pill">No triggers on latest turn</span>
        ) : (
          latestTriggers.map((t) => (
            <span key={t} className="pill warn-pill">
              {t}
            </span>
          ))
        )}
      </div>

      <ul className="trigger-feed">
        {history.length === 0 ? (
          <li className="muted">No trigger history in this window.</li>
        ) : (
          history.map((e) => (
            <li key={e.preflight_id || e.ts}>
              <span className="mono feed-ts">{formatOpsTs(e.ts)}</span>
              <span className="feed-triggers">{(e.triggers ?? []).join(" · ")}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

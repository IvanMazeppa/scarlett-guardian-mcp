import type { ControlState, TelemetryEvent, TelemetrySummary } from "../types";

type Props = {
  control: ControlState | null;
  latest: TelemetryEvent | null;
  summary: TelemetrySummary | null;
};

export function SaveLagBanner({ control, latest, summary }: Props) {
  const suspectedNow = Boolean(latest?.save_lag?.suspected);
  const rate = summary?.save_lag?.suspected_rate ?? 0;
  const count = summary?.save_lag?.suspected_count ?? 0;
  const storyClock =
    control?.live_beat?.story_clock ||
    control?.live_beat?.time_in_story ||
    control?.live_beat?.last_updated ||
    "—";

  const show = suspectedNow || rate > 0;

  if (!show) {
    return (
      <div className="banner banner-quiet">
        <span className="banner-tag">Timeline</span>
        <span>
          LIVE BEAT on disk: <strong>{storyClock}</strong>
          <span className="muted"> — no save-lag flag on latest turn</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`banner ${suspectedNow ? "banner-warn" : "banner-soft"}`} role="status">
      <span className="banner-tag">Save-lag</span>
      <div>
        <strong>
          {suspectedNow
            ? "Latest preflight flagged multi-scene save lag"
            : `Save-lag seen on ${count} turn${count === 1 ? "" : "s"} in ops window`}
        </strong>
        <div className="banner-detail">
          Disk LIVE BEAT reads <code>{storyClock}</code>. Canon on disk may trail play — never
          invent wall-clock “today.” Sync <code>current-state.md</code> (+ reindex) when ready.
        </div>
      </div>
    </div>
  );
}

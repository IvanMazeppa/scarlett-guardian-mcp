import type { ControlState, NarrativeSummary, TelemetrySummary } from "../types";
import { pct } from "../api";

type Props = {
  control: ControlState | null;
  narrative: NarrativeSummary | null;
  summary: TelemetrySummary | null;
};

export function StatusStrip({ control, narrative, summary }: Props) {
  const live = control?.live_beat || {};
  const streak =
    narrative?.location?.current_streak ?? control?.location?.consecutiveTurns ?? 0;
  const threshold = narrative?.location?.threshold ?? 15;
  const stagnating = narrative?.location?.stagnation || streak >= threshold;
  const locationLine =
    live.location ||
    narrative?.location?.current_location_line ||
    control?.location?.locationLine ||
    "—";
  const storyClock = live.story_clock || live.time_in_story || live.last_updated || "—";
  const present =
    Array.isArray(live.present) && live.present.length ? live.present.join(", ") : "—";

  const cards = [
    {
      label: "Story time (LIVE BEAT)",
      value: storyClock,
      hint: "From current-state.md — never wall-clock",
      tone: "ok" as const
    },
    {
      label: "Location",
      value: locationLine || "—",
      hint: present !== "—" ? `Present: ${present}` : "canon location on disk",
      tone: "neutral" as const
    },
    {
      label: "Location streak",
      value: `${streak} / ${threshold}`,
      hint: stagnating ? "STAGNATION WARNING (pacing)" : "turns at same story location",
      tone: stagnating ? ("bad" as const) : streak >= Math.max(8, threshold - 5) ? ("warn" as const) : ("ok" as const)
    },
    {
      label: "Active mode",
      value: control?.sceneMode ?? "default",
      hint: `lore: ${control?.lorePack ?? "none"}`,
      tone: "neutral" as const
    },
    {
      label: "Correction rate",
      value: pct(narrative?.corrections?.rate ?? summary?.duplex.correction_rate),
      hint: `${narrative?.corrections?.total_fired ?? summary?.duplex.correction_count ?? 0} fired in ops window`,
      tone: "neutral" as const
    }
  ];

  return (
    <div className="status-grid">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card tone-${c.tone}`}>
          <div className="stat-label">{c.label}</div>
          <div className="stat-value">{c.value}</div>
          <div className="stat-hint">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}

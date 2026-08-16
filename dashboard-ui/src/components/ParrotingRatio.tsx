import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { TelemetryEvent } from "../types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Props = {
  events: TelemetryEvent[];
};

/**
 * Parroting / generation pressure: user duplex chars vs Guardian fact count.
 * Uses recent turns; backfill often has previous_message_chars = 0.
 */
export function ParrotingRatio({ events }: Props) {
  const recent = events.slice(-12);
  const labels = recent.map((e, i) => {
    const t = (e.ts || "").slice(11, 16);
    return t || `#${i + 1}`;
  });
  const userChars = recent.map((e) => e.duplex?.previous_message_chars ?? 0);
  const facts = recent.map((e) => e.quality?.llm_facts_count ?? 0);

  const latest = events[events.length - 1];
  const latestChars = latest?.duplex?.previous_message_chars ?? 0;
  const latestFacts = latest?.quality?.llm_facts_count ?? 0;
  const ratio =
    latestChars > 0 ? (latestFacts / (latestChars / 100)).toFixed(2) : latestFacts > 0 ? "∞" : "—";

  return (
    <section className="card metric-card">
      <div className="card-head">
        <h3>Parroting ratio</h3>
        <span className="metric-pill" title="facts per 100 duplex chars (latest)">
          {ratio} <span className="muted">facts/100ch</span>
        </span>
      </div>
      <p className="card-hint">
        Duplex chars (user/Scarlett prior) vs LLM facts — high facts on thin duplex can signal
        parroting risk.
      </p>
      <div className="chart-box">
        {recent.length === 0 ? (
          <div className="empty">No recent events</div>
        ) : (
          <Bar
            data={{
              labels,
              datasets: [
                {
                  label: "Duplex chars",
                  data: userChars,
                  backgroundColor: "rgba(201, 162, 39, 0.75)",
                  borderRadius: 2
                },
                {
                  label: "LLM facts",
                  data: facts,
                  backgroundColor: "rgba(91, 159, 212, 0.85)",
                  borderRadius: 2
                }
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  labels: { color: "#8b9bb4", boxWidth: 10, font: { size: 11 } }
                }
              },
              scales: {
                x: {
                  ticks: { color: "#8b9bb4", maxRotation: 0 },
                  grid: { color: "rgba(42, 53, 72, 0.6)" }
                },
                y: {
                  beginAtZero: true,
                  ticks: { color: "#8b9bb4" },
                  grid: { color: "rgba(42, 53, 72, 0.6)" }
                }
              }
            }}
          />
        )}
      </div>
    </section>
  );
}

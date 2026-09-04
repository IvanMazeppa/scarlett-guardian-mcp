import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { TelemetryEvent } from "../types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

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
  
  // Calculate Chars per Fact instead of raw values
  const charsPerFact = recent.map((e) => {
    const chars = e.duplex?.previous_message_chars ?? 0;
    const facts = e.quality?.llm_facts_count ?? 0;
    if (facts === 0) return 0;
    return Math.round(chars / facts);
  });

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
        Tracks generation volume. Parroting occurs when the LLM repeats your actions/dialogue in more descriptive prose instead of taking initiative and advancing the narrative. High "chars per fact" implies stalling.
      </p>
      <div className="chart-box">
        {recent.length === 0 ? (
          <div className="empty">No recent events</div>
        ) : (
          <Line
            data={{
              labels,
              datasets: [
                {
                  label: "Chars per Fact",
                  data: charsPerFact,
                  borderColor: "rgba(201, 162, 39, 0.9)",
                  backgroundColor: "rgba(201, 162, 39, 0.2)",
                  tension: 0.3,
                  fill: true,
                  pointRadius: 4
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
                  ticks: { color: "#8b9bb4", maxRotation: 45 },
                  grid: { color: "rgba(42, 53, 72, 0.6)" }
                },
                y: {
                  beginAtZero: true,
                  ticks: { color: "#8b9bb4" },
                  grid: { color: "rgba(42, 53, 72, 0.6)" },
                  title: {
                    display: true,
                    text: 'Characters per Fact',
                    color: "#8b9bb4"
                  }
                }
              }
            }}
          />
        )}
      </div>
    </section>
  );
}

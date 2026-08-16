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
import { num } from "../api";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Props = {
  latest: TelemetryEvent | null;
};

const PHASE_KEYS = ["dispatch", "rag_batch", "llm_assessment"] as const;

export function LatencyBreakdown({ latest }: Props) {
  const phases = latest?.latency_ms?.phases ?? {};
  const llm = latest?.latency_ms?.llm_assessment;
  const values = PHASE_KEYS.map((key) => {
    if (key === "llm_assessment" && (phases.llm_assessment == null || phases.llm_assessment === 0)) {
      return llm ?? 0;
    }
    return phases[key] ?? 0;
  });
  const total = latest?.latency_ms?.total ?? values.reduce((a, b) => a + b, 0);
  const hasData = values.some((v) => v > 0) || (total ?? 0) > 0;

  return (
    <section className="card metric-card">
      <div className="card-head">
        <h3>Latency breakdown</h3>
        <span className="metric-pill mono">{num(total)} ms</span>
      </div>
      <p className="card-hint">Preflight phase split — dispatch / rag_batch / llm_assessment.</p>
      <div className="chart-box chart-box-sm">
        {!hasData ? (
          <div className="empty">No live timings (backfill has none)</div>
        ) : (
          <Bar
            data={{
              labels: ["dispatch", "rag_batch", "llm_assessment"],
              datasets: [
                {
                  label: "ms",
                  data: values,
                  backgroundColor: ["#5b9fd4", "#3d9a6a", "#c9a227"],
                  borderRadius: 3
                }
              ]
            }}
            options={{
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  beginAtZero: true,
                  ticks: { color: "#8b9bb4" },
                  grid: { color: "rgba(42, 53, 72, 0.6)" }
                },
                y: {
                  ticks: { color: "#e7ecf3" },
                  grid: { display: false }
                }
              }
            }}
          />
        )}
      </div>
    </section>
  );
}

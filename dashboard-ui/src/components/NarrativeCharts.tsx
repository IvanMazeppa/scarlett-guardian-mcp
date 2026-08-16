import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Bar, Doughnut, Line, Pie } from "react-chartjs-2";
import type { NarrativeSummary } from "../types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

type Props = {
  narrative: NarrativeSummary | null;
};

const tick = { color: "#8b9bb4" };
const grid = { color: "rgba(42, 53, 72, 0.6)" };

export function NarrativeCharts({ narrative }: Props) {
  if (!narrative) {
    return <div className="empty">Narrative metrics loading…</div>;
  }

  const sp = narrative.serendipity_parroting || {};
  const streakSeries = narrative.location?.streak_series || [];
  const threshold = narrative.location?.threshold ?? 15;
  const toolCounts = narrative.tools?.counts || {};
  const toolLabels = Object.keys(toolCounts);
  const toolData = toolLabels.map((k) => toolCounts[k] || 0);
  const byKind = narrative.corrections?.by_kind || {};
  const kindLabels = Object.keys(byKind).filter((k) => k !== "none");

  return (
    <div className="charts-grid">
      <section className="card">
        <div className="card-head">
          <h3>Serendipity / Parroting</h3>
        </div>
        <div className="chart-box">
          <Bar
            data={{
              labels: [
                "Init+Serendipity",
                "Recv+Parroting",
                "Initiate",
                "Receive",
                "Rest",
                "Serendipity",
                "Parroting"
              ],
              datasets: [
                {
                  label: "Turns",
                  data: [
                    sp.initiate_plus_serendipity || 0,
                    sp.receive_plus_parroting || 0,
                    sp.initiate || 0,
                    sp.receive || 0,
                    sp.rest || 0,
                    sp.serendipity || 0,
                    sp.parroting || 0
                  ],
                  backgroundColor: [
                    "#3d9a6a",
                    "#c45c5c",
                    "#5b9fd4",
                    "#8b9bb4",
                    "#c9a227",
                    "#3d9a6a88",
                    "#c45c5c88"
                  ]
                }
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { ...tick, maxRotation: 45 }, grid },
                y: { beginAtZero: true, ticks: tick, grid }
              }
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Scene pacing</h3>
        </div>
        <div className="chart-box">
          <Line
            data={{
              labels: streakSeries.map((p) => (p.ts || "").slice(11, 16)),
              datasets: [
                {
                  label: "streak",
                  data: streakSeries.map((p) => p.streak),
                  borderColor: "#5b9fd4",
                  tension: 0.25,
                  pointRadius: 2
                },
                {
                  label: "threshold",
                  data: streakSeries.map(() => threshold),
                  borderColor: "#c45c5c",
                  borderDash: [4, 4],
                  pointRadius: 0
                }
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { labels: { color: "#8b9bb4", boxWidth: 10 } } },
              scales: {
                x: { ticks: tick, grid },
                y: { beginAtZero: true, ticks: tick, grid }
              }
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>RAG tool mix</h3>
        </div>
        <div className="chart-box">
          <Pie
            data={{
              labels: toolLabels.map((k) =>
                (toolCounts[k] || 0) === 0 ? `${k} (0)` : k
              ),
              datasets: [
                {
                  data: toolData.map((n) => (n === 0 ? 0.001 : n)),
                  backgroundColor: ["#5b9fd4", "#3d9a6a", "#c9a227", "#c45c5c", "#8b9bb4"]
                }
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { color: "#8b9bb4", boxWidth: 10, font: { size: 10 } }
                }
              }
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Correction kinds</h3>
        </div>
        <div className="chart-box">
          <Doughnut
            data={{
              labels: kindLabels,
              datasets: [
                {
                  data: kindLabels.map((k) => byKind[k] || 0),
                  backgroundColor: ["#c45c5c", "#c9a227", "#5b9fd4", "#8b9bb4", "#3d9a6a"]
                }
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { color: "#8b9bb4", boxWidth: 10, font: { size: 10 } }
                }
              }
            }}
          />
        </div>
      </section>
    </div>
  );
}

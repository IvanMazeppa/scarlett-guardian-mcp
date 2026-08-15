/* global fetch, document, Chart, performance */
(function () {
  const $ = (id) => document.getElementById(id);
  /** @type {Record<string, import('chart.js').Chart>} */
  const charts = {};

  function pct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return `${Math.round(n * 1000) / 10}%`;
  }

  function num(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(n);
  }

  function authHeaders() {
    const token = window.GUARDIAN_BEARER;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  async function getJson(url) {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  }

  function renderStatus(control, narrative) {
    const loc = control.location;
    const live = control.live_beat || {};
    const streak = narrative?.location?.current_streak ?? loc?.consecutiveTurns ?? 0;
    const threshold = narrative?.location?.threshold ?? 15;
    const stagnating = narrative?.location?.stagnation || streak >= threshold;
    const mode = control.sceneMode || "default";
    const lore = control.lorePack || "none";
    const locationLine =
      live.location ||
      narrative?.location?.current_location_line ||
      loc?.locationLine ||
      "—";
    const storyClock = live.story_clock || live.time_in_story || live.last_updated || "—";
    const present = Array.isArray(live.present) && live.present.length
      ? live.present.join(", ")
      : "—";

    const cards = [
      {
        label: "Story time (LIVE BEAT)",
        valueHtml: `<div class="live-beat">${escapeHtml(storyClock)}</div>`,
        hint: "From current-state.md — never wall-clock today",
        cls: "ok"
      },
      {
        label: "LIVE BEAT location",
        valueHtml: `<div class="live-beat">${escapeHtml(locationLine || "—")}</div>`,
        hint: present !== "—" ? `Present: ${present}` : "canon location on disk"
      },
      {
        label: "Location streak",
        value: `${streak} / ${threshold}`,
        hint: stagnating ? "STAGNATION WARNING (pacing only)" : "turns at same story location",
        cls: stagnating ? "bad" : streak >= Math.max(8, threshold - 5) ? "warn" : "ok"
      },
      {
        label: "Active mode",
        valueHtml: `<span class="badge">${escapeHtml(mode)}</span>`,
        hint: `lore: ${lore}`
      },
      {
        label: "Correction rate",
        value: pct(narrative?.corrections?.rate),
        hint: `${narrative?.corrections?.total_fired ?? 0} fired in ops window`
      }
    ];

    $("statusCards").innerHTML = cards
      .map(
        (c) => `
      <div class="card">
        <div class="label">${c.label}</div>
        ${
          c.valueHtml
            ? `<div class="value ${c.cls || ""}">${c.valueHtml}</div>`
            : `<div class="value ${c.cls || ""}">${c.value}</div>`
        }
        <div class="hint ${c.cls || ""}">${c.hint || ""}</div>
      </div>`
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCards(summary) {
    const cards = [
      {
        label: "Events",
        value: summary.event_count,
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
        hint: "lower is better",
        cls: summary.quality.meta_pollution_rate > 0.2 ? "bad" : "ok"
      },
      {
        label: "Duplex present",
        value: pct(summary.duplex.present_rate),
        hint: `${summary.duplex.present_count} present / ${summary.duplex.absent_count} absent`
      },
      {
        label: "Correction rate",
        value: pct(summary.duplex.correction_rate),
        hint: `${summary.duplex.correction_count} fired`
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
        label: "Avg confidence",
        value: num(summary.quality.avg_confidence),
        hint: `brief ~${num(summary.quality.avg_brief_chars)} chars`
      },
      {
        label: "Max chunk p95",
        value: num(summary.memory.max_chunk_chars_p95),
        hint: `avg max ${num(summary.memory.avg_max_chunk_chars)}`,
        cls:
          summary.memory.max_chunk_chars_p95 != null &&
          summary.memory.max_chunk_chars_p95 > 4000
            ? "warn"
            : ""
      },
      {
        label: "Reports on disk",
        value: summary.reports_dir_count,
        hint: "preflight-full-*.json"
      }
    ];

    $("cards").innerHTML = cards
      .map(
        (c) => `
      <div class="card">
        <div class="label">${c.label}</div>
        <div class="value ${c.cls || ""}">${c.value}</div>
        <div class="hint">${c.hint || ""}</div>
      </div>`
      )
      .join("");
  }

  function renderRecent(items) {
    const body = $("recent");
    if (!items.length) {
      body.innerHTML = `<tr><td colspan="9" style="color:var(--muted)">No events. Run telemetry:backfill.</td></tr>`;
      return;
    }
    body.innerHTML = items
      .slice()
      .reverse()
      .map((e) => {
        const t = (e.ts || "").replace("T", " ").replace(/\.\d+Z$/, "Z");
        const ms = e.source === "backfill" ? "—" : e.latency_ms?.total ?? "—";
        return `<tr>
          <td>${t}</td>
          <td>${e.source || "live"}</td>
          <td>${e.quality?.confidence_score ?? "—"}</td>
          <td>${e.quality?.llm_facts_count ?? "—"}</td>
          <td>${e.duplex?.source ?? "—"}</td>
          <td class="${e.duplex?.correction_fired ? "warn" : ""}">${e.duplex?.correction_fired ? "yes" : "no"}</td>
          <td>${e.memory_write?.action ?? "—"}</td>
          <td>${ms}</td>
          <td><code>${(e.preflight_id || "").slice(0, 22)}</code></td>
        </tr>`;
      })
      .join("");
  }

  function renderCharts(narrative) {
    if (typeof Chart === "undefined") return;
    const sp = narrative.serendipity_parroting || {};
    destroyChart("ratio");
    charts.ratio = new Chart($("chartRatio"), {
      type: "bar",
      data: {
        labels: ["Initiate+Serendipity", "Receive+Parroting", "Initiate", "Receive", "Rest", "Serendipity", "Parroting"],
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
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8b9bb4", maxRotation: 45 }, grid: { color: "#2a3548" } },
          y: { beginAtZero: true, ticks: { color: "#8b9bb4" }, grid: { color: "#2a3548" } }
        }
      }
    });

    const streakSeries = narrative.location?.streak_series || [];
    const threshold = narrative.location?.threshold ?? 15;
    destroyChart("pacing");
    charts.pacing = new Chart($("chartPacing"), {
      type: "line",
      data: {
        labels: streakSeries.map((p) => (p.ts || "").slice(11, 16)),
        datasets: [
          {
            label: "streak",
            data: streakSeries.map((p) => p.streak),
            borderColor: "#5b9fd4",
            tension: 0.2,
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
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#8b9bb4" } } },
        scales: {
          x: { ticks: { color: "#8b9bb4" }, grid: { color: "#2a3548" } },
          y: { beginAtZero: true, ticks: { color: "#8b9bb4" }, grid: { color: "#2a3548" } }
        }
      }
    });

    const toolCounts = narrative.tools?.counts || {};
    const toolLabels = Object.keys(toolCounts);
    const toolData = toolLabels.map((k) => toolCounts[k] || 0);
    destroyChart("tools");
    charts.tools = new Chart($("chartTools"), {
      type: "pie",
      data: {
        labels: toolLabels.map((k) =>
          (toolCounts[k] || 0) === 0 ? `${k} (0%)` : k
        ),
        datasets: [
          {
            data: toolData.map((n) => (n === 0 ? 0.001 : n)),
            backgroundColor: ["#5b9fd4", "#3d9a6a", "#c9a227", "#c45c5c", "#8b9bb4"]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#8b9bb4", boxWidth: 10, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label(ctx) {
                const i = ctx.dataIndex;
                const real = toolData[i] || 0;
                return `${toolLabels[i]}: ${real}`;
              }
            }
          }
        }
      }
    });

    const byKind = narrative.corrections?.by_kind || {};
    const kindLabels = Object.keys(byKind).filter((k) => k !== "none");
    destroyChart("corrections");
    charts.corrections = new Chart($("chartCorrections"), {
      type: "doughnut",
      data: {
        labels: kindLabels,
        datasets: [
          {
            data: kindLabels.map((k) => byKind[k] || 0),
            backgroundColor: ["#c45c5c", "#c9a227", "#5b9fd4", "#8b9bb4", "#3d9a6a"]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#8b9bb4", boxWidth: 10, font: { size: 10 } } }
        }
      }
    });
  }

  async function loadLorePacks() {
    const data = await getJson("/control/lore-packs");
    const sel = $("lorePack");
    const current = sel.value;
    sel.innerHTML = (data.packs || [])
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`)
      .join("");
    if (current) sel.value = current;
  }

  async function loadControlIntoForm() {
    const state = await getJson("/control/state");
    $("sceneMode").value = state.sceneMode || "default";
    $("lorePack").value = state.lorePack || "none";
    $("controlStatus").textContent = state.updatedAt
      ? `last applied ${state.updatedAt.replace("T", " ").replace(/\.\d+Z$/, "Z")}`
      : "";
    return state;
  }

  async function applyControl() {
    $("controlStatus").textContent = "Saving…";
    try {
      const next = await postJson("/control/state", {
        sceneMode: $("sceneMode").value,
        lorePack: $("lorePack").value
      });
      $("controlStatus").textContent = `applied ${next.updatedAt?.replace("T", " ").replace(/\.\d+Z$/, "Z") || "ok"}`;
      await load();
    } catch (err) {
      $("controlStatus").textContent = "error";
      $("error").textContent = String(err.message || err);
    }
  }

  async function load() {
    $("error").textContent = "";
    $("status").textContent = "Loading…";
    const days = $("days").value;
    try {
      const t0 = performance.now();
      const [health, summary, recent, narrative, control] = await Promise.all([
        getJson("/telemetry/api/health"),
        getJson(`/telemetry/api/summary?days=${days}`),
        getJson(`/telemetry/api/recent?limit=25&days=${days}`),
        getJson(`/telemetry/api/narrative?days=${days}`),
        getJson("/control/state")
      ]);
      const ms = Math.round(performance.now() - t0);
      $("sceneMode").value = control.sceneMode || "default";
      $("lorePack").value = control.lorePack || "none";
      renderStatus(control, narrative);
      renderCards(summary);
      renderCharts(narrative);
      renderRecent(recent.events || []);
      $("status").textContent = `ok · ${summary.event_count} events in ops window · load ${ms} ms · last ops event ${health.last_event_ts || "—"}`;
    } catch (err) {
      $("status").textContent = "error";
      $("error").textContent = String(err.message || err);
    }
  }

  $("refresh").addEventListener("click", load);
  $("days").addEventListener("change", load);
  $("applyControl").addEventListener("click", applyControl);

  loadLorePacks()
    .then(() => loadControlIntoForm())
    .then(() => load())
    .catch((err) => {
      $("status").textContent = "error";
      $("error").textContent = String(err.message || err);
    });

  setInterval(load, 30000);
})();

/* global fetch, document */
(function () {
  const $ = (id) => document.getElementById(id);

  function pct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return `${Math.round(n * 1000) / 10}%`;
  }

  function num(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return String(n);
  }

  function authHeaders() {
    // Optional: set window.GUARDIAN_BEARER if token required
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

  async function load() {
    $("error").textContent = "";
    $("status").textContent = "Loading…";
    const days = $("days").value;
    try {
      const t0 = performance.now();
      const [health, summary, recent] = await Promise.all([
        getJson("/telemetry/api/health"),
        getJson(`/telemetry/api/summary?days=${days}`),
        getJson(`/telemetry/api/recent?limit=25&days=${days}`)
      ]);
      const ms = Math.round(performance.now() - t0);
      renderCards(summary);
      renderRecent(recent.events || []);
      $("status").textContent = `ok · ${summary.event_count} events · load ${ms} ms · last ${health.last_event_ts || "—"}`;
    } catch (err) {
      $("status").textContent = "error";
      $("error").textContent = String(err.message || err);
    }
  }

  $("refresh").addEventListener("click", load);
  $("days").addEventListener("change", load);
  load();
})();

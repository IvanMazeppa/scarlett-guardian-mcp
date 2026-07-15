# Guardian Telemetry & Analytics Dashboard — Design

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent) — requested by Gemini 3.1 Pro  
**Companions (this folder):** `guardian-eval-harness-design-2026-07.md` (scorecard metrics overlap), `guardian-report-quality-audit-2026-07.md` (what to measure), `guardian-dramaturg-design-2026-07.md`, `guardian-writeback-recency-serendipity-roadmap-2026-07.md`, `executor-preferences-grok-build-2026-07.md`  
**Executor:** Grok 4.5 (Agentic Coder)  
**Problem:** As Dramaturg, Serendipity 2.0, compression, NPC state, and duplex land, system complexity outgrows manual JSON inspection. The operator needs a **local, always-on view** of health and quality trends — without slowing preflight or requiring external SaaS.

---

## 1. Design goals

| Goal | Constraint |
|------|------------|
| See health at a glance | One browser tab on `localhost:8790/dashboard` |
| Trend over time | Last N sessions / last 7 days, not just the latest report |
| Hot path untouched | Preflight latency budget is sacred; telemetry must not block or fail the turn |
| Build on what exists | `docs/guardian-reports/preflight-full-*.json` already captures rich detail; dashboard **indexes** it rather than duplicating all fields inline |
| Grow with features | Metric schema is extensible (dramaturg, serendipity tiers, chunk sizes) without redesign |
| Local only | No third-party analytics; optional bearer on dashboard routes like `/mcp` |

Non-goals for v1: real-time alerting, multi-user auth, cloud export, replacing the eval harness (dashboard = **operational observability**; eval = **regression gates**).

---

## 2. Architecture — three layers, one hot-path rule

```text
                    HOT PATH (preflight)
                           │
                           │  fire-and-forget (never await)
                           ▼
              ┌────────────────────────────┐
              │  TelemetryEmitter        │
              │  append 1 NDJSON line    │
              │  ~200–800 bytes/turn     │
              └────────────┬─────────────┘
                           │
         .guardian/telemetry/events-YYYY-MM-DD.ndjson
                           │
              ┌────────────▼─────────────┐
              │  Indexer (on read)       │
              │  + optional rollup cache │
              └────────────┬─────────────┘
                           │
              GET /dashboard  (static UI)
              GET /telemetry/api/summary
              GET /telemetry/api/series?metric=...
```

**The hot-path rule:** record metrics in memory during the preflight (timestamps already logged today); at the **end** of `runGuardianPreflight`, call `telemetry.record(event)` which **queues** an append and returns immediately. The append runs via `setImmediate` / unawaited `fs.promises.appendFile` with swallowed errors. If disk is full or permissions fail, preflight still succeeds — telemetry is best-effort observability, not correctness.

**Do not** parse full reports or run aggregations inside preflight. **Do not** add synchronous manifest/index queries to the hot path for chunk-size metrics — derive chunk stats from the **already-returned** `tool_calls` payloads or from a **background** indexer triggered after preflight completes.

---

## 3. Event schema (one line per preflight)

**NEW** `.guardian/telemetry/schema-v1.json` (documentation) + TypeScript type `PreflightTelemetryEvent`:

```ts
{
  v: 1,
  ts: "2026-07-15T02:51:26.420Z",
  preflight_id: "2026-07-15T02-51-26-420Z",   // matches report filename stem
  report_path: "docs/guardian-reports/preflight-full-....json",

  // Latency (ms) — measured in-process, high resolution
  latency_ms: {
    total: 8420,
    rag: { index_status: 120, retrieve: 890, search: [410, 380], expand: 0, verify: 0 },
    llm_assessment: 3200,
    compile_brief: 4
  },

  // Quality signals (denormalized for fast charts — full detail stays in report JSON)
  quality: {
    confidence_score: 88,
    proceed_recommendation: "proceed",
    retrieval_status: "success",
    llm_facts_count: 5,
    scene_delta_present: true,
    brief_chars: 3910,
    meta_pollution: false          // scene summary contains RAG coaching dialect
  },

  // Duplex
  duplex: {
    source: "caller" | "bridge_cache" | "absent",   // when bridge lands
    previous_message_chars: 1840,
    correction_fired: false
  },

  // Serendipity (v1: nudge present; v2: tier + category)
  serendipity: {
    fired: false,
    tier: null | "ambient" | "peripheral" | "engaging" | "disruptive",
    category: null | string,
    deferred: false
  },

  // Dramaturg (when landed)
  dramaturg: {
    arc_slug: "arc-09-nurburgring-track-day",
    live_beat_index: 3,
    beats_total: 4,
    momentum_hash: "a3f9…"          // hash of momentum line — detect shifts without storing prose
  },

  // Memory / corpus (from tool responses, not extra RAG calls)
  memory: {
    preflight_result_count: 6,
    search_result_counts: [10, 6],
    max_chunk_chars: 2840,           // max len(results[].text) returned this turn
    avg_chunk_chars: 1120,
    expand_sections: 0
  },

  // Write-back
  memory_write: { action: "none" | "staged" | "live_append" | "failed", reason_short: "…" },

  // Flags for drill-down
  hard_flags_count: 3,
  triggers: ["AMG, Black Panther, …"]
}
```

**Link to full report:** dashboard drill-down opens or fetches the existing `preflight-full-*.json` by `preflight_id` — no duplicate storage of tool payloads.

**Backfill path:** **NEW** `scripts/backfill-telemetry.ts` scans `docs/guardian-reports/preflight-full-*.json` and emits historical NDJSON lines (one-time + nightly optional). This gives trends **immediately** without waiting for new code to accumulate data.

---

## 4. Where to instrument (file-by-file)

| Location | What to record | Hot-path cost |
|----------|----------------|---------------|
| `src/guardian/rag-client.ts` | Wrap `callJsonTool` / `callTextTool`: `performance.now()` per tool name | In-memory only; ~microseconds |
| `src/guardian/tools/preflight.ts` | Phase markers: rag batch, expand/verify budgets, llm start/end; assemble `PreflightTelemetryEvent` at return | One `telemetry.record()` call, non-blocking |
| `src/guardian/server.ts` | After report save: pass `report_path` + `preflight_id` into event; mount dashboard routes | Async after response sent for MCP (see §5) |
| `src/guardian/report/compile-grok-brief.ts` | Optional: `meta_pollution` detector reused from eval harness patterns | Runs anyway during brief compile |
| Future: `dramaturg.ts`, `serendipity-weaver.ts` | Populate dramaturg/serendipity blocks when those modules exist | Same record call |

**RagMcpClient timing** is the highest-value instrumentation: the audit showed retrieval dominates latency; per-tool ms in the dashboard answers "is expand/verify worth it?" without reading logs.

---

## 5. MCP vs `/preflight` — when telemetry fires

| Entry point | When to emit |
|-------------|--------------|
| `POST /preflight` | After `res.json(report)` — record in `finally` so failures also emit partial events |
| MCP `guardian_memory_preflight` | After tool handler returns; **do not delay** the MCP response — queue telemetry after `return` payload is built (same tick via `setImmediate`) |

Saved reports (`preflight-full-*.json`) remain the audit trail; telemetry is the **time-series index** over them.

---

## 6. Dashboard UI — lightweight, no build step

Serve from Guardian on the same port (8790):

| Route | Purpose |
|-------|---------|
| `GET /dashboard` | Single-page HTML (vanilla JS + Chart.js from CDN or vendored under `public/`) |
| `GET /telemetry/api/health` | `{ ok, last_event_ts, events_today, reports_dir_count }` |
| `GET /telemetry/api/summary?days=7` | Aggregates for cards |
| `GET /telemetry/api/series?metric=latency.total&days=7` | Time series for charts |
| `GET /telemetry/api/recent?limit=20` | Last N events with sparkline fields + link to full JSON |

**Auth:** reuse `requireGuardianAuth` when `GUARDIAN_MCP_BEARER_TOKEN` is set; dashboard is localhost-trusted when token unset (same as today).

### v1 panels (maps to Gemini's ask)

1. **Preflight latency** — p50/p95 total ms; stacked bar: RAG vs LLM vs rest; per-tool RAG breakdown.  
2. **Director's Correction rate** — % turns with `correction_fired`; duplex present vs absent stacked.  
3. **Serendipity** — when v1: fire rate; when v2: tier distribution pie + deferral count.  
4. **Dramaturg momentum** — timeline of `live_beat_index` / `momentum_hash` changes per arc (detect stagnation or skips).  
5. **Memory chunk sizes** — max/avg chunk chars per turn; alert band when max > 4000 (monolith warning from compression roadmap).  
6. **Quality strip** — meta_pollution rate, avg facts count, brief_chars trend (feeds same numbers as eval harness scorecard).

**Drill-down:** click a point → open streamlined `.md` + full `.json` paths (file links or inline fetch if same origin).

No React, no Vite — one `public/dashboard.html` + `public/dashboard.js` keeps Grok's "one P0 row per session" rule achievable.

---

## 7. Aggregation strategy (read path, not hot path)

On first dashboard load (or every 60s if UI polls):

1. Read last 7 days of `events-*.ndjson` (typically small: ~50–200 lines/day at one preflight per turn).  
2. Compute rollups in memory — no SQLite required for v1.  
3. Optional **rollup cache** file `.guardian/telemetry/rollup-7d.json` written by the same background job that runs on dashboard open; invalidated when today's NDJSON mtime changes.

If event volume grows (automated eval runs), add **daily rollup files** (`rollup-2026-07-15.json`) appended by a cron or `npm run telemetry:rollup`.

**Chunk-size manifest metrics** (index health: sections per file, store/manifest mismatch) belong on a **separate panel** fed by:

- RAG `index_status` text already returned in preflight (parse once per event from `tool_calls`), and/or  
- **Background job** `npm run telemetry:index-snapshot` (reads manifest, never in hot path).

This satisfies "memory chunk sizes" without an extra RAG call per turn.

---

## 8. Relationship to eval harness

| Concern | Eval harness | Dashboard |
|---------|--------------|-----------|
| Purpose | Regression gate before merge | Operator situational awareness during play |
| Data | Golden cases + baselines | Live preflight stream + backfill |
| Metrics overlap | meta_pollution, facts count, duplex | Same fields, live trends |
| Failure mode | Exit code non-zero | Red card on UI, RP continues |

When eval harness lands, add a dashboard panel **"Last eval:fast"** populated by reading the latest `evals/runs/*-scorecard.json` — no duplicate eval logic.

---

## 9. Roadmap

### P0 — Observable without new features (1 session)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | `telemetry.ts`: event type, in-memory timers, async NDJSON append | `src/guardian/telemetry.ts` | **done** (WP-1.6) |
| 2 | Instrument `rag-client.ts` + end of `runGuardianPreflight` | edit | **done** (WP-1.6) |
| 3 | `backfill-telemetry.ts` from existing `guardian-reports/` | NEW script | **next** (WP-1.7) |
| 4 | `GET /telemetry/api/summary` + minimal `/dashboard` (latency + duplex + facts cards) | `server.ts`, `public/` | **next** (WP-1.7) |
| 5 | Document: run backfill once; open dashboard during RP | ops | with 1.7 |

### P1 — Full panel set + rollups

| # | Task |
|---|------|
| 6 | Serendipity + dramaturg fields when those modules ship |
| 7 | Chunk size + meta_pollution trends; link to full JSON |
| 8 | `rollup-7d.json` cache; optional `npm run telemetry:rollup` |
| 9 | Index snapshot job (manifest section counts, store ID mismatch flag) |

### P2 — Integration

| # | Task |
|---|------|
| 10 | Eval scorecard panel |
| 11 | Duplex `bridge_cache` source dimension when shadow sidecar lands |
| 12 | Export CSV for a date range (offline analysis) |

---

## 10. Acceptance criteria

- Preflight p95 latency increases by **< 5 ms** vs baseline with telemetry enabled (measure 20 live preflights).  
- Telemetry write failure never causes preflight HTTP/MCP error.  
- Dashboard loads in < 2 s on 7 days of data after backfill over existing 142+ reports.  
- Operator can answer in 10 seconds: "Are corrections firing?", "Is latency creeping up?", "Are chunks getting huge?" without opening raw JSON.  
- Duplex present-rate and correction-rate match manual counts on a 10-report spot-check.

---

## 11. One-line summary

**Append one small NDJSON event per preflight off the hot path, backfill history from saved reports, and serve a zero-build local dashboard on :8790 that charts latency, duplex corrections, serendipity tiers, dramaturg beat shifts, and chunk-size warnings — so system complexity becomes visible instead of buried in JSON.**

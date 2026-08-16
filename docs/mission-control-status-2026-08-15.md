# Mission Control — Status & Feedback Request

**Date:** 2026-08-15  
**Repo:** `scarlett-guardian-mcp`  
**Companion:** `rag-memory-mcp` (local only; not publicly tunneled)  
**Remote domain:** `https://scarlett-guardian.ngrok.app`

This document records what the Mission Control upgrade has achieved so far, what is unfinished, what should be added next, and where operator feedback is needed before further work.

---

## 1. Goal (reminder)

Evolve the bare telemetry page into a remote **Mission Control** dashboard that:

1. Uses Hobbyist ngrok (static domain + path-scoped edge auth).
2. Visualizes narrative-health metrics (not only latency/chunks).
3. Lets the operator **steer** the next Grok turn via Scene Modes / Targeted Lore without typing OOC.
4. Never confuses **story time** with **wall-clock / real-world today**.

Hard constraint (from June incident + Hobbyist design): edge Basic Auth on `/dashboard`, `/telemetry`, `/control` only — **never** on `/mcp`, `/preflight`, `/duplex-cache`, or `/health`.

---

## 2. Achieved so far

### 2.1 Ngrok Hobbyist infrastructure

| Item | Status |
|------|--------|
| Static domain reserved | Done — `scarlett-guardian.ngrok.app` |
| `NGROK_STATIC_DOMAIN` in local `.env` | Done |
| Traffic Policy example + local credentials file | Done — `ngrok/traffic-policy.example.yml`, gitignored `traffic-policy.local.yml` |
| `npm run tunnel` / `scripts/start-ngrok.sh` | Done |
| Path-scoped Basic Auth (Mission Control only) | Done — verified: `/health`+`/mcp` = 200 unauthenticated; `/dashboard` = 401 without creds |
| Setup doc | Done — [`docs/mission-control-ngrok.md`](mission-control-ngrok.md) |
| Remote-flow handoff updated | Partial — Hobbyist tunnel section rewritten |

### 2.2 Browser bridge

| Item | Status |
|------|--------|
| Bridge bumped to v2.2.0 | Done — `scripts/guardian-browser-bridge.user.js` |
| Menu: “use Mission Control domain…” / “use local 8790” | Done |
| `/duplex-cache` left off edge auth | Done (by design) |
| Stale `tests/` copy marked do-not-install | Done |

### 2.3 Scene Modes + Targeted Lore (active control)

| Item | Status |
|------|--------|
| Sidecar `.guardian/mission-control-state.json` | Done |
| `GET` / `POST /control/state` | Done |
| `GET /control/lore-packs` | Done |
| Modes: EXPLICIT/SLOW-BURN, TACTICAL, BANTER → essential brief block | Done — `compile-grok-brief.ts` (survives truncation) |
| Targeted lore packs → extra `search_story_memory` with exact `source_files` | Done — `lore-packs.ts` (prioritize, not isolate live-state) |
| Eval isolation (hermetic runs ignore live overrides) | Done |
| Unit tests | Done — `tests/mission-control.test.ts`; `npm test` + `eval:fast` green at ship |

### 2.4 Narrative telemetry + charts + React UI

| Item | Status |
|------|--------|
| Intention classifier (`initiate` / `receive` / `rest` / `unknown`) | Done |
| Correction taxonomy (`cis_wash`, `parroting`, `location_rewind`, `ensemble`, …) | Done |
| Real serendipity tier/category/deferred on NDJSON (was hardcoded null) | Done |
| Location streak sidecar + stagnation hard-flag (15 / 25 in slow-burn) | Done |
| `tools_invoked` + RAG tool pie data | Done |
| `GET /telemetry/api/narrative` | Done |
| Dashboard UI | Done — React SPA in `dashboard-ui/` → `public/dashboard-app` (steering, save-lag, parroting, tools, triggers, latency, narrative charts) |
| Chart.js canvases (ratio, pacing, tools, corrections) | Done (React) |
| Static-file auth leak fixed (`/dashboard` + assets only via auth) | Done |

### 2.5 Story time vs wall-clock (critical clarification)

| Item | Status |
|------|--------|
| Dashboard warning: story time ≠ real time | Done |
| Ops window labeled as wall-clock (not story date) | Done |
| Status card: **Story time (LIVE BEAT)** from `current-state.md` | Done — `live-beat-snapshot.ts` + `/control/state.live_beat` |
| Event table labeled as ops timestamps | Done |
| Rule documented in `docs/mission-control-ngrok.md` | Done |

**Non-negotiable product rule (confirmed by operator):** narrative calendar is LIVE BEAT / `current-state.md` only. It may skip, hold, or run several days in a row. It must never be tied to the PC’s “today.”

### 2.6 Validation already run

- `npm test` — green (including Mission Control tests)
- `npm run eval:fast` — 38/38 at ship
- Remote smoke: health/mcp open; dashboard/telemetry/control challenged
- Local Mission Control APIs respond

---

## 3. Unfinished / known gaps

### 3.1 Canon save-lag (high priority)

At last check, **disk LIVE BEAT** still said approximately:

> Monday morning, Mid/Late October 2026 — Private Aviation Terminal / Gulfstream boarding

Operator reports **play** is:

> Monday **2 November 2026** (≈ one month from first-meeting anniversary)

Until `rag-memory-mcp/project_source_files/current-state.md` (and usually a reindex) matches play, Guardian will keep grounding on the older stamp. Mission Control now *displays* disk story time honestly — it does not invent November.

**Status:** not fixed in canon files pending operator go-ahead on exact LIVE BEAT wording.

### 3.2 Dual ngrok sessions

A second `ngrok http 8790` (old free host `deceiving-pummel-ajar.ngrok-free.dev`) was observed alongside the Hobbyist tunnel. It should stay killed so Grok/bridge only use `scarlett-guardian.ngrok.app`.

**Status:** operational hygiene; re-check whenever tunnels feel “weird.”

### 3.3 Client config still operator-owned

These were verified on the server side; full end-to-end depends on the operator:

- Grok connector URL = `https://scarlett-guardian.ngrok.app/mcp`
- Tampermonkey base URL = `https://scarlett-guardian.ngrok.app` (v2.2 script installed)
- Browser login to `/dashboard` with Basic Auth
- One live preflight after applying BANTER (or another mode) and confirming `SCENE MODE (ACTIVE): …` in `preflight-streamlined-*.md`

Repo example `.agents/mcp_config.json` was pointed at the new domain; Grok’s UI config is separate.

### 3.4 Telemetry richness for older NDJSON

Charts work on historical events, but fields like `intention`, `correction_kind`, `location_streak`, and real serendipity metadata are **additive**. Pre-upgrade lines show as unknown/none until new live preflights accumulate.

### 3.5 Location streak pollution risk

Hermetic eval isolation avoids writing live sidecars; a polluted streak line was seen earlier from non-isolated runs. Worth a one-shot clear of `.guardian/location-progress-state.json` after canon is corrected if the gauge looks nonsense.

### 3.6 Plan backlog items not built (v1 out of scope)

Explicitly deferred from the original plan:

- One-shot Director Note (single-turn essential brief, then auto-clear)
- Serendipity throttle UI (Off / Ambient-only / Normal / Force-next)
- Hold vs Advance pacing control
- Memory write mode switcher (`stage` / `live` / `off`) from the panel
- Staged-update inbox (approve/reject from phone)
- Wardrobe lock / roulette controls
- SSE / live push (currently 30s poll)
- Google OAuth instead of Basic Auth
- Correction taxonomy **timeline** chart (kinds exist; richer time series UI not done)
- Verbosity sparkline, dramaturg stale-plan badge, RAG lane-mix chart
- Dashboard rate-limit at ngrok edge

---

## 4. What else should be added (recommended next)

Ordered by leverage for continuous hyper-realistic RP:

1. **Canon sync** — Update `current-state.md` (+ event-log touch if needed) to Monday 2 November 2026 and reindex so LIVE BEAT matches play.
2. **Director Note** — Highest-leverage steering after Modes; replaces most OOC typing.
3. **Hold / Advance** — Pair with the stagnation gauge so “15 turns here” is a signal you can answer with a control, not a forced move.
4. **Serendipity throttle** — Expose weaver caps already in code.
5. **Staged write inbox** — Phone-friendly approve/reject for `GUARDIAN_MEMORY_WRITE_MODE=stage`.
6. **Clearer ops vs story UX** — Optional second clock on every chart tooltip: “ops ts” only; never imply story date.
7. **Kill-switch checklist** in daily run guide — one page: RAG / Guardian / `npm run tunnel` / Grok URL / bridge URL / no second ngrok.

---

## 5. Requests for feedback

Please answer as briefly as you like (bullet replies are fine):

### A. Story clock / canon

1. Confirm the **exact** LIVE BEAT story stamp you want on disk (e.g. `Monday, 2 November 2026 — …`).
2. Is location still Private Aviation Terminal / Gulfstream boarding → Munich, or has play moved?
3. Should Guardian auto-warn louder on Mission Control when disk story time looks stale vs recent preflight prose (heuristic), or keep it manual?

### B. Modes

4. Are EXPLICIT / SLOW-BURN, TACTICAL, and BANTER wordings strong enough in the brief, too weak, or too preachy?
5. Any additional modes you want in v1.1 (e.g. AFTERCARE, PUBLIC FACE, FAMILY THREAD)?
6. Targeted lore packs: is the current list (`europe-arm`, thread-01/02/03/05, letters) enough, or do you need Affalterbach / wardrobe / letters-only variants?

### C. Dashboard

7. Which chart is most useful so far, and which feels noise?
8. Is Basic Auth good enough for phone access, or do you want Google OAuth next?
9. Prefer more **steering controls** next, or more **health metrics**?

### D. Ops

10. Did you kill the second/old ngrok tunnel and point Grok + Tampermonkey only at `scarlett-guardian.ngrok.app`?
11. After applying a mode, did a live streamlined brief show `SCENE MODE (ACTIVE): …`?

### E. Scope discipline

12. Anything in the deferred backlog you want **blocked** (do not build)?
13. Anything not listed that is now higher priority than Director Note?

---

## 6. Quick reference — daily run

```bash
# Terminal A
cd rag-memory-mcp && npm run dev

# Terminal B
cd scarlett-guardian-mcp && npm run dev

# Terminal C
cd scarlett-guardian-mcp && npm run tunnel
```

- Mission Control: `https://scarlett-guardian.ngrok.app/dashboard` (Basic Auth)
- Grok MCP: `https://scarlett-guardian.ngrok.app/mcp` (no edge auth)
- Bridge base URL: `https://scarlett-guardian.ngrok.app`
- Local UI: `http://127.0.0.1:8790/dashboard`

---

## 7. Key files

| Area | Path |
|------|------|
| Dashboard UI | `dashboard-ui/` (source), `public/dashboard-app/` (build), legacy `public/dashboard.html` + `dashboard.js` fallback |
| HTTP + control + telemetry routes | `src/guardian/server.ts` |
| Modes / state | `src/guardian/mission-control.ts` |
| Lore packs | `src/guardian/lore-packs.ts` |
| Story clock snapshot | `src/guardian/live-beat-snapshot.ts` |
| Location streak | `src/guardian/location-progress.ts` |
| Brief injection | `src/guardian/report/compile-grok-brief.ts` |
| Preflight wiring | `src/guardian/tools/preflight.ts` |
| Telemetry + narrative aggregate | `src/guardian/telemetry.ts`, `telemetry-aggregate.ts` |
| Tunnel | `ngrok/`, `scripts/start-ngrok.sh` |
| Bridge | `scripts/guardian-browser-bridge.user.js` |
| This status doc | `docs/mission-control-status-2026-08-15.md` |

---

*End of status. Feedback on §5 unlocks the next implementation slice.*

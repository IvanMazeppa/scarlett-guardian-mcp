# WP-5.3 — Dramaturg LLM pass + cache + background refresh

**Date:** 2026-07-18  
**Repo:** Guardian (`feature/phase5-dramaturg`)  
**Status:** done  
**Depends on:** WP-5.2 (deterministic momentum)

## Ticket

`runDramaturgPass` LLM call + disk cache + scene-transition / staleness / plan-change triggers.  
**Acceptance:** hot path stays **one** LLM call per turn (auditor only); dramaturg never adds turn latency.

## Design (D7 §3.1)

| Cadence | When | Latency |
|---------|------|---------|
| **Hot path** | Every preflight | Deterministic diff + optional **cached** LLM momentum. No dramaturg await. |
| **Dramaturg pass** | After assess, if triggered | Fire-and-forget terra call; writes `.guardian/dramaturg-context.json` for **next** turn |

## Delivered

| Item | Detail |
|------|--------|
| `runDramaturgPass` | Structured JSON schema: beats, momentum_line, npc_intersections, plan_warnings (pressure-only) |
| Cache | `.guardian/dramaturg-context.json` (turnCounter + context + planHash) |
| `resolveHotPathDramaturg` | Prefer LLM cache when planHash matches; else deterministic |
| `shouldRefreshDramaturg` | Triggers: `no_cache`, `plan_changed`, `scene_transition`, `staleness` (≥12 turns) |
| `scheduleDramaturgRefresh` | In-flight coalesce; never awaited from preflight |
| Config | `GUARDIAN_DRAMATURG_ENABLED` (default true), `STALENESS_TURNS=12`, `REASONING_EFFORT=medium` |
| Outcome guard | Normalize rejects momentum containing crude outcome language → fall back to mechanical line |
| Eval safety | Skip schedule when `frozenLlmAssessment` or `disableTelemetry` |

## Acceptance

- `npm test` green; `eval:fast` **31/31**  
- Hermetic tests cover refresh triggers, cache preference, outcome-momentum reject  
- Production: first live preflight with LLM may log `Dramaturg refresh scheduled (reason=no_cache)`; **same turn** brief still uses deterministic line; **next** turn can show `llm_cache` source in auditor STORY MOMENTUM block

## Out of scope

- WP-5.4: author `npc-agendas.md` + wire intersections into serendipity weaver  
- WP-5.5: `scarlett_next_intention` / `resonance_echo` on turn auditor  

## Verify

```bash
npm run build && npm test && npm run eval:fast
# After restart, one live preflight — check logs for "Dramaturg refresh scheduled"
# Optional: cat .guardian/dramaturg-context.json after background pass completes
```

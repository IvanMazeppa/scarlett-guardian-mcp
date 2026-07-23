# Ops trio — save-lag, quiet private brief, echo/save-lag telemetry

**Date:** 2026-07-23  
**Branch:** `feature/suite-npc-canon-2026-07-23`  
**Scope:** Guardian code only (no corpus reindex required)

## Why

1. **Save lag** — multi-scene play can outrun disk `current-state.md`. Auditor + Director correction were treating stale LIVE BEAT (cabin/paddock) as ground truth and pulling prose back from suite/shower already established in IC.
2. **Quiet private brief** — couple-only suite/aftercare still got Story Momentum + Scene Cast pressure (board/Shevchenko/arc), which read like a board meeting during intimacy.
3. **Telemetry** — no turn-level visibility into warmth `resonance_echo` rate or save-lag frequency.

## Changes

| Item | Files | Behavior |
|------|--------|----------|
| Save-lag detect | `src/guardian/save-lag.ts` | Cluster tokens: cabin vs paddock vs suite/hotel vs road. Suspected when played consensus score ≥2 and LIVE BEAT score ≥1 and clusters differ. |
| Soften rewinds | `save-lag.ts` + `preflight.ts` | Location-rewind corrections replaced with operator SAVE LAG note; `should_block_prose` cleared for that path. Hard flag `SAVE_LAG_SUSPECTED`. |
| Auditor | `llm-assessment.ts` | System SAVE LAG instruction + user `### SAVE LAG FLAG` when suspected. |
| Couple-only roster | `scene-roster.ts` | `isCoupleOnlyPresent`; suppresses arc-cast / location-cue activation and background crowd. User-addressed NPCs still activate. |
| Quiet brief | `compile-grok-brief.ts` + report `story_momentum` | Omits Story Momentum + Scene Cast when couple-only private. Echo still allowed. |
| Telemetry | `telemetry.ts`, `telemetry-aggregate.ts` | Per-event `resonance_echo.present`, `save_lag.suspected`; summary rates `present_rate` / `suspected_rate`. |

## Operator

- **Restart Guardian only** after deploy (code path). No reindex for these ops.
- When you see `SAVE_LAG_SUSPECTED` in hard flags / logs: update `project_source_files/current-state.md` (and event-log if needed), then reindex so disk matches play.
- Dashboard: watch `resonance_echo.present_rate` (warmth) and `save_lag.suspected_rate` (ops hygiene).

## Validation

```bash
cd scarlett-guardian-mcp
npm run build
npm test
npm run eval:fast
```

Hermetic: `tests/save-lag-quiet-echo.test.ts`.

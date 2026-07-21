# WP-R3 — Live / eval isolation evidence

**Date:** 2026-07-21  
**Branch:** `feature/post-wp59-affalterbach`

## Implemented

### Telemetry source tag
- `PreflightTelemetryEvent.source`: `live` | `backfill` | `eval`
- Live preflight defaults `source: "live"`
- Hermetic isolation tags `eval` if emit is enabled

### Dashboard summary default
- `GET /telemetry/api/summary` defaults to **live-only**
- Override: `?sources=all` or `?sources=live,eval`

### Sidecar isolation
- When `disableTelemetry`, `isolateSidecars`, or frozen hermetic path:
  - `runSerendipityTurn({ persist: false })` — no write to `.guardian/serendipity-state.json`
  - `persist: false` no longer mutates process-global serendipity `memoryCache`
  - `resolveHotPathDramaturg({ bumpTurn: false })` — no dramaturg turnCounter bump on disk

### Tests
- `tests/sidecar-isolation.test.ts` — three hermetic preflights leave serendipity/dramaturg sidecars unchanged
- `tests/telemetry-aggregate.test.ts` — documents live-only default

## Verification

```bash
npm test && npm run build && npm run eval:fast
# eval:fast → 36/36
```

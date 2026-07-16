# WP-2.7 evidence — event-log rotation — 2026-07-16

**Status:** done  
**Owner:** Grok Build (RAG)  
**Roadmap:** D5 §3.3–3.5 / master WP-2.7

## Delivered

| Piece | Location |
|-------|----------|
| Rotation planner + executor | `rag-memory-mcp/src/rotation.ts` |
| MCP tool `rotate_event_log` | `rag-memory-mcp/src/server.ts` (default `dry_run: true`) |
| Auto-trigger after event-log write | same file, inside `performApprovedStoryUpdate` when `EVENT_LOG_AUTO_ROTATE` |
| Env | `EVENT_LOG_RETAIN_SESSIONS` (6), `EVENT_LOG_ROTATE_HYSTERESIS` (2), `EVENT_LOG_ROTATE_MAX_CHARS` (12000), `EVENT_LOG_DEFAULT_ARC_SLUG`, `EVENT_LOG_AUTO_ROTATE` |
| Source roles | `arc_chronicle` (priority 75, path `arc-chronicles/`); `historical/arc-*` → `historical_narrative` |
| Tests | `npm run test:rotation` → `scripts/test-rotation.ts` |

## Acceptance

| Criterion | Result |
|-----------|--------|
| Verbatim invariant (rotated + retained bodies == original session bodies) | Pass |
| Dry-run plan on live `event-log.md` | 3 sessions; auto **not** needed; forced retain=1 peels 2 older story sessions |
| `arc_chronicle` / `historical_narrative` profiles | Pass |
| No live rotation applied to production event-log in this WP | Intentional — only dry plan + temp-dir execute |

## Live dry plan snapshot (2026-07-16)

- Sessions: 3 (Villa suite, Nordschleife out lap, WP-2.5 ceremony proof)
- Auto threshold: retain 6 + hysteresis 2 → **no auto-rotate**
- Forced `retain_sessions=1` would move the two story sessions into `arc-chronicles/arc-09-germany-trip.md` and keep the ceremony session hot (operator choice later; **not** run for real)

## Operator notes

```bash
cd rag-memory-mcp
npm run test:rotation
# after restarting live RAG with this code:
# MCP tool rotate_event_log { dry_run: true }
# or force a peel only when you mean it:
# rotate_event_log { retain_sessions: 2, dry_run: false, arc_slug: "arc-09-germany-trip" }
```

## Deferred (roadmap follow-up)

Staged `current-state.md` queue cleanup (three pendings) left for a later quiet ops pass — see master roadmap §13 FOLLOW-UP row. Not required for Phase 3 start.

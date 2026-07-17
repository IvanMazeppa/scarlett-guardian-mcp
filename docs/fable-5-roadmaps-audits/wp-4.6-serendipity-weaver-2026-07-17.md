# WP-4.6 — Serendipity 2.0 weaver — 2026-07-17

**Status:** done

## Delivered

| Piece | Detail |
|-------|--------|
| `serendipity-weaver.ts` | Catalog with tiers; `classifySceneMode`; `maxTierFor`; `selectSerendipity`; drought fire chance 30%→60%; deferral queue; Ryan arc stages 1→2→3; state persist |
| State file | `.guardian/serendipity-state.json` (gitignored) |
| Preflight | `runSerendipityTurn({ triggers, userMessage, liveBeat })` → `serendipity_nudge` |
| Wrapper | `serendipity.ts` thin compat → weaver |
| Tests | `tests/serendipity-weaver.test.ts` |

## Scene mode → max tier

| Mode | Max tier |
|------|----------|
| intimate / vulnerable | ambient only |
| transit | peripheral |
| professional / social | engaging |
| downtime | disruptive |

## Not in this WP (4.7)

Auditor field `serendipity_weave` + brief prefer weave over raw nudge.

## Verify

```bash
npm test   # includes serendipity-weaver
npm run eval:fast
```

Restart Guardian to load preflight wiring.

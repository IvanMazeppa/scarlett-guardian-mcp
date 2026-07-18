# WP-5.7 — Scene roster + presentCast + NPC section expand

**Date:** 2026-07-18  
**Status:** done  

## Ticket

`scene-roster.ts` (aliases, activation, cap 4) + `**Present:**` convention + `parseLiveBeat.presentCast`; exact-section fetch for active NPCs.

## Delivered

| Item | Detail |
|------|--------|
| NEW `scene-roster.ts` | Registry aliases; activation addressed > speaker > present_cast > arc_cast > mentioned; max 4 active |
| `LiveBeat.presentCast` | Parsed from `**Present:**` in current-state |
| LIVE BEAT block | Shows Present cast when set |
| Preflight | Resolves roster; `report.scene_roster`; optional expand by source_file+section (cassette-soft) |
| Corpus | current-state Present: Scarlett, Benjamin, Shevchenko, AMG engineers, Albion |
| Tests | `tests/scene-roster.test.ts`; eval:fast 31/31 |

## Acceptance

- Hermetic goldens assert no hard fail; roster unit tests green.  
- Cap 4 + no false Ryan on dinner cues.  
- NPC expand does not PLAN_DRIFT hermetic cassettes (optional path).

## Out of scope

- 5.8 Scene Cast brief block  
- 5.9 npc_state_changes  

## Verify

```bash
npm test && npm run eval:fast
# Restart Guardian after deploy
```

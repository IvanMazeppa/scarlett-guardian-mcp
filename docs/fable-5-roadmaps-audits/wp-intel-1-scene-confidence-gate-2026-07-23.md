# INTEL-1 — Resolved scene-confidence gate

**Date:** 2026-07-23  
**Branch:** `feature/suite-npc-canon-2026-07-23`  
**Depends on:** INTEL-0  
**Feature gate:** `GUARDIAN_SCENE_CONFIDENCE_GATE` (default **true**; set `false` to rollback policy without deleting code)

## Problem

Save-lag detection softened the auditor **after** roster, agendas, serendipity, and dramaturg had already consumed stale LIVE BEAT.

## Solution

One early `ResolvedSceneConfidence` object (`src/guardian/scene-confidence.ts`) built immediately after LIVE BEAT parse, then shared by:

| Consumer | Provisional policy |
|----------|-------------------|
| Scene roster | Suppress Present/arc/cue-only; keep user-addressed + Scarlett-speaker |
| Serendipity | `forceMaxTier: ambient`; skip NPC agenda intersections |
| Dramaturg | Neutral momentum line (no exact beat pressure) |
| Auditor | `saveLagSuspected` / SAVE LAG instructions |
| Write-back | Hold stage/transition/NPC/live append → `held_for_review` |

## Provisional triggers

- Multi-cluster **save lag** (played IC vs disk LIVE BEAT)
- **Stale Present bleed** (supporting NPCs on Present while played is private couple and does not name them)
- Missing/sparse LIVE BEAT

Aligned disk + played (same cluster, no stale present) → **not** provisional; systems behave as before.

## Hard flags

- `SAVE_LAG_SUSPECTED: …` (unchanged)
- `SCENE_CONFIDENCE_PROVISIONAL: …` when gate degrades optional systems

## Tests

`tests/scene-confidence.test.ts` — required Sol cases + gate-disabled rollback.

## Validation

```bash
npm run build && npm test && npm run eval:fast
```

## Rollback

```bash
export GUARDIAN_SCENE_CONFIDENCE_GATE=false
# restart Guardian
```

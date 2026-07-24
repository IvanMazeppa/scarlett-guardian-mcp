# INTEL-2 — Sidecar and cache hardening

**Date:** 2026-07-24  
**Branch:** `feature/suite-npc-canon-2026-07-23`  
**Depends on:** INTEL-1  
**Feature systems:** Dramaturg and serendipity remain **enabled**

## Goal

Stop dramaturg and serendipity state from bleeding across live scenes, threads, or LIVE BEAT revisions.

## Changes

| Area | Behavior |
|------|----------|
| `scene-fingerprint.ts` | Hash of location + time + Present + live cues (+ optional thread) |
| Dramaturg cache | LLM cache used only when `planHash` **and** `liveSceneFingerprint` match; old sidecars without fingerprint fail conservative → deterministic |
| Dramaturg refresh | `scene_fingerprint` trigger when LIVE BEAT changes |
| Serendipity deferred | Tagged with scene + thread; cross-thread clears deferred; cross-scene drops mismatched deferred; untagged old deferred dropped when scene known |
| NPC agendas | Superseded LIVE BEAT cues **excluded** from positive activation haystack |
| Dramaturg NPC merge | Cached intersections need current-turn name corroboration (user/duplex/live) |

## Not disabled

- `GUARDIAN_DRAMATURG_ENABLED` default on  
- Serendipity weaver still runs  
- INTEL-1 provisional ambient/neutral still applies on save-lag  

## Validation

```bash
npm run build && npm test && npm run eval:fast
```

## Operator

Restart Guardian after deploy. Optional: leave existing sidecars; they invalidate naturally when fingerprints mismatch (or delete `.guardian/dramaturg-context.json` / `serendipity-state.json` once to start clean).

## Rollback

Old cache files without fingerprints are simply not used as LLM cache (deterministic path). No destructive migration.

# WP-5.8 — Scene Cast brief block + ensemble dilution

**Date:** 2026-07-19  
**Status:** done  

## Ticket

Scene Cast block in brief (mandatory ⚠ boundary lines, 90-word budget); ensemble-dilution clause in duplex prompt.

## Delivered

| Item | Detail |
|------|--------|
| `npc-registry.ts` | Parse registry tails; `formatSceneCastBlock` pressure-only lines + ⚠ |
| `compile-grok-brief.ts` | Renders **Scene Cast** after Story Momentum when `scene_roster` non-empty |
| Auditor | ENSEMBLE DILUTION clause on `scarlett_previous_message` critique; SCENE ROSTER block in user message |
| Preflight | Passes `sceneRosterSummary` into assess |
| Tests | `tests/scene-cast.test.ts` — boundaries, budget soft-cap, brief placement, prompt |

## Example (brief)

```markdown
**Scene Cast (supporting — Scarlett remains the lens and the lead):**
- Mr. Shevchenko: protective ally…; wants heat-soak telemetry…
- Ryan: present. ⚠ Scarlett is trans…
```

## Acceptance

- Family/stealth NPCs emit ⚠; Shevchenko without stealth does not false-positive.  
- `npm test` green; `eval:fast` 31/31.  

## Out of scope

- 5.9 `npc_state_changes` staging  

## Verify

```bash
npm test && npm run eval:fast
# Restart Guardian
```

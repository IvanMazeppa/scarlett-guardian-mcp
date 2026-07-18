# WP-5.2 — Dramaturg P0: parseArcPlan + mechanical Story Momentum

**Date:** 2026-07-18  
**Repo:** Guardian (`feature/phase5-dramaturg`)  
**Status:** done  
**Depends on:** WP-5.1 (`arc_plan` corpus + role)

## Ticket

`parseArcPlan` + deterministic beat-diff + mechanical momentum line; momentum block in auditor prompt + brief render. **LLM-free** (D7 §4 P0).

## Delivered

| Item | Detail |
|------|--------|
| NEW `src/guardian/dramaturg.ts` | `parseArcPlan`, `diffBeatsAgainstLive`, `composeMomentumLine`, `buildDramaturgSnapshot`, `loadActiveArcPlan`, `formatStoryMomentumBlock` |
| Preflight | After LIVE BEAT: load active plan from disk, attach `story_momentum` on report; pass `dramaturg` into auditor |
| Auditor | User message order: LIVE BEAT → **STORY MOMENTUM** → evidence; system prompt: pressure only, never outcomes |
| Brief | `**Story Momentum:**` line under Scene Summary when present |
| Model | `GuardianReport.story_momentum?: string` |
| Tests | `tests/dramaturg.test.ts`; state-rewrite fixture stabilized (no live current-state length drift) |

## Acceptance

- With active `arc-09` plan + debrief-ish LIVE BEAT: momentum says **Beat 3 of 4** live, remaining → Affalterbach runway.  
- Hermetic: `npm test` green; `npm run eval:fast` **31/31**.  
- Brief carries a fresh momentum line when a plan is on disk (no LLM spend).

## Example mechanical line

```text
Beat 3 of 4 (Adrenaline crash and debrief) is live; remaining today: Transition toward recovery and Affalterbach runway. Pressure now: The world is ready for return → telemetry debrief → grounding. … The world is ready to move when the scene is.
```

## Plan discovery

1. `GUARDIAN_ARC_PLAN_PATH` (single file)  
2. `GUARDIAN_ARC_PLAN_DIR` / `GUARDIAN_MEMORY_DIR/arc-plans`  
3. `../rag-memory-mcp/project_source_files/arc-plans` (default sibling layout)  

Prefer `**Status:** active`.

## Out of scope (5.3+)

- `runDramaturgPass` LLM call + cache  
- NPC agendas → serendipity  
- `scarlett_next_intention` / `resonance_echo`

## Verify

```bash
npm run build && npm test && npm run eval:fast
npx tsx tests/dramaturg.test.ts
```

Restart Guardian after deploy so preflight loads the new module.

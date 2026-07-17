# WP-4.1 — `scene_transition` + `stage_transition` — 2026-07-17

**Status:** done  
**Branch:** `feature/master-roadmap-v1`  
**Repos:** structured current-state **overwrite** generator (`generateStateRewrite` / validate) is **WP-4.2**

## Delivered

| Piece | Detail |
|-------|--------|
| Auditor schema | `scene_transition: { occurred, from, to, kind } \| null` (strict JSON schema) |
| System prompt | Set only on durable location/time change vs LIVE BEAT; null for continuous same-place action |
| `normalizeAssessmentFields` | Safe parse for live + fixtures |
| `MemoryWriteDecision` | New class `stage_transition` with `transition` snapshot |
| `decideMemoryWrite` | Auditor `occurred: true` → `stage_transition` (even if candidate empty → synthetic from→to note) |
| Preflight | Stages to `current-state.md` append with transition citations; report `memory_write.action = "stage_transition"`; top-level `scene_transition` |
| Eval | `writeActionClass` recognizes `stage_transition` |

## Not in this WP

- Full structured overwrite of `current-state.md` (WP-4.2)  
- Auto-approve transitions / `GUARDIAN_AUTO_APPROVE` (WP-4.3)  
- `review-staged.ts` (WP-4.4)

## Verification

```text
npm run build   # green
npm test        # includes stage_transition cases
npm run eval:fast  # 16/16
```

## Operator note

Restart Guardian to load auditor schema changes. Live LLM will now emit `scene_transition` when terra fires; until WP-4.2, transitions still **stage** (review/approve path), not auto-rewrite the full snapshot.

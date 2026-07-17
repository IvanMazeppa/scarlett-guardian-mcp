# WP-4.3 — Write branch + always-on `memory_write` — 2026-07-17

**Status:** done

## Delivered

| Item | Detail |
|------|--------|
| Always-on field | Every preflight sets `report.memory_write` (and mirrors to `llm_assessment.memory_write`), including failures via try/catch |
| Beat path | Stages **event-log.md** (session heading) + **current-state.md** (continuity bullet) |
| Auto-approve beats | When `GUARDIAN_AUTO_APPROVE` is `beats` or `beats_and_valid_transitions`: dry-run + approve both staged ids |
| Transitions | Still **hold** unless `beats_and_valid_transitions` (unchanged WP-4.2 burn-in) |
| Hermetic | `hermeticEvalConfig()` sets `GUARDIAN_AUTO_APPROVE=none` so cassettes never auto-approve |
| Assertion | Telemetry smoke test requires `memory_write.action` + `reason` |

## Ops note

- Rejected junk staged item `pending-2026-06-23T11-07-51-322Z-current-state.md` (antigravity test) via review CLI.
- Two story pendings remain (Jul 15, Jul 16) for human review.

## Verification

```text
npm test && npm run eval:fast
```

# WP-1.4 golden inventory — COMPLETE

**Date closed:** 2026-07-15  
**Status:** **done** — Gemini expectations + Grok verify + baseline `after-wp-1.4`  
**Branch:** `feature/master-roadmap-v1`

## Verification

```text
npm run eval:fast → 16/16 passed, 0 hard fails (~113–121 ms, zero network)
npm run eval:baseline -- --tag after-wp-1.4 → evals/baselines/after-wp-1.4.json
npm test → includes WP-1.5 mutants
```

~23 `PLAN_DRIFT` warns remain (warn-only; plan vs cassette evolution).

## Cases (15 + smoke)

| id | category | role |
|----|----------|------|
| gt-001-first-lap-ask | continuous-scene | good |
| gt-002-first-lap-live | continuous-scene | good |
| gt-003-radio-swedish | continuous-scene | good |
| gt-004-villa-petrusse | exact-fact | good |
| gt-005-eifel-b-roads | continuous-scene | good |
| gt-010-empty-weave-eifel | other | failure trap |
| gt-011-empty-weave-grass | other | failure trap |
| gt-012-empty-weave-attention | other | failure trap |
| gt-013-changing-room | temporal-mud | failure trap |
| gt-014-thread-start-nordschleife | fresh-thread | failure trap |
| gt-030-race-suit-writeback | write-back | write-back |
| gt-031-shower-writeback | write-back | write-back |
| gt-032-intimacy-writeback | write-back | write-back |
| gt-033-eifel-live-append | write-back | write-back |
| gt-040-thermal-lap-duplex-stage | duplex | duplex + stage path |
| gt-000-hermetic-smoke | other | synthetic smoke |

## Notes

- `pending-gemini-expectations` tags cleared.
- L1 write_action often `"either"` or `"none"` because hermetic `llm-mode off` does not stage; full stage proof remains operational WP-2.5 / frozen-llm later.
- **`gt-040`:** `input.scarlett_previous_message` is still `null` in the committed tree after verify — re-paste if duplex correction tests need it; not blocking WP-1.4 L1 green.

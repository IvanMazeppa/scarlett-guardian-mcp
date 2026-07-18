# WP-5.5 — scarlett_next_intention + resonance_echo

**Date:** 2026-07-18  
**Repo:** Guardian (`feature/phase5-dramaturg`)  
**Status:** done  

## Ticket

Auditor fields `scarlett_next_intention` + `resonance_echo`, prompts, brief render, **echo budget ≤1** (code-enforced). Acceptance: echoes/turn ≤ 0.5 on scorecard helper; no-outcome language cleaned on intention.

## Delivered

| Item | Detail |
|------|--------|
| Schema | Nullable `scarlett_next_intention`, `resonance_echo` on strict auditor JSON |
| System prompt | Intention for Qualified Autonomy lead; echo scarcity (most turns null); pressure not outcomes |
| Normalize | Outcome-language reject on intention; `enforceResonanceEchoBudget` (single line) |
| Brief | `**Scarlett's Intention:**` before QA block; `**Echo (optional texture):**` max one after QA |
| Config | `GUARDIAN_ECHO_MAX_PER_TURN=1` (documented) |
| Scorecard | `resonanceEchoRate()` helper (alert if > 0.5) |
| Tests | `tests/intention-echo.test.ts` |

## Design law

- Intention = what she would **initiate** (possibility), not dialogue to recite or a fixed outcome.  
- Echo = optional texture; **most turns null**; never a callback quota.  
- Code never renders more than one echo line even if the model multi-lines.

## Acceptance

- `npm test` green; `eval:fast` **31/31**  
- Hermetic brief shows intention + single echo; omits when null  

## Out of scope

- WP-5.6 `npc_canon` / secondary bible ranking  
- Telemetry dashboard panel for echo rate (7.5 backlog)

## Verify

```bash
npm run build && npm test && npm run eval:fast
# Restart Guardian — live auditor will return new fields
```

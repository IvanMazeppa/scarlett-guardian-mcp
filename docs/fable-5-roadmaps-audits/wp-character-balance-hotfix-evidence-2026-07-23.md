# Character-balance hotfix — evidence

**Date:** 2026-07-23  
**Branch:** `feature/suite-npc-canon-2026-07-23`  
**Prompt:** `prompt-grok-character-balance-hotfix-2026-07-23.md`  
**Executor:** Grok 4.5  

## Problem

Guardian briefs repeatedly coached Scarlett to prove autonomy via visible initiative/leadership, producing cold, managerial, or professionally masked private prose. Temporary OOC “be soft” overrides caused the opposite performance (“I am not directing anything”).

## Changes (scope freeze)

| File | Change |
|------|--------|
| `src/guardian/report/compile-grok-brief.ts` | Stop rendering `**Scarlett's Intention:**`; replace QUALIFIED AUTONOMY PROTOCOL with **CHARACTER BALANCE** (receive/follow/yield/rest valid; no invented coldness; private vs professional; sexual D role-fluid) |
| `src/guardian/llm-assessment.ts` | Narrow Director's Correction (no “harsh”); protect receptive agency; sparse intention instruction; ensemble dilution = full-turn prop only |
| `tests/intention-echo.test.ts` | Updated expectations |
| `tests/character-balance-hotfix.test.ts` | New hermetic coverage |

**Not changed:** canon, RAG, current-state, dramaturg, roster, write-back, telemetry, schemas (fields retained).

## Rollback

Single commit; `git revert` restores previous brief/auditor wording. No reindex required.

## Validation

```bash
npm run build   # pass
npm test        # pass (includes character-balance-hotfix.test.ts)
npm run eval:fast  # 36/36 L1 off
```

`eval:llm` not run in this session (optional).

Goldens updated deliberately: `brief_must_include` **QUALIFIED AUTONOMY** → **CHARACTER BALANCE** on gt-051, gt-052, gt-060, gt-061 (brief heading rename only).

## Live check (Operator)

**Restart Guardian** (`npm run dev`) so the new brief text loads.

Then 2–3 private suite turns — watch for neither bossiness nor performative softness slogans (“I am not directing anything”).

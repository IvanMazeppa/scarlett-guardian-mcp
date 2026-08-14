# WP Evidence — Parroting Fix Phase 2 (2026-08-14)

**Proposal:** `fable5-parroting-fix-proposal-2026-08-14.md` (Phase 2)
**Handover:** `grok-4.6-phase2-handover-2026-08-14.md`
**Scope:** Auditor prompt + fact-check extraction + unquoted-claim filter. No Phase 3. No commit.

## Changes

### 2.1 Risky claims are contradiction-only, with a quote

- `src/guardian/llm-assessment.ts` `buildAuditorSystemPrompt`: never audit the current RP turn; strategy/plans/motives in play are creative content; a flag is legal only when retrieved evidence *contradicts* a past-canon assertion **and the evidence line is quoted in the flag**. Absence of support → `needs_more_retrieval`, never a risky claim.
- `filterQuotedRiskyClaims` / `riskyClaimHasEvidenceQuote`: require a quoted span ≥12 chars. Applied in `normalizeAssessmentFields` and again in `preflight.ts` `buildHardFlags` (the handover's 2246–2248 site) so an unquoted auditor violation cannot become `LLM_RISKY_CLAIM`.

### 2.2 Duplex names echo as parroting

- After the existing receptivity exemption, one additive sentence: re-narrating the user's completed sequence with no Scarlett-added interior beat, sensation, choice, or offer **is** mechanical parroting and gets a one-sentence `grok_performance_correction`. Receiving / following / yielding stay protected. Hermetic Character Balance asserts for those phrases still pass.

### 2.3 Fact-check claim extraction

- `buildFactCheckQuestions` (now exported) no longer dumps the user's whole turn into `claim_or_question`. Present-tense play is dropped; only past-canon clauses are sent; cap is one clause ≤180 chars. The 14 Aug 07:16 dressing/AGI-tactic timeline therefore does not become a `FACT_CHECK_AMBIGUOUS` clerk-mode claim.

### Eval harness (live budget)

- `evals/l3.ts` `liveEvalConfig` inherited hermetic `GUARDIAN_BUDGET_AUDITOR_MS: 200`, so the first live run failed 11/11 with `Auditor timeout exceeded` in 14s. Live config now uses 12s (or `GUARDIAN_BUDGET_AUDITOR_MS` if set >1000) and 45s total preflight. Hermetic 200ms unchanged.

## Goldens added (cassettes from crisis reports; not rewritten)

| id | category | trap |
|---|---|---|
| `gt-035-intra-suite-beat-lag` | write-back | sofa→dressing must not rewind; no `LLM_RISKY_CLAIM` / `FACT_CHECK_` in the brief |
| `gt-044-agi-delay-not-risky` | duplex | AGI delay tactic never `LLM_RISKY_CLAIM`; `FACT_CHECK_` never in the brief |

Frozen auditor snapshots are kept as historical record. L1 `llm-mode off` does not inject them for these categories. Expectations use `correction_expected` / `write_action_expected`: `either` so hermetic off stays green.

## Tests

- `tests/character-balance-hotfix.test.ts` — quoted-evidence + echo-parroting prompt phrases; receptivity asserts untouched.
- `tests/llm-assessment-live-beat.test.ts` — unquoted AGI-delay claim dropped; quoted contradiction kept.
- `tests/preflight.test.ts` — crisis-shaped present-tense turn → no fact-check; mixed past-canon clause extracted and capped.

## Gate results

- `npm test` — green.
- `npm run eval:fast` — **38/38 passed, 0 failed**, 30 warns.
- `npm run eval:llm -- --category duplex,write-back --trials 3` — **11/11 passed, 0 failed, 0 flaky**; duplex correction precision=1.00 recall=1.00. Scorecard: `evals/runs/2026-08-14T12-05-06-380Z-l3-scorecard.md`.

## Not in this change-set

- Phase 3 (re-rendering `scarlett_next_intention`) — not started.
- No commit.
- Foreign in-flight diffs outside Phase 2 files were not used as the Phase 2 surface.

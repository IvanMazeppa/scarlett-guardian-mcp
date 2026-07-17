# WP-4.8 — Eval L3 tier + duplex pairs + golden growth — 2026-07-17

**Status:** done (infrastructure + hermetic gates green; live L3 needs a valid `OPENAI_API_KEY`)

## Delivered

| Piece | Detail |
|-------|--------|
| L3 runner | `evals/l3.ts` — live terra on cassette-frozen retrieval, N trials, majority ≥ ceil(2N/3) |
| Expectations | `evaluateL3Expectations` (`facts_min`, `facts_must_cover`, `scene_delta_required`, correction) |
| Vote | `majorityVoteTrials` + `collapseAssertionsByName` (no multi-row inflation) |
| Cassette | `CassetteRagClient.reset()` for multi-trial FIFO replay |
| CLI | `--llm-mode live`, `--trials N`; `npm run eval:llm` |
| Cost envelope | Skip cleanly when `OPENAI_API_KEY` unset; category/`--id` filters for iteration |
| Duplex pair | `gt-041-passive-prior-correction` (required) + `gt-042-strong-prior-no-correction` (none) |
| Golden growth | 16 → **31** cases (toward ~50); curated reports + synthetic seeds |
| Tests | `tests/eval-l3.test.ts` hermetic (no API) |

## Commands

```bash
npm test
npm run eval:fast          # L1 hermetic — 31/31
npm run eval:llm -- --category duplex,write-back --trials 3
npm run eval:llm -- --id gt-041-passive-prior-correction,gt-042-strong-prior-no-correction --trials 3
```

## Verify (this session)

| Check | Result |
|-------|--------|
| `npm test` | green (includes `eval-l3`) |
| `npm run eval:fast` | **31/31** passed |
| `npm run build` | green |
| `eval:llm` no key | exits 0, skipped scorecard |
| `eval:llm` duplex pair (1 trial) | path runs; local `.env` key is invalid (401) — surfaces as `llm_assessment_error` |

## Live L3 note

Live auditor trials require a **real** OpenAI API key. When the key is missing/invalid, L3 hard-fails with `llm_assessment_error` (not silent empty facts). Re-run with a valid key after rotating `.env`:

```bash
npm run eval:llm -- --category duplex --trials 3
```

Expect duplex correction precision/recall on the scorecard once pairs pass majority.

## Golden inventory (31)

| Category | Count | Notes |
|----------|------:|-------|
| continuous-scene | 7 | +gt-006..008 growth |
| duplex | 4 | gt-040..043 incl. pair + bridge_cache |
| write-back | 5 | +gt-034; llm blocks on write-back |
| exact-fact | 2 | +gt-015 |
| fresh-thread | 2 | +gt-016 |
| temporal-mud | 2 | +gt-017 |
| high-risk-intimacy | 1 | gt-020 synthetic seed |
| serendipity | 2 | gt-050 curated + gt-051 synthetic |
| other | 6 | +gt-018/019 growth |

Growth cases tagged `wp-4.8` / `expectations-minimal` / `curated-growth` — meta-pollution gates only; Gemini may tighten `brief_must_include` toward 50 full-quality cases.

## Files

- `evals/l3.ts`, `evals/expectations.ts`, `evals/cassette-client.ts`, `evals/runner.ts`
- `package.json` — `eval:llm`, test wire
- `tests/eval-l3.test.ts`
- `evals/golden/**` growth + duplex pair
- `evals/golden/MANIFEST-wp-4.8.md`

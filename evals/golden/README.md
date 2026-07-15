# Golden cases

Category subfolders hold `gt-*.json` cases.
Cassettes are frozen history — never regenerate to make a test pass.

## Curate a skeleton from an archived report (WP-1.2)

```bash
npm run curate:golden -- docs/guardian-reports/preflight-full-<ts>.json --category continuous-scene
# or:
npx tsx scripts/curate-golden.ts docs/guardian-reports/preflight-full-<ts>.json \
  --category temporal-mud --sequence 25 --id gt-025-track-vs-morning
```

Writes `evals/golden/<category>/<id>.json` with input + cassette filled and
**empty** `brief_must_include` (plus universal meta-leak `must_not` seeds).

Author expectations before treating the case as merge-ready (Gemini owns WP-1.4).

## Run L1 eval (WP-1.3)

```bash
npm run eval:fast                          # hermetic, zero network, llm-mode off
npx tsx evals/runner.ts --llm-mode frozen  # uses frozen_llm_assessment on each case
npm run eval:baseline -- --tag main        # snapshot current L1 results
npx tsx evals/runner.ts --baseline main    # diff vs named baseline
```

Scorecards land in `evals/runs/` (gitignored). Baselines live in `evals/baselines/`.

**Note:** `scarlett_previous_message` is not stored in full reports today — if
`retrieval_notes` say duplex was provided, paste the prior Scarlett turn into
`input.scarlett_previous_message` manually for duplex cases.

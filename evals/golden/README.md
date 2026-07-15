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

**Note:** `scarlett_previous_message` is not stored in full reports today — if
`retrieval_notes` say duplex was provided, paste the prior Scarlett turn into
`input.scarlett_previous_message` manually for duplex cases.

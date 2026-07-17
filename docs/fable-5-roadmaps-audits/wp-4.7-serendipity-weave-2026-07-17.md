# WP-4.7 — Serendipity auditor weave — 2026-07-17

**Status:** done

## Delivered

| Piece | Detail |
|-------|--------|
| Schema | `serendipity_weave: string \| null` required on auditor JSON |
| Input | Preflight runs weaver **before** `assessGuardianEvidence` and passes selected event |
| User message | `### SERENDIPITY WORLD EVENT` block with tier/mode/weave instructions |
| Resolve | Weave string → `serendipity_nudge`; `null` weave = **veto** (no catalog dump); LLM off → catalog fallback |
| Brief | Prefer `llm_assessment.serendipity_weave`; strip legacy `SERENDIPITY EVENT…` labels |

## Flow

```text
classify/select serendipity → (optional event)
        → auditor (weave or null)
        → brief World Weaver line
```

## Verify

```bash
npm test && npm run eval:fast
```

Restart Guardian after pull.

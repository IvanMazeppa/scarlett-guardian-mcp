# WP-4.2 — State rewrite generator + validator — 2026-07-17

**Status:** done  
**Branch:** `feature/master-roadmap-v1`

## Delivered

| Piece | Path / behavior |
|-------|-----------------|
| `generateStateRewrite` | Dedicated OpenAI call, **medium** reasoning, full markdown current-state |
| `validateStateRewrite` | Headings in order, Last Updated changed, 0.5–2.0× length, protected facts, no RAG meta, open threads or `resolved:` |
| Protected facts | `.guardian/protected-facts.txt` (pre-op, trans woman, Qualified Autonomy, Swedish, Benjamin, Scarlett, Black Panther, AMG) |
| Preflight wire | On `stage_transition`: generate → validate → `stage_story_update` **overwrite** |
| Fail path | Gen/validate fail → `held_for_review` (+ staged bullet or invalid rewrite for human) |
| Auto-approve | `GUARDIAN_AUTO_APPROVE=beats` (default): **stage and hold**. `beats_and_valid_transitions`: dry-run then apply |
| Tests | `tests/state-rewrite.test.ts` golden Affalterbach rewrite + mutants |

## Burn-in (operator)

Do **not** set `GUARDIAN_AUTO_APPROVE=beats_and_valid_transitions` until 3 consecutive human-approved transition rewrites (D4 §C.4 / WP-4.5).

## Verification

```text
npm run build
npm test
npm run eval:fast   # 16/16
```

## Next

- **WP-4.3** — always record `memory_write`; auto-approve policy integration for beats  
- **WP-4.4** — `review-staged.ts` CLI for human approve/reject of held rewrites  

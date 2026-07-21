# WP-R2 — Exact-section contract repair evidence

**Date:** 2026-07-21  
**Branch:** `feature/post-wp59-affalterbach`  
**Design:** Sol review + Fable response (`fable5-response-sol-review-2026-07-20.md` §R2)

## Defect

Guardian `sectionNeedle` values are short (`Mr Shevchenko`).  
`splitMarkdownSections` stores full ancestry (`… > Mr Shevchenko`).  
`findSection` only matched exact/normalized **full** labels → expand always soft-failed silently.

## Implemented

### RAG (`rag-memory-mcp/src/manifest-index.ts`)

- Exported `findSection` / `sectionLeaf` with:
  1. exact full label  
  2. normalized full label  
  3. unique leaf match (handles `Mr.` / parentheticals like `Lynn Loughrey (Mother)`)  
  4. unique ancestry suffix  
  5. **ambiguous → undefined** (never guesses)
- `canExpand`, `expandAround`, `getNeighbors` resolve via `findSection` (not exact `===` only).

### Guardian (`preflight.ts`)

- NPC expand failures append to `retrieval_notes` (`NPC registry expand misses: …`) and console.warn.
- Hermetic cassette misses still optional (no PLAN_DRIFT change); notes make them visible in live reports.

### Tests

- `rag-memory-mcp/tests/find-section.test.ts`
- Live smoke against `secondary-characters-bible.md`: Shevchenko, Karin, Maya, Lynn Loughrey, Ryan resolve.

## Verification

```bash
# RAG
cd rag-memory-mcp && npx tsx tests/find-section.test.ts && npm run build

# Guardian
cd scarlett-guardian-mcp && npm test && npm run build && npm run eval:fast
# → 31/31 green
```

## Operator note

Restart **RAG** (and Guardian) so the needle-aware expand is live.  
Scene Cast still works from disk either way; auditor now gets real registry expands when RAG is up-to-date.

## Out of scope

- R3 live/eval isolation  
- R4 goldens  
- AMG engineers needle may still miss if source is `npc-agendas.md` without a matching `###` leaf — separate content/roster mapping issue, not this contract.

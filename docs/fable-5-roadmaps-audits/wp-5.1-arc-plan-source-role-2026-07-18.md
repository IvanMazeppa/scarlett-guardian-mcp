# WP-5.1 — Arc plan corpus + `arc_plan` source role

**Date:** 2026-07-18  
**Repos:** RAG (`feature/phase5-dramaturg`); Guardian docs/ledger only  
**Status:** done  

## Ticket

Retro-fit Nürburgring set-piece plan → `arc-plans/arc-09-nurburgring-track-day.md` with beat annotations (`fixed` / `open` / `conditional` + pressure). Register source role **`arc_plan`** at priority **88** / rankBoost **0.05**. Reindex into the live vector store. Acceptance: plan retrieves at near-live rank.

## Delivered

| Item | Detail |
|------|--------|
| Corpus | `project_source_files/arc-plans/arc-09-nurburgring-track-day.md` (status **active**, 4 annotated beats) |
| Convention | `project_source_files/arc-plans/README.md` |
| Legacy | `nurburgring-track-day-plan.md` → thin stub pointing at arc-09 (no duplicate full plan) |
| Role | `SourceRole` + `SOURCE_ROLE_ENUM` + path rule `/arc-plans/` (README excluded) |
| Retriever | Explanation + importance `high` for `arc_plan` |
| Tests | `scripts/test-rotation.ts` source-role assertions for priority sandwich (90 > 88 > 80) |

## Acceptance proof (live store `vs_6a2d14890d6c81919a2177f5a65a059e`)

Query: `arc-09 nurburgring track day plan Beat 3 debrief pressure Affalterbach`

| rank_score | source_role | section (abbrev) |
|-----------:|-------------|------------------|
| **0.902** | **arc_plan** | Beat 3 — Adrenaline crash and debrief |
| 0.815 | arc_plan | Open / delegated |
| 0.802 | arc_plan | Beat 4 — Affalterbach runway |
| 0.791 | current_state | Open Story Threads |
| 0.551 | supporting_backstory | stub `nurburgring-track-day-plan.md` (moved) |

Top hit is `arc_plan` with near-live rank (above current_state on this query; role boost 0.05; importance high). Hermetic: `npm run build` + `npm run test:rotation` green.

## Ops notes / footguns

1. **`--dry-run-summary` alone does not dry-run.** Indexer only short-circuits when `--dry-run` is set. An accidental full index without `--reuse` created orphan store `vs_6a5af4faa74c81918f144183095ae264`. Live traffic remains on `.env` store `vs_6a2d…`.
2. Arc-09 + stub were reindexed into the **live** store via `reindex-one-file.ts` (10 + 1 sections).
3. Manifest after the accident is only a **partial** tracker for those incremental files. A future `npm run index -- --memory-dir ./project_source_files --reuse --name …` (with correct flags) can rebuild a full map against the live store if needed.
4. Restart RAG server after deploy so `SOURCE_ROLE_ENUM` / built `dist` includes `arc_plan` for filtered MCP searches.

## Out of scope (next: WP-5.2)

- `dramaturg.ts` / `parseArcPlan` / mechanical momentum line  
- Auditor STORY MOMENTUM block / brief render  
- LLM dramaturg pass (5.3)

## Verify commands

```bash
cd rag-memory-mcp
npm run build
npm run test:rotation
npx tsx scripts/query-memory.ts "arc-09 nurburgring track day plan Beat 3 debrief pressure Affalterbach"
```

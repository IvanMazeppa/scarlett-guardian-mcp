# WP-2.6 evidence — reject + list include_content — 2026-07-16

**Status:** done  
**Owner:** Grok Build (RAG `server.ts`)  
**Roadmap:** D4 P0-6

## Changes

| Tool | Behavior |
|------|----------|
| `list_staged_story_updates` | Optional `include_content` (default false). When true, returns `proposed_content`, `citations`, `safety_note`. Skips `staged-updates/rejected/`. Response also has `count` + `include_content` echo. |
| `reject_staged_story_update` | Requires `staged_update_id` + `reason`. Moves JSON to `.rag-memory-mcp/staged-updates/rejected/` with `rejected_at` + `reject_reason`. No live write, no reindex. |

Helper: `rag-memory-mcp/scripts/wp25-staging-ceremony.ts` supports `list --include-content` and `reject --id … --reason …`.

## Round-trip verification (2026-07-16)

Ephemeral RAG on `:8799` (live `:8787` left alone).

1. `list` → 3 pending `current-state` drafts (metadata only).
2. `stage-test` → `pending-2026-07-16T08-29-38-680Z-event-log.md`.
3. `list --include-content` → `include_content: true`, throwaway draft includes `proposed_content`.
4. `reject --id … --reason "WP-2.6 round-trip reject (throwaway ceremony draft)"` → `rejected: true`.
5. Pending file removed; archive present under `staged-updates/rejected/`.
6. `list` no longer shows rejected id (3 remain).
7. Second reject → clear not-found error.

**Live corpus:** unchanged (reject path only).

## Operator note

Three real `current-state.md` pendings remain for human review. Example:

```bash
cd rag-memory-mcp
# after restarting live RAG so it loads WP-2.6 code:
npx tsx scripts/wp25-staging-ceremony.ts list --include-content
npx tsx scripts/wp25-staging-ceremony.ts reject --id pending-2026-06-23T11-07-51-322Z-current-state.md --reason "stale antigravity test"
```

## Gemini

No Gemini handoff required — pure RAG tool surface, no goldens/prompts.

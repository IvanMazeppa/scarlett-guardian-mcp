# review-staged CLI (WP-4.4)

Human loop for RAG staged updates (transition rewrites, beat notes, old queue items).

## Prerequisites

- RAG MCP running (`rag-memory-mcp` → `:8787`)
- From **Guardian** package root (`scarlett-guardian-mcp`)

```bash
cd ~/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
```

Optional env (already in `.env` if Guardian is configured):

| Variable | Default |
|----------|---------|
| `RAG_MCP_URL` | `http://127.0.0.1:8787/mcp-v2` |
| `RAG_MCP_BEARER_TOKEN` | (empty) |
| `RAG_MEMORY_DIR` | `../rag-memory-mcp` (for live file diffs) |

## Commands

```bash
# List pending (metadata)
npm run review:staged -- list

# List with proposed_content previews
npm run review:staged -- list --content

# Full JSON for one id
npm run review:staged -- show --id pending-2026-07-16T04-38-30-420Z-current-state.md

# Diff vs live file (overwrite = line diff; append = live tail + proposed)
npm run review:staged -- diff --id pending-...

# Validate without writing
npm run review:staged -- dry-run --id pending-...

# Apply + bg reindex
npm run review:staged -- approve --id pending-...

# Reject → staged-updates/rejected/
npm run review:staged -- reject --id pending-... --reason "stale antigravity test"
```

## Recommended flow (transition rewrite)

1. `list --content` — find `mode: overwrite` or rationale containing `scene transition` / `VALIDATION`.  
2. `diff --id …` — read the full snapshot rewrite.  
3. `dry-run --id …` — confirm RAG accepts path.  
4. `approve` **or** `reject --reason "…"`.

## Deferred queue hygiene

Three older `current-state` pendings may still exist (Jun 23 test, Jul 15/16 continuity). Use this CLI to **reject** the antigravity test and review the rest — same FOLLOW-UP as the master roadmap.

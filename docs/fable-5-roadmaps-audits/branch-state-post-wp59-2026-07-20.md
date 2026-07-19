# Branch state after WP-5.9 — 2026-07-20

## Working branches (use these after Cursor restart)

| Repo | Active branch | Tip | Notes |
|------|---------------|-----|--------|
| **scarlett-guardian-mcp** | `feature/post-wp59-affalterbach` | `f9e2763` | WP-5.9 + handover docs |
| **rag-memory-mcp** | `feature/post-wp59-affalterbach` | `fa831d2` | No RAG code for 5.9; tip = Phase 5 corpus through WP-5.7 Present line |

Same tip also on:

- `feature/phase5-dramaturg` (integration line, pushed)
- `preserve/phase5-through-wp59-20260720` (rollback freeze, pushed)

## Guardian commits just landed

1. `e98478c` — **Feat: WP-5.9 npc_state_changes staging with knowledge human-always**  
2. `f9e2763` — **Docs: Cursor handover pack, Living GM parking, Thread 9 setup**

## Not committed (local only)

- `.guardian/dramaturg-context.json` — runtime cache; leave dirty / gitignored churn

## After Cursor restart

1. Open workspace multi-root if used.  
2. Checkout **`feature/post-wp59-affalterbach`** in both repos.  
3. `git pull` each.  
4. Continue: Affalterbach (WP-5.10 ops/play) + GM/NPC discussion — not more 5.9 code unless bugs.

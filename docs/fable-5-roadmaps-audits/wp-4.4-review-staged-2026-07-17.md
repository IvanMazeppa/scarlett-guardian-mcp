# WP-4.4 — review-staged CLI — 2026-07-17

**Status:** done

## Delivered

| Item | Detail |
|------|--------|
| CLI | `scripts/review-staged.ts` |
| npm | `npm run review:staged -- <cmd>` |
| Commands | `list`, `show`, `diff`, `dry-run`, `approve`, `reject` |
| Doc | `docs/review-staged-cli.md` |

Closes the “approval is a dead end” gap (D4 §C.1): operators can review WP-4.2 overwrite rewrites and the older staged queue without hand-editing JSON under `.rag-memory-mcp/staged-updates/`.

## Smoke

With RAG up:

```bash
cd scarlett-guardian-mcp
npm run review:staged -- list
```

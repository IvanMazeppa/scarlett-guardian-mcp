# WP-2.5 staging ceremony evidence — 2026-07-16

**Status:** done  
**Owner:** operator (approve) + Grok Build (stage/dry-run/helper)  
**Roadmap:** D4 P0-5 — execute staging path end-to-end once

## Goal

Prove `stage → list → dry-run → approve → background reindex` without applying real story canon to `current-state.md`.

## Stack

| Service | Port | Health at ceremony |
|---------|------|--------------------|
| RAG memory MCP | 8787 | healthy |
| Guardian MCP | 8790 | healthy |

## Staged test update

| Field | Value |
|-------|--------|
| ID | `pending-2026-07-16T07-43-39-976Z-event-log.md` |
| Target | `project_source_files/event-log.md` |
| Mode | `append` |
| Content | `## Session — WP-2.5 ceremony — 2026-07-16T07:43Z` + technical proof bullet (not a story beat) |
| Rationale | WP-2.5 guided staging ceremony — hermetic ops proof |

Helper script: `rag-memory-mcp/scripts/wp25-staging-ceremony.ts`

## Results

| Step | Result |
|------|--------|
| list | Three older `current-state.md` pendings present; left **unapproved** |
| stage-test | Created ceremony pending on `event-log.md` |
| dry-run | `success: true`, `applied: false`, validation only |
| **approve** | `success: true`, `applied: true` |
| reindex | Message: *Vector store reindexing has started in the background* |
| staged file cleanup | Ceremony pending removed from `.rag-memory-mcp/staged-updates/` |
| file backup | `.rag-memory-mcp/file-backups/event-log.md.bak-2026-07-16T08-12-04-316Z` |
| event-log tail | Ceremony session heading + bullet present |

### Approve response (summary)

```json
{
  "success": true,
  "staged_update_id": "pending-2026-07-16T07-43-39-976Z-event-log.md",
  "applied": true,
  "result": {
    "success": true,
    "dry_run": false,
    "message": "Successfully updated 'project_source_files/event-log.md'. Vector store reindexing has started in the background.",
    "details": {
      "file": "project_source_files/event-log.md",
      "mode": "append",
      "file_backup": ".../file-backups/event-log.md.bak-2026-07-16T08-12-04-316Z"
    }
  }
}
```

Operator terminal capture: `rag-memory-mcp/temp/approve-ceremony.txt`

## Not in scope (left pending on purpose)

Do **not** treat these as ceremony failures — they are real story drafts for later review:

- `pending-2026-06-23T11-07-51-322Z-current-state.md`
- `pending-2026-07-15T02-51-26-402Z-current-state.md`
- `pending-2026-07-16T04-38-30-420Z-current-state.md`

Reject UX for discarding without apply is **WP-2.6**.

## Acceptance vs master roadmap

| Criterion | Met? |
|-----------|------|
| Stage once | Yes |
| List | Yes |
| Approve | Yes |
| Background reindex kicked off | Yes (server message) |
| Evidence saved | This file + operator log |

## Follow-ups

1. **WP-2.6** — `reject_staged_story_update` + `list_staged_story_updates include_content`
2. Optional: remove ceremony bullet from `event-log.md` later (harmless if left)
3. Optional: review/approve/reject the three `current-state.md` pendings under human judgment

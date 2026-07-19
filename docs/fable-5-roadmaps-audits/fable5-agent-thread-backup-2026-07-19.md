# Fable 5 Agents-sidebar thread — backup + restore pointer

**Date:** 2026-07-19  
**Session ID:** `1401cf7a-5af5-42ab-a1be-39d2b5824b13`  
**Sidebar title (misleading):** **Health check results**  
**Status:** **Not deleted — archived** (`isArchived: true` in Cursor `composerHeaders`)

## Backup (project)

```text
backups/cursor-agent-threads/LATEST-fable5-agent-sidebar/
backups/cursor-agent-threads/fable5-agent-sidebar-1401cf7a-5af5-42ab-a1be-39d2b5824b13-20260719T084345Z.tar.gz
```

Inside that folder:

- `raw/` — full jsonl + subagents + canvas
- `exports/conversation-readable.md` — recovered dialogue
- `exports/cursor-index-status.json` — DB header dump
- `README.md` — restore instructions

## Live sources still present

| Store | Location |
|-------|----------|
| Agent transcript jsonl | `~/.cursor/projects/home-maz3ppa-projects-AMG-GT-Black-Prototype/agent-transcripts/1401cf7a-…/` |
| Composer bubbles | Windows `state.vscdb` → `composerData:` + `bubbleId:1401cf7a-…` (~5k rows) |
| Header | `composerHeaders` for same id |

## UI restore (try first)

1. Open Agents history for this workspace.
2. Open **Archived** chats (not the active list only).
3. Find **Health check results** (subtitle mentions Living GM / master roadmap docs).
4. Unarchive / rename.

## If UI restore fails

See `backups/cursor-agent-threads/LATEST-fable5-agent-sidebar/README.md` for optional DB unarchive steps. Prefer using the readable export + design docs rather than editing `state.vscdb` while Cursor is open.

## Resume without sidebar

```text
/resume-cursor 1401cf7a-5af5-42ab-a1be-39d2b5824b13
```

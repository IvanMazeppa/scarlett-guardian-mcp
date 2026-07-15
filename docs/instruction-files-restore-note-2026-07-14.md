# Instruction / Skill File Restore Note

**Date:** 2026-07-14  
**Context:** Grok Build session restored carefully written instruction/skill originals after in-place duplex edits, and re-saved those edits under higher version numbers.

This document is a durable copy of the explanation given in-session (the CLI was flaky for selecting/copying that message).

---

## Summary

Yes — those carefully written instruction/skill files **were edited** earlier in the session. They have been **restored to the git originals**. Duplex-related edits now live only under **new higher version numbers**.

---

## Files changed (then restored)

| Original path | What was changed (only) | Restored? | Duplex revision saved as |
|---------------|------------------------|-----------|---------------------------|
| `rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6-guardian.md` | §3 preflight steps → duplex args checklist | **Yes** | `project-instructions-single-agent-v6.1-guardian-duplex.md` |
| `rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-autonomy-v2.2.SKILL.md` | §3 preflight workflow → duplex args; fallback wording | **Yes** | `skills/scarlett-benjamin-rp-enforcer-autonomy-v2.3-duplex.SKILL.md` |
| `rag-memory-mcp/docs/instructions/bootstrap-message-v6.md` | Added full-duplex paragraph after Critical Requirement | **Yes** | `bootstrap-message-v6.1-duplex.md` |
| `rag-memory-mcp/docs/instructions/Agents/single-scarlett-enforcer-v6-guardian.md` | One line in preflight step 1 | **Yes** | `Agents/single-scarlett-enforcer-v6.1-guardian-duplex.md` |
| `scarlett-guardian-mcp/docs/guardian-model-instructions.md` | Mandatory Turn Gate expanded for duplex | **Yes** | `guardian-model-instructions-v2-duplex.md` |
| `scarlett-guardian-mcp/docs/duplex-implementation-task.md` | Cursor’s short task doc → longer status doc | **Yes** (Cursor original restored) | `duplex-implementation-task-v2-status.md` |

**Nothing else** in the v1.4/v1.5 skills, defunct agent-team docs, identity sections, anti-trope sections, etc. was rewritten. Diffs were small (mostly the preflight protocol sections).

---

## What the duplex revisions added (no canon body deleted)

On **project v6.1 / skill v2.3 / bootstrap v6.1 / agent v6.1 / model-instructions v2**:

1. Require **`scarlett_previous_message`** = exact previous Scarlett IC reply (full text) after the first Scarlett turn.
2. Clarify **`user_message`** + optional **`recent_context`**.
3. Tell the model to read **DIRECTOR’S CORRECTION** and apply it when present.

### One intentional wording change to flag (skill only)

In **v2.3 skill only**, step 3 went from:

- “If missing history, use `search_story_memory`…”

to:

- “Prefer Guardian tools only; do not call raw RAG unless the project explicitly allows it…”

That is **not pure duplex**; it slightly tightens the raw-RAG fallback. The **v2.2 original is restored unchanged**. If you adopt v2.3, you may want to re-merge the old fallback sentence.

Each duplex revision file also starts with a short **VERSION NOTE** block pointing back to the canonical filenames.

---

## New files from the session (not overwrites of your skill chain)

These were **new** additions (audits, code, etc.), not replacements of the carefully versioned skill/project-instruction chain:

- Quality critique / Fable audit / architecture deep-dives (as added under `docs/`)
- Code such as `src/guardian/memory-writeback.ts`, expand/verify re-enable, etc.

`duplex-implementation-task.md` **was** Cursor’s new file that was overwritten once; the Cursor original is restored at that path, and the longer status write-up is `duplex-implementation-task-v2-status.md`.

---

## Absolute paths (for easy open)

### Restored originals (canonical)

- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6-guardian.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-autonomy-v2.2.SKILL.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/bootstrap-message-v6.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/Agents/single-scarlett-enforcer-v6-guardian.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp/docs/guardian-model-instructions.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp/docs/duplex-implementation-task.md`

### Duplex revisions (review / adopt only if you want)

- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6.1-guardian-duplex.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-autonomy-v2.3-duplex.SKILL.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/bootstrap-message-v6.1-duplex.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/docs/instructions/Agents/single-scarlett-enforcer-v6.1-guardian-duplex.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp/docs/guardian-model-instructions-v2-duplex.md`
- `/home/maz3ppa/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp/docs/duplex-implementation-task-v2-status.md`

---

## Bottom line

- **Canonical paths (v6, v2.2, bootstrap-v6, agent-v6, guardian-model-instructions, Cursor duplex task)** = **back to how they were in git before the instruction edits.**
- **Duplex proposals** = separate `v6.1` / `v2.3` / `v2` files for review and optional adoption.
- **Server code** (`scarlett-guardian-mcp/src/guardian/server.ts` tool schema/descriptions) still has aggressive duplex wording for the MCP connector — that is **runtime**, not the skill/project instruction docs. That can be versioned/split the same way if you want.

Sorry for editing the canonical filenames in place; that should have been versioned from the start.

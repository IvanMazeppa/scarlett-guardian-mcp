# current-state.md never updates — root cause & fix

**Date:** 2026-08-16  
**Repos:** `scarlett-guardian-mcp` + `rag-memory-mcp`  
**Symptom:** After scene changes, LIVE BEAT stays stale → OOC / DO NOT PROCEED / save-lag loops. Operator edits appear to “never stick.”

---

## 1. Verdict

There were **three stacked problems**. Only one was a true code deadlock; the others are ops/path confusion.

| # | Problem | Severity | Status |
|---|---------|----------|--------|
| A | **Save-lag ↔ holdCanonWrites deadlock** | Critical | **Fixed this round** |
| B | **Wrong file open** (parent tree vs RAG canon) | High (operator) | Documented |
| C | Staging inbox rarely auto-applied historically | Medium | Config already `beats_and_valid_transitions`; deadlock was blocking before apply |

---

## 2. Smoking gun (A) — the deadlock

### What happened on the airborne turn (`2026-08-16T04-04-56`)

1. Play moved to **airborne Gulfstream**; disk still said **tarmac**.
2. Save-lag correctly fired → scene confidence **provisional** → `holdCanonWrites: true`.
3. Auditor / safety net produced a valid **`stage_transition`** decision (the right remediation).
4. Preflight then did:

```text
decision = stage_transition
BUT holdCanonWrites → memory_write = held_for_review
  (NO stage_story_update call, staged_update_id = null)
```

5. Disk never changed → next turns still lag → more provisional / DO NOT PROCEED pressure.

**Catch-22:** The only write that clears save-lag was blocked *because* save-lag was active.

Evidence: `memory_write.reason` =
`provisional scene confidence — canon write held (save_lag:aviation->aviation); decision was stage_transition`
with **no** `staged_update_id`. Staged inbox had no new file for that turn.

### Fix (code)

`allowSaveLagRemediationWrite()` — when `saveLag.suspected` and the decision is
`stage_transition` | `stage` | `live_append`, **do not** short-circuit on `holdCanonWrites`.
Proceed into `applySceneTransitionWrite` / beat stage / live append.

With your env:

- `GUARDIAN_MEMORY_WRITE_MODE=stage`
- `GUARDIAN_AUTO_APPROVE=beats_and_valid_transitions`

…validated transitions can **auto-approve** onto:

`rag-memory-mcp/project_source_files/current-state.md`

Provisional softening (neutral dramaturg, ambient serendipity) still applies; only the **location remediation write** is unblocked.

NPC speculative writes remain held under provisional.

---

## 3. Wrong file (B) — ultra irritating path trap

| Path | Role | Your open tab |
|------|------|----------------|
| `rag-memory-mcp/project_source_files/current-state.md` | **Live LIVE BEAT authority** Guardian/RAG read & write | Updated ~05:33 (airborne) |
| `AMG_GT_Black_Prototype/project_source_files/current-state.md` | Stale parent copy (London Waitrose, June) | **Often what Cursor shows** |

Editing or “watching” the parent file will never reflect Guardian write-back. Guardian talks to RAG MCP, which resolves `project_source_files/…` under **rag-memory-mcp**.

**Action:** Always edit/open the RAG path. Consider deleting or adding a stub README in the parent `project_source_files/` pointing at the sibling repo (drastic but clarifying — see §5).

---

## 4. How write-back is supposed to work

```text
auditor candidate + scene_transition
        ↓
decideMemoryWrite → stage_transition | stage | live_append | none
        ↓
[NEW] allow save-lag remediation even if provisional
        ↓
applySceneTransitionWrite:
  generateStateRewrite → validate → stage_story_update (overwrite)
        ↓
if GUARDIAN_AUTO_APPROVE=beats_and_valid_transitions:
  approve_staged_story_update → disk current-state.md + reindex
else:
  left in .rag-memory-mcp/staged-updates/ for human approve
```

Historical inbox (many never approved under older `AUTO_APPROVE=beats`):

`rag-memory-mcp/.rag-memory-mcp/staged-updates/pending-*-current-state.md.json`

Operator CLI (already wired — not a background worker):

```bash
cd scarlett-guardian-mcp
npm run review:staged -- list --content
npm run review:staged -- diff --id <id>
npm run review:staged -- approve --id <id>
```

Do **not** blindly approve old drafts (e.g. `pending-2026-08-15T04-59-01-318Z-current-state.md.json` failed validation for dropped open-thread markers).

The 05:33 airborne update on disk was **manual/external** — no matching auto-approve in the 04:39 report. That matches the lifelong “only works when I edit it myself” pattern.

---

## 5. Drastic options (if you want them later)

Recorded for operator choice — **not applied** this round:

1. **Delete or quarantine parent `project_source_files/`** so only RAG canon exists (stops dual-file confusion).
2. **Mission Control “Apply LIVE BEAT” button** — one-click approve of held/staged transitions + wardrobe.
3. **Default `GUARDIAN_MEMORY_WRITE_MODE=live`** for location transitions only (faster, less review; higher risk).
4. **Force rewrite current-state from recent_context** when save-lag persists >N turns (aggressive; needs strong guards).
5. **Symlink** parent `current-state.md` → RAG file (WSL/Windows symlink caveats).

Recommended near-term: keep stage + auto-approve transitions; add MC approve UI (option 2).

---

## 6. Operator checklist after restart

1. Restart Guardian on `:8790` (this fix is in preflight).
2. Open **only** `rag-memory-mcp/project_source_files/current-state.md`.
3. Trigger a preflight on a turn where play has moved past disk (or temporarily revert a line on disk to force save-lag).
4. Expect terminal:
   - `SAVE LAG suspected` (if still lagging)
   - `Memory write-back SAVE-LAG remediation: allowing stage_transition…`
   - `Scene transition rewrite auto-approved: …` (with your auto-approve setting)
5. Confirm RAG `current-state.md` mtime/content updates; reindex if not automatic.
6. Update wardrobe LIVE card separately when undressing is canon (still independent).

---

## 7. Code / docs touched

- `src/guardian/memory-writeback.ts` — `allowSaveLagRemediationWrite`
- `src/guardian/tools/preflight.ts` — use remediation gate; debug logs
- `tests/memory-writeback.test.ts` — gate unit tests
- This report

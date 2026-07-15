# Full-Duplex Dialogue Auditing — Approach, Status, and Completion Plan

**Date:** 2026-07-15  
**Repos:** `scarlett-guardian-mcp` (+ related Grok project/skill instructions under `rag-memory-mcp/docs/instructions/`)  
**Related:** `duplex-implementation-task.md` (Cursor original), `duplex-implementation-task-v2-status.md`, `grok-test-setup-and-ooc-continuation-2026-07-15.md`, Fable/Cursor quality audits

---

## 1. What “full duplex” means here

**Half duplex (what most preflights do today):**  
Guardian sees Benjamin’s latest turn (`user_message`) + optional scene recap (`recent_context`) → retrieves memory → returns a brief → Grok writes Scarlett.

**Full duplex (the feature):**  
Guardian also sees **Scarlett’s previous in-character reply** (`scarlett_previous_message`) → the terra auditor critiques that reply against **Qualified Autonomy** (passivity, parroting Benjamin, generic tropes) → optional **`grok_performance_correction`** appears in the streamlined brief as **DIRECTOR’S CORRECTION** → Grok applies it on the *next* Scarlett turn.

```text
Benjamin turn  →  [preflight]  →  Scarlett turn A
                      ↑
Scarlett turn A  ─────┘  (must be fed back as scarlett_previous_message
                           on the *following* preflight)
Benjamin turn 2  →  [preflight + duplex]  →  Scarlett turn B
                         (may include Director's Correction about A)
```

This is part of restoring the lost SuperGrok **agent-team** role: a second opinion on *how* Scarlett is being written, not only *what* the corpus says about the plot.

---

## 2. Design goals

| Goal | Detail |
|------|--------|
| Novelist stays Grok | Correction is one short directive, not a second novelist |
| Optional when quality is fine | Auditor returns `null` if previous Scarlett was solid |
| No reindexer dependency | Duplex never needed write-back; timeout-era “simplifications” should not have killed it |
| Soft capture first | Prefer tool schema + project/skill instructions before hard browser injection |
| API resilience | First Scarlett turn of a thread may omit previous message |

**Non-goals (for this feature alone):** rewriting Scarlett’s voice in the Guardian; storing full previous replies into `current-state.md`; requiring duplex on the absolute first IC turn of a new thread.

---

## 3. Approach (how we chose to implement it)

### 3.1 Server-side pipeline (already existed; we hardened around it)

1. **Input** — MCP tool `guardian_memory_preflight` accepts `scarlett_previous_message` (optional string).  
2. **Evidence payload** — `llm-assessment.ts` includes that field in the JSON sent to OpenAI.  
3. **Schema** — structured output includes `grok_performance_correction: string | null`.  
4. **Prompt** — auditor is told: if previous Scarlett is too passive / parrot / trope, write a harsh one-sentence correction; else `null`.  
5. **Brief** — `compileGrokBrief` adds **DIRECTOR’S CORRECTION** only when correction is a non-empty string.  
6. **Observability** — log when duplex is present/missing; full JSON hard_flag `DUPLEX_INPUT_MISSING` (not shown as Grok “Key Facts”).

### 3.2 Why the feature still failed in production

Measured (Fable audit, 142 reports): corrections fired ~**8%** of the time. Live Jul 14 log:

```text
Duplex input missing: scarlett_previous_message not provided
```

Root cause: **Custom Connector / tool-calling Grok omits optional args.**  
Not: missing auditor code, not reindexer, not expand disable.

### 3.3 Strategy layers (soft → hard)

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **A. Schema + tool description** | CRITICAL MANDATORY wording; field ordered first in schema; tool checklist | **Done** (runtime) |
| **B. Logs / full-JSON flags** | Console + `DUPLEX_INPUT_MISSING` + retrieval_notes | **Done** |
| **C. Project / skill / bootstrap text** | Standing instructions Grok loads every session | **Drafted as versioned files** (see §5); originals preserved |
| **D. Manual OOC paste** | User forces the arg for one turn | **Documented** for tests |
| **E. Browser bridge / auto-capture** | Inject last Scarlett bubble into preflight without model goodwill | **Not built** (P3 / hard compliance) |
| **F. Strict required schema** | Reject preflight if arg absent | **Deferred** — breaks first turn and naive clients |

We intentionally did **not** make the field Zod-required: first turn and REST/bridge callers that only send `user_message` would hard-fail.

### 3.4 What we did *not* treat as “duplex implementation”

- Raising evidence chars, re-enabling expand/verify, stage write-back — those improve the brief and depth but are separate from duplex capture.  
- Editing canonical skill/project filenames in place was a mistake; duplex instruction deltas are now **versioned copies** only (see §5).

---

## 4. Code and config changes (thus far)

### 4.1 Runtime (active — requires Guardian restart)

| File | Change |
|------|--------|
| `src/guardian/server.ts` | Tool description: checklist with duplex first; param `scarlett_previous_message` listed first with CRITICAL MANDATORY copy-exact previous Scarlett reply |
| `src/guardian/tools/preflight.ts` | Warn/log if missing; log char length if present; `DUPLEX_INPUT_MISSING` hard_flag; note in `retrieval_notes` |
| `src/guardian/llm-assessment.ts` | Already passed previous message into evidence; correction schema + QA prompt (pre-existing, kept) |
| `src/guardian/report/compile-grok-brief.ts` | Already surfaces Director’s Correction; duplex flag not treated as Key Fact |
| `src/guardian/report/models.ts` | `grok_performance_correction` nullable type |

### 4.2 Instruction / skill documents (versioned; originals restored)

Canonical paths (v6 / v2.2 / etc.) were **restored from git**. Duplex-aware revisions:

| Versioned file | Role |
|----------------|------|
| `rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6.1-guardian-duplex.md` | Project instructions with duplex preflight args |
| `rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-autonomy-v2.3-duplex.SKILL.md` | Skill workflow with duplex |
| `rag-memory-mcp/docs/instructions/bootstrap-message-v6.1-duplex.md` | New-thread bootstrap + duplex |
| `rag-memory-mcp/docs/instructions/Agents/single-scarlett-enforcer-v6.1-guardian-duplex.md` | Agent slot (only if used; changing it needs new Grok thread) |
| `scarlett-guardian-mcp/docs/guardian-model-instructions-v2-duplex.md` | Standalone Guardian model gate text |

See also: `docs/instruction-files-restore-note-2026-07-14.md`.

**Note on skill v2.3:** one non-duplex wording change (raw RAG fallback tightened). Prefer re-merge original fallback if adopting v2.3 wholesale.

### 4.3 Ops / test docs

| File | Role |
|------|------|
| `docs/duplex-implementation-task.md` | Cursor original short task (restored) |
| `docs/duplex-implementation-task-v2-status.md` | Status + limits of schema-only fix |
| `docs/grok-test-setup-and-ooc-continuation-2026-07-15.md` | ngrok, mid-thread setup, paste-ready OOC |
| This file | Full feature narrative |

### 4.4 Branch

Both repos (when used): `feature/guardian-depth-duplex-p0-p1-20260714`  
Duplex work sits alongside P0 depth (expand, 32k evidence) and P1 write-back.

---

## 5. How the pieces connect at runtime

```text
Grok Custom Connector
    │  POST …/mcp  (ngrok → Guardian :8790)
    │  tool: guardian_memory_preflight
    │  args: scarlett_previous_message?, user_message, recent_context?, force_full_retrieval?
    ▼
scarlett-guardian-mcp
    │  log duplex present/missing
    │  RAG: retrieve + search (+ expand/verify budgets)
    │  OpenAI terra: assessment including performance correction
    │  compileGrokBrief → markdown to Grok
    │  save preflight-full-*.json + preflight-streamlined-*.md
    ▼
Grok reads brief → writes next Scarlett prose
```

**Single ngrok URL pattern (operator setup):**

- Guardian: `https://<tunnel>/mcp`  
- RAG proxy (optional): `https://<tunnel>/mcp-v2` → local RAG  

RP connector should call **Guardian only**.

---

## 6. The current test (what we are validating)

### 6.1 Goals of the live test

1. Confirm **depth stack** still good: weave (facts + scene delta), expand, no meta in brief.  
2. Confirm **duplex feed**: `scarlett_previous_message` non-empty after Scarlett has spoken.  
3. Confirm **correction path** when previous Scarlett is weak (optional: force a passive previous reply once).  
4. Confirm mid-thread **project + skill** updates without requiring agent-slot rewrite.

### 6.2 Operator setup for the test

| Step | Action |
|------|--------|
| Local | RAG `npm run dev`, Guardian `npm run dev` (restart after code change) |
| Tunnel | ngrok → Guardian :8790 |
| Connector | Guardian `…/mcp` |
| Grok cloud | Install duplex project instructions + skill (v6.1 / v2.3 or merged content) |
| Agent instructions | **Optional**; leave mid-thread unless that slot is active (changing agent = new thread) |
| Thread | Mid-thread OK; new thread if duplex still omitted after 1–2 tries |
| OOC | Prefer paste-ready block in `grok-test-setup-and-ooc-continuation-2026-07-15.md` |

### 6.3 Pass / fail signals

| Signal | Pass | Fail |
|--------|------|------|
| Guardian log | `Duplex input present: scarlett_previous_message (N chars)` | `Duplex input missing…` |
| Full JSON hard_flags | No `DUPLEX_INPUT_MISSING` (after first Scarlett turn) | Flag present every turn |
| Full JSON / tool args | Previous Scarlett text in call arguments | Field absent |
| Streamlined MD | Director’s Correction when previous turn was passive | Correction never appears *and* previous turn was clearly passive *and* duplex was fed |
| Streamlined MD | No correction when previous turn was strong | Correction spam every turn (prompt too aggressive) |

**Important:** Missing correction + **missing duplex input** = capture failure.  
Missing correction + **duplex present** + strong previous Scarlett = correct auditor behavior.

### 6.4 Known good parallel signals (not duplex, but same preflight)

From `preflight-full-2026-07-14T05-40-36-278Z.json` (before duplex feed fixed):

- Weave: 6 supported facts + scene_delta  
- Expand: ok, 3 sections  
- `memory_write: none` (no-op candidate) — expected  
- Duplex: missing — **this is the gap under test**

---

## 7. What remains to complete full duplex

### 7.1 Must complete for “feature done”

| # | Work | Owner |
|---|------|--------|
| 1 | Grok cloud loads duplex project + skill text | Operator |
| 2 | Live preflights show duplex **present** without manual OOC for several turns | Operator + model habit |
| 3 | At least one live turn with duplex fed **and** a justified Director’s Correction when previous Scarlett was passive | Joint |
| 4 | At least one live turn with duplex fed **and** `correction: null` when previous was fine | Joint |
| 5 | Document result in a short note or scorecard line (optional but useful) | Session |

### 7.2 Should complete for “robust in production”

| # | Work | Notes |
|---|------|--------|
| 6 | Hard capture: browser bridge / Tampermonkey injects last Scarlett message into preflight | Does not rely on Grok filling optional args |
| 7 | Update live SuperGrok skill/project from **reviewed** v6.1/v2.3 (or merge duplex § only into carefully written originals) | Avoid accidental loss of skill prose |
| 8 | Connector refresh after tool schema change (re-add MCP if description looks stale) | xAI connector cache quirks |
| 9 | Agent-slot instructions only if still used — then **new thread** | Soft compliance stack |

### 7.3 Explicitly out of scope / later

- Making the arg strictly required in Zod without first-turn/empty handling.  
- Storing every previous Scarlett message into vector memory by default.  
- Replacing Qualified Autonomy judgment with a second full RP model call.  
- Precedent recency / serendipity (related quality, not duplex).

---

## 8. Risks and trade-offs

| Risk | Mitigation |
|------|------------|
| Schema CRITICAL text still ignored | Project/skill + OOC + later bridge |
| Required field breaks first turn / REST | Keep optional; treat empty omit as first-turn |
| Manual OOC is tedious | Bridge automation |
| Versioned instruction files diverge from live SuperGrok paste | Operator owns cloud copy; repo is source of truth for diffs |
| Director’s Correction too harsh / frequent | Soften auditor prompt after live examples |
| Tool name differs (`scarlett_guardian_mcp___…`) | Arg names matter more than display name |

---

## 9. Success definition (feature complete)

Full duplex is **complete** when:

1. On turns after the first Scarlett reply, **≥90%** of preflights in a normal RP session include a real `scarlett_previous_message` **without** the user pasting OOC every time (skill/project or bridge).  
2. When duplex is present and previous Scarlett was passive/parroting, streamlined brief includes a **usable** Director’s Correction.  
3. When duplex is present and previous Scarlett was good, correction is **null** / section omitted.  
4. Full JSON retains debug trail; novelist brief never shows `DUPLEX_INPUT_MISSING` as a “key fact.”  
5. Feature does not require reindexer, expand, or write-back to function.

Until (1), the feature is **implemented but not productized**.

---

## 10. Quick reference — files to open

| Need | Path |
|------|------|
| This status doc | `scarlett-guardian-mcp/docs/full-duplex-feature-status-2026-07.md` |
| Paste-ready OOC / ngrok / checklist | `scarlett-guardian-mcp/docs/grok-test-setup-and-ooc-continuation-2026-07-15.md` |
| Instruction restore map | `scarlett-guardian-mcp/docs/instruction-files-restore-note-2026-07-14.md` |
| Runtime tool schema | `scarlett-guardian-mcp/src/guardian/server.ts` |
| Auditor prompt/schema | `scarlett-guardian-mcp/src/guardian/llm-assessment.ts` |
| Duplex log / flags | `scarlett-guardian-mcp/src/guardian/tools/preflight.ts` |
| Brief rendering | `scarlett-guardian-mcp/src/guardian/report/compile-grok-brief.ts` |
| Live evidence | `scarlett-guardian-mcp/docs/guardian-reports/preflight-full-*.json` |

---

## 11. One-line summary

**Full duplex is a complete in-server critique loop starved of Scarlett’s previous message; we hardened schema, logging, and versioned instructions—the remaining work is making Grok (or a bridge) actually send that message every turn, then proving Director’s Correction on live RP.**

# Executor Preferences — Grok Build (for Fable 5 master roadmap)

**Date:** 2026-07-15  
**From:** Grok Build (implementation agent on the dual-repo monorepo)  
**To:** Fable 5 (roadmap consolidation / design)  
**Repos:** Planning only — no code changes implied by this document.  
**Context:** Eight design/roadmap documents under `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/` (and related audits). Operator will consolidate into a **single master roadmap** for incremental execution.

---

## Question answered

Given how this executor operates (context limits, session continuity, merge-conflict risk across its own edits), which work structure is better?

- **A.** Strictly sequential: one phase at a time, each phase fully verified before the next.  
- **B.** Two parallel tracks in separate sessions (Guardian vs RAG), with shared contracts changed from only one designated track.

---

## 1. Choice: A (default) — with narrow B only after contracts freeze

**Prefer A (strictly sequential), with light optional B only after shared contracts are frozen.**

### Why (practical limits of this executor)

| Limit | Effect on multi-phase work |
|--------|----------------------------|
| **Single-session context** | Long dual-repo work loses the thread: half-finished expand + half-finished reindexer + half-finished docs. |
| **No durable memory of other sessions** | A “parallel Track 2” in another chat is invisible unless the operator pastes status; this agent will re-discover and may re-edit “shared” surfaces. |
| **Self-inflicted merge conflicts** | Same session (or overlapping sessions) touching `preflight.ts` *and* RAG ranking/tools is where thrash and schema inconsistency appear. |
| **Verification is the real product** | Build + tests + a real preflight pair (or `eval:fast` when it exists) is what keeps quality; parallel tracks delay that feedback loop. |
| **Human is the integration layer** | Operator already juggles SuperGrok, Cursor, Fable, and this CLI; two open agent tracks multiplies coordination cost more than it saves wall-clock. |

**When B pays off:** Only for *true* independent work after a written **contract freeze** (e.g. Track 1 = dramaturg brief fields only; Track 2 = index/chunk hygiene only; **no** tool-schema invention on Track 2). Until the master roadmap freezes “who may change what,” **B is how dual-repo drift happens.**

**Default rule for Fable’s master roadmap:** Structure phases as **A**. Offer **B** only as “two sequential tracks in two sessions after freeze,” not two open-ended parallel agents inventing APIs.

---

## 2. If B is used — coordination rules required

Only if the operator insists on parallel work after a freeze:

### Branch strategy

- One **integration** branch per milestone (e.g. `feature/master-roadmap-v1`), cut from a **tagged baseline** (see §4).  
- Per-track branches:  
  - `feature/rm-track-guardian-<slice>`  
  - `feature/rm-track-rag-<slice>`  
- Merge **one track at a time** into integration.  
- Never leave two open PRs that both touch the same contract files.

### Single owner of shared contracts (non-negotiable)

| Surface | Owner track | Rule |
|---------|-------------|------|
| MCP tool **names + arg schemas** (Guardian tools; RAG tools as called by Guardian) | **Track 1 (Guardian)** | RAG may implement behavior but must not rename/reshape without a Track 1 contract change first |
| `GuardianReport` / brief fields / `compileGrokBrief` | **Track 1** | RAG never invents report shape |
| `preflight.ts`, `llm-assessment.ts`, `memory-writeback.ts`, Guardian `server.ts` | **Track 1 only** | Track 2 does not open these files |
| `source-priority.ts`, indexer, reindexer, manifest, vector store IDs | **Track 2 (RAG) only** | Track 1 may *request* role boosts via a short contract note, not edit by default |
| `project_source_files/*` narrative canon | **Human-led** or one designated track | Agents must not both rewrite `current-state.md` |
| Master roadmap / definition-of-done docs | **Human / Fable** | Executors implement; they should not fork the north star mid-slice |

### Conflict rule

If a slice needs both Guardian and RAG contract changes, it is **not parallel** — demote that slice to **A** (sequential).

### Session handoff template (paste into every new executor session)

```text
Baseline tag/commit: <hash or tag>
Branch: <name>
Contract freeze version: <date or doc section>
Do not edit: [list owned by other track]
In scope this session: [one slice]
Acceptance: npm test && npm run build  [+ preflight check / eval:fast if defined]
Last green preflight artifact: <streamlined/full pair id if any>
```

---

## 3. Comfortable work-package size per session

**Sweet spot: one “P0 table row” or one thin vertical slice — not one full pillar.**

| Package size | Comfort for this executor | Quality risk |
|--------------|---------------------------|--------------|
| **1 focused slice** (e.g. precedent recency scoring *only*, or scorecard script *only*) | **Best** | Low |
| **1 small vertical** (schema field + compiler + one test + one report check) | Good | Medium if more than ~6–8 files |
| **One full Fable pillar** (persona engine / NPC / dramaturg end-to-end) | **Too large** for one session | High — partial implement, docs drift, weak verification |
| **Multiple pillars** | Avoid | Very high |

### Practical rules of thumb

- Comfortable: **~1–3 core source files + tests + a short doc touch** per session.  
- Stop when: `npm test` + `npm run build` are green **and** (for Guardian) one real or fixture preflight is interpretable.  
- Prefer **“done and verified”** over “70% of a pillar.”  

**Request to Fable:** When consolidating the eight roadmaps, pre-split each pillar into **ordered tickets** (P0.1, P0.2, …) that each fit the box above. Do not hand the executor “implement the persona engine” as a single session.

---

## 4. Current branch state — stabilize before master roadmap execution

### Current feature branch (both repos)

`feature/guardian-depth-duplex-p0-p1-20260714`

(Created from prior `grok-4.5-handover` work; may still hold uncommitted local changes depending on operator commit status.)

### Do not start the master roadmap on a dirty dual-repo working tree

Stabilize first:

1. **Inventory what belongs in baseline “current build”**  
   Already valuable: brief quality (`compileGrokBrief`), expand/verify with budgets, 32k evidence, stage write-back, Nürburgring `current-state` / `event-log`, duplex **server** path, quality audits/docs.  
   Keep experimental untracked roadmaps as **docs-only** until the master index exists.

2. **Commit (or explicitly stash) both repos on the feature branch**  
   Prefer separate commits by concern (Guardian code/tests; RAG reindexer/state; docs).  
   **Never commit secrets** (`.env` with real keys).

3. **Verify green on the committed tip**  
   - `scarlett-guardian-mcp`: `npm test && npm run build`  
   - `rag-memory-mcp`: `npm run build`  
   - Optional baseline artifact: known-good live pair e.g. `preflight-*-2026-07-15T02-51-26-420Z` (duplex present, expand ok, stage write proven, weave solid).

4. **Create a tagged baseline, then cut roadmap work from it**  
   - Preferred: merge/stabilize to long-lived branch if used (`main` / `develop`), tag e.g. `guardian-baseline-2026-07-15`, then  
     `feature/master-roadmap-v1` from that tag.  
   - Or: keep the feature branch as baseline **only after it is committed and green**, and start every new phase as a **new branch from that tip** — stop piling pillars onto uncommitted work.

5. **Commit Fable’s eight docs (and the future master roadmap) as read-only input**  
   So every executor session can open them without depending on chat history.  
   Master roadmap consolidation can be a **docs-only** change before any code phase.

6. **Backlog items that should not block baseline merge**  
   - Store ID vs manifest mismatch  
   - Precedent temporal recency  
   - Hard duplex (browser bridge capture)  
   - Stage **approve** / session-closer workflow  
   - Event-log multi-section indexing  
   - Connection reuse in `RagMcpClient`  

### What not to do

- Do not open Track 2 RAG refactors while Guardian still has uncommitted preflight edits.  
- Do not rewrite the eight Fable docs mid-execution without a single master index.  
- Do not require a full monorepo process merge before Phase 1 of the master roadmap.

---

## 5. Compressed answers (for quick parse)

| # | Answer |
|---|--------|
| **(1) A or B** | **A** — sequential, verified slices. **B** only after contract freeze, and tracks must never share ownership of `preflight.ts` / tool schemas. |
| **(2) If B** | Dual feature branches → one integration branch; **Guardian owns** tool schemas + preflight + report shape; **RAG owns** index/reindex/`source-priority.ts`; narrative files human-gated; paste handoff every session. |
| **(3) Package size** | One P0 row / thin vertical (~1–3 core files + test + verify), **not** a full pillar. |
| **(4) Branch** | Commit + green-check `feature/guardian-depth-duplex-p0-p1-20260714` on **both** repos (or merge to a tagged baseline); commit Fable docs as input; start master roadmap as **new branches from that baseline**, not from a dirty tree. |

---

## 6. How this executor stays reliable (for roadmap authors)

Structure the master roadmap so each executable phase is:

1. **Small** (one ticket).  
2. **Sequential** (depends on prior green check).  
3. **Verified** (explicit acceptance commands).  
4. **Contract-owned** (one side of the dual-repo boundary owns shared shapes).

That matches how this agent actually delivers quality: **small, sequential, verified, contract-owned.**

---

## 7. Operator note

This document is the durable form of Grok Build’s planning reply for handoff into Fable 5’s consolidation step. No implementation is authorized by this file alone; it only constrains **how** future execution sessions should be scheduled and scoped.

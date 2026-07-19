# Cooperative multi-agent workflow — Engineering + Play

**Date:** 2026-07-19  
**Companion:** `handover-grok-build-to-cursor-2026-07-19.md`  
**North star:** `master-roadmap-2026-07.md`  
**Purpose:** Define how **Operator, Fable 5, GPT Sol, Gemini, and Grok** cooperate without double-writing canon, thrashing contracts, or burning token budget.

---

## 1. Two different “teams” (do not conflate)

| Team | Domain | Doc |
|------|--------|-----|
| **Engineering team** | Code, evals, MCP, roadmaps | This file + master roadmap + D10 |
| **RP agent team** | Live story on grok.com | `docs/agent-team-operating-order.md` |

Engineering agents **never** speak as Scarlett/Benjamin.  
RP agents **never** merge PRs or rewrite `preflight.ts`.

---

## 2. Engineering roster (2026-07-19)

### 2.1 Operator (human)

**Owns:** priorities, canon, staged approvals, token budget, live play as Benjamin, final “merge this”.

**Does:**

- Chooses next WP id from the master roadmap  
- Pastes session handoff template into the active agent  
- Runs or watches `npm run review:staged` for material canon  
- Plays RP; reports when story milestones hit (e.g. “driving finished”)  
- Moves work between Grok Build ↔ Cursor when budget demands  

**Does not:**

- Expect three agents to invent three different architectures for the same WP  

### 2.2 Fable 5 (Cursor Agents — architecture / docs)

**Owns:** design integrity, master-roadmap upkeep, contract freezes, WP splitting to D10 size, Living GM design docs.

**Typical model seat:** Cursor Agents sidebar (strong model when available).

**Does:**

- Reads D-docs and answers “what does the WP mean?”  
- Splits oversized asks into 1–3 file tickets  
- Updates progress ledger when operator confirms  
- Drafts charters, seed packs, feasibility (docs-only)  
- Produces handoffs for Sol / Grok  

**Does not:**

- Implement multi-file features in the same breath as redesigning them (unless operator explicitly wants a tiny doc+code pair)  
- Approve canon into `project_source_files/` without operator  
- Override D10 sequential law  

### 2.3 GPT Sol (Cursor Agents — cheaper implementer)

**Owns:** **one frozen WP at a time** — code, tests, short evidence doc, green checks.

**Why “Sol”:** Budget-preserving **GPT-class** implementer in Cursor, used when Grok Build weekly tokens are scarce. Name aligns with project language where **sol** is the cost-aware high-capability tier for offline / implementer work; **terra** remains the lighter tier for medium tasks / comparisons.

**Does:**

- Implements exactly the WP id given  
- Touches only files listed in that WP (or asks Fable for a contract note first)  
- Runs `npm test && npm run build && npm run eval:fast` for Guardian WPs  
- Writes `docs/fable-5-roadmaps-audits/wp-X.Y-*-evidence-YYYY-MM-DD.md`  
- Stops when green; does not “while I’m here” Phase 6  

**Does not:**

- Rewrite the master roadmap  
- Invent new MCP tool names without a Fable contract note  
- Edit RAG `source-priority` on a Guardian-owned WP without freeze  
- Author goldens that change product policy (Gemini + operator)  

**Handoff in to Sol:**

```text
You are GPT Sol, budget implementer for scarlett-guardian-mcp (+ rag-memory-mcp only if listed).
Master roadmap WP: <WP-id>
Design cite: <D# section>
Branch: <branch>
Files in scope: <list>
Files forbidden: <list>
Acceptance: npm test && npm run build && npm run eval:fast
Evidence doc path: docs/fable-5-roadmaps-audits/wp-...md
Do not expand scope. If blocked by design ambiguity, stop and ask Fable/Operator.
```

### 2.4 Gemini 3.1 Pro (reviewer + goldens + story co-pilot)

**Owns:** expectation quality, prompt critique, mutant/red-team thinking, **play co-pilot** for set pieces.

**Does:**

- Authors / revises golden `expectations` (WP-1.4 pattern) for operator review  
- Reviews Sol/Grok diffs for silent law breaks (outcomes in schema, hot-path second LLM, CORE writes)  
- Helps Operator finish track day / Affalterbach with beat discipline  
- Can run **manual Living GM O-1** cold reads (docs only)  

**Does not:**

- Become default production coder  
- Write final Scarlett RP prose (Lead stays on grok.com)  
- “Fix” cassettes to green a test  

**Prompt library already on disk:**

- `gemini-catchup-phase2-phase3-duplex-2026-07-16.md`  
- `gemini-catchup-phase3-green-phase4-l3-live-test-2026-07-17.md`  
- `gemini-prompt-track-day-setpiece-finish-2026-07-18.md` (refresh after driving finished)  

### 2.5 Grok 4.5 / Grok Build (heavy implementer + RP host)

**Owns:** primary implementation when token budget allows; **Lead prose** for Scarlett on grok.com with Guardian preflight.

**Does:**

- Same implementer contract as Sol, usually preferred for deep dual-repo familiarity  
- Live RP with Guardian brief injection  
- Occasional architecture second opinion when asked  

**Does not:**

- Run unbounded weekly sessions while Cursor promo tokens exist and budget is tight  
- Own the master roadmap (Fable does)  

### 2.6 Services (not agents, but seats)

| Service | Role |
|---------|------|
| **scarlett-guardian-mcp** | Preflight, dramaturg cache, serendipity, write-back decisions, dashboard |
| **rag-memory-mcp** | Vector search, source roles, stage/approve/reject, rotation |

Startup order (typical): RAG → Guardian → bridge/ngrok if used.

---

## 3. Decision rights matrix

| Decision | Who decides | Who executes | Who reviews |
|----------|-------------|--------------|-------------|
| Next WP id | Operator (+ Fable advice) | — | — |
| What a WP means | Fable + design doc | — | Operator ACK if ambiguous |
| Code for WP | Sol **or** Grok | Sol/Grok | Gemini optional; Operator merge |
| Golden expectations | Gemini draft | Sol/Grok wire if needed | Operator |
| Canon in corpus | Operator | staging / review:staged | Guardian gates |
| Arc plan beats open/closed | Play + Operator | Grok IC | Guardian brief |
| Living GM apply card | Operator only | future campaign-gm fan-out | Fable design |
| Kill a bad feature | Operator | any | ledger update |

---

## 4. Session shapes (copy/paste patterns)

### 4.1 Fable architecture session

```text
Role: Fable 5 — architecture only unless I explicitly ask for a tiny code fix.
Open: master-roadmap-2026-07.md §13 + D-doc for the WP under discussion.
Goal today: <clarify WP-5.9 / split tickets / Living GM charter draft / …>
Do not implement large code. Do not invent parallel roadmaps.
Output: decision note + exact paste block for Sol or Grok if implementation follows.
```

### 4.2 Sol implementer session

```text
Role: GPT Sol — one WP only.
WP: <id>
Cite: <path to D-doc section + master roadmap row>
Branch: feature/phase5-dramaturg
Acceptance: npm test && npm run build && npm run eval:fast
Evidence: docs/fable-5-roadmaps-audits/wp-<id>-evidence-<date>.md
Stop when green. List residual risks. Do not start the next WP.
```

### 4.3 Gemini review session

```text
Role: Gemini — review only.
Diff / files: <paste or path list>
Laws to check: pressure≠outcomes; one hot-path LLM; staging for canon;
knowledge human-always; cassettes frozen; contract ownership Guardian vs RAG.
Output: VERDICT pass | minor | hold + bullet findings only.
```

### 4.4 Gemini play co-pilot session

```text
Role: Gemini set-piece co-pilot (not code).
Live beat: Nürburgring Beat 3 debrief; driving portion finished.
Use latest streamlined preflight + current-state if provided.
Help Benjamin choose IC moves; keep forks open; no railroad to Affalterbach.
```

### 4.5 Grok Build implementer session (when budget allows)

Same as Sol, plus: prefer continuity with prior preserve branches and dual-repo habits; still one WP.

---

## 5. Conflict resolution

| Conflict | Resolution |
|----------|------------|
| Sol and Fable disagree on design | Fable writes one-paragraph contract note; Sol implements that; operator breaks ties |
| Sol and Grok both edit same files | **Forbidden** — only one implementer seat open per branch/WP |
| Gemini wants outcome language for “better drama” | Reject — laws win; rewrite as pressure/forks |
| Play needs a canon fact not in corpus | Operator stages via review tools; never silent invent in code |
| Token budget panic | Pause Grok Build; prefer Sol + Fable in Cursor; Gemini for reviews |

---

## 6. Cadence examples

### Engineering sprint day

```text
09:00 Operator: "WP-5.9 only"
09:05 Fable: confirms D9 scope, acceptance, forbidden files
09:15 Sol: implements
10:30 Sol: green + evidence doc
10:40 Gemini: optional hold/pass review
10:50 Operator: commit / push
11:00 Fable: ledger §13 → 5.9 done
```

### RP evening (track day finish)

```text
Guardian + bridge running
Operator plays Benjamin on grok.com
Gemini co-pilot on demand for debrief forks
No Sol/Fable code unless production broken
```

### Token-saving week

```text
Fable (Cursor)  = architecture 2–3 short sessions
Sol (Cursor)    = implement WPs
Gemini          = goldens + play help
Grok Build      = idle or RP-only until weekly refresh
```

---

## 7. Artifacts every WP must leave

1. Code on the agreed branch  
2. Tests green (`eval:fast` for Guardian behavior changes)  
3. Evidence markdown under `docs/fable-5-roadmaps-audits/`  
4. Ledger line updated in `master-roadmap-2026-07.md` §13 (Fable or implementer with operator OK)  
5. No secrets in git  

---

## 8. Related RP team (reminder only)

From `docs/agent-team-operating-order.md`:

```text
Every turn:     Memory Guardian → Lead (Scarlett prose)
On demand:      Plot Architect (possibilities only)
At boundaries:  Continuity Auditor (flags only)
```

Engineering multi-agent workflow **does not replace** this RP loop.

---

## 9. One-line summary

**Fable designs, Sol or Grok implements one ticket, Gemini reviews and co-pilots play, Operator owns canon and budget — and when Grok’s weekly tokens are tight, Cursor (Fable + GPT Sol) carries the engineering load without forking the master roadmap.**

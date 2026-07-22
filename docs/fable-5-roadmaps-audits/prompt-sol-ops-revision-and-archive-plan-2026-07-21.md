# Paste prompt — GPT Sol: OPS revision reliability + thread archival (PLAN MODE)

**Date:** 2026-07-21  
**Mode:** Plan only (high reasoning) — **no code** until Operator ACK  
**Author:** Grok Build (handoff for Cursor / GPT Sol)  
**Why this file exists:** Operator prefers disk files for copy/paste; Grok Build CLI selection/scroll is unreliable for long prompts.

**Related parking:** `ideas-parking-raw-thread-export-2026-07-21.md` (ARCH-1/2/3)  
**Related recent ops:** LIVE BEAT lag (Schloss Lieser force-sync); duplex WP-R1 floor; staged review CLI  

**Sol deliverable (this session only):**  
`scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/wp-ops-revision-and-archive-plan-2026-07-21.md`  
(or same stem with actual date)

---

## How to use

1. Open a **new Cursor thread** with **GPT Sol** in **plan mode**, high reasoning effort.  
2. Attach or `@` key paths if helpful (optional):  
   - `src/guardian/tools/preflight.ts`  
   - `src/guardian/duplex-cache.ts`  
   - `src/guardian/memory-writeback.ts`  
   - `src/guardian/server.ts`  
   - `docs/fable-5-roadmaps-audits/ideas-parking-raw-thread-export-2026-07-21.md`  
   - `docs/fable-5-roadmaps-audits/browser-bridge-duplex-architecture-2026-07.md`  
3. Copy everything under **PASTE BELOW** into the Sol thread.  
4. Wait for the plan doc + open questions. Do **not** authorize implement until you freeze WP order with “go”.

**Interim (while plan is unbuilt):** use OOC rewrite template in Grok Build chat history / operator runbook; `npm run review:staged -- list` after suspicious regens; do not approve staged current-state unless the scene truly moved.

---

## PASTE BELOW

```text
# GPT Sol — PLAN MODE ONLY (high reasoning)
# Work package family: Operator turn revision reliability + thread archival
# Brand: GPT Sol (implementer later). This session: DESIGN + WP BREAKDOWN ONLY.
# Do NOT implement code, edit canon, reindex, or open PRs until Operator says "go".

## 0. Who you are and how to work
You are GPT Sol on the AMG_GT_Black_Prototype dual-repo stack:
- scarlett-guardian-mcp (Guardian :8790) — preflight, auditor, duplex, write-back, bridge API
- rag-memory-mcp (RAG :8787) — vector store, staged updates, current-state / event-log

Plan mode rules:
1. Read before proposing. Cite file paths and existing behaviors.
2. Prefer small sequential WPs with frozen acceptance tests (master-roadmap style).
3. Human-gated narrative: never silent live overwrite of current-state without stage/approve path.
4. No exploit code. No secrets in docs.
5. Deliverable this session: ONE plan document under
   scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/
   named like: wp-ops-revision-and-archive-plan-2026-07-21.md
   (or today's date). Plus a short operator summary at the end of your reply.
6. End with: ordered WP list, effort, dependencies, risks, "Operator ACK gates", and what is explicitly deferred.

## 1. Mission
Design a thorough, production-grade solution so the Guardian + duplex + write-back stack **behaves correctly and predictably** when the operator:

A) **Edits their own (Benjamin) message** in the Grok UI, which forces Scarlett's reply to regenerate.
B) Presses the UI **Regenerate** button on Scarlett's reply (same Benjamin turn).
C) On a **later turn**, sends an **OOC rewrite request** (often short, poorly formatted) asking for a small change to the previous Scarlett reply — which also causes regeneration / a new assistant message.

Today these paths are only **partially** supported. Duplex overwrites on regen by design, and write-back is usually stage-only + blocked on do_not_proceed — so silent canon corruption is rare — but the system is **not equipped as a product** for revision workflows. Operators get full IC preflights on meta lines, false continuity pressure, accidental staged scene transitions, wasted tokens, and no first-class "prose revision / no scene advance" mode.

Also plan **related ops reliability** that must not be forgotten:
D) **Automated / one-click thread archival** once a thread is marked for archiving (or session-end), so platform truncation cannot erase play (see existing parking doc).
E) Optionally note **multi-scene LIVE BEAT lag** (play advanced; current-state lagged → false Director's Corrections) as a sibling WP — design only whether revision-mode and "operator force-sync LIVE BEAT" share machinery.

## 2. Why this matters (operator context)
- Thread 9: multi-scene travel (changing room → debrief → drive → Schloss Lieser cabin) outran current-state; Guardian correctly blocked against stale LIVE BEAT. Operator had to force-rewrite canon offline. Lesson: continuity system is strong when state is right, punitive when operator workflow (regen/OOC/edit) is underspecified.
- Operator will not accept "just don't regenerate" or "always use a perfect OOC template" as the only answer. Templates are interim; product should classify and gate.
- Play may continue toward Monday Affalterbach; this plan must be implementable **without blocking play**. Implementation can wait until after HQ set piece if Operator chooses — plan still must be complete.
- Do not wind down quality on this class of ops work. Prefer thorough phased WPs over a thin OOC-prefix-only fix.

## 3. Required reading (do all of these; quote paths in the plan)
Architecture / code:
- scarlett-guardian-mcp/src/guardian/tools/preflight.ts (write-back calls, live beat parse, duplex merge)
- scarlett-guardian-mcp/src/guardian/duplex-cache.ts (WP-R1 substantial floor, regen overwrite comment, TTL)
- scarlett-guardian-mcp/src/guardian/memory-writeback.ts (stage default, prose blocked, material gates)
- scarlett-guardian-mcp/src/guardian/server.ts (guardian_memory_preflight schema, /duplex-cache POST 422 rules, ooc consult if present)
- scarlett-guardian-mcp/src/guardian/tools/ooc-consult.ts
- scarlett-guardian-mcp/src/guardian/llm-assessment.ts (LIVE BEAT supersession, scene_transition, candidate_memory_update)
- scarlett-guardian-mcp/src/guardian/state-rewrite.ts (WP-4.2 staged overwrite path)
- Browser bridge docs + userscript location for duplex POST (search: duplex-cache, Guardian Bridge, userscript v2.1)
- scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/browser-bridge-duplex-architecture-2026-07.md
- scarlett-guardian-mcp/docs/review-staged-cli.md
- scarlett-guardian-mcp/docs/grok-test-setup-and-ooc-continuation-2026-07-15.md
- rag-memory-mcp/docs/single-agent-ooc-prefix-v4.txt (operator OOC habit)

Parking / related:
- scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/ideas-parking-raw-thread-export-2026-07-21.md (ARCH-1/2/3)
- master-roadmap notes on regeneration handling if any (grep regenerat in docs/fable-5-roadmaps-audits and master-roadmap)

Live ops reality check (read only; do not mutate):
- Latest preflight under docs/guardian-reports/ (note any suite transition staged after Schloss cabin)
- .rag-memory-mcp/staged-updates/ pending vs rejected
- current-state.md header (LIVE BEAT ground truth is disk + approved stage, not chat alone)

## 4. Problem decomposition (you must address each)

### 4.1 Three revision surfaces
For each of A/B/C above, document:
- What the Grok UI does (message graph / regen)
- What the bridge can observe (DOM, hash, last-good)
- What preflight receives (user_message, scarlett_previous_message, recent_context)
- What write-back may do (none / stage / live — live should remain discouraged)
- Failure modes (false block, false proceed + bad stage, duplex poison, double scene transition)

### 4.2 Classification
Propose how Guardian (and/or skill/project instructions) detect:
- pure IC advance
- OOC consult / systems question
- **prose_revision** (same beat, rewrite last Scarlett reply)
- edit-regenerate of Benjamin turn (new user_message, same scene)
- accidental short meta ("make her softer")

Prefer **explicit flags** over pure NLP when possible, e.g.:
- preflight arg: turn_kind = "ic" | "ooc_consult" | "prose_revision" | "ic_regen"
- or header token in user_message that preflight strips
- skill/project instructions that force turn_kind

NLP fallback is OK as soft signal, not sole authority.

### 4.3 Desired policy matrix (fill in the plan as a table)
Rows: A edit Benjamin | B UI regen Scarlett | C OOC rewrite next turn | normal IC | hard OOC systems  
Columns: run full preflight? | require duplex? | allow scene_transition? | allow memory_write/stage? | allow Director correction for "wrong location"? | brief style | bridge cache update rules

### 4.4 Write-back and staging
- prose_revision must **never** stage location jumps from the rewrite request text alone.
- edit-Benjamin regen may re-run preflight with new user_message; scene_transition only if LIVE BEAT + evidence support real move.
- UI regen: bridge must post **final** Scarlett text; intermediate partial bubbles must not poison cache (coordinate with WP-R1 floor).
- Staged junk after revision: operator recovery path (review:staged reject) must be documented; consider auto-tag staged rationale with turn_kind.

### 4.5 LIVE BEAT / multi-scene lag (sibling, design only)
When play advances multiple beats without approved state update, Director's Correction fights the thread.
Options to evaluate (pick recommend + defer):
1. Operator OOC force-sync workflow (manual current-state — current practice)
2. Staged multi-beat catchup rewrite (one approve)
3. preflight flag: operator_asserts_scene=... (dangerous; needs human gate)
4. Soften block when duplex+user_message strongly agree and current-state is stale by N hours — **high risk**; argue carefully or reject

Do not weaken LIVE BEAT as ground truth without a human gate story.

### 4.6 Thread archival (include in same plan, separate WPs)
Using ideas-parking-raw-thread-export-2026-07-21.md:
- ARCH-1: one-click / menu export full visible thread → local .md or .jsonl under backups/threads/
- ARCH-2: truncation warning (bubble count drop)
- ARCH-3: optional Guardian JSONL spine from each preflight (user + duplex), not a substitute for full DOM export
- **Mark for archiving** workflow: operator flag (UI pill, menu, or OOC command) → auto export + optional rename/freeze thread id → never auto-index raw erotic/full thread into live narrative VS without review

Archival must NOT dump raw threads into the live vector store by default.

### 4.7 Eval / telemetry
Propose goldens (eval:fast or new cases), e.g.:
- prose_revision does not set scene_transition
- prose_revision → memory_write action none
- short OOC ack does not enter duplex (already R1 — verify interaction)
- ic_regen with new Benjamin line still retrieves LIVE BEAT correctly
- archival export is hermetic/unit-testable where possible (DOM fixtures if bridge)

Telemetry: turn_kind on preflight events; revision rate; staged-from-revision count.

### 4.8 Operator docs / skill / project instructions
Plan updates to:
- OOC prefix (v4 or new v5 snippet): rewrite template + when to skip tools
- guardian model instructions / duplex skill lines
- short operator runbook: "How to regenerate safely"

Interim templates are OK as WP-0; code is WP-1+.

## 5. Non-goals (explicitly out of first implementation slice)
- Living GM / offline proposal log (Phase 6.5) — mention only if it shares transcript capture
- Full anti-paraphrase "personhood" agent team restoration
- Affalterbach narrative writing
- Silent auto-approve of staged current-state
- Indexing raw full threads into production VS without human review
- Regenerating frozen eval cassettes to force green

## 6. Constraints
- TypeScript ES modules, .js extensions in imports, 2-space indent
- Preserve WP-R1 duplex substantial floor (200+ / structure / 422)
- Preserve human stage/approve for current-state overwrites
- Cassettes frozen; add new goldens rather than mutating old ones casually
- Branches: work on feature/* from current post-R4 line; do not invent merge strategy without Operator
- Cost: prefer deterministic classification before extra LLM calls; if LLM classifier needed, budget it and make it optional behind flag

## 7. Deliverable structure for the plan document
Write the markdown plan with these sections:

1. Executive summary (1/2 page)
2. Current behavior audit (A/B/C with code citations)
3. Policy matrix (table)
4. Recommended architecture (diagrams in mermaid OK)
5. WP breakdown — each WP must have:
   - ID (e.g. OPS-REV-0, OPS-REV-1, ARCH-1)
   - Goal
   - In scope / out of scope
   - Files likely touched
   - Acceptance tests (concrete commands / behaviors)
   - Risk + rollback
   - Depends on
   - Effort (S/M/L)
6. Sequencing recommendation:
   - What can ship before Affalterbach play finishes
   - What should wait until after HQ set piece
   - What is docs-only interim this week
7. Open questions for Operator (numbered, decide-before-code)
8. Explicit statement of what Sol must NOT do until ACK

## 8. Suggested WP skeleton (you may rename/refine after audit — do not rubber-stamp)
Refine after reading code; this is a starting skeleton not orders:

- **OPS-REV-0** — Operator runbook + OOC rewrite template + skill/project wording (no code). Acceptance: paste templates in docs; Operator can revise prose without staging.
- **OPS-REV-1** — `turn_kind` / prose_revision on preflight API + classification + suppress scene_transition + suppress memory_write for revision kinds. Unit tests.
- **OPS-REV-2** — Bridge: regen detection, only cache final substantial Scarlett bubble; optional "revision in progress" so partials don't post. Align with R1 floor.
- **OPS-REV-3** — Brief/auditor prompt: when turn_kind=prose_revision, correct style/continuity of the *reply under edit*, do not relocate scene; no Director "return to X" unless LIVE BEAT truly conflicts with claimed IC (define carefully).
- **OPS-REV-4** — Eval goldens + telemetry fields for turn_kind / revision.
- **OPS-REV-5** (optional) — Multi-beat LIVE BEAT catchup: staged rewrite helper or operator CLI to set LIVE BEAT from a structured summary without full manual markdown craft.
- **ARCH-1** — One-click / mark-for-archive full thread export to backups/threads/
- **ARCH-2** — Truncation warning
- **ARCH-3** — Guardian JSONL spine (preflight turns only)

Mark which of these are must-have vs nice-to-have for "revision reliability v1".

## 9. Definition of done for THIS plan session
- [ ] Plan file written under fable-5-roadmaps-audits/
- [ ] All three revision surfaces covered with policy matrix
- [ ] ARCH WPs included as separate IDs (not buried)
- [ ] Multi-scene lag either has a WP or an explicit "deferred with reason"
- [ ] Acceptance tests are implementable (not vibes)
- [ ] Open questions listed for Operator
- [ ] No code changes in repos except the plan markdown (and optionally a one-line index link in a roadmap README if one exists — optional)
- [ ] Final message to Operator: "ready for ACK" + recommended first implement WP

## 10. Stop conditions
If you discover the bridge cannot distinguish UI regen from normal completion, say so and design around final-hash POST only.
If Grok UI never exposes "edited user message" as a distinct event, design classification from preflight args + skill instructions, not fantasy DOM events.
If anything requires platform APIs we don't have, park it — do not invent scrapers that violate ToS; stick to Tampermonkey-visible DOM and local Guardian.

## 11. After Operator ACK (not this session)
Implement OPS-REV-0 or OPS-REV-1 only when Operator freezes scope with "go". One WP per Sol session unless Operator expands.

Begin by reading the listed files and writing the plan. High thoroughness. No implementation.
```

---

## Operator note (Grok Build CLI UX)

If selection/scroll in the TUI is painful: **always ask for “write that to disk under docs/…”** for long prompts, Sol handoffs, and OOC templates. Prefer opening the file in the editor or `cat`/`less` in a normal terminal for copy.

**Path for this prompt:**

`scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/prompt-sol-ops-revision-and-archive-plan-2026-07-21.md`

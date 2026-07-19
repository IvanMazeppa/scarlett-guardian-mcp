# Handover — Grok Build → Cursor Agents sidebar

**Date:** 2026-07-19  
**From:** Grok Build (this session + prior implementation work)  
**To:** Cursor Agents sidebar (Fable 5 primary; GPT Sol as cheaper implementer; Gemini as reviewer / story co-pilot)  
**Why:** Grok Build has consumed ~60% of the Operator’s weekly token budget. Cursor Agents sidebar currently has a promotional discount (~50% off) and can also draw free account tokens. Engineering and architecture continue there; Grok returns later for heavy implementer bursts when budget allows.

**Status of this document:** Operational handoff. Authorizes reading and planning. Does **not** authorize random new pillars. Code only after an explicit WP id from the master roadmap (or operator exception).

---

## 0. Start here (mandatory read order)

Do this **before** writing code or inventing new architecture.

### 0.1 Always open first

| Order | Path | Why |
|------:|------|-----|
| 1 | `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md` | Single north star. Phases, WPs, scheduling law, **progress ledger §13**. |
| 2 | `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/executor-preferences-grok-build-2026-07.md` | Ticket size, sequential execution, contract ownership (D10). |
| 3 | This file | Current status, story position, open work, multi-agent protocol. |
| 4 | `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/cooperative-multi-agent-workflow-2026-07-19.md` | Who does what (Fable / Sol / Gemini / Grok / Operator). |
| 5 | `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/cursor-agent-paste-prompt-2026-07-19.md` | Paste-ready first message for a new Cursor Agents thread. |

### 0.2 Design docs by next work (read the D-doc for the WP you touch)

| If next work is… | Read first |
|------------------|------------|
| **WP-5.9** NPC state deltas / knowledge gates | D9 `guardian-npc-state-management-design-2026-07.md` (+ brief touch of D7 dramaturg, D4 write-back) |
| **WP-5.10** Affalterbach live ensemble stress | D9 §9; current-state / latest preflight; arc plans |
| **Phase 6** compression / persona / draft-arc-plan | D5 `memory-compression-pipeline-roadmap-2026-07.md`, D8 `guardian-persona-engine-design-2026-07.md` |
| **Living GM** (docs only for now) | `fable5-living-gm-feasibility-2026-07-18.md`, `ideas-parking-living-gm-truman-2026-07-18.md`, prompts `fable5-prompt-living-gm-*` |
| **Eval / goldens** | D2 `guardian-eval-harness-design-2026-07.md`, `evals/golden/MANIFEST-wp-1.4.md` |
| **Duplex / bridge** | D6 `browser-bridge-duplex-architecture-2026-07.md`, `docs/browser-bridge-v2-install.md` |
| **Serendipity / write-back** | D4 `guardian-writeback-recency-serendipity-roadmap-2026-07.md` |

Full D1–D11 index is in master roadmap §0.

### 0.3 Repos and branches (verify live; do not trust memory)

```text
Monorepo root:   /home/maz3ppa/projects/AMG_GT_Black_Prototype
Guardian:        scarlett-guardian-mcp/     branch feature/phase5-dramaturg  (as of this handoff)
RAG sibling:     rag-memory-mcp/
Narrative corpus:project_source_files/   (human-gated unless WP says heading-only)
Design + WPs:    scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/
Live reports:    scarlett-guardian-mcp/docs/guardian-reports/   (often gitignored)
```

At handoff tip (Guardian):

- Latest feature commits through **WP-5.8** (`41f064a` Scene Cast brief).
- Uncommitted / untracked: Living GM docs, immersion ideas, this handover pack, dramaturg-context churn.
- Parent monorepo may still have weak/no git history; treat Guardian + RAG as the real repos.

**Session handoff template** (paste into every executor session):

```text
Baseline tag/commit: guardian-baseline-2026-07-15 / current tip of feature/phase5-dramaturg
Branch: feature/phase5-dramaturg  (or next phase branch if cut)
Master roadmap WP: <id, e.g. WP-5.9>
Design doc: <D-number + section>
Do not edit: [files owned by other side / other WPs]
Acceptance: npm test && npm run build [+ eval:fast / preflight check per WP]
Last green preflight artifact: preflight-full-2026-07-19T17-32-11-689Z (local)
```

---

## 1. What just happened in Grok Build (this transfer window)

### 1.1 Thread recovery (done)

- Fable 5’s long Agents-sidebar thread **disappeared from the active list** but was **not deleted**.
- Root cause: **`isArchived: true`** in Cursor `composerHeaders`.
- Misleading UI title: **“Health check results”** (early session name).
- Session ID: `1401cf7a-5af5-42ab-a1be-39d2b5824b13`.
- Operator has **restored visibility** of that thread.
- Durable backup (keep even after restore):

```text
backups/cursor-agent-threads/LATEST-fable5-agent-sidebar/
backups/cursor-agent-threads/*.tar.gz
scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/fable5-agent-thread-backup-2026-07-19.md
```

Readable export: `exports/conversation-readable.md` inside that backup.

### 1.2 Living GM discussion (docs only — no code)

- Operator shared campaign-level **Living Gamemaster** idea at an inflection point.
- Fable wrote: `fable5-living-gm-feasibility-2026-07-18.md` → **feasible-with-constraints**.
- Parking: `ideas-parking-living-gm-truman-2026-07-18.md` (Truman Show / Christof analogy: direct the *environment*, not puppet Scarlett every line).
- **Five operator questions still unanswered** (charter depth, Ryan pacing, bliss/danger mix, sol budget, ensemble seeds).
- **Do not implement GM-0…GM-4 yet** unless operator re-prioritizes. Default: finish Phase 5 hands (5.9 → 5.10), parallel docs only.

### 1.3 Why leave Grok Build now

- Weekly SuperGrok / Grok Build token budget ~**60% used**.
- Cursor Agents sidebar: promo discount + free-tier tokens → preferred seat for **architecture (Fable)** and **cheaper implementation (GPT Sol)** until Grok budget refreshes.
- Grok remains the preferred **heavy implementer** when budget allows; Sol is the budget-preserving substitute, not a second north-star.

---

## 2. Engineering status (truth = progress ledger)

Source of truth: **master-roadmap §13**. Summary at 2026-07-19:

| Phase | Status |
|-------|--------|
| 0 Stabilize | **done** (`guardian-baseline-2026-07-15`) |
| 1 Eval + telemetry | **done** |
| 2 Foundations (recency, live beat, staging, rotation) | **done** (ops follow-up: some staged `current-state` still to review) |
| 3 Duplex shadow bridge | **done** (3.3 polish optional; 3.5 deferred) |
| 4 Write-back + Serendipity 2.0 | **done** except **4.5** transition auto-approve burn-in **pending** |
| 5 Dramaturg + NPC | **5.1–5.8 done**; **5.9–5.10 pending** |
| 6 Arc-close ceremony | **pending** |
| 7 Polish / interceptor / index recency | **pending** |
| Living GM Phase 6.5 | **docs only** (parked) |

### Next engineering tickets (default order)

1. **WP-5.9** — `npc_state_changes` schema + staging route; knowledge changes **human-always** (D9).  
2. **WP-5.10** — Affalterbach presentation as **live ensemble stress test** (ops + play; after 5.9 if possible).  
3. Then Phase 6 WPs (compression → persona → draft-arc-plan → ceremony).  
4. Parallel cheap docs: Living GM seed pack + conflict charter (no code).  
5. Ops debt: `npm run review:staged` for remaining Jul 15/16 `current-state` pendings if still open.

### Verification contract (every code WP)

```bash
# Guardian
cd scarlett-guardian-mcp
npm test && npm run build && npm run eval:fast

# RAG (only if WP touches RAG)
cd ../rag-memory-mcp
npm run build
# + eval:memory when ranking/index contracts change
```

**Standing laws (do not violate):**

1. One WP per session; sequential; no parallel tracks on shared contract files.  
2. ~1–3 core source files + tests + short evidence doc per WP.  
3. Hot path: **one LLM call per turn** on preflight. Background dramaturg/cache only.  
4. Pressure **never** outcomes (dramaturg, serendipity, future Living GM).  
5. Canon writes only through **staging + human review** (except configured auto-approve for beats).  
6. Cassettes frozen; red eval → fix code or consciously amend expectation — never delete traps.  
7. Guardian owns preflight/schemas/brief; RAG owns index/manifest/source-priority.  
8. Narrative under `project_source_files/` is **human-gated**.

---

## 3. Story status — Nürburgring track day (live RP)

### 3.1 Operator report (this handoff)

- Thorough **Nürburgring** test / track-day run is **basically complete** (evening update).
- **Driving portion finished** earlier; debrief/pit work ran the day.
- Narrative moves to **RP Thread 9** and Affalterbach runway.
- **Duplex:** mixed `bridge_cache` vs `absent` across 2026-07-19 reports — treat as TM/bridge teething; do **not** block WP-5.9 on a duplex rewrite.

### 3.2 Latest Guardian brief snapshot

Artifact: `docs/guardian-reports/preflight-streamlined-2026-07-19T17-32-11-689Z.md`  
(Full twin: `preflight-full-2026-07-19T17-32-11-689Z.json`)

| Field | Live read |
|-------|-----------|
| Place | Nürburgring Industry Pool, pit box |
| Time | Friday early afternoon |
| Car | Black Panther **stationary** after completed shakedown |
| Lap note | Telemetry shows **6:54.2** Nordschleife (verify against play before treating as hard canon if ambiguous) |
| Beat | **Beat 3** — post-shakedown pit-box handoff / debrief (arc-09) |
| Scarlett | Exiting hot cockpit; should **lead** driver debrief |
| Cast | Benjamin at door; Shevchenko; AMG engineers; Albion; paddock ambient |
| Next obligations | Telemetry review before leaving circuit; **Beat 4** hotel / Affalterbach only when day can wind down |
| Correction note | Prior Grok turn risked inventing attack-lap state; brief insists completed-shakedown return + pit-box handoff |

### 3.3 Arc plan map (`arc-plans/arc-09-nurburgring-track-day.md`)

1. Beat 1 Arrival — largely done  
2. Beat 2 Green Hell (open outcomes) — **driving portion finished per operator**  
3. Beat 3 Adrenaline crash & debrief — **live**  
4. Beat 4 Hotel / Affalterbach runway — **conditional**, do not force mid-debrief  

Set-piece co-pilot prompt (may need **refresh** after driving finished):

- `gemini-prompt-track-day-setpiece-finish-2026-07-18.md`

**Play law:** Guardian + arc plan **guide pressure**; Operator + Grok.com RP **resolve outcomes**. No agent preordains whether aero is “proven,” whether she goes out again (now less relevant if driving is closed), or Affalterbach results.

### 3.4 After track day

- Story path: finish debrief → close day → travel → **Affalterbach presentation** (WP-5.10 ensemble stress).  
- Germany arc eventually closes → Phase 6 ceremony (compression + persona + next plan).  

---

## 4. Multi-agent cooperative workflow (summary)

Full protocol: **`cooperative-multi-agent-workflow-2026-07-19.md`**.

| Seat | Identity | Owns | Does not own |
|------|----------|------|--------------|
| **Operator** | Human (Benjamin in RP; integration outside RP) | Canon approvals, staged review, priorities, tokens, play | Must not be replaced by any agent deciding canon alone |
| **Fable 5** | Cursor Agents — architecture | Designs, master roadmap upkeep, WP splits, contract notes, Living GM design | Implementation of large code WPs unless operator asks |
| **GPT Sol** | Cursor Agents — cheaper implementer | One WP at a time: code + tests + evidence doc | Forking roadmap; canon rewrites; multi-pillar sessions |
| **Gemini 3.1 Pro** | Separate CLI / chat | Golden expectations, prompt review, red-team gates, **story set-piece co-pilot** | Production code as primary implementer; final RP prose as Scarlett |
| **Grok 4.5 / Grok Build** | CLI / Grok Build UI | Primary heavy implementer when budget allows; live Scarlett RP on grok.com | Not the architecture owner; not unlimited weekly use |
| **Guardian MCP** | Service | Preflight truth / brief / staging decisions | Not a “character” |
| **RAG MCP** | Service | Retrieval, index, staging tools | Not story voice |

### Terra vs Sol (model-tier language already in designs)

In design docs, **terra** / **sol** often mean model *effort/cost tiers* for Guardian offline passes (e.g. state-rewrite medium terra; Living GM cold-read terra vs sol).  

**In this handoff, “GPT Sol” specifically means:** use a **GPT-class model in Cursor** as the **budget implementer** paired with Fable, so Grok Build tokens are conserved. Prefer Sol for:

- Single-file / small-WP implementation  
- Tests and evidence markdown  
- Mechanical refactors with a frozen contract  

Prefer Fable (stronger / architecture) for:

- Cross-cutting design, contract freezes, WP splitting  
- Ambiguous D9/D8 decisions  
- Living GM charter / seed design  

Prefer Grok Build when:

- Weekly tokens recover  
- Hard dual-repo or large verification loops  
- Operator wants the historical implementer continuity  

Prefer Gemini for:

- WP-1.4-style golden expectations  
- Prompt red-teams  
- Live track-day / Affalterbach **play co-pilot** (not code)

### Cadence (do not run everyone every turn)

```text
Engineering day:
  Fable  → confirms WP scope + design cite
  Sol or Grok → implements one WP
  Gemini → reviews diff / goldens when gates/prompts change
  Operator → accepts commit, runs live preflight if needed

RP day:
  Guardian preflight every turn (service)
  Grok.com Lead prose every turn
  Gemini set-piece co-pilot on demand
  Fable/Sol stay out of IC voice
```

---

## 5. Open questions / parked ideas

### Living GM (await operator)

1. Service sparseness — hard never-canonize line vs soft default?  
2. Ryan wedding-sabotage-class cards — propose soon or hold until wedding arc?  
3. Bliss/danger target mix (e.g. 40/60)?  
4. Sol budget for campaign GM passes per week?  
5. Scarlett-side ensemble seeds — invent vs pre-named?

### Engineering debt / partials

- WP-4.5 transition auto-approve burn-in  
- Staged `current-state` pendings (review:staged)  
- Bridge 3.3 calibrate polish optional  
- gt-040 duplex null note in golden inventory  
- Commit untracked Living GM / handover docs when ready  

### Product docs still authoritative

- `scarlett-guardian-mcp/AGENTS.md` — eval gates, ownership  
- `docs/agent-team-operating-order.md` — **RP** four-agent team (Guardian / Lead / Plot Architect / Continuity Auditor) — separate from **engineering** multi-agent team  

---

## 6. Immediate recommended next actions for Cursor

### Path A — Engineering (default) — **Thread 9 implementer**

1. Open a **new** Cursor Agents chat (not Fable’s). Full setup: `cursor-thread-9-setup-2026-07-19.md`.  
2. Mode: **Agent** (optional single **Plan** turn first). Attach **D9**.  
3. Sol implements **WP-5.9** only after Operator says go.  
4. Green: `npm test && npm run build && npm run eval:fast`.  
5. Evidence doc + update master-roadmap ledger §13.  
6. Grok Build CLI: leave idle for this WP until token reset.  

### Path B — Play (RP Thread 9 / Affalterbach)

1. Story on grok.com; track day closed.  
2. Gemini co-pilot for Affalterbach runway if needed.  
3. Does not require Cursor Agent mode.  

### Path C — Living GM docs only (Fable thread)

1. Answer five operator questions.  
2. Draft `campaign-seeds/` + `conflict-charter.md` (GM-0 docs).  
3. Manual O-1 cold read via Gemini (no code).  

### Path D — Duplex TM (later, separate mini-session)

1. Collect 2–3 full reports with `duplex_source` bridge_cache vs absent.  
2. Check userscript status pill, Guardian `/duplex-cache`, thread_key.  
3. Do not mix with WP-5.9.  

---

## 7. Safety / secrets

- Never commit `.env`, bearer tokens, ngrok URLs, API keys.  
- Prefer local `127.0.0.1` for Guardian/RAG; tunnels only when needed.  
- Reports under `docs/guardian-reports/` may be gitignored — cite paths in evidence docs, don’t force-commit secrets or huge dumps.  

---

## 8. One-line summary

**Phases 0–5.8 are built; next code is WP-5.9 then Affalterbach (5.10); Nürburgring driving is done and Beat 3 debrief is live; Living GM is designed but parked; move architecture and cheap implementation to Cursor (Fable + GPT Sol) with Gemini reviewing and co-piloting play, and hold Grok Build for when the weekly token budget can afford the heavy implementer seat again.**

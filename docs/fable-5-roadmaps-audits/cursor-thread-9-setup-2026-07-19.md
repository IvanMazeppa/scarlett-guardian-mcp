# Cursor Thread 9 — setup guide (implementer seat)

**Date:** 2026-07-19 (evening)  
**Thread name (suggested):** `Thread 9 — GPT Sol implementer / Phase 5`  
**Role of this thread:** **Budget implementer** (GPT Sol), **not** Fable architecture.  
**Separate from:** Fable 5 long architecture thread (`1401cf7a…` / “Health check results”).  
**Grok Build CLI:** stays warm until tokens reset tomorrow; do not run the same WP in both seats.

---

## 1. Mode choice (Plan / Agent / Debug)

| Mode | Use for this thread? | When |
|------|----------------------|------|
| **Plan** | Optional first turn only | If you want a scope readback of WP-5.9 before any edits. One plan cycle max. |
| **Agent** | **Yes — primary** | Implementation of a frozen WP (code + tests + evidence). |
| **Debug / Ask** | No for default work | Only if a concrete failure is under investigation (red `eval:fast`, runtime crash). |
| **Edit / manual** | Not needed | Agent should apply patches. |

### Recommendation

1. **Start in Plan** for 1 message *or* paste the Sol prompt below with “propose scope first, wait for OK.”  
2. After you reply **“implement WP-5.9”** → switch to / stay in **Agent**.  
3. Do **not** leave it in Plan for the whole session (it will over-design and burn tokens without shipping).  
4. Do **not** use Debug unless something is broken after green unit tests.

Fable thread (other sidebar chat): keep that for architecture / Living GM / ledger; **this** thread codes.

---

## 2. Attachments checklist

### Already attached (good)

- `README-handover-pack-2026-07-19.md`
- `handover-grok-build-to-cursor-2026-07-19.md`
- `cooperative-multi-agent-workflow-2026-07-19.md`
- `story-status-nurburgring-2026-07-19.md`
- `master-roadmap-2026-07.md`
- `executor-preferences-grok-build-2026-07.md`

### Add these before first code turn

| Doc | Why |
|-----|-----|
| **`guardian-npc-state-management-design-2026-07.md` (D9)** | WP-5.9 design source — **required** |
| **`cursor-thread-9-setup-2026-07-19.md`** (this file) | Thread charter + mode + first message |
| **`cursor-agent-paste-prompt-2026-07-19.md`** | Optional; Prompt B is mirrored below |

### Do not attach yet (noise)

- Full Living GM feasibility stack  
- All D1–D11 designs  
- Entire `guardian-reports/` tree  

If duplex debugging later: attach `browser-bridge-duplex-architecture-2026-07.md` + one full report with `duplex_source` — **separate** session or after 5.9.

---

## 3. Model / seat naming

- Prefer a **GPT-class** model if that is the promo / free-token path (this is “GPT Sol”).  
- Stronger models: OK for hard WP-5.9 schema work; not required for every file touch.  
- Do **not** also open a second Agent coding the same WP in Fable’s thread.

---

## 4. First message (paste into Thread 9)

```text
You are GPT Sol — budget implementer for scarlett-guardian-mcp.
This is Cursor Thread 9 (implementer). Fable 5 is a SEPARATE architecture thread — do not act as Fable.

## Mandatory context (already attached)
- master-roadmap-2026-07.md (§1 scheduling law + §13 ledger)
- executor-preferences-grok-build-2026-07.md (D10)
- handover-grok-build-to-cursor-2026-07-19.md
- cooperative-multi-agent-workflow-2026-07-19.md
- story-status-nurburgring-2026-07-19.md / Thread 9 setup
- guardian-npc-state-management-design-2026-07.md (D9) — required for WP-5.9

## Story note (do not play RP here)
- Track day testing is COMPLETE for engineering purposes.
- Narrative moves to RP Thread 9 / Affalterbach runway next.
- Do not invent story beats; do not write Scarlett prose.

## Duplex note (do not fix in this WP)
- Live track-day preflights today mixed: some duplex_source=bridge_cache, later ones often absent.
- Treat as likely Tampermonkey / bridge teething, not a reason to expand scope into Phase 3 rewrites.
- Log as residual risk only.

## Assignment
Master roadmap WP: WP-5.9
Cite: D9 + master roadmap WP-5.9 row
Branch: feature/phase5-dramaturg (verify with git)
Task: npc_state_changes schema + staging route; knowledge = human-always;
played disposition shifts survive to next session brief.

## Process
1. First reply: scope only — files in/out, acceptance tests, risks. WAIT for Operator "go".
2. On "go": implement only WP-5.9.
3. Acceptance: npm test && npm run build && npm run eval:fast
4. Evidence: docs/fable-5-roadmaps-audits/wp-5.9-npc-state-changes-evidence-YYYY-MM-DD.md
5. STOP. Do not start WP-5.10, Phase 6, Living GM, or duplex bridge work.

## Forbidden
- Editing RAG source-priority unless WP lists it
- Rewriting project_source_files canon
- Regenerating frozen eval cassettes to force green
- Multi-WP sessions
```

---

## 5. Operator checklist (besides attachments)

| # | Action | Done? |
|---|--------|-------|
| 1 | Workspace = AMG_GT_Black_Prototype (Guardian + RAG folders visible) | |
| 2 | Terminal/cwd can reach `scarlett-guardian-mcp` | |
| 3 | Branch `feature/phase5-dramaturg` (or note if different) | |
| 4 | `.env` present locally; agent must **not** commit secrets | |
| 5 | Only **one** implementer thread open for WP-5.9 | |
| 6 | Fable thread: architecture only until 5.9 lands | |
| 7 | After green: you review evidence doc + optional commit | |
| 8 | Update master-roadmap §13 when WP lands (or ask Fable to) | |
| 9 | Grok CLI: idle for this WP until token reset (unless emergency) | |
| 10 | RAG/Guardian services: not required for pure schema unit tests; needed for live preflight smoke | |

### Optional before coding

```bash
cd scarlett-guardian-mcp
git status --short --branch
npm test && npm run eval:fast   # confirm baseline green
```

---

## 6. After WP-5.9 (Thread 9 next messages)

Default sequence:

1. Operator commits / pushes (or asks Sol for commit message only).  
2. Either:  
   - **Same thread:** “next is WP-5.10 is ops/play — do not code; summarize Affalterbach readiness”  
   - **Or stop** and use Fable thread for Phase 6 planning  
3. Duplex TM issues → **new** short Debug/Agent session with bridge docs only (do not mix with 5.9).

---

## 7. Story vs engineering (Thread 9 boundary)

| Concern | Where |
|---------|--------|
| Code WP-5.9 | **This Cursor thread (Agent)** |
| Architecture / Living GM | Fable Cursor thread |
| Live RP Thread 9 / Affalterbach | grok.com + Guardian preflight (+ Gemini co-pilot) |
| Heavy implementer after token reset | Grok Build CLI tomorrow |
| Duplex TM flaky | Separate mini-debug later |

---

## 8. One-line charter

**Thread 9 = GPT Sol implements one frozen WP at a time in Agent mode; Fable stays architecture; play and duplex drama stay out of this chat unless the Operator opens a dedicated debug turn.**

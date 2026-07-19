# Handover — This Grok session → Cursor Agents sidebar

**Date:** 2026-07-20 (token-transfer window)  
**From:** Grok Build / Grok CLI session on `AMG_GT_Black_Prototype` (the coordination thread that produced the handover pack, Thread 9 setup, Living GM resume, and WP-5.9 scope approval)  
**To:** **New** Cursor Agents sidebar chat (Grok 4.5 High is fine — currently 50% off tokens in Cursor)  
**Why:** Weekly Grok token budget is ~**60% consumed** by productive coding/coordination. Continue discussion and light architecture in Cursor without losing this thread’s context. Heavy Grok CLI returns after reset if needed.

**Status of this document:** Context freeze + transfer instructions. Authorizes **discussion and design**. Does **not** authorize expanding Living GM or NPC systems into code until Operator freezes a WP after further design talk.

---

## 0. What this Cursor chat is (and is not)

| This new Cursor chat | Other Cursor chats |
|----------------------|--------------------|
| **Coordination + product discussion** seat that continues *this* Grok conversation | **Fable 5** long architecture thread (`1401cf7a…`, UI title often “Health check results”) |
| Holds GM / NPC / “how does the stack work” conversation | **Thread 9 — GPT Sol implementer** (WP-5.9 code only; separate) |
| May refine design docs and produce Sol paste blocks | Does **not** replace Sol for WP implementation |
| Prefer Grok 4.5 in Cursor while promo lasts | Grok **CLI** idle until weekly budget recovers |

**Rule:** One implementer at a time on code WPs. If Thread 9 is mid-WP-5.9, this chat discusses only — do not dual-edit the same files.

---

## 1. Session history (what we did together — preserve this)

Chronological recovery of *this* Grok thread (not the Fable transcript):

1. **`/resume-cursor` Living GM**  
   - Located Fable Agents transcript `1401cf7a-5af5-42ab-a1be-39d2b5824b13`.  
   - Living GM feasibility already written: `fable5-living-gm-feasibility-2026-07-18.md` (feasible-with-constraints).  
   - Session stopped on **five unanswered operator questions** (Service sparseness, Ryan pacing, bliss/danger mix, sol budget, ensemble seeds).

2. **Fable thread “disappeared” from sidebar**  
   - Not deleted: **`isArchived: true`** in Cursor `composerHeaders`.  
   - Misleading name: **“Health check results”**.  
   - Operator restored visibility.  
   - Durable backup: `backups/cursor-agent-threads/LATEST-fable5-agent-sidebar/` (+ `.tar.gz`).

3. **Engineering handoff pack written** (Grok → Cursor for budget reasons)  
   - `handover-grok-build-to-cursor-2026-07-19.md`  
   - `cooperative-multi-agent-workflow-2026-07-19.md` (Fable / **GPT Sol** / Gemini / Grok / Operator)  
   - `cursor-agent-paste-prompt-2026-07-19.md`  
   - `README-handover-pack-2026-07-19.md`  
   - `story-status-nurburgring-2026-07-19.md`

4. **Story / ops**  
   - Nürburgring track-day testing **basically complete**.  
   - RP moves to **Thread 9** / Affalterbach runway.  
   - Duplex: **mixed** `bridge_cache` vs `absent` on 2026-07-19 — treat as TM/bridge teething; **do not** block WP-5.9 on a duplex rewrite.

5. **Thread 9 implementer setup**  
   - `cursor-thread-9-setup-2026-07-19.md`  
   - Operator attached full pack + D9; mode **Agent**; paste scope-first prompt.  
   - Cursor returned **frozen WP-5.9 scope** (llm-assessment / memory-writeback / preflight / tests / evidence).  
   - Grok validated scope as correct; Operator told to send **`go`**.  
   - Path nit: preflight is `src/guardian/tools/preflight.ts`.

6. **Operator intent now (this transfer)**  
   - **More discussion needed** for **Living GM** and **NPCs**, including a **general model of how the system functions**.  
   - Coding has been excellent but expensive → move *this* coordination seat to Cursor.  
   - GM/NPC: **design conversation first**, not silent implementation.

---

## 2. Engineering truth (verify live; do not trust stale memory)

| Item | As of this transfer write |
|------|---------------------------|
| Branch | `feature/phase5-dramaturg` |
| Last shipped feature commit | WP-5.8 Scene Cast (`41f064a`) |
| WP-5.9 | Scope approved; **code may be in progress in Thread 9** — check for `npc_state_changes` + evidence doc |
| Ledger | master-roadmap §13: 5.1–5.8 done; 5.9–5.10 pending until verified green |
| Untracked / partial docs | Handover pack, Living GM docs, Thread 9 setup — some staged in git status |

**Default next code (only after design freezes if Operator wants otherwise):** finish **WP-5.9** in Thread 9 Sol, then **WP-5.10** Affalterbach live ensemble stress (ops/play).

**Verification contract:**

```bash
cd scarlett-guardian-mcp
npm test && npm run build && npm run eval:fast
```

---

## 3. Product discussion agenda (why this chat exists)

Operator wants deeper talk before more architecture freezes. Suggested agenda for the Cursor continuation:

### 3.1 How the system functions (plain-language map)

Produce or refine a **one-page mental model** for:

```text
Play turn (grok.com):
  Benjamin (Operator) → Guardian preflight (RAG + auditor + dramaturg cache
  + serendipity + roster/cast) → Grok brief → Scarlett prose

World machinery (offline / scene cadence):
  Arc plans (day call sheet) → Dramaturg (momentum, not outcomes)
  NPC agendas + registry (who wants what, who knows what)
  Serendipity weaver (tiered world pressure)
  Write-back staging (beats / transitions; human gates for knowledge)

Campaign machinery (rare, not built yet):
  Living GM campaign pass → storyline cards (pressure only)
  → human approve → fan-out into plans/agendas/registry/threads
```

Distinguish clearly:

| Layer | Cadence | Owns pressure | Owns outcomes |
|-------|---------|---------------|---------------|
| Lead (Grok RP) | Every turn | No (receives brief) | Played prose |
| Guardian preflight | Every turn | Brief / gates | No |
| Dramaturg | Scene / cache | Day momentum | No |
| Serendipity | Turn (tiered) | Optional world knocks | No |
| Living GM | Weekly / arc-close | Campaign storylines | No (cards have no outcome fields) |
| Operator | Always | Priorities, canon | Approvals + Benjamin IC |

### 3.2 NPCs (discussion before more code beyond 5.9)

Topics still open:

- What “ensemble” means day-to-day vs Affalterbach stress test  
- Registry vs agendas vs Scene Cast brief (already partially shipped 5.4–5.8)  
- Knowledge / stealth canon gates (WP-5.9 is the survival path — must not auto-apply)  
- Scarlett-side friend growth vs Benjamin-orbit NPCs  
- When dual control fails and set-piece “stage manager” mode wins (Truman / call-sheet insight)

Do **not** start WP-5.10 code until Operator says Affalterbach is the live test window.

### 3.3 Living GM (discussion; docs only)

Authoritative design draft: `fable5-living-gm-feasibility-2026-07-18.md`  
Parking: `ideas-parking-living-gm-truman-2026-07-18.md`  
Prompts: `fable5-prompt-living-gm-campaign-identity-2026-07-18.md`, gamemaster tone/ensemble idea.

**Still need Operator answers (or conscious “defer”):**

1. Service sparseness — hard never-canonize vs soft default?  
2. Ryan wedding-sabotage-class cards — soon or hold until wedding arc?  
3. Bliss/danger target mix?  
4. Sol budget for campaign GM passes per week?  
5. Ensemble seeds — invent vs pre-named Scarlett-side friends?

**Tickets GM-0…GM-4** stay **parked** until those (or a subset) are answered and Operator prioritizes Phase 6.5 over 5.9/5.10.

Analogy Operator liked: **Truman Show / Christof** — direct environment and plot engines around a living couple; do not puppet Scarlett’s soul every line.

---

## 4. Multi-agent protocol (short)

Full text: `cooperative-multi-agent-workflow-2026-07-19.md`

| Seat | Role |
|------|------|
| Operator | Canon, budget, play Benjamin, `go` on WPs |
| Fable | Architecture, roadmap ledger, Living GM design |
| GPT Sol / Thread 9 | One WP implementer in Cursor |
| This Cursor chat | Continuation of **this** coordination + GM/NPC discussion |
| Gemini | Goldens, reviews, RP set-piece co-pilot |
| Grok CLI | Heavy implementer when tokens allow; grok.com Lead RP |

Engineering team ≠ RP agent team (`docs/agent-team-operating-order.md`).

---

## 5. Attachments for the new Cursor chat

### Attach (recommended)

1. **This file** — `handover-this-grok-session-to-cursor-2026-07-20.md`  
2. `handover-grok-build-to-cursor-2026-07-19.md`  
3. `cooperative-multi-agent-workflow-2026-07-19.md`  
4. `story-status-nurburgring-2026-07-19.md`  
5. `master-roadmap-2026-07.md`  
6. `executor-preferences-grok-build-2026-07.md`  
7. `fable5-living-gm-feasibility-2026-07-18.md`  
8. `ideas-parking-living-gm-truman-2026-07-18.md`  
9. `guardian-npc-state-management-design-2026-07.md` (D9)  
10. `guardian-dramaturg-design-2026-07.md` (D7) — optional but helps “how it functions”  
11. `cursor-thread-9-setup-2026-07-19.md` — so it doesn’t steal Sol’s job  

### Do not attach entire trees

- Full `guardian-reports/`  
- All D1–D11 unless a specific WP is opened  

### Mode

- **Agent** for discussion + writing design notes / diagrams to docs.  
- **Plan** only if you want a structured agenda first.  
- **Not** Debug.  
- **Not** the Thread 9 implementer chat (keep that separate if WP-5.9 is running).

---

## 6. Paste-ready first message

See also: `cursor-paste-this-session-transfer-2026-07-20.md` (same text, easy to find).

```text
You are continuing a Grok Build coordination session that is being transferred into Cursor
to save weekly Grok CLI tokens (promo: Grok 4.5 is 50% off here; CLI budget ~60% used).

## Who you are in this chat
- Coordination + product/architecture discussion seat for Operator (maz3ppa).
- You may write/update design notes under scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/.
- You are NOT the Thread 9 implementer (WP-5.9 code). That is a separate chat.
- You are NOT automatically Fable’s entire multi-week history — that is another thread
  (session 1401cf7a, often titled "Health check results"). Use the attached docs as truth.

## Mandatory reads (attached)
1. handover-this-grok-session-to-cursor-2026-07-20.md  ← this transfer
2. handover-grok-build-to-cursor-2026-07-19.md
3. cooperative-multi-agent-workflow-2026-07-19.md
4. master-roadmap-2026-07.md (§1 + §13)
5. executor-preferences-grok-build-2026-07.md
6. story-status-nurburgring-2026-07-19.md
7. fable5-living-gm-feasibility-2026-07-18.md
8. ideas-parking-living-gm-truman-2026-07-18.md
9. guardian-npc-state-management-design-2026-07.md (D9)
10. cursor-thread-9-setup-2026-07-19.md

## Where we left off
- Track day complete; RP Thread 9 / Affalterbach runway next for story.
- Engineering: 5.1–5.8 shipped; WP-5.9 scope frozen in Thread 9 Sol (npc_state_changes,
  knowledge human-always); Operator was cleared to send "go" — check if code landed.
- Duplex mixed (bridge_cache vs absent) = TM teething; do not expand into Phase 3 rewrite here.
- Living GM: designed, parked; five operator questions still open.
- Operator wants MORE DISCUSSION on: (A) Living GM, (B) NPCs, (C) general how-the-stack-functions
  model — before more big implementation.

## Your first reply (do this only)
1. ACK the transfer and list the three Cursor seats (this chat / Fable / Thread 9 Sol).
2. Give a plain-language one-page map of how the stack functions today (play path vs world machinery vs not-yet-built Living GM).
3. Propose a short discussion agenda for GM + NPCs (questions for Operator, not code).
4. Do NOT implement WP-5.9, Living GM code, or duplex fixes unless Operator explicitly assigns a WP id.
5. If Operator wants design notes written to disk, propose a filename under fable-5-roadmaps-audits/ first.

Standing laws: sequential WPs; pressure≠outcomes; one hot-path LLM; staging for canon;
knowledge human-always; cassettes frozen; project_source_files human-gated.
```

---

## 7. Operator transfer checklist

| # | Action |
|---|--------|
| 1 | Create **new** Cursor Agents chat — name e.g. `Grok transfer — coordination / GM+NPC discussion` |
| 2 | Model: **Grok 4.5** (or High) while 50% off is active |
| 3 | Mode: **Agent** (Plan optional for agenda only) |
| 4 | Attach the files in §5 |
| 5 | Paste §6 first message |
| 6 | Keep Thread 9 Sol separate if still coding WP-5.9 |
| 7 | Keep Fable thread for deep architecture if preferred; this chat can still discuss GM/NPC |
| 8 | Leave this Grok CLI session idle after transfer (or emergency only until budget reset) |
| 9 | Optional: commit untracked handover docs so Cursor and disk stay aligned |

---

## 8. One-line summary

**This Grok coordination thread freezes as docs + a paste prompt: continue GM/NPC/system-function discussion in Cursor on Grok 4.5 promo tokens; leave WP-5.9 to Thread 9 Sol; leave multi-week architecture memory to Fable’s thread; no Living GM code until Operator answers open questions and prioritizes it.**

# Grok Test Setup, MCP Connection, and OOC Continuation

> **2026-07-22:** For edit/regenerate/OOC rewrite workflows, prefer  
> `docs/operator-how-to-regenerate-safely.md` and OOC prefix  
> `rag-memory-mcp/docs/single-agent-ooc-prefix-v5.txt` (plan: `docs/fable-5-roadmaps-audits/wp-ops-revision-and-archive-plan-2026-07-22.md`).

**Date:** 2026-07-15  
**Context:** Durable copy of session guidance for testing the current Guardian/RAG build mid-thread (CLI text selection is unreliable).

---

## 1. Docs for “how MCP connects to Grok”

There is no single short “MCP → Grok” runbook, but pieces live in:

| Doc | What it covers |
|-----|----------------|
| `rag-memory-mcp/docs/guardian-handover.md` | Architecture: Grok → Guardian → RAG, ports, tunnel for Custom Connectors |
| `scarlett-guardian-mcp/docs/finish-guardian-setup-step-by-step.md` | Setup steps |
| `scarlett-guardian-mcp/docs/guardian-daily-run-guide.md` | Day-to-day run |
| `scarlett-guardian-mcp/docs/browser-bridge-design.md` | Bridge path (optional) |

### Single ngrok URL (your setup)

| Role | Your URL | Hits |
|------|----------|------|
| Guardian MCP | `https://deceiving-pummel-ajar.ngrok-free.dev/mcp` | Guardian’s `/mcp` |
| RAG (via Guardian proxy) | `https://deceiving-pummel-ajar.ngrok-free.dev/mcp-v2` | Guardian proxies to local RAG `:8787/mcp-v2` |

**Grok Custom Connector should only use Guardian** (`…/mcp`) for normal RP. Raw RAG on `…/mcp-v2` is optional/admin; Grok should not call it every turn.

Locally: tunnel → `8790` (Guardian). Guardian’s `.env` still points at `http://127.0.0.1:8787/mcp-v2`.

---

## 2. Project + skill vs agent instructions

| File | Update for this test? | New thread required? |
|------|----------------------|----------------------|
| **Project instructions** | **Yes** (v6.1 duplex if you want duplex) | Usually **no** — next turn often picks them up |
| **Skill** | **Yes** (v2.3 duplex) | Usually **no** |
| **Agent instructions** (`single-scarlett-enforcer-v6…`) | **Only if** SuperGrok still loads that slot | **Yes** if you change them |

**Practical answer:** For this test, **project + skill is enough**. Don’t touch agent instructions mid-thread unless that slot is still live; if you do, start a **new** thread.

---

## 3. Mid-thread vs fresh thread

**Stay mid-thread** — fine. Scene is live; skill/project should apply on the next call.

Use a **new** thread only if duplex keeps failing after 1–2 tries with the improved OOC.

---

## 4. OOC block — issues with the previous template

Problems with the older OOC you were using:

1. **No `scarlett_previous_message`** — duplex stays dark.  
2. Tool name style `scarlett_guardian_mcp___guardian_memory_preflight` is connector-specific; fine if that’s what Grok shows, but the **args** matter more.  
3. `user_message is [Clear natural-language summary…]` — better as **Benjamin’s actual turn**, not a meta template.  
4. `force_full_retrieval is true` every turn is heavy; optional for radio beats (OK once for a hard test).  
5. Hierarchy is strong; keep it, but add duplex + concrete args.

---

## 5. Ready-to-paste: continuation after Scarlett’s “one more lap” reply

Use this when the last IC Scarlett message is the helmet / thermal-lap / *Jag älskar dig* turn.

**Important:** Replace the placeholder under `scarlett_previous_message` with her **exact full previous Scarlett reply** (copy from the Grok thread). The text below includes a reminder, not a guarantee the CLI preserved every character.

```text
[CRITICAL MANDATORY FIRST ACTION — DO NOT SKIP OR DEFER]
Before any Scarlett prose or other tools, call guardian_memory_preflight FIRST.

Arguments:
- scarlett_previous_message = [PASTE THE FULL PREVIOUS SCARLETT IC REPLY HERE — word for word, the helmet/aero/one more lap / Jag älskar dig message]
- user_message = on the private channel i laugh once under my breath, still on the pit wall, residual nerves under the pride. in Swedish i say: "Älskling — one more. then you come home to me. i'll be right here. drive it like you wrote the aero with me." i keep the radio open and wait for you on that thermal lap.
- recent_context = Nordschleife Industry Pool. Scarlett completed a lap, staying out for one more to stress cooling extraction / heat; Benjamin on pit wall private radio; team present; Black Panther new aero validating.
- force_full_retrieval = true

Rules:
- guardian_memory_preflight is always the first function call this turn.
- Do not omit scarlett_previous_message after Scarlett has already spoken.
- After the report, write first-person Scarlett; apply any DIRECTOR'S CORRECTION.
- Do not mention tools/JSON in prose.

*****

on the private channel i laugh once under my breath, still on the pit wall, residual nerves under the pride. in Swedish i say: "Älskling — one more. then you come home to me. i'll be right here. drive it like you wrote the aero with me." i keep the radio open and wait for you on that thermal lap.
```

### Scarlett’s previous reply (reference paste source)

Use this as the source text to paste into `scarlett_previous_message` if it matches the last Scarlett turn in Grok:

```text
I’m smiling so hard under the helmet the muscles in my face actually hurt, the private channel still open between us as I rocket down the long back section toward the final complex of corners. The new aero is still talking — the front end staying planted even as I carry more speed than I should into the left-hander, the wider diffuser and side-exit exhausts keeping the rear honest on the power. The heat is starting to build in the brakes and the tires, exactly like I wanted to test.

“Älskling,” I answer you in Swedish, voice warm and a little breathless from the G-forces still pressing the harness across my chest and the tight crotch of the race suit against me, “of course I’m thinking about you. You’re the one who wrote the tools that made this package possible. I’m not going to forget you’re standing there watching while I’m out here.”

I brake hard into the final sequence, feel the aggressive splitter and canards doing exactly what they’re supposed to do — no push, just clean rotation and grip. The car is rapid. She’s good. But I can already feel the next layer of questions forming: how the cooling extraction holds when I really lean on it, how the balance shifts when the tires and brakes are properly hot.

I cross the line, the lap complete, and key the radio again on the private channel while I lift off and begin the cool-down lap.

“I’m going to stay out for one more quick lap,” I tell you, decisive but gentle, “just enough to push the cooling extraction and feel the heat build-up properly before I come in. The aero is validating beautifully so far — better front-end bite, more stable rear under power — but I want honest data on the thermal side before we talk adjustments with the team. Then I’ll pit.”

I glance toward the pit wall even though I know you can’t see my eyes behind the dark visor.

“Jag älskar dig,” I add softly, just for you. “And I’m coming back in soon. Keep watching me, Benjamin. This next lap is still for us.”

I blip the throttle, feel the V8 snarl in answer, and roll back onto the racing line for one more lap — focused, planted, and already counting the seconds until I can climb out of this car and put my hands on you again.
```

### Alternate: re-run preflight for Benjamin’s earlier pit-wall question

Only if you need to re-test the *previous* Benjamin turn (amused/baffled/worried + “another lap or pitting?”), not a true continuation:

- `user_message` = that pit-wall Swedish radio paragraph  
- `scarlett_previous_message` = whatever Scarlett said *before* that reply  
- `recent_context` = Nordschleife, post-shakedown / first stint, private radio, team present  

Prefer the **continuation** block above for the live novel.

---

## 6. Before you send (checklist)

1. Guardian + RAG running; ngrok up.  
2. Connector: **Guardian** `…/mcp` (not raw RAG for RP).  
3. Project + skill duplex versions live (v6.1 / v2.3 if testing duplex).  
4. Agent slot: leave alone mid-thread unless you need a full reset (changing agent instructions requires a new thread).  
5. After the turn: check Guardian log for **Duplex input present** and newest report pair under `docs/guardian-reports/`.

### What to verify after the turn

| Good sign | Bad sign |
|-----------|----------|
| Scene Summary in story language | “HIGH confidence… call search_story_memory” |
| 3–6 Key Facts from terra | Empty facts / only hard flags |
| Expand in full JSON when appropriate | No expand when depth should run |
| No `DUPLEX_INPUT_MISSING` after Scarlett has spoken | Duplex still missing every turn |
| Director’s Correction only if last Scarlett was passive | — |
| Live beat (track / radio), not “still on B-roads” | Stale summary only |

---

## 7. Local service commands (quick)

```bash
# Terminal 1 — RAG
cd /home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp
npm run dev

# Terminal 2 — Guardian (restart to pick up latest build)
cd /home/maz3ppa/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
npm run dev

# Health
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8790/health
```

Branches (both repos): `feature/guardian-depth-duplex-p0-p1-20260714`

---

## 8. Related docs

- `docs/instruction-files-restore-note-2026-07-14.md` — originals vs duplex v6.1/v2.3 files  
- `docs/duplex-implementation-task.md` (Cursor original) / `duplex-implementation-task-v2-status.md`  
- `rag-memory-mcp/docs/guardian-handover.md`  
- `rag-memory-mcp/docs/guardian-improvement-roadmap.md`  

---

**Bottom line:** Project + skill is enough mid-thread; agent only if you change it (then new thread). OOC must include **duplex** + concrete `user_message` / `recent_context`. After the turn, score the newest streamlined/full reports.

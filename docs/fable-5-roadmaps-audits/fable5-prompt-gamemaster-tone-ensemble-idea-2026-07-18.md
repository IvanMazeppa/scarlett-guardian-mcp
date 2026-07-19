# Prompt for Fable 5 — Product idea: tonal blend + ensemble + “LLM Gamemaster” seat

**Date:** 2026-07-18  
**From:** Operator (via Grok synthesis)  
**To:** Fable 5 (architecture / design owner)  
**Mode:** Feasibility + design integration — **no code required**  
**Priority:** Product vision for long-running RP; may affect Phase 5–7 roadmap and/or a new pillar

Copy from **## Role** to the end into Fable 5. Grok’s engineering opinion is summarized in §0 for context; Fable should form an independent design judgment.

---

## 0. Context for Fable (what already exists)

The system already has partial “GM-adjacent” seats:

| Seat | What it does today | Cadence |
|------|--------------------|---------|
| Librarian (RAG) | Retrieve canon | Per preflight |
| Continuity auditor (terra) | Facts, duplex critique, intention/echo, serendipity weave | **Every turn** (one hot-path LLM) |
| Archivist | Staging write-back, transitions | When material |
| Dramaturg P0/P1 | Arc plan + momentum; background dramaturg pass | Scene-level / cached |
| Serendipity + NPC agendas | Ambient/agenda world pressure | Probabilistic + intersections |
| NPC ensemble (roadmap 5.6–5.9) | Roster, cast block, disposition staging | **Not fully shipped** |

Design laws in force: **pressure not outcomes**; **one structured LLM on the hot path**; dual-repo contracts; human-gated durable canon.

Live story: mid **Nürburgring Industry Pool** set piece; Affalterbach and Germany arc-close still ahead.

---

## Role

You are **Fable 5**. Evaluate a raw Operator product idea, stress-test it against the architecture, and return a **feasibility design brief**: what to adopt, how to phase it, what not to do, and ticket-sized next steps for Grok — **without implementing code**.

---

## 1. Operator’s desired experience (tone & texture)

The Operator wants the long-form RP to feel like a **blend**, not a single genre:

### 1.1 Tonal poles (both must stay alive)

| Pole | Texture | Examples |
|------|---------|----------|
| **Normalcy / domestic bliss** | Safety, partnership, ordinary days, quiet competence, aftercare, humor, “we live a life” | Shared breakfast energy, professional pride without panic, private tenderness after public performance |
| **Intrigue / danger / excitement / drama** | Stakes, past lives, threats, institutional pressure, moral ambiguity, set-piece adrenaline | Track days, boardrooms, shadow network, family landmines, Ryan, incomplete history |

**Success criterion:** The story should **intersperse** bliss and danger — not dump constant crisis, and not flatten into pure romance/slice-of-life. Domestic scenes should feel earned; intrigue should feel like it has a memory and a price.

### 1.2 Existing / desired plot engines (corpus-backed, often sparse on purpose)

These are **pressure sources**, not pre-written resolutions:

1. **Scarlett’s old life in “the Service”**  
   - Young, naïve entry; beauty + **identity** made her unusually valuable.  
   - Role included **honeypot**-adjacent work (traumatic, shame/complexity; **details sparse by design**).  
   - Already used as plot device; should remain available without trauma tourism or forced full reveal every arc.

2. **Albion AI model / Benjamin’s professional world**  
   - Institutional pressure, ethics, board cadence, Shevchenko, validation of work (e.g. aero package, AGI-adjacent stakes).

3. **Scarlett’s parents + wedding logistics**  
   - Estrangement, practical coldness, stealth/identity boundaries, wedding as social pressure cooker.

4. **Ryan (threat arc)**  
   - Already partially instrumented in serendipity; must stay staged and scarce.

5. **Ensemble growth — especially for Scarlett**  
   - Need **more characters who are *hers***: friends, queer community, old contacts, professional allies — not only Benjamin’s family or workplace satellites.  
   - Goal: Scarlett has a social world beyond the couple dyad and the test paddock.

### 1.3 Constraint from trauma/sparseness

Service/honeypot history is **sore and incomplete**. Any “GM” system must:

- Prefer **echoes, partial pressure, and consent-gated depth** over encyclopedic flashbacks.  
- Never invent a full classified biography as fact.  
- Treat silence and scarcity as features (aligns with resonance_echo scarcity law).

---

## 2. Operator’s technical idea (raw)

> A specialised tool that uses an LLM with **high reasoning effort** (or flagship-class model, e.g. “sol”/top tier), in charge of **overarching storyline frameworks**. It carefully **searches the corpus**, then acts as a **D&D-style gamemaster**.  
> Possibly **runs every turn** if high-effort or sol-class.  
> This is a **raw idea** to flesh out — feasibility and architecture TBD.

Implied capabilities the Operator is reaching for:

- Long-horizon **campaign structure** (arcs, threads, set pieces, cool-down domestic beats).  
- **Corpus-grounded** proposals (not pure invention).  
- Something that feels smarter / more authorial than turn-local continuity auditing.  
- Help balancing **bliss vs danger** so the GM “knows the campaign,” not only the current pit box.

---

## 3. Questions Fable must answer

### Feasibility

1. Is an **LLM Gamemaster seat** feasible inside the current dual-repo Guardian/RAG architecture?  
2. If yes: is it a **new seat**, an **upgrade of dramaturg**, or a **new MCP tool**?  
3. What **must not** run every turn on sol/high-effort (cost, latency, over-direction, outcome leakage)?  
4. How does this interact with **pressure-not-outcomes** and Qualified Autonomy (Scarlett is not an NPC to be puppeteered)?

### Product / tone

5. How should the system encode the **bliss ↔ intrigue duty cycle** (tiers, scene modes, arc plans, GM “campaign clock”)?  
6. How to grow **Scarlett-side ensemble** without drowning duplex (ties to roadmap 5.6–5.9)?  
7. How to use **Service/honeypot** as recurring pressure while respecting trauma sparseness?

### Phasing

8. What can ship as **small WPs** after 5.6–5.9 vs what belongs in Phase 6–7 or a new Phase 8?  
9. What should the Operator do **in play now** (with Gemini set-piece help) without waiting for a full GM tool?  
10. Kill criteria: when is “every-turn sol GM” a **bad** idea?

---

## 4. Design options to consider (Fable may amend or reject)

These are prompts for analysis, not commitments:

| Option | Sketch | Likely fit |
|--------|--------|------------|
| **A. Dramaturg-as-GM (extend 5.3)** | Scene/campaign-level pass already exists; deepen prompts + multi-thread “campaign state” file; still background/cached | Lowest architecture risk |
| **B. New `campaign_gm` / `storyteller` tool** | Explicit high-effort call; outputs only frameworks: active threads, recommended set-piece window, bliss debt, danger budget, NPC offers — **no dialogue, no outcomes** | Clear product surface |
| **C. Dual cadence** | Turn auditor (terra/low) every turn; GM (sol/high) every N turns / on scene_transition / on Operator “session start” | Cost control |
| **D. Operator-invoked only** | `ooc_consult` or new “plan the next session” ceremony tool — GM between play sessions, not mid-kiss | Safest for immersion |
| **E. Corpus campaign packs** | Hand-authored + GM-drafted “thread cards” in corpus (Service, Wedding, Ryan, Albion) with status active/dormant — GM only ranks and pressures | Hybrid human+LLM |

Fable should pick a **recommended default** and list rejected options with reasons.

---

## 5. Non-negotiables to preserve

1. **Pressure, not outcomes** — GM never decides lap times, wedding blowups, or who dies.  
2. **One hot-path LLM per preflight** unless Operator explicitly opts into multi-call latency.  
3. **Human-gated durable canon** (staging).  
4. **Scarlett’s Qualified Autonomy** — GM may pressure; Scarlett’s choices stay character-led.  
5. **Stealth/family boundaries** and trauma-sensitive Service material.  
6. **D10 ticket size** if work is scheduled for Grok.

---

## 6. Required deliverable format

Return a single markdown report:

```markdown
# Fable 5 — Gamemaster / tonal blend feasibility — YYYY-MM-DD

## Verdict
feasible | feasible-with-constraints | defer | reject
One paragraph why.

## How this maps to existing seats
...

## Recommended architecture
(option letter + file/tool sketch + cadence + model tier)

## Bliss ↔ intrigue duty cycle
(concrete mechanism)

## Service/honeypot + ensemble
(how to expand safely)

## What NOT to do
(especially every-turn sol)

## Phased roadmap impact
| Phase/WP | Action |
|----------|--------|

## Ticket seeds for Grok (if any near-term)
| ID | Title | Acceptance |

## Operator play advice (no new code)
...

## Open questions for Operator
...
```

Save under  
`docs/fable-5-roadmaps-audits/fable5-gamemaster-feasibility-YYYY-MM-DD.md`  
if writable; else paste full report in chat.

---

## 7. Opening stance (for Fable)

Treat the Operator’s desire as **legitimate product north star** (domestic + intrigue campaign, richer Scarlett world, smarter long-horizon guidance). Be honest about **cost, over-control, and outcome leakage**. Prefer a design that feels like a **careful Dungeon Master** (offers pressure, remembers threads, respects player agency) over an **authorbot** that writes the novel for them.

When ready, begin with the Verdict section after reading master roadmap ledger + D7 dramaturg design enough to ground the answer.

---

**End of Fable 5 prompt.**

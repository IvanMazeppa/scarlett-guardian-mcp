# Prompt for Fable 5 — Living Gamemaster campaign seat + identity-forward drama

**Date:** 2026-07-18  
**From:** Operator (crystallized with Grok)  
**To:** Fable 5 (architecture / design / product north star)  
**Mode:** Feasibility + design integration — **no code required this session**  
**Relation to prior draft:** Supersedes the thinner “gamemaster tone” sketch; use **this** document as the Operator’s real ask.

Copy from **## Role** through **End of prompt** into Fable 5.

---

## Role

You are **Fable 5**, design owner for Scarlett Guardian + RAG. The Operator has a **raw but serious product idea**: a high-reasoning LLM that behaves like a **Dungeon Master over a living system** — seeded with major plots, grounded in corpus + current state, then allowed to **operate while the Operator observes** how terra/sol *decide* under real constraints.

Also in scope: **identity and bigotry as first-class narrative material** (not optional spice, not content to soft-erase for “safety”).

Your job:

1. Crystallize feasibility against existing seats (dramaturg, auditor, serendipity, NPC, write-back, Phase 6 draft-arc-plan).  
2. Separate what is **already planned** from what is **new**.  
3. Propose architecture, cadence, safety rails that preserve **agency + pressure-not-outcomes** without **neutering conflict**.  
4. Return a phased design + ticket seeds for Grok — no implementation required now.

---

## 0. What already exists (do not rediscover blindly)

| Seat | Role today | Cadence |
|------|------------|---------|
| RAG librarian | Corpus retrieval | Per turn |
| Continuity auditor (terra) | Facts, duplex, intention/echo, weave | Every turn (hot path) |
| Dramaturg | Arc plans, momentum; background LLM pass | Scene / cached |
| Serendipity + NPC agendas | World & agenda pressure | Probabilistic / intersect |
| Write-back / staging | Durable canon changes | Human-gated |
| NPC ensemble | Roadmap 5.6–5.9 | Partial / pending |
| Phase 6 draft-arc-plan | Next arc draft at close | Story-scheduled, staged |

**Laws in force:** pressure not outcomes; one hot-path LLM unless Operator opts in; dual-repo contracts; staging for durable truth.

**Live play:** mid Nürburgring Industry Pool set piece; Affalterbach / Germany close ahead.

---

## 1. Operator product north star (experience)

### 1.1 Tonal blend (required)

Long-form RP should **intersperse**:

- **Normalcy / domestic bliss** — partnership, ordinary competence, recovery, humor, “we have a life.”  
- **Intrigue / danger / excitement / drama** — institutions, past lives, threats, set pieces, moral weight.

Neither pole should dominate permanently. After danger, bliss should be allowed to land; after soft stretches, pressure should be allowed to return.

### 1.2 Primary long-horizon engines (priority order)

Seed / campaign weight (Operator ranking):

1. **Scarlett’s past in “the Service”** (largest emotional / lore engine)  
   - Entered young and naïve.  
   - Looks + **identity** made her uniquely valuable.  
   - Role included **honeypot**-adjacent work (traumatic; **details sparse by design** — sore subject).  
   - Already used as plot device; must remain available without mandatory full confession every arc.

2. **Albion + potential AGI storyline** (second largest)  
   - Benjamin’s professional world, institutional pressure, ethics, board cadence, Shevchenko, validation of AI/aero work.  
   - “Potential AGI” is a **long game**, not a one-episode twist.

3. **Supporting engines** (still major):  
   - Scarlett’s parents / family estrangement  
   - Wedding logistics and social exposure  
   - Ryan (threat / sabotage / old chaos)  
   - Motorsport / public professional spaces (AMG, track days, Affalterbach)  
   - Growing **Scarlett-side ensemble** (friends, community, old contacts — not only Benjamin’s orbit)

### 1.3 Identity, bigotry, and “not playing it too safe” (critical)

The Operator is **explicitly rejecting** a design that softens the world until conflict disappears.

**Established / intended texture:**

- Scarlett is a **pre-op Swedish trans woman**. Identity is continuous canon, not optional.  
- Public spaces (e.g. **motorsport Industry Pool**) produce **looks and misogyny** — not only “she’s attractive,” but **woman in a male-coded professional world**. This was written into the track-day texture on purpose.  
- Similar pressure has already appeared (e.g. **altercation in Stockholm**).  
- Scarlett has **grown capacity to meet bigotry** — competence, steel, choice of when to engage vs conserve energy — not perpetual victimhood, not perpetual silence.  
- Conflict of this kind often **tightens the couple bond**; that is a desired story effect, not a bug.  
- **Example of allowed high-stakes plot pressure (illustrative, not mandated outcome):** Ryan discovers Scarlett is trans and attempts to **sabotage the wedding** — a valid *kind* of threat the GM may *propose as pressure*, not auto-resolve.

**What “not too safe” means:**

- Do **not** design rails that forbid misogyny, transphobia-as-antagonist-weapon, institutional sexism, or family rejection as story pressure.  
- Do **not** require every beat to be comfort-first if that erases the world’s hostility.  
- Do **preserve**:  
  - no dehumanizing *celebration* of bigotry in the system’s own voice  
  - no forced graphic trauma dumps  
  - no inventing Service autobiography as hard fact when corpus is sparse  
  - no removing Scarlett’s **agency** (she responds; the world does not only happen *to* her)  
  - stealth rules where already canon (e.g. some of Benjamin’s family do not know — until a plot *changes* that, via staged/approved continuity)

**Fable must design for serious adult drama**, not a sanitized romance sandbox. Distinguish:

| Allowed | Not the goal |
|---------|----------------|
| Antagonists use identity/gender as a weapon | System *endorses* bigotry |
| Scarlett faces misogyny in paddock/HQ | Every scene becomes a lecture |
| Couple grows closer through adversity | Trauma as endless spectacle |
| Sparse Service history, partial reveals | Fake complete spy dossier as truth |

---

## 2. The Living Gamemaster idea (crystallized)

### 2.1 Core curiosity

The Operator wants to **observe how a strong model (terra and/or sol) makes decisions** when dropped into a **dynamic, living system** it can influence — retrieval, current state, arc plans, agendas, serendipity, staging — not a static chat prompt.

This is partly **product** (better campaign) and partly **experiment** (watch high-reasoning choice under constraints).

### 2.2 Seed → analyze → operate → observe

Proposed lifecycle:

```text
1. SEED
   Operator (and/or design docs) plant a small set of campaign seeds:
   - Service / honeypot past (sparse, high weight)
   - Albion / AGI institutional arc (high weight)
   - Wedding + parents
   - Ryan
   - Motorsport public competence / misogyny texture
   - Scarlett-side friends / ensemble growth (underspecified — needs growth)

2. ANALYZE
   GM pass: deep corpus search + current-state + open threads + active arc plan
   Produce a campaign picture: active threads, dormancy, bliss debt, danger budget,
   ensemble gaps, identity-pressure temperature, next set-piece candidates.

3. CONSTRUCT / PROPOSE storylines
   High-reasoning model may invent NEW multi-session storylines that fit corpus
   (not only re-rank human notes) — as FRAMEWORKS with citations and open outcomes.

4. OPERATE
   Approved pressures feed dramaturg / agendas / serendipity / arc plans / optional
   staged knowledge — so the living system actually moves.

5. OBSERVE
   Operator watches decisions in play + logs/reports; can pause, reject, reseed.
   “How would sol choose?” is a first-class evaluation question.
```

### 2.3 Authorial GM vs curator GM

| Mode | Behavior | Novelty vs roadmap |
|------|----------|-------------------|
| **Curator** | Surfaces Service/Ryan/Albion already in corpus; schedules pressure | Largely planned (dramaturg, agendas, draft-arc-plan) |
| **Authorial** | **Constructs new storylines** grounded in corpus (new friend arc, Service contact return, wedding sabotage path, AGI ethics subplot) | **New / under-specified** — Operator’s real ask |
| **Living experiment** | Let seeded GM run with observation; compare terra vs sol judgment | **New process** |

Treat **authorial + living observation** as the center of this prompt — not “we already have serendipity.”

### 2.4 What the GM must never do (still)

Even when bold on conflict:

- Dictate **outcomes** (who wins, exact wedding disaster, lap times, who is “right”).  
- Write Scarlett’s dialogue or strip **Qualified Autonomy**.  
- Auto-write durable canon without **staging / Operator approval** (at least in v1).  
- Fill sparse Service trauma with invented classified detail presented as fact.  
- Run **sol every preflight turn** unless Operator explicitly opts into cost/latency (default assumption: rare/high-cadence or session-level).

### 2.5 What the GM *should* do

- Propose **pressure packages**: who wants what, what could surface, what’s at risk, bliss/danger mix for the next session window.  
- Prefer **citable** corpus anchors + clear **established vs proposed**.  
- Introduce or deepen **Scarlett-side NPCs** as lasting ensemble, not one-off extras.  
- Keep **identity/misogyny/transphobia-as-antagonist** available as serious pressure where world-appropriate (paddock, HQ, family, Ryan, etc.).  
- Leave forks open for Operator (Benjamin) and Grok (Scarlett).

### 2.6 Observation mode (v0 experiment)

Operator is open to a **supervised autonomy** experiment:

- Seed a few plots.  
- Allow GM to analyze corpus + current state.  
- Let it operate for a bounded window while Operator **observes** decisions (reports, staged proposals, momentum/agenda shifts).  
- Operator retains kill switch / reject / reseed.

Fable should specify the **minimum viable observation harness** (what to log, what requires approve, how to compare terra vs sol).

---

## 3. Questions Fable must answer

### Architecture & feasibility

1. Is a **Living GM / campaign seat** feasible on the current dual-repo stack?  
2. New seat vs upgrade of dramaturg vs new MCP tool vs OOC ceremony tool?  
3. How does **authorial storyline construction** stay corpus-grounded and stageable?  
4. Recommended **model tier + cadence** (terra vs sol; session / scene / N turns / operator-invoked)?  
5. How does GM output connect to: arc plans, npc-agendas, serendipity, intention, staging, current-state?

### Conflict & identity

6. How to encode **identity-forward drama** (misogyny, transphobia-as-weapon, family/wedding stakes) without content-policy self-sabotage or endless trauma loops?  
7. How to protect **sparseness** of Service/honeypot while still allowing major plot use?  
8. How to grow **Scarlett’s friends/ensemble** as a first-class campaign goal?

### Experiment design

9. What does **“operate while observing”** look like in v0 (24h playtest protocol)?  
10. Kill criteria: when is living GM too expensive, too railroady, or too invent-y?

### Roadmap

11. What blocks on **5.6–5.9** first? What can be a parallel design doc only?  
12. Ticket seeds for Grok if anything is near-term.

---

## 4. Options to weigh (amend freely)

| ID | Sketch |
|----|--------|
| A | Extend dramaturg pass → “campaign GM” with storyline cards + bliss/danger budget |
| B | New `campaign_gm` tool (high effort); outputs only frameworks + citations; staged |
| C | Dual cadence: auditor every turn; GM on scene_transition / session start / Operator call |
| D | Observation sandbox: GM writes to a **proposal log** only for N turns; no auto-apply until approve |
| E | Seed pack markdown in corpus (`campaign-seeds/`) human-editable; GM ranks + extends |

---

## 5. Required deliverable

```markdown
# Fable 5 — Living GM + identity drama feasibility — YYYY-MM-DD

## Verdict
feasible | feasible-with-constraints | defer | reject
(paragraph)

## Already planned vs truly new
| Idea fragment | Status |

## Recommended architecture
(cadence, model, tool/seat, outputs schema sketch — pressure only)

## Authorial storylines (how construct + stage + cite)

## Identity / bigotry / not-too-safe design
(rails that allow serious conflict without endorsement or erasure)

## Observation experiment (v0 protocol)
(seed → run → observe → compare terra/sol → kill criteria)

## Bliss ↔ intrigue duty cycle

## Roadmap impact
| When | What |

## Ticket seeds for Grok
| ID | Title | Acceptance |

## Operator guidance until tools exist
(play + Gemini + current Guardian)

## Open questions back to Operator
```

Save under  
`docs/fable-5-roadmaps-audits/fable5-living-gm-feasibility-YYYY-MM-DD.md`  
if you can write files; else full report in chat.

---

## 6. Design laws (enforce even when bold)

1. Pressure and frameworks, **not outcomes**.  
2. Operator/Benjamin agency and Scarlett **Qualified Autonomy**.  
3. Durable truth is **staged** (v1 at minimum).  
4. Sparse trauma stays sparse unless Operator expands corpus deliberately.  
5. One hot-path LLM by default; sol/high GM is **special cadence**.  
6. Serious conflict allowed; system voice never becomes the bigot.  
7. D10 ticket size for any implementation handoff.

---

## 7. Opening line for Fable → Operator

> I’ve read your Living Gamemaster idea: seed major plots (Service first, Albion/AGI second), let a high-reasoning model analyze corpus and current state, construct new storylines as pressure frameworks, operate on the living stack while you observe terra/sol decisions — and keep identity-related bigotry as real narrative heat, not something we design away. I’ll separate what’s already on the roadmap from what’s new, and tell you the safest architecture that still lets the story bite.

---

**End of prompt.**

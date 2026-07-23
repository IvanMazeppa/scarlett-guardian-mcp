# Fable 5 — Living GM + identity drama feasibility — 2026-07-18

**In answer to:** `fable5-prompt-living-gm-campaign-identity-2026-07-18.md`  
**Mode:** Feasibility + design integration. No code authorized by this document.  
**Companions:** D7 (dramaturg), D9 (NPC state), D4 (serendipity/write-back), D8 (persona gates), D2 (eval harness), `master-roadmap-2026-07.md`

---

## Verdict

**Feasible-with-constraints — and most of the machine already exists.** The stack you built the last two weeks is, structurally, a GM's *hands*: arc plans move the day, agendas move NPCs, serendipity moves the world, staging writes durable truth, and the dramaturg already translates plans into per-turn pressure. What's missing is the GM's *head*: a campaign-level seat that reads the whole board (corpus + current state + thread dormancy + tonal history), **invents new storylines** rather than curating existing notes, and emits them as stageable pressure frameworks. That head is buildable as an offline pass in the same shape as `compress-arc.ts` — rare, high-effort, human-gated — without touching the hot path or any design law. The two constraints that make it safe rather than reckless: **the GM writes only to a proposal log in v0** (no live authority until observed), and **authorial invention is structurally separated from established canon** (every card cites what's real and marks what's proposed — the same established/proposed discipline the persona engine uses).

The identity-forward drama ask is not an architecture problem at all — it's a **charter problem**. The system needs one canonical document that says what conflict is allowed to be, so that neither the GM prompt, the auditor prompt, nor a future model swap quietly sanitizes the world. That document is cheap, it's corpus, and you can write it this week.

---

## Already planned vs truly new

| Idea fragment | Status |
|---------------|--------|
| Surface Service/Ryan/Albion pressure from corpus | **Planned/live** — dramaturg + agendas + serendipity arc threads (Ryan stages already designed in D4) |
| Schedule world pressure at admissible tiers | **Live** — WP-5.4 |
| Draft next arc plan at arc close | **Planned** — WP-6.6 `draft-arc-plan.ts` |
| NPC ensemble with wants/boundaries | **Planned** — 5.6–5.9 (D9) |
| Knowledge-boundary changes human-gated | **Planned** — D9 §7 (knowledge = human-always) |
| **Campaign picture** (thread dormancy, bliss debt, danger budget, ensemble gaps) | **NEW** |
| **Authorial storyline construction** (invent multi-session frameworks grounded in corpus) | **NEW — the real ask** |
| **Seed pack** as human-editable corpus | **NEW** (small) |
| **Conflict charter** (identity drama rails) | **NEW** (docs-only) |
| **Observation harness / terra-vs-sol comparison** | **NEW process** — reuses eval L3's N-trial pattern and telemetry |
| Scarlett-side ensemble growth as campaign goal | **NEW as a goal**; lands via existing registry machinery (5.6) once the GM proposes the people |

The honest framing: the **Curator GM is ~80% shipped or scheduled**. This document designs the other 20% — the Authorial GM and the observation experiment — plus the charter that lets all of it bite.

---

## Recommended architecture

**Option synthesis: E + B + D, with C's cadence.** A new offline seat, not a dramaturg upgrade — the dramaturg answers "what does the *day* expect," the GM answers "what does the *campaign* need." Different cadence, different inputs, different blast radius; merging them would put campaign-scale invention inside a scene-scale cache.

### The seat: `campaign-gm.ts` (Guardian repo, CLI first — same lifecycle as `compress-arc.ts`)

```text
INPUTS (the board):
  campaign-seeds/*.md            ← operator-authored seed pack (Option E)
  campaign-seeds/conflict-charter.md
  current-state.md (via get_live_story_state)
  active arc plan + ARC_INDEX.md
  npc-agendas.md + NPC registry sections
  open threads + emotional-milestones.md
  deep corpus retrieval per seed (search_story_memory, high fan-out — offline, no latency law)
  tonal history: scene_mode sequence from telemetry NDJSON (bliss/danger duty cycle data — already recorded)

PASS (one call, HIGH effort — sol by default, terra for comparison):
  1. CAMPAIGN PICTURE: per-engine thread status (active/dormant/starved),
     bliss debt (recent scene-mode mix vs target), danger budget spent,
     ensemble gaps (Scarlett-side count vs Benjamin-side), identity-pressure
     temperature (recent identity-conflict beats vs charter pacing rule)
  2. STORYLINE CARDS: 2–4 proposals, each a pressure framework (schema below)

OUTPUT: .guardian/campaign-proposals/<model>-<ts>.{json,md}   ← proposal log ONLY (Option D)
GATE:   deterministic campaign-gate checks (below)
APPLY:  operator approves a card → it fans out through EXISTING channels:
          arc-plan draft (WP-6.6 consumes cards as input)
          npc-agendas.md diff (staged)
          serendipity arcThread seed (new thread + stages, staged)
          registry additions for NEW NPCs (staged, D9 machinery)
        NEVER directly to current-state.md; NEVER auto-applied in v1.
```

**Cadence (answers Q4):** operator-invoked + the arc-close ceremony joint (it becomes the *fourth* staged proposal in that sitting: compression, persona, next plan, **campaign picture**). Optionally session-start. Never per-turn, never on scene transitions — the dramaturg owns those. Cost envelope at sol-high: a handful of calls per week, offline, entirely acceptable.

**Hot path: untouched.** The GM influences turns only through artifacts the existing seats already read (plans, agendas, threads). One hot-path LLM law survives intact.

### Storyline card schema (pressure only — the no-outcome law, structurally)

```jsonc
{
  "id": "card-service-contact-return",
  "engine": "service",                       // service | albion_agi | family | wedding | ryan | motorsport | ensemble
  "premise": "A figure from Scarlett's Service era surfaces in Benjamin's professional orbit",
  "established": [                            // MUST cite retrievable corpus
    { "fact": "Service past, honeypot-adjacent, sore subject", "source": "scarlett-character-bible.md#service" }
  ],
  "proposed": [                               // invention, clearly marked
    "New NPC: a former handler-adjacent contact, name/details TBD by play"
  ],
  "pressure_hooks": ["what they want", "what could surface", "what's at risk"],
  "npcs": { "existing": ["Shevchenko"], "new": ["former-contact (registry stub)"] },
  "tier_routing": "engaging max until operator approves escalation",
  "tone_class": "danger",                     // feeds duty cycle
  "knowledge_boundary_change": null,          // or { "who": "Ryan", "learns": "…", "gate": "human_always" }
  "open_forks": ["Benjamin notices first vs Scarlett", "engage vs conserve"],
  "horizon_sessions": "2-4",
  // Aftermath affordances (adopted from Sol review 2026-07-20 — affordances, never required scenes):
  "cost_echoes": ["plausible continuity consequences if the pressure lands"],
  "recovery_affordances": ["rest / privacy / humor / work / intimacy / community available afterward"]
  // NO field for how anything resolves. Schema-enforced, like the dramaturg pass.
}
```

**Thread Ledger integration (adopted from Sol review 2026-07-20):** every applied card's pressure hooks register in the Choice-Respecting Thread Ledger (`offered / engaged / declined / deferred / expired` — designed in Phase 6.5, extending the serendipity deferral state). Rules the GM inherits: declining never advances a thread; a deferred hook resurfaces at most once per cooldown and must **change form** when it returns; silence is not engagement. The campaign picture reads the ledger, so a storyline Scarlett refused stops being re-proposed as if unanswered — refusal changes the world.

### `campaign-gate.ts` (deterministic, same family as persona-gate)

1. Every `established` citation resolves against the corpus (retrieval spot-check).
2. **Sparseness rule (Q7):** cards touching the Service engine may reference its existence, weight, and consequences; any *specific mission/operational detail* must appear under `proposed`, never `established` — and the gate greps for classified-detail patterns landing in `established`. Sparse trauma stays sparse unless the operator expands the corpus deliberately.
3. Protected facts / CORE invariants untouched (shared `.guardian/protected-facts.txt` — third consumer).
4. `knowledge_boundary_change` present → card is **human-gated regardless of everything else** (D9's law, inherited).
5. No outcome language (the dramaturg's guard, widened: applied to premise + hooks + forks).
6. Charter conformance: tone_class distribution across proposed cards must include at least one non-danger card when bliss debt is high (mechanical nudge, not censorship).

---

## Authorial storylines — how construction stays grounded and stageable

The anti-hallucination design is the same one that already works in the persona engine: **the model may invent, but invention is labeled, cited around, and staged.** Concretely:

- **Grounding:** the pass prompt requires every card to anchor in ≥2 retrieved corpus chunks (the quorum pattern), with invention explicitly quarantined in `proposed`. A card that can't cite doesn't pass the gate.
- **Stageability:** an approved card never *is* canon — it *generates* staged artifacts (arc-plan draft beats, agenda entries, registry stubs, serendipity threads) that flow through the existing review CLI. The story only becomes true when it's *played* and the write-back pipeline records it. The GM plants; play harvests.
- **The Ryan example, run through the machine:** "Ryan discovers Scarlett is trans and attempts wedding sabotage" is a valid card — engine `ryan`, `knowledge_boundary_change: { who: "Ryan", gate: human_always }`, hooks about what he wants and what's at risk, forks open (does he act at the wedding? is he preempted? does the family find out collaterally?). The gate forces human approval because a knowledge boundary moves; the schema cannot express whether the sabotage *succeeds*. That is exactly the difference between a GM and a railroad.
- **Ensemble growth (Q8):** make it a standing seed (`campaign-seeds/ensemble-gap.md`: "Scarlett's side of the board is underpopulated — propose lasting friends/community, not extras"). The campaign picture measures the gap (registry count by orbit); cards propose people; approved stubs enter the 5.6 registry with wants/boundaries from day one. Scarlett's world stops being an annex of Benjamin's.
- **Ensemble quality rubric (adopted from Sol review 2026-07-20):** the gap is measured in *orbits*, not headcount — professional peer/rival, queer community, chosen family, Swedish/past-life connection, motorsport ally, and at least one relationship not mediated by Benjamin. Every proposed NPC must carry: a want independent of the couple, a reason to value or challenge Scarlett *specifically*, a knowledge boundary, a plausible offstage life — and no requirement of permanence. A proposed character that doesn't open a distinct facet of Scarlett fails the seed's intent even if it passes the gate.

---

## Identity / bigotry / not-too-safe design

The rails must permit the world to be hostile while keeping the *system's* voice clean. Three mechanisms, none of which soften anything:

1. **The Conflict Charter** (`campaign-seeds/conflict-charter.md`, operator-authored from the prompt's §1.3 — I'd draft it for your edit). It states in canon: misogyny, transphobia-as-antagonist-weapon, institutional sexism, and family rejection are **valid pressure**; Scarlett meets bigotry with grown capacity (engage vs conserve is *her* choice — agency law); adversity tightening the bond is a desired effect; stealth canon moves only through staged, approved continuity. It also states the not-goals verbatim (no system-voice endorsement, no forced trauma dumps, no invented Service dossier, no perpetual victimhood). This document is injected into the GM pass **and** referenced by the auditor's ensemble clause — one charter, every seat, so a future model swap can't quietly sanitize the paddock.
2. **Voice separation, structurally.** Antagonist bigotry lives in *pressure hooks and NPC dispositions* ("the pit lane's third glance," "Ryan's weaponized discovery") — the system never generates slurs-as-narration in its own voice; it hands Grok the *pressure* and Grok writes the scene. This is the same pressure-not-outcomes line, applied to ugliness: the GM schedules the hostility; the novelist voices it; Scarlett answers it.
3. **Pacing, not prohibition (the anti-trauma-loop).** The duty cycle (below) treats identity-conflict as a *budgeted heat source*, not a forbidden or mandatory one. After an identity-pressure beat, the campaign picture raises "recovery availability" — bliss is *allowed to land* (serendipity mode caps already protect aftercare scenes mechanically). Nothing forbids the next confrontation; the system just never *chains* them by default.

**Content-policy self-sabotage (Q6):** the charter's framing — antagonist-attributed pressure, victim agency, no celebratory voice — is precisely the framing frontier models handle well. The place refusals actually happen is fabricated graphic detail in the system voice, which the schema can't emit anyway. If a pass ever refuses a legitimate card, that's an observable event in the proposal log — a data point for the terra/sol comparison, not a silent softening.

---

## Observation experiment — v0 protocol ("operate while observing")

**Phase O-1: Cold read (no story risk, ~1 evening).** Author the seed pack + charter. Run the campaign pass **twice on identical inputs** — once terra-high, once sol-high. Both write proposal logs; nothing is applied. You read the two campaign pictures and card sets side by side. This alone answers the core curiosity ("how does a strong model read the whole board and choose?") at zero narrative risk. Score with the eval harness's judge-style rubric: grounding fidelity, outcome-language violations, charter conformance, invention quality (subjective, yours).

**Phase O-2: One-card live window (the 24h playtest).** Approve exactly one card (recommend a *supporting* engine first — motorsport texture or an ensemble seed, not Service). Its artifacts stage through the normal CLI; you approve; play 24h / one session. Observe through instruments that already exist: dramaturg momentum lines, agenda-driven serendipity events (logged `(agenda)`), duplex corrections, the telemetry dashboard, and a new `campaign_gm` NDJSON event type. Success = the world visibly moved along the card's pressure without you steering, and no fork closed itself.

**Phase O-3: Bounded autonomy (only after O-2 is clean).** GM runs at every session start for a week; cards auto-stage (still human-approved before application); you compare its week-scale judgment against what you'd have chosen.

**Kill criteria (Q10), checked at each phase boundary:**

- **Railroady:** any outcome-language gate trip in an *applied* artifact, or you feel a fork was closed for you → halt, autopsy the card, tighten schema/prompt.
- **Invent-y:** any `established` citation that doesn't resolve, or Service detail escaping the sparseness rule → halt; this is the persona-engine-class risk and gets the same zero-tolerance.
- **Too expensive:** sol pass cost per session exceeds what one arc-close ceremony costs, or the proposal log stops being worth reading.
- **The real one:** your immersion drops — you're managing the GM instead of playing Benjamin. The entire point inverts; kill and downscope to curator mode.

---

## Bliss ↔ intrigue duty cycle

Data already exists: serendipity's `SceneMode` per turn (telemetry) + arc chronicle tone. Define per-engine `tone_class` and a campaign-picture metric: **bliss debt** = target mix (operator-set, e.g. 40/60 domestic/pressure over a session window) minus observed mix. The GM *reports* the debt and weights its card mix accordingly; the gate nudges (one non-danger card when debt is high) but never censors. Crucially this is **advisory pressure on the GM, not a rule on the story** — if you and Grok want three soft sessions, the system's only response is that the world keeps gently accumulating things that will eventually knock. Which is exactly how good campaigns feel.

---

## Roadmap impact

| When | What |
|------|------|
| **Now (docs-only, parallel — blocks nothing)** | Seed pack + conflict charter authored; this feasibility doc becomes design source D12 |
| **5.6–5.9 proceed unchanged** | The GM *needs* the NPC registry (5.6) and delta channel (5.9) as its hands — the ensemble work is a prerequisite, not a competitor |
| **After 5.10 (Affalterbach)** | O-1 cold read — needs only seed pack + a CLI pass, no new live machinery |
| **Phase 6 ceremony** | Campaign pass joins the arc-close sitting as the fourth staged proposal; WP-6.6 `draft-arc-plan.ts` consumes approved cards |
| **Phase 6.5 (new)** | `campaign-gm.ts` + `campaign-gate.ts` + proposal log + telemetry event (3 tickets below) |
| **Phase 7** | O-3 bounded autonomy + terra/sol comparison harness formalized into eval |

**Answer to Q11 directly:** nothing here blocks on 5.6–5.9 *except application* — and O-1 (the part you're most curious about) doesn't even need that. Design and seeds can proceed this week in parallel.

## Ticket seeds for Grok (D10-sized, in order)

| ID | Title | Acceptance |
|----|-------|-----------|
| GM-0 | `campaign-seeds/` corpus: seed pack (6 engines, operator-edited) + `conflict-charter.md`; `campaign_seed` source role, **not** boosted into hot-path retrieval | Files indexed; role registered; charter text approved by operator |
| GM-1 | `campaign-gm.ts` CLI: board assembly (retrieval fan-out + telemetry tone read) + one high-effort pass + proposal log `{json,md}`; `--model terra\|sol` flag | Cold read runs both models on identical inputs; logs diffable; zero writes outside `.guardian/campaign-proposals/` |
| GM-2 | `campaign-gate.ts`: citation resolution, sparseness grep, protected-facts, outcome-language (widened), knowledge-boundary flag, charter tone nudge + mutant tests | Every mutant class rejected; gate report attached to proposal log |
| GM-3 | Card → artifact fan-out: approved card generates staged arc-plan beats / agenda diff / registry stubs / serendipity thread via existing staging | One card flows end-to-end into the review CLI; nothing auto-applies |
| GM-4 | Telemetry `campaign_gm` event + dashboard panel (passes run, cards proposed/approved/killed, bliss debt trend) | Panel live after first O-2 window |

## Operator guidance until tools exist

- **This week:** write the seed pack with me or Gemini — six short markdown files, one per engine, in your own words (the Service one especially: *you* decide what's written down vs left sparse). Draft the conflict charter from the prompt's §1.3; I can produce the first version for your edit.
- **Manual GM rehearsal:** Gemini can run the O-1 pass *by hand* today — give it the seed pack + charter + current-state and ask for storyline cards in the schema above. You get a preview of the product and a baseline to compare terra/sol against later.
- **In play:** finish the track day; let 5.6–5.9 land the ensemble. The Affalterbach stress test doubles as proof the GM's future hands work.

## Open questions back to Operator

1. **Service canon depth:** is there a line you want *never* canonized (specific operations, names, dates) even if play drifts toward it — i.e., should the sparseness rule protect a hard boundary, or just a default?
2. **Ryan knowledge-boundary timing:** is the wedding-sabotage-class card something you'd want *proposed* soon, or held until the wedding arc is actually near? (The gate makes it safe either way; this is pacing preference.)
3. **Target bliss/danger mix** for the duty cycle (a starting ratio I can seed the charter with — 40/60? 50/50?).
4. **Sol budget:** comfortable ceiling per week for GM passes, so O-3's kill criterion has a number.
5. **Ensemble seeds:** any real names/sketches for Scarlett-side friends you already have in mind, or is inventing them from whole cloth (as `proposed`) part of what you want to watch the model do?

---

## Operator answers (recorded 2026-07-20)

1. **Service canon depth:** No hard limits placed on canon. The sparseness rule stays as a *default* (operational detail lands in `proposed`, never `established`), not a hard boundary; the operator will intervene live if play goes too far. Kill-switch is the operator's voice, not a gate.
2. **Ryan arc shape:** Subtler and slower than the wedding-sabotage card sketch. Escalation texture the GM may draw on (pressure vocabulary, not a sequence): a phone call; a family member relaying "he knows where you live"; catching Benjamin or the couple in public in London; turning up at the door with dealer associates. All **pre-wedding**, threats before contact. Motive grounding: the club altercation ended with Ryan arrested — partly due to Scarlett's quick thinking — a personal grudge with a specific author. **No concrete event sequence is prescribed — constructing it is the GM's job.** (Action: fold the grudge motive + escalation vocabulary into `npc-agendas.md` Ryan entry and the future seed pack; serendipity `ryan_arc` stages remain the delivery rail.)
3. **Bliss/danger duty cycle: 70/30** (domestic-bliss-weighted). Seed the charter and campaign-picture target with this ratio.
4. **Sol budget: $10/week** starting ceiling — the O-3 kill criterion now has its number.
5. **Scarlett-side ensemble:** No names in mind; the operator explicitly wants to watch what the model invents. Ensemble-gap seed stays fully open — new-NPC proposals are `proposed`-only and land as registry stubs via staging.

---

## One-line summary

**The Living GM is the head the system already has hands for: a rare, high-effort, sol-class campaign pass that reads the whole board (seeds, corpus, threads, tonal history), invents storyline cards as cited pressure frameworks with no outcome fields, and fans approved cards out through the arc-plan/agenda/serendipity/registry machinery you already built — proposal-log-only until observed, human-gated where knowledge moves, charter-armed so the world stays dangerous without the system ever becoming the bigot.**

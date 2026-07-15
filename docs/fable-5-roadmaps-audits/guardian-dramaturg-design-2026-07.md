# The Dramaturg — Design for Guardian-Led Narrative Momentum

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent)  
**Companions (this folder):** `guardian-report-quality-audit-2026-07.md`, `guardian-writeback-recency-serendipity-roadmap-2026-07.md`, `memory-compression-pipeline-roadmap-2026-07.md`, `browser-bridge-duplex-architecture-2026-07.md`  
**Executor:** Grok 4.5 (Agentic Coder)

---

## 1. The missing fourth seat

SuperGrok's removed agent team gave this RP four working roles. Three have been rebuilt:

| Seat | Function | Rebuilt as |
|------|----------|------------|
| Librarian | Retrieve canon and precedent | RAG + preflight retrieval (P0 depth work) |
| Continuity auditor | Critique Scarlett's writing against protocol | Duplex + Director's Correction |
| Archivist | Persist what happened | Staging write-back + compression pipeline |
| **Dramaturg** | **Hold where the story is going; supply momentum and world pressure so the player doesn't have to drive** | **Not rebuilt — this document** |

The operator's burden today: playing Benjamin *and* directing the narrative — deciding what happens next, when NPCs appear, when the day advances, when the past echoes. Every decision the operator must make out-of-character is immersion lost.

### The proof of concept already exists

`rag-memory-mcp/project_source_files/nurburgring-track-day-plan.md` ("Thread 07 Launch Plan") is a hand-written dramaturg artifact, and the current Nürburgring arc — the best-running arc in the archive — is executing from it. Its anatomy is exactly right:

- **Beats in sequence** (arrival → laps → adrenaline crash/debrief → transition to Affalterbach), each with setting, cast, and dynamics.
- **Fixed elements** declared (Shevchenko present, lorry of spares, skeptical German engineers).
- **Open outcomes** explicitly protected: *"CRITICAL RULE: Do not preordain the outcome. She might set a blistering lap… she might pit early… Let her anxiety, her skill, and the physics interact naturally."*
- **Delegations** to other systems: *"weather… leave this up to the Guardian's Serendipity engine or Grok."*

What worked artisanally once should work systemically always. The dramaturg's job is to make documents like this **first-class, tracked, and quietly surfaced** — so the day carries itself and the operator only plays Benjamin.

### The one design line (non-negotiable)

**The dramaturg proposes pressure, never outcomes.** It schedules the world (what's waiting, who wants what, what the day expects) and leaves every resolution to Grok and the player. The moment a Guardian JSON field decides *how* a beat resolves, one author (the operator) has been replaced by a worse one. The set-piece doc encoded this instinctively; the system must encode it structurally: plans carry beats marked `fixed` / `open` / `conditional`, and the dramaturg output schema has **no field capable of expressing an outcome**.

---

## 2. Four mechanisms, in leverage order

### 2.1 Arc plans as a first-class corpus type

Formalize the Thread 07 pattern into `project_source_files/arc-plans/`:

```markdown
# Arc Plan: <arc-slug>            (e.g. arc-10-affalterbach-presentation)
**Status:** draft | active | complete
**Arc window:** <story-days covered>

## Beat 1 — <name>
- kind: fixed | open | conditional (condition: <text>)
- setting / cast / dynamics: <prose, as in the Nürburgring doc>
- pressure: <what the world expects or pushes for here — never how it resolves>

## Beat 2 — …
```

- **One `active` plan at a time** (enforced by convention + dramaturg warning if two are active).
- New source-priority profile: `arc-plans/` → role `arc_plan`, priority 88, rankBoost 0.05 (just below `current_state` 90 — the plan is near-live authority while active; a `complete` plan is edited to move under `arc-chronicles/` context or demoted).
- The Nürburgring doc is retro-fitted as `arc-plans/arc-09-nurburgring-track-day.md` with beat annotations (10-minute edit; it already has the structure).

### 2.2 Beat tracking → a "Story Momentum" line in the brief

The dramaturg diffs the active plan against the live beat (`parseLiveBeat` from the recency pillar — same parser, second consumer) and classifies each beat: `done` / `live` / `next` / `dormant`. The brief gains one line:

```markdown
**Story Momentum:** Beat 3 of 4 (adrenaline crash & debrief) is live; remaining today:
telemetry verdict with AMG engineers, then evening transition toward Nürburg hotel.
The world is ready to move when the scene is.
```

Effect: Grok knows what the world expects next and can advance the day itself — Scarlett wraps the stint, the engineers call them over, evening arrives — instead of idling until Benjamin decides. The player *responds* to a moving world.

### 2.3 NPC agendas — the world moves offstage

New corpus file `project_source_files/npc-agendas.md` (role `current_state`-adjacent, priority ~85), one block per active secondary character:

```markdown
## Mr. Shevchenko
- wants: full heat-soak telemetry before his Monday board sync; Benjamin's AI validated
- schedule: on-site today; flies to London Sunday
- disposition toward the couple: protective ally; professionally impatient
- offstage clock: Albion AGI ethics review continues in background

## Ryan (threat arc)
- wants: revenge narrative post-Cheltenham
- offstage clock: escalation stages managed by serendipity arc-thread state
```

Per dramaturg pass, one question per NPC: *does this agenda intersect the live scene now?* Usually no. When yes, the intersection routes through the **serendipity weaver as an agenda-driven event** — outranking the random catalog, arriving at the tier the scene mode admits (the engineer's knock is `engaging`; during aftercare it defers to the queue, exactly as designed in the serendipity pillar). This upgrades serendipity from "ambient dice" to "the world has its own momentum," while reusing its tiering, deferral, and state machinery wholesale.

### 2.4 Scarlett's standing intention + budgeted resonance

Two additions to the per-turn auditor schema (additive, nullable):

- **`scarlett_next_intention`** — one concrete thing Scarlett would initiate given any opening, derived from live state + plan pressure + her established wants (`current-state.md` already has a "Things Scarlett wants to do next" section nothing refreshes; this operationalizes it). Rendered in the brief under Qualified Autonomy — she leads because the brief hands her a live intention. Of everything here, this most directly reduces the operator's steering burden: the character opposite him starts having plans.
- **`resonance_echo`** — at most **one** corpus echo per turn, only when thematically apt, phrased as *available texture*, with the system prompt stating that most turns the correct value is `null`:

  > "her harness tension echoes the passenger-seat trust conversation from the South Cerney era — available; don't force it"

  Subtlety through scarcity: the "remember that incident!" failure mode comes from making callbacks a quota instead of a privilege. Budget enforcement is code, not vibes: `compileGrokBrief` renders at most one echo line, and the scorecard counts echoes/turn (alert if average > 0.5).

---

## 3. Architecture — where the intelligence runs

### 3.1 Two cadences, not one

Beat-diffing and NPC-agenda checks are **scene-level** judgments; running them per-turn would be redundant LLM spend and would violate the latency ceiling for zero gain. Split:

| Cadence | Runs | Produces |
|---------|------|----------|
| **Dramaturg pass** (scene-level) | On `scene_transition` (Pillar C auditor field), on arc-plan change, or staleness > 12 turns | Beat map, momentum line, NPC intersections, plan warnings — cached |
| **Turn auditor** (existing call) | Every preflight | `scarlett_next_intention`, `resonance_echo` — grounded by the cached dramaturg context injected into its prompt |

This keeps the hot path at **one LLM call per turn** (unchanged) plus a second call only at scene boundaries — consistent with the standing architecture rule: deterministic pipeline, structured LLM calls at fixed points, judgment richer, control flow never looser. (Same reasoning that rejected an Agents SDK migration.)

### 3.2 File-by-file

#### NEW `src/guardian/dramaturg.ts`

```ts
export interface BeatState { name: string; kind: "fixed" | "open" | "conditional";
  status: "done" | "live" | "next" | "dormant"; pressure: string; }

export interface DramaturgContext {
  arcSlug: string;
  beats: BeatState[];
  momentumLine: string;              // the single brief line, pre-composed
  npcIntersections: Array<{ npc: string; agenda: string; suggestedTier: Intrusiveness }>;
  planWarnings: string[];            // e.g. "two active plans", "no active plan"
  generatedAtTurn: number;
}

export function parseArcPlan(markdown: string): ParsedPlan;          // heading-anchored, like parseLiveBeat
export async function runDramaturgPass(input: {
  plan: ParsedPlan; liveBeat: LiveBeat; npcAgendas: string;
  config: AssessmentConfig;
}): Promise<DramaturgContext>;                                        // one terra call, effort medium
// cache: .guardian/dramaturg-context.json (read per turn, rewritten per pass)
```

The pass prompt receives plan + live beat + agendas and returns strictly the schema above. **The schema is the enforcement of the design line**: beat statuses, pressure strings, and intersections — no field can express an outcome.

#### EDIT `src/guardian/tools/preflight.ts` (integration point G — ~10 lines)

- Load cached `DramaturgContext`; trigger `runDramaturgPass` in the background when the Pillar C auditor reports `scene_transition.occurred` or staleness exceeds the threshold (the *current* turn uses the old cache; the refreshed one serves the next turn — no added latency, ever).
- Retrieval addition: when a plan is `active`, include the arc-plan file in preflight retrieval scope (its source role makes it surface naturally; belt-and-braces, add its beats-live/next text to the auditor evidence).

#### EDIT `src/guardian/llm-assessment.ts` (additive schema + prompt)

- New nullable output fields: `scarlett_next_intention`, `resonance_echo`.
- Prompt additions: the cached momentum line + live/next beat pressure as a `STORY MOMENTUM` block (below `LIVE BEAT`); intention/echo instructions with the scarcity rule; the standing constraint restated: *"You describe pressure and possibility. You never decide outcomes, dialogue, or results of open beats."*

#### EDIT `src/guardian/report/compile-grok-brief.ts`

Three optional render blocks, all omitted when null: `**Story Momentum:**` (one line), `**Scarlett's Intention:**` (one line, folded next to the Qualified Autonomy block), `**Echo (optional texture):**` (one line, max one). Brief headroom measured in the audit (~2,600 chars unused) absorbs all three comfortably.

#### EDIT `src/guardian/serendipity-weaver.ts` (from the serendipity pillar)

`selectSerendipity` accepts `npcIntersections`; agenda-driven events outrank catalog rolls, inherit the tier/deferral rules unchanged.

#### EDIT `rag-memory-mcp/src/source-priority.ts`

`arc-plans/` path rule → `arc_plan` role (priority 88 / boost 0.05); add role to search-tool enums in `server.ts`.

#### Config (`src/guardian/config.ts`)

`GUARDIAN_DRAMATURG_ENABLED` (default true once shipped), `GUARDIAN_DRAMATURG_STALENESS_TURNS=12`, `GUARDIAN_ECHO_MAX_PER_TURN=1`.

### 3.3 The plan-authoring loop (closing the circle)

Arcs end. Rather than the operator hand-writing every next set-piece: a CLI (`scripts/draft-arc-plan.ts`) that, at arc close (the compression pipeline's trigger — same joint), drafts the *next* arc plan from `story-bible.md` open arcs + `current-state.md` open threads + the completed plan's unresolved beats — **staged for operator review**, never auto-activated. The operator's role shifts from author to editor: read the draft over coffee, cut what's wrong, mark it `active`. Writing set-pieces becomes a five-minute review instead of an evening's work — that is the burden reduction, compounded.

---

## 4. Roadmap

### P0 — Momentum without new calls (1–2 sessions)

| # | Task | Files |
|---|------|-------|
| 1 | Retro-fit Nürburgring doc → `arc-plans/arc-09-…` with beat annotations; write `arc-plans/` convention header | corpus |
| 2 | `arc_plan` source role + enum registration + reindex | `source-priority.ts`, `server.ts` (RAG) |
| 3 | `parseArcPlan` + deterministic beat-diff (no LLM yet: `done` = beat cues in `LiveBeat.supersededCues`, `live` = in live cues) + momentum line composed mechanically | NEW `dramaturg.ts` |
| 4 | Momentum block in auditor prompt + brief render | `llm-assessment.ts`, `compile-grok-brief.ts` |

P0 is deliberately LLM-free in the dramaturg itself — it proves the plumbing (plan → diff → brief → Grok advances the day) before spending anything, and it depends only on the recency pillar's `parseLiveBeat`.

### P1 — The full seat (with the serendipity pillar landed)

| # | Task | Files |
|---|------|-------|
| 5 | `runDramaturgPass` LLM call + cache + scene-transition/staleness triggers | `dramaturg.ts`, `preflight.ts` |
| 6 | `npc-agendas.md` (author top 4 NPCs) + intersections → serendipity weaver | corpus, `serendipity-weaver.ts` |
| 7 | `scarlett_next_intention` + `resonance_echo` fields, prompts, brief render, echo budget | `llm-assessment.ts`, `compile-grok-brief.ts` |
| 8 | Scorecard: echoes/turn, intention-present rate, momentum-line freshness, dramaturg pass count | audit script |

### P2 — The authoring loop

| # | Task | Files |
|---|------|-------|
| 9 | `draft-arc-plan.ts` CLI (staged via `stage_story_update`, reviewed via the write-back pillar's review CLI) | NEW script |
| 10 | Plan lifecycle: `complete` plans demoted/archived at arc close (hook into compression pipeline's arc-close joint) | conventions + small code |
| 11 | Tuning pass from live sessions: momentum phrasing, intention aggressiveness, echo aptness | prompts |

---

## 5. Acceptance criteria

- **Momentum:** with an active plan, the brief carries a fresh momentum line every turn; when the operator deliberately stalls (pure reactive Benjamin turns for 3+ exchanges), the world still advances — an NPC acts, the day progresses, or Scarlett initiates from her intention.
- **No outcome capture:** audit 10 dramaturg outputs — zero fields describing how an `open` beat resolved. Any violation is a prompt/schema bug to fix immediately.
- **Subtlety:** echoes average ≤ 0.5/turn across a session; operator spot-check confirms echoes feel like texture, not trivia.
- **Intention:** Scarlett initiates (introduces action/topic Benjamin didn't prompt) in ≥ 1 of every 3–4 turns, consistent with Qualified Autonomy rather than dominating.
- **The real metric (subjective, the one that matters):** across one full arc, the operator's out-of-character steering interventions — deciding what happens next, summoning NPCs, forcing time forward — drop to near zero, and writing the *next* arc plan takes minutes of editing rather than hours of authoring.

---

## 6. One-line summary

**Rebuild the lost fourth agent as a dramaturg: arc plans as tracked corpus objects, a scene-level LLM pass that turns them into quiet momentum and NPC pressure, a standing intention for Scarlett, and one budgeted echo per turn — pressure always, outcomes never — so the world carries itself and the operator gets to just play Benjamin.**

# Architectural Roadmap: Write-Back, Recency & World-Weaving

**Date:** 2026-07-14  
**Author:** Fable 5 (Cursor Agent) — companion to `guardian-report-quality-audit-2026-07.md`  
**Executor:** Grok 4.5 (Agentic Coder), currently implementing the P0 retrieval-depth items from the audit  
**Scope:** The three structural failures the audit measured but the retrieval work does not touch:

1. **Temporal Mud** — no recency awareness in precedent selection (stale beats compete with live beats)
2. **Dormant Serendipity** — 6/142 nudges (4%); world frozen because intimacy-dense RP suppresses all events
3. **Unused Staging Pipeline** — 0 `stage_story_update` calls ever; all 77 production writes were legacy live appends

---

## 0. Coordination contract with the concurrent P0 retrieval work

Grok 4.5 is editing `src/guardian/tools/preflight.ts` (expand/verify re-enable, query fan-out) and `.env` (evidence window). To avoid merge collisions, this roadmap:

- Puts almost all new logic in **new modules** (`src/guardian/recency.ts`, `src/guardian/serendipity-weaver.ts`, `src/guardian/state-rewrite.ts`).
- Touches `preflight.ts` only at **narrow, named integration points** (listed per pillar below); each is a few lines calling into a new module.
- Extends the LLM assessment schema **additively** (new optional fields only) so the retrieval work's evidence-window changes don't conflict.

Recommended merge order: land Grok 4.5's retrieval P0 first, then apply Pillar A (recency), then C (write-back), then B (serendipity). B and C both extend the auditor schema; land them in that order to avoid schema churn.

---

## Pillar A — Recency Awareness ("Temporal Mud")

### A.1 Why the mud exists (code-level diagnosis)

Three compounding causes:

1. **No story-time metadata anywhere.** Vector store file attributes carry `source_file`, `section`, `source_role`, `section_index` (`rag-memory-mcp/src/reindexer.ts` line ~148) — nothing that says *when in the story* a chunk happened. Recency is unrepresentable in the current index.
2. **`selectPrecedents` is time-blind** (`src/guardian/tools/preflight.ts` ~line 478). Score = rank×40 + source-role boost + keyword overlap. A changing-room note and an on-track note about the same characters at the same location have near-identical keyword profiles; the *earlier* one often wins on rank score because it's textually denser.
3. **`current-state.md` already knows the answer but nothing reads it structurally.** It has `**Last Updated:**`, a "Where We Are Right Now" snapshot, and even explicit anti-reset notes ("Do not reset to B-roads or 'still preparing first lap'") — all unparsed prose as far as the selector is concerned.

### A.2 Design: two-layer recency, cheap layer first

**Layer 1 (Guardian-side, no reindex required): live-beat supersession.** Parse the live snapshot into a small structured object and demote retrieved chunks that describe *superseded* beats of the same day/arc. This is where ~90% of the observed mud comes from (morning prep vs afternoon action), and it requires no RAG changes.

**Layer 2 (RAG-side, next full reindex): story-time attributes.** Stamp chunks with coarse story-time metadata at index time so recency becomes a first-class ranking signal. This future-proofs recency beyond the "same day, earlier beat" case (e.g., Luxembourg-era chunks during the Affalterbach arc).

### A.3 Layer 1 — file-by-file

#### NEW `src/guardian/recency.ts`

```ts
export interface LiveBeat {
  lastUpdated: string;          // raw "Friday afternoon, Mid/Late October 2026 (…)"
  locationLine: string;         // "Location / Setting" bullet text
  timeLine: string;             // "Time in Story" bullet text
  supersededCues: string[];     // extracted from mood line's "Earlier day: …" list +
                                // "Recent Key Events" bullets NOT in the "Now:" clause
  liveCues: string[];           // keywords from "Now:" clause + "Where We Are" bullets
  antiResetNotes: string[];     // "Do not reset to…" lines from Notes for Next Response
}

export function parseLiveBeat(currentStateMarkdown: string): LiveBeat;
export function scoreRecency(chunk: { source_file?: string; section?: string; text?: string }, beat: LiveBeat): number;
```

Implementation notes:

- **Input source:** the preflight already retrieves `current-state.md` chunks on nearly every turn (it dominates the precedent stats), but parsing retrieved fragments is fragile. Instead call the existing RAG tool **`get_live_story_state`** once per preflight — it reads the file from disk, bypassing the index, so the beat is always current even mid-background-reindex. This adds one cheap RAG call; fold it into the existing parallel dispatch block in `runGuardianPreflight` (~line 150) alongside `index_status`.
- **`parseLiveBeat`** is heading-anchored, not regex-on-prose: split on the known `##` headings (`Where We Are Right Now`, `Recent Key Events`, `Notes for Next Response`), then extract bullets. The file's schema is stable (see Pillar C, which formalizes it).
- **`supersededCues` extraction:** the mood line and Recent Key Events already narrate the day in order ("Earlier day: B-road motion-sickness … changing-room intimacy … pit send-off. **Now:** first out lap done"). Everything before the `Now:`/latest bullet becomes a superseded-cue set (`changing room`, `motion sick`, `B-roads`, `Villa Pétrusse`, `send-off`…). Everything in the `Now:` clause becomes live cues (`out lap`, `on track`, `pit wall`, `private radio`…).
- **`scoreRecency` returns a signed modifier**, applied inside `selectPrecedents`:
  - chunk text/section matches **live cues** → `+25`
  - chunk matches **superseded cues** and NOT live cues → `−45` (enough to beat the +12 "current/emotional" section bonus and typical keyword overlap, so a superseded beat only survives if the *user's turn itself* is about it)
  - chunk matches an **anti-reset note** target → `−80` (hard demotion; the operator explicitly banned resets to that beat)
  - **escape hatch:** if the user's message keywords overlap a superseded cue (Benjamin deliberately references the morning), halve the demotion instead of skipping it — memory callbacks are legitimate, resets are not.

#### EDIT `src/guardian/tools/preflight.ts` (integration point A — ~6 lines)

- In the parallel dispatch block: add `const liveStatePromise = callJson(toolCalls, ragClient, "get_live_story_state", { include_event_log: false })`.
- After awaiting: `const liveBeat = parseLiveBeat(liveState.response?.content ?? "")`.
- Pass `liveBeat` into `selectPrecedents(...)` (both call sites: `criticalPrecedents` limit 5 and `grokPrecedents` limit 2) and add `score += scoreRecency(result, liveBeat)` inside the scoring map.
- Also pass `liveBeat.liveCues` into `summarizeCurrentState` / `buildToneGuidance` as the keyword source, **replacing the Germany-arc hardcoded regexes** (`friday|nordschleife|paddock|race suit|…` at ~line 575 and the mood literals in `buildToneGuidance`). This defuses the arc-hardcoding time bomb flagged in the audit §5.2 in the same change: the keywords now come from live state, not code.

#### EDIT `src/guardian/llm-assessment.ts` (integration point B — additive)

Add to the system prompt: a `LIVE BEAT` block (location line, time line, live cues, anti-reset notes) placed **above** the retrieved evidence, with the instruction: *"Facts and precedents that describe earlier beats of the same day are context, not the present. Never describe superseded beats as current. If evidence conflicts with the LIVE BEAT, the LIVE BEAT wins."* This gives the auditor the same supersession knowledge the selector has — belt and braces.

#### NEW `tests/recency.test.ts`

Fixtures: the real current-state.md above + three synthetic chunks (changing-room note, out-lap note, Luxembourg-villa note). Assert: out-lap ranks first; changing-room demoted below it; Luxembourg demoted hard; changing-room demotion halves when the user message mentions "this morning in the changing room".

### A.4 Layer 2 — story-time attributes (RAG side, at next reindex)

#### EDIT `rag-memory-mcp/src/reindexer.ts` + the full indexer

Add two optional attributes per section at upload time (~line 148 attribute block):

- `story_epoch: number` — a coarse, monotonically increasing arc counter maintained in a small map file (`.rag-memory-mcp/story-epochs.json`) keyed by source file/dir: historical thread-01 = 1, thread-02 = 2, … chronological-summary-5 = 8, event-log/current-state = 99 (always-now). A 20-line lookup, not NLP.
- `is_live_state: boolean` — true for `current-state.md` / `event-log.md`.

#### EDIT `rag-memory-mcp/src/retriever.ts`

- Surface `story_epoch` on `RagContextResult` (it already passes through `attributes` at ~line 428; add `numberAttribute(attributes.story_epoch)`).
- Optional rank tweak: `rank_score += 0.02 * (story_epoch / maxEpoch)` — mild; the strong logic stays Guardian-side where the live beat is known.

#### EDIT `src/guardian/recency.ts`

When `story_epoch` is present on results, add an epoch-distance demotion (chunks ≥2 epochs behind the max retrieved epoch get −15 unless family/trauma/history triggers fire — preserving the existing deliberate-callback pathway in `selectPrecedents`).

**Priority:** Layer 1 is P0 of this pillar (pure Guardian, ships this week). Layer 2 is P1 (needs one full reindex to take effect; batch it with the store/manifest reconciliation the audit already recommends, killing two index-hygiene birds with one reindex).

---

## Pillar B — Serendipity 2.0 ("The Arc Weaver")

### B.1 Why the world is frozen (code-level diagnosis)

`src/guardian/serendipity.ts` is 41 lines: a flat 18-event array, `Math.random()` twice, and a **binary suppression** — any trigger matching `/Intimacy|Recovery|soreness|caretaking|dominance|Family|trauma/i` kills the roll entirely. Measured across the archive, those triggers are present in most turns of this RP, so: 6 nudges in 142 reports, all pure luck, no memory (the same event can fire twice in a row; the Ryan threat arc can never escalate because nothing remembers it fired).

The design error is treating "delicate scene" as *no world*, when the actual requirement is *no intrusive world*. Rain on the paddock roof during aftercare is atmosphere, not interruption.

### B.2 Design principles

1. **Intrusiveness tiers, not binary suppression.** Every event has a tier; every scene mode has a maximum admissible tier.
2. **Deferral, not deletion.** An event blocked by the scene mode isn't discarded — it queues and surfaces when the scene opens up ("as you step out of the changing room, Benjamin's phone shows three missed messages from Shevchenko").
3. **State + cooldowns.** A tiny JSON state file makes serendipity a *narrative system* instead of a dice roll: per-event cooldowns, per-category budgets, and arc threads that escalate (Ryan rumor → Ryan sighting → direct threat).
4. **The auditor weaves; the picker only picks.** Selection stays deterministic/cheap; the `gpt-5.6-terra` auditor (already running per-turn) turns the selected event into one scene-aware sentence, so "a text from Shevchenko" during the track stint becomes "the open channel crackles — Shevchenko wants two more heat-soak laps" instead of a generic phone buzz.

### B.3 File-by-file

#### NEW `src/guardian/serendipity-weaver.ts` (replaces the logic in `serendipity.ts`; keep the old export as a thin wrapper for one release)

```ts
export type Intrusiveness = "ambient" | "peripheral" | "engaging" | "disruptive";
// ambient:    weather, sound, smell — never requires character response
// peripheral: phone buzz noticed, background team chatter — acknowledgeable, ignorable
// engaging:   message content surfaces, NPC addresses them — invites response
// disruptive: knock on door, radio demand, Ryan development — forces response

export type SceneMode = "intimate" | "vulnerable" | "professional" | "transit" | "social" | "downtime";

export interface SerendipityEvent {
  id: string;                    // stable, for cooldown tracking
  category: "weather" | "environment" | "body" | "tech" | "phone_family" | "phone_friends"
          | "work_albion" | "network_shadow" | "recovery" | "ryan_arc";
  tier: Intrusiveness;
  text: string;
  grokNote?: string;             // stealth/lore constraints (kept from v1)
  arcThread?: string;            // e.g. "ryan"; enables escalation chains
  arcStage?: number;             // 1..n within the thread
  cooldownTurns: number;         // per-event
  weight: number;                // base selection weight
}

export interface SerendipityState {   // persisted at .guardian/serendipity-state.json
  lastFiredTurn: number;
  turnCounter: number;
  eventCooldowns: Record<string, number>;   // eventId -> turn it may fire again
  categoryLastFired: Record<string, number>;
  arcProgress: Record<string, number>;      // thread -> highest stage fired
  deferred: Array<{ eventId: string; queuedAtTurn: number; expiresAtTurn: number }>;
}

export function classifySceneMode(highRiskTriggers: string[], userMessage: string, liveBeat: LiveBeat): SceneMode;
export function maxTierFor(mode: SceneMode): Intrusiveness;
// intimate → ambient; vulnerable → ambient; professional → engaging;
// transit → peripheral; social → engaging; downtime → disruptive

export function selectSerendipity(state: SerendipityState, mode: SceneMode, triggers: string[]): {
  event?: SerendipityEvent;
  deferredInstead?: SerendipityEvent;   // picked but over-tier → queued
  state: SerendipityState;              // updated (counters, cooldowns, queue)
};
```

Selection algorithm (deterministic given the roll):

1. Increment `turnCounter`. Base fire chance **30%** (up from 15) **plus a drought bonus**: +5% per 5 turns since `lastFiredTurn`, capped at 60%. This mathematically guarantees the world can't freeze for 20 turns even in trigger-dense play — expected fire interval lands around every 3–5 turns, tunable.
2. Check the **deferred queue first**: if a queued event's tier is now admissible and not expired, surface it (with a "delayed discovery" framing hint) before rolling for new events.
3. Otherwise roll; filter the catalog to `tier ≤ maxTierFor(mode)`, off-cooldown, category not used in the last N turns. Weight `arcThread` events higher when their thread is mid-escalation.
4. If the roll selected an over-tier event (e.g., Ryan development during aftercare), **queue it** (`deferred`, expiry ~10 turns) and fire nothing — the world moved, and it will be discovered when the scene opens.
5. `ryan_arc` / `network_shadow` events select `arcStage = arcProgress[thread] + 1` so the threat escalates in order and never repeats a stage.

Catalog migration: the existing 18 events map cleanly (weather/environment → ambient; phone buzzes → peripheral at buzz-level with an engaging-tier "content revealed" variant; Shevchenko/Albion → engaging; Ryan → disruptive, stages 1–3).

#### EDIT `src/guardian/llm-assessment.ts` (integration point C — additive schema field)

Add optional output field `serendipity_weave: string | null` and, when an event was selected, append to the user payload: *"A background world event was selected: '<event text>' (tier: <tier>, scene mode: <mode>). Write ONE sentence weaving it into the current scene's background at its tier — ambient events must not demand a response. Respect the Grok note: <grokNote>. If it cannot be woven without disrupting the scene, return null."* The auditor thus has veto power — the last defense for delicate scenes — and its weave replaces the raw catalog text in the brief.

#### EDIT `src/guardian/report/compile-grok-brief.ts`

Prefer `llm_assessment.serendipity_weave` over `report.serendipity_nudge`; render as the existing "World Weaver (Serendipity)" block. Tier annotation stays out of the brief (novelist doesn't need mechanics).

#### EDIT `src/guardian/tools/preflight.ts` (integration point D — ~8 lines)

Replace `getSerendipityNudge(highRiskTriggers)` with: load state → `classifySceneMode(...)` → `selectSerendipity(...)` → persist state → pass selected event into `assessGuardianEvidence` input → put the weave (or deterministic fallback text) into `serendipity_nudge`.

State persistence: simple `fs` read/write of `.guardian/serendipity-state.json` with an in-process cache; single-writer (one Guardian instance), so no locking needed.

#### NEW `tests/serendipity-weaver.test.ts`

Assert: intimate mode admits only ambient; disruptive event during intimate mode queues and later surfaces in downtime mode; drought bonus raises probability monotonically; ryan_arc fires stages in order; per-event cooldown respected across simulated 50-turn runs (statistical: fire rate lands in 20–35% band).

---

## Pillar C — The Staging Pipeline & Scene-Transition Rewrites

### C.1 Diagnosis: three separate gaps, not one

1. **The staging path has never executed.** All 77 archived writes are legacy `update_story_state` live appends; the `decideMemoryWrite` → `stage_story_update` code postdates every saved report and has no production run. Unknown-unknowns live here.
2. **Append is the wrong verb for `current-state.md`.** The file is a *structured snapshot* with a stable schema (`Last Updated` / `Where We Are` / `Emotional State` / `Open Threads` / `Recent Key Events` / `Notes for Next Response`). Appending "Proposed continuity update" bullets to the bottom degrades it into a log, and — worse — leaves the *top* of the file (the actual snapshot) stale, which then poisons Pillar A's live-beat parsing. Scene transitions need a **structured rewrite**, not an append.
3. **`isMaterialMemoryUpdate` has the same arc-hardcoding time bomb** as the scene fallbacks: its `materialCue` regex is Germany-arc literals (`nordschleife|paddock|race suit|shakedown|affalterbach…`, `memory-writeback.ts` line ~58). When the story flies home, material updates stop being recognized as material.
4. **Approval is a dead end.** `approve_staged_story_update` exists but nothing surfaces pending updates to the operator; staged files would rot silently in `.rag-memory-mcp/staged-updates/`.

### C.2 Design: three write classes with different verbs, gates, and risk

| Class | Trigger | Target & verb | Gate |
|-------|---------|---------------|------|
| **Turn note** (most turns) | Nothing material | **No write.** | Existing no-op/material gate (fix the regex) |
| **Beat advance** | Material event within the same scene (out lap completed, letter revealed) | `event-log.md` **append** (episodic, append-native) + staged one-bullet patch to `Recent Key Events` | Auto-approve (low risk: additive, non-destructive) |
| **Scene transition** | Location/time/scene changed (Luxembourg → Nürburgring; track → Affalterbach) | Full structured **overwrite** of `current-state.md`, generated by the auditor | Staged; auto-approve **only if validation passes**, else held for human review |

This answers the core tension directly: micro-logs are killed by the material gate; scene transitions get the powerful-but-dangerous verb (overwrite) wrapped in the strongest gate (schema validation + canon-preservation checks + staging with dry-run).

### C.3 File-by-file

#### EDIT `src/guardian/memory-writeback.ts` — de-hardcode + classify

- Replace the `materialCue` literal regex with two generic signals: (a) **live-beat delta** — the update's location/time cues differ from `LiveBeat.locationLine`/`timeLine` (Pillar A's parser, reused); (b) **auditor declaration** — new schema field below. Keep the risk-level gate as is.
- Extend `MemoryWriteDecision` with a class: `{ action: "stage_transition"; … }` alongside the existing stage/live/none, decided by the new auditor field.

#### EDIT `src/guardian/llm-assessment.ts` (integration point E — additive schema fields)

```ts
scene_transition: {
  type: ["object", "null"],
  properties: {
    occurred: { type: "boolean" },
    from: { type: "string" },          // "Villa Pétrusse suite, Luxembourg, Thursday night"
    to: { type: "string" },            // "Nürburgring industry paddock, Friday midday"
    kind: { enum: ["location", "time_jump", "both"] }
  }
}
```

System-prompt addition: *"Set scene_transition only when the scene's location or story-time has durably changed versus the LIVE BEAT block. Continuous action in the same place and hour is not a transition."* Because the LIVE BEAT block (Pillar A) is in the same prompt, the auditor compares against ground truth, not vibes — this is why Pillar A should land first.

#### NEW `src/guardian/state-rewrite.ts` — the structured rewrite generator

```ts
export const CURRENT_STATE_SCHEMA = [
  "# Current Story State — Scarlett & Benjamin",
  "## Where We Are Right Now (High-Level Snapshot)",
  "## Scarlett’s Current Emotional & Relational State",
  "## Benjamin’s Observable State (What Scarlett Sees / Hears)",
  "## Open Story Threads & Pending Elements",
  "## Recent Key Events (Last 1–3 Sessions — Brief)",
  "## Notes for Next Response"
];

export async function generateStateRewrite(input: {
  currentStateMarkdown: string;        // via get_live_story_state
  transition: SceneTransition;
  supportedFacts: string[];            // this turn's auditor facts
  recentCandidateUpdates: string[];    // last few staged bullets, for Recent Key Events
  config: AssessmentConfig;
}): Promise<{ markdown: string } | { error: string }>;

export function validateStateRewrite(oldMd: string, newMd: string): { ok: true } | { ok: false; violations: string[] };
```

- **Generation** is a *second, dedicated* `gpt-5.6-terra` call (reasoning effort **medium** — this writes canon; do not run it at `low`), fired only on transitions (rare: a handful per week), so cost is negligible. The prompt: old file + transition + facts, instruction to produce the full new file preserving every heading, rolling the old "Now" into "Recent Key Events", carrying unresolved Open Threads forward, and updating `Last Updated`.
- **`validateStateRewrite` is the real gate** (deterministic, no LLM):
  1. every `CURRENT_STATE_SCHEMA` heading present, in order;
  2. `Last Updated` changed;
  3. length within 0.5×–2.0× of the old file (catches truncation and runaway generation);
  4. **canon-preservation list**: a small `.guardian/protected-facts.txt` of literals that must survive any rewrite (e.g. "pre-op trans woman", "Qualified Autonomy", key names) — every entry must appear in the new file;
  5. no RAG meta / tool dialect (`isRagMetaText` over each section);
  6. every Open Thread from the old file either appears in the new file or is explicitly listed in a `resolved:` marker the generator must emit for dropped threads (prevents silent thread loss).

#### EDIT `src/guardian/tools/preflight.ts` (integration point F — the write branch, replacing the current stage/live blocks ~lines 218–266)

```text
decision = decideMemoryWrite(...)
├─ none            → record reason (unchanged)
├─ stage (beat)    → stage_story_update(event-log.md, append)          → auto-approve
│                    + stage_story_update(current-state patch bullet)   → auto-approve
├─ stage_transition→ generateStateRewrite(...)
│    ├─ validate OK  → stage_story_update(current-state.md, overwrite)
│    │                 → approve_staged_story_update({ dry_run: true })  // RAG-side path check
│    │                 → approve_staged_story_update({})                 // real apply + bg reindex
│    └─ validate FAIL→ stage only; memory_write = { action: "held_for_review", violations }
└─ live_append     → keep for GUARDIAN_MEMORY_WRITE_MODE=live only (legacy)
```

New config: `GUARDIAN_AUTO_APPROVE: "none" | "beats" | "beats_and_valid_transitions"` (default `beats` for the first two weeks; graduate to `beats_and_valid_transitions` once §C.4's burn-in passes). `memory_write` in the report must always record what happened — the audit found this field absent from all 142 reports; it is the observability spine of this pillar.

#### EDIT `rag-memory-mcp/src/server.ts` (small, additive)

- `list_staged_story_updates`: add optional `include_content: boolean` so a reviewer can read proposals without opening JSON files.
- Add `reject_staged_story_update` (id + reason → moves the JSON to `staged-updates/rejected/`) so the queue can be cleared without approving. Currently rejection = manual file deletion.

#### NEW `scripts/review-staged.ts` (Guardian repo) — the missing human loop

CLI: list pending staged updates with diffs against the live file, then `approve <id>` / `reject <id> <reason>` via the RAG tools. ~80 lines. Without this, "held for review" is a black hole and the operator will be tempted back to live mode.

#### NEW `tests/state-rewrite.test.ts`

Golden test: the real current-state.md + a synthetic "arrived at Affalterbach" transition → validate that a hand-written good rewrite passes and that mutants fail (missing heading; dropped protected fact; silently dropped open thread; 10× length).

### C.4 Burn-in protocol (before trusting auto-approve on transitions)

1. Ship with `GUARDIAN_AUTO_APPROVE=beats`; transitions stage-and-hold.
2. Play through the next real transition (track day → Affalterbach is imminent in-story — a perfect live test). Review the generated rewrite via `review-staged.ts`; approve manually.
3. After **3 consecutive** transition rewrites that pass validation *and* human review without edits, flip to `beats_and_valid_transitions`.
4. Keep the RAG-side file backup (already created by `performApprovedStoryUpdate`) as the rollback path; add the backup path to `memory_write` in the report.

---

## Consolidated P0 → P2 sequencing

### P0 (this week — foundations, no risky writes)

| # | Item | Files | Pillar |
|---|------|-------|--------|
| 1 | `parseLiveBeat` + `scoreRecency`; wire into `selectPrecedents` | NEW `recency.ts`; `preflight.ts` (point A) | A |
| 2 | Replace Germany-arc hardcoded regexes in scene/tone fallbacks with live-beat cues | `preflight.ts` (same edit) | A |
| 3 | LIVE BEAT block in auditor prompt | `llm-assessment.ts` (point B) | A |
| 4 | De-hardcode `isMaterialMemoryUpdate` (live-beat delta signal) | `memory-writeback.ts` | C |
| 5 | **Execute the staging path once end-to-end manually** (stage → list → approve → bg reindex) to flush unknown-unknowns before building on it | none (operational) | C |
| 6 | `reject_staged_story_update` + `include_content` | `rag-memory-mcp/src/server.ts` | C |

### P1 (next 1–2 weeks — the three systems go live)

| # | Item | Files | Pillar |
|---|------|-------|--------|
| 7 | `scene_transition` auditor field + `stage_transition` decision class | `llm-assessment.ts` (E), `memory-writeback.ts` | C |
| 8 | `generateStateRewrite` + `validateStateRewrite` + protected-facts file | NEW `state-rewrite.ts` | C |
| 9 | Write branch rework + `GUARDIAN_AUTO_APPROVE` + `memory_write` always recorded | `preflight.ts` (F), `config.ts` | C |
| 10 | `review-staged.ts` CLI | NEW script | C |
| 11 | Serendipity 2.0: tiers, scene modes, deferral queue, arc threads, state file | NEW `serendipity-weaver.ts`; `preflight.ts` (D) | B |
| 12 | Auditor weave field + brief rendering | `llm-assessment.ts` (C), `compile-grok-brief.ts` | B |
| 13 | Tests: recency, weaver, state-rewrite golden | NEW test files | all |

### P2 (after burn-in — index-level recency & polish)

| # | Item | Files | Pillar |
|---|------|-------|--------|
| 14 | `story_epoch` / `is_live_state` attributes at index time + epoch map | `rag-memory-mcp/src/reindexer.ts`, indexer, NEW `story-epochs.json` | A |
| 15 | Full reindex (batched with store/manifest reconciliation from the audit) | operational | A |
| 16 | Epoch-distance demotion in Guardian when attribute present | `recency.ts`, `retriever.ts` | A |
| 17 | Graduate to `beats_and_valid_transitions` after 3 clean transitions | `.env` | C |
| 18 | Serendipity tuning pass from state-file telemetry (fire rate, deferral survival, arc pacing) | `serendipity-weaver.ts` | B |
| 19 | Scorecard extension: recency-violation counter (superseded cue in top-2 precedents), serendipity fire rate, write-class distribution per week | audit scorecard script | all |

---

## Acceptance criteria (measurable, per pillar)

**A — Recency:** In 10 consecutive preflights during an active scene, zero top-2 precedents describe a superseded same-day beat (unless the user's turn references it). Scene summary never regresses to an earlier location after a transition rewrite.

**B — Serendipity:** Fire rate 20–35% over any 30-turn window regardless of trigger density; zero engaging/disruptive events during intimate/vulnerable modes; at least one deferred event observed surfacing later; Ryan arc stages fire in order.

**C — Write-back:** `memory_write` present in 100% of new reports; zero live appends while mode=stage; every scene transition produces either an applied validated rewrite or a held-for-review entry visible in `review-staged.ts`; `current-state.md` top snapshot matches the actual live beat after each transition (which closes the loop — Pillar A's parser reads what Pillar C writes).

---

## Closing note on system shape

These three pillars are one feedback loop, not three features: **C** keeps `current-state.md` truthful at transitions → **A** parses that truth to demote the past → the auditor, grounded by A's LIVE BEAT block, makes better transition calls for C → and **B** uses A's scene mode plus its own state to keep the world alive without breaking the scene. The loop's single point of failure is the truthfulness of `current-state.md`, which is exactly why Pillar C's validation gate (schema + protected facts + thread preservation) is the most safety-critical code in this roadmap — and why the burn-in protocol should not be skipped, however well the first rewrite reads.

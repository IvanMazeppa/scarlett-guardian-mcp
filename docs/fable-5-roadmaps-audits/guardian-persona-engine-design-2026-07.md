# The Persona Engine — Self-Healing Character Bibles Without Self-Modifying Identity

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent)  
**Companions (this folder):** `guardian-writeback-recency-serendipity-roadmap-2026-07.md` (Pillar C: staging, state rewrite, protected facts), `memory-compression-pipeline-roadmap-2026-07.md` (arc-close trigger), `guardian-dramaturg-design-2026-07.md`, `guardian-eval-harness-design-2026-07.md`  
**Executor:** Grok 4.5 (Agentic Coder)  
**Problem:** Persona documents (`master-context.md`, character bibles, Grok's cloud-pasted project instructions) drift out of sync with the story unless manually updated. A marriage-and-move-to-Sweden-class event would leave Scarlett's base persona describing a life she no longer lives.

---

## 1. First, a warning the design must be built around

An autonomous persona engine is the **highest-risk write surface in the entire system**, because it closes a positive feedback loop with no natural damping:

```text
bible drifts → Grok writes a drifted Scarlett → auditor treats drifted behavior
as the new baseline → reconciliation "confirms" the drift → bible drifts further
```

Write-back to `current-state.md` (Pillar C) is bounded — a bad write costs one scene. A bad *persona* write compounds every turn forever. So the engine's name must be read precisely: **self-healing means converging on the evidenced truth of the story; it must never mean self-modifying identity.** Every mechanism below is a damping mechanism first and an automation second.

## 2. The measured problem — drift is already happening, and already being patched around

Three findings from the live corpus:

1. **`benjamin-character-bible.md` §"Current Emotional State (1 October 2026 – Evening)"** — the story is mid/late October; this section is two-plus story-weeks stale, still describing the letters/piano evening. The quality audit measured the symptom: this exact section kept surfacing in tone selection, and `pickPreferredSceneResults` now carries a **code-level demotion** with the comment *"Character-bible 'current emotional state' is often days/weeks stale vs live RP — demote for tone."* A retrieval heuristic is compensating for a data-lifecycle failure. That is the drift problem, live, today.
2. **`master-context.md` already contains the correct pattern** — its "Current Live State" section holds no snapshot at all: *"Use `current-state.md` as the sole authority for the live scene… Do not treat this file as carrying its own current snapshot."* Delegation instead of duplication. But the same file's "High-Signal Timeline" ends with a volatile "Germany trip (actual progress)" entry that says *"Luxembourg (Thursday evening as of current)"* — already one story-day behind. The file is half-migrated to its own best practice.
3. **The cloud copy is unreachable by design.** Grok's project instructions live in SuperGrok's UI, pasted by the operator. Guardian can patch the repo version; it can never push to the cloud. Any design pretending otherwise is fiction — the sync gap needs an operator-loop answer, not an API answer.

## 3. The central insight: don't sync faster — shrink what can drift

The naive design (LLM rewrites the bibles when things change) attacks the wrong variable. The right variable is the **size of the static surface**:

> Static layers should contain only what never changes. Everything that evolves should live where the write-back pipeline already keeps it fresh — and reach Grok through retrieval, which is *always* current.

Retrieval already delivers live persona state to Grok every turn via the brief (scene summary, emotional context, intention). A "current emotional state" section in a static bible is not just stale — it is *redundant with a fresher channel*. Delete the redundancy and most of the drift surface disappears before any engine is built.

What remains is a genuinely small set of slow-moving facts (relationship status, living situation, occupation arc, resolved traumas) that *should* live in the bibles and *do* need occasional evolution. That is the engine's entire jurisdiction.

## 4. The volatility partition

Every section of every persona document gets one classification, recorded in a machine-readable map (`rag-memory-mcp/persona-volatility-map.json` — machinery, not lore; not indexed):

| Tier | Definition | Examples | Who may write |
|------|-----------|----------|---------------|
| **CORE** | Identity invariants; the story ends before these change | Trans identity/anatomy/transition history; Qualified Autonomy; first-person POV rule; anti-tropes; names, birthdates, first-meeting date | **No one, mechanically.** Human edit only, by hand, deliberately |
| **STABLE** | Life-event scale; changes a few times per story-year | Relationship status (engaged → married); home (London → Vaxholm); occupation arc; family estrangements resolved | Engine may **propose diffs**; human approval always required |
| **VOLATILE** | Arc scale; should refresh every arc close | Bible "current emotional state" sections; master-context timeline tail; "ongoing arcs" lists | Engine reconciles via staging; auto-approvable after burn-in |
| **DELEGATED** | Should not exist in static files at all | Live scene, mood, open threads | Removed — replaced by a delegation line pointing at `current-state.md` (the master-context pattern) |

The map is the persona equivalent of the dramaturg's no-outcome schema: enforcement is **structural** (the gate refuses any diff touching an unlisted or CORE section), so the constraint cannot erode through prompt drift.

`persona-invariants` (the CORE fact list) extends Pillar C's `.guardian/protected-facts.txt` — same file, same consumers: `validateStateRewrite` already checks it for state rewrites; the persona gate checks it for bible patches; the eval harness asserts it in briefs. One canon-protection list, three enforcement points.

## 5. The reconciliation pass

### 5.1 Cadence and trigger

**Arc close only** — the same joint where compression fires and the dramaturg drafts the next plan. (These three form one "arc-close ceremony"; one operator sitting, three staged proposals to review.) Never per-turn, never per-scene: persona evolution at turn cadence is definitionally drift.

### 5.2 Evidence quorum — the engine believes the record, not itself

**NEW `scripts/reconcile-persona.ts`** (Guardian repo, CLI, offline — same shape as `compress-arc.ts`):

```text
reconcile-persona --arc arc-09-germany-trip [--dry-run]

 Inputs (the evidence pool — all products of already-gated pipelines):
   - emotional-milestones.md entries added during the arc
   - approved staged updates (event-log sessions, current-state rewrites)
   - the arc's narrative record (## 2. Durable Canon & Character Updates —
     the compression pipeline already extracts exactly this)
   - duplex Director's Corrections log for the arc

 Step 1  PROPOSE (one terra call, reasoning medium): for each VOLATILE section
         in the map, a replacement; for STABLE facts, a diff proposal ONLY if
         evidence demands it. Every changed line must carry ≥2 citations into
         the evidence pool (quorum). Output schema has no field capable of
         touching a CORE section.

 Step 2  GATE (deterministic, src/guardian/persona-gate.ts):
         only mapped VOLATILE/STABLE sections touched · all CORE invariants
         byte-present · quorum satisfied per changed line · diff size bounds
         (a VOLATILE refresh may not triple a section) · no RAG meta ·
         no contradiction of persona-invariants regexes

 Step 3  STAGE via stage_story_update (one staged update per target file),
         reviewed in the same review-staged CLI as everything else.
         VOLATILE → auto-approvable after burn-in (§7).
         STABLE  → human approval, permanently.

 Step 4  Post-approval: background reindex (existing path); if any STABLE
         change landed, emit the instruction sync digest (§6).
```

The quorum rule is the anti-hallucination core: a single auditor's `candidate_memory_update` or one odd scene can never rewrite who Benjamin is — the story must have said it at least twice, through pipelines that were themselves gated.

### 5.3 The drift alarm (duplex as sensor)

Duplex corrections double as a persona-drift detector: if Director's Corrections repeatedly fire against behavior that is *consistent with the bible* (or repeatedly defend behavior that contradicts it), either the bible is stale or Grok is drifting. The reconciler counts correction-vs-bible conflicts in its evidence pool and surfaces a `drift_alarm` in its report — a prompt for the human to look, never an auto-change. This turns the feedback loop's own machinery into its smoke detector.

## 6. The cloud sync gap — honest answer

Guardian cannot write SuperGrok's project settings. The design therefore has three legs:

1. **The instruction diet makes the gap small.** After partition, `project-instructions-*.md` contains only CORE identity + protocol + anti-tropes (v6.1 §1/§3/§5 are already exactly this). A document of invariants needs syncing approximately never; volatile persona reaches Grok through the brief each turn.
2. **Versioned files + sync digest for the rare rest.** When a STABLE change lands (marriage-class), **NEW `scripts/generate-instruction-sync.ts`** produces the next versioned instruction file (the v6 → v6.1 convention, automated) plus a digest: what changed, why (citations), and a paste-ready block. The operator's job drops from "notice drift, rewrite instructions" to "paste this."
3. **Version visibility.** The instruction file carries a version hash; the bootstrap message template (already versioned: `bootstrap-message-v6.1-duplex.md`) embeds it. When the repo hash and the bootstrap hash disagree, the repo knows the cloud copy is behind — drift becomes *visible* even though it can't be *pushed*.

## 7. Worked example — marriage and the move to Vaxholm

1. **During the arc:** wedding beats play out; milestones staged ("wedding at Midsommar, Vaxholm — vows in Swedish…"); current-state rewrites track the move; the narrative record's Durable Canon section lists both.
2. **Arc close, reconciliation:** VOLATILE proposals — Benjamin bible emotional-state refresh, master-context "Ongoing Arcs" update (quorum trivially met). STABLE proposals — bible "Relationship with Scarlett": *engaged → married*; master-context timeline: wedding date moves from planned to happened; "Important Locations": Vaxholm home added. Each line cites ≥2 evidence entries.
3. **Gate:** CORE untouched (trans identity, autonomy protocol — marriage changes none of it); quorum ok; diffs bounded. Passes.
4. **Human review:** operator reads three diffs in the review CLI over coffee; approves. Reindex fires.
5. **Sync digest:** STABLE changed → v6.2 instructions generated; the only edited line is §1's *"profoundly bonded to Benjamin"* → *"married to Benjamin, living in Vaxholm"* + changelog + paste block. Operator pastes into SuperGrok; bootstrap hash updated.

Total human cost for a life-changing event: one review sitting and one paste. Total machine authority over identity: zero.

## 8. Roadmap

### P0 — Shrink the drift surface (no engine, immediate wins)

| # | Task | Files |
|---|------|-------|
| 1 | Author `persona-volatility-map.json` covering master-context, both bibles, story-bible, project-instructions | NEW map |
| 2 | Apply DELEGATED conversions: Benjamin bible emotional-state section → delegation line + reconciled snapshot (dated); master-context timeline tail → move "actual progress" into current-state/event-log delegation; reindex | corpus edits |
| 3 | Promote `.guardian/protected-facts.txt` → shared persona-invariants (consumed by Pillar C validator; seeded from v6.1 §1 + story-bible §1) | Guardian config |
| 4 | Retire the `pickPreferredSceneResults` character-bible demotion **only after** #2 proves fresh (the heuristic is the fallback until the data is fixed) | `preflight.ts`, later |

### P1 — The engine

| # | Task | Files |
|---|------|-------|
| 5 | `persona-gate.ts` (deterministic checks; map + invariants enforcement) + mutant tests (CORE touch, quorum miss, unbounded diff → all fail) | NEW + tests |
| 6 | `reconcile-persona.ts` (evidence pool assembly, propose call, gate, stage) | NEW script |
| 7 | Drift alarm from duplex-corrections log | reconciler |
| 8 | First live run at the Germany-arc close; human-approve everything; record outcomes | operational |
| 9 | Eval-harness `persona/` golden category: CORE invariants present in briefs; reconciler mutants rejected | evals |

### P2 — Sync automation and graduated trust

| # | Task | Files |
|---|------|-------|
| 10 | `generate-instruction-sync.ts` + version-hash convention in bootstrap templates | NEW script |
| 11 | Auto-approve VOLATILE reconciliations after 3 consecutive arc-closes with zero human edits (same burn-in protocol as Pillar C transitions); STABLE stays human forever | config |
| 12 | Scorecard: staleness metric (days since each VOLATILE section's last reconciliation vs arc closes), drift-alarm count | audit script |

## 9. Acceptance criteria

- **Staleness:** no VOLATILE section older than one arc close; the "1 October" class of stale bible section cannot recur (measured by the scorecard staleness metric).
- **Identity safety:** persona-invariants byte-identical across every reconciliation, forever — a single violation is a release-blocking bug; the gate's mutant tests prove CORE is structurally unreachable.
- **Quorum:** zero approved persona lines with fewer than 2 independent evidence citations.
- **The heuristic retires:** the character-bible tone demotion in `pickPreferredSceneResults` can be removed without quality regression (eval-verified) — the cleanest possible proof that the data lifecycle now does what the retrieval patch was compensating for.
- **The marriage test:** a STABLE-class event flows end-to-end (evidence → proposal → gate → human approval → reindex → sync digest → paste) with less than fifteen minutes of operator time.

## 10. One-line summary

**Don't build an engine that rewrites the persona — shrink the persona's static surface to true invariants (delegating everything live to retrieval, which is already fresh), then reconcile the small volatile remainder once per arc under an evidence quorum and a structural gate that makes identity mechanically unwritable, with a paste-ready digest bridging the one gap automation can't reach: Grok's cloud-side instruction box.**

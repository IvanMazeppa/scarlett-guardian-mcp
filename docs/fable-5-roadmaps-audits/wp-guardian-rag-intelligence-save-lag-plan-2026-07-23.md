# Guardian + RAG intelligence and save-lag implementation plan

**Date:** 2026-07-23  
**Status:** Proposed work-package sequence — no implementation authorized  
**Branch at drafting:** `feature/suite-npc-canon-2026-07-23`  
**Evidence audit:** `guardian-rag-intelligence-save-lag-architecture-audit-2026-07-23.md`

## Purpose

Increase Guardian's narrative intelligence, memory depth, and context awareness without:

- adding large amounts of unnecessary context;
- increasing temporal mud;
- rewinding live play when disk state lags;
- allowing offstage NPC, serendipity, or dramaturg pressure into the wrong scene;
- reintroducing character steering or personality drift;
- blocking forward roleplay on perfect save synchronization.

The system already retrieves aggressively. This plan improves freshness, evidence selection, optional-system safety, and adaptive depth before increasing token budgets.

## Current architectural finding

Save lag is detected during preflight, but the stale disk-derived LIVE BEAT can still reach:

- Scene Roster;
- NPC agenda intersections;
- Serendipity Weaver;
- Dramaturg Momentum;
- the Guardian auditor;
- canon-adjacent write decisions.

Mitigation currently happens too late.

The central change is one resolved scene-confidence decision, calculated before those systems run and consumed consistently by all of them.

## Safety hold before implementation

Do not commit or reindex the current uncommitted RAG `current-state.md` without review.

The Saturday-morning narrative advance may be valid, but the file currently contains model-control language such as:

- “proving to herself”
- “Character Balance”
- “Character Balance rules apply”

Preserve approved story facts while removing prompt/policy language from canon.

Also review the three untracked v6.2/v2.4 instruction files before activating them together. Repeating Character Balance at Agent, Project, Skill, Guardian auditor, and final-brief layers risks another overcorrection.

## Work-package sequence

### INTEL-0 — Freeze and verify current state

**Effort:** S  
**Risk:** Low  
**Must ship first:** Yes

#### Goal

Establish a clean baseline before adding more architecture.

#### In scope

- Review the uncommitted Saturday-morning `current-state.md`.
- Separate narrative state from model-control instructions.
- Review and deduplicate the three v6.2/v2.4 instruction candidates.
- Restore the Scene Cast test threshold changed from 130 to 160 words, or fix the formatter in a separately justified patch.
- Add one semantic receptive-agency case where Scarlett accepts care or follows Benjamin and Director's Correction remains null.
- Record the exact active Agent, Project, Skill, Guardian, and OOC instruction versions.

#### Out of scope

- No retrieval-volume changes.
- No save-lag architecture changes.
- No reindex until the Operator approves the cleaned narrative state.
- No personality rewrite.

#### Acceptance

- No prompt vocabulary remains in narrative canon.
- Only one reviewed Character Balance source exists at each necessary layer.
- A valid receptive Scarlett reply receives no correction.
- Existing anti-parroting and ensemble-erasure cases remain green.
- No unrelated test threshold is weakened.

#### Validation

```bash
cd scarlett-guardian-mcp
npm run build
npm test
npm run eval:fast
```

If a valid API key is configured:

```bash
npm run eval:llm -- --category duplex --trials 3
```

#### Rollback

One focused commit. Revert it if the instruction baseline or test restoration causes unexpected behavior.

---

### INTEL-1 — Resolved scene-confidence gate

**Effort:** M  
**Risk:** Medium  
**Depends on:** INTEL-0

#### Goal

Calculate scene freshness once and prevent stale passive evidence from controlling optional systems.

#### Proposed resolved state

Add a small internal object containing:

- disk LIVE BEAT availability;
- disk-state hash and modification time;
- index revision/hash when available;
- save-lag suspected;
- played-evidence confidence;
- current scene mode;
- current cast confidence;
- evidence provenance from disk, current user message, previous Scarlett duplex, and recent context;
- provisional-state reason.

Do not expose a new public API in this WP unless unavoidable.

#### Integration order

1. Resolve duplex.
2. Read disk LIVE BEAT.
3. Compare disk state with user, duplex, and recent context.
4. Build resolved scene confidence.
5. Pass the same result into roster, agendas, serendipity, dramaturg, auditor, and write-back.

#### Degradation policy

When state is provisional:

- **Roster:** allow directly addressed or currently speaking NPCs; suppress Present-cast, arc-cast, cache-only, and cue-only activation without current-turn corroboration.
- **Serendipity:** ambient-only; defer NPC, engaging, disruptive, threat, or knowledge-sensitive events.
- **Dramaturg:** omit exact beat pressure; use only a neutral “continue played scene; preserve downstream pressure” line.
- **Auditor:** do not issue rewind corrections against strong played consensus.
- **Write-back:** transitions and NPC changes must remain human-held; never auto-approve.

#### Likely files

- `src/guardian/tools/preflight.ts`
- `src/guardian/save-lag.ts`
- `src/guardian/scene-roster.ts`
- `src/guardian/serendipity-weaver.ts`
- `src/guardian/dramaturg.ts`
- `src/guardian/llm-assessment.ts`
- focused tests

#### Acceptance

- Stale Present data cannot summon offstage NPCs.
- Strong user + duplex consensus can continue a later played scene without rewinding.
- Save-lag uncertainty cannot generate non-ambient events.
- Stale exact momentum reaches neither auditor nor final brief.
- Provisional state cannot auto-approve canon-adjacent writes.
- Correct, synchronized LIVE BEAT behavior remains unchanged.

#### Required tests

- stale car/cabin state versus played suite scene;
- stale Present names Shevchenko in a private couple scene;
- save lag affects roster, serendipity, and momentum simultaneously;
- current user explicitly addresses an NPC despite stale couple-only state;
- missing LIVE BEAT;
- strong disk/user agreement;
- provisional transition write remains held.

#### Validation

```bash
npm run build
npm test
npm run eval:fast
```

Run targeted LLM trials for temporal-mud, duplex, and write-back if configured.

#### Rollback

Feature-gate the resolved scene-confidence policy. Disable it to return to existing behavior without deleting telemetry fields.

---

### INTEL-2 — Sidecar and cache hardening

**Effort:** M  
**Risk:** Medium  
**Depends on:** INTEL-1

#### Goal

Prevent dramaturg and serendipity state from crossing unrelated scenes, revisions, or threads.

#### In scope

- Add a live-scene fingerprint to dramaturg cache validity.
- Include location, story time, Present cast, and live cues in the fingerprint.
- Invalidate on disk-state revision, not only plan hash, declared transition, or turn count.
- Key serendipity/deferred state by thread and scene when identifiers are available.
- Give deferred events an expiry and applicability fingerprint.
- Remove superseded LIVE BEAT cues from positive agenda activation.
- Require current-turn corroboration for cached NPC agenda pressure.
- Report cache source, age, fingerprint, and invalidation reason.

#### Acceptance

- Correcting disk LIVE BEAT invalidates stale dramaturg context immediately.
- Deferred events do not cross thread or scene boundaries.
- Superseded cues cannot activate current NPC pressure.
- Restarted Guardian cannot resurrect an inapplicable deferred event.
- Missing identifiers fail conservatively rather than guessing.

#### Required tests

- same plan hash, changed live scene;
- thread A deferred event unavailable in thread B;
- expired event;
- stale cached NPC intersection without current-turn corroboration;
- superseded cue present but no live cue;
- restart persistence.

#### Rollback

Ignore new fingerprint fields and retain old sidecar files; do not destructively migrate them in place.

---

### INTEL-3 — Retrieval correctness and bounded execution

**Effort:** M/L  
**Risk:** Medium  
**Depends on:** INTEL-1

#### Goal

Make existing retrieval trustworthy before adding calls or tokens.

#### In scope

1. Expand context using exact `source_file + section`, not global response-local IDs such as `r1`.
2. Namespace result IDs if they remain externally visible.
3. Replace soft timeout races with true cancellation.
4. Add one total preflight deadline and one shared optional-depth budget.
5. Limit initial and optional MCP concurrency.
6. Reuse a transport per preflight or provide a bounded bundled RAG operation.
7. Give the Guardian auditor an explicit timeout and output-token cap.
8. Replace evidence JSON tail-cutting with valid, field-budgeted assembly.
9. Replace final Markdown hard-cutting with per-section budgets.
10. Reserve space for:
    - scene/status;
    - Director's Correction;
    - minimal Character Balance;
    - key facts.

#### Suggested initial limits

- initial retrieval deadline: 14 seconds;
- optional-depth budget: 5 seconds total;
- auditor deadline: 12 seconds;
- total preflight hard deadline: 30–32 seconds;
- initial MCP concurrency: 3;
- optional concurrency: 2;
- auditor evidence: keep current 32,000-character cap during this WP.

#### Likely files

Guardian:

- `src/guardian/tools/preflight.ts`
- `src/guardian/rag-client.ts`
- `src/guardian/config.ts`
- `src/guardian/llm-assessment.ts`
- `src/guardian/report/compile-grok-brief.ts`
- `src/guardian/telemetry.ts`

RAG:

- `src/retriever.ts`
- `src/server.ts`

#### Acceptance

- Concurrent searches cannot expand the wrong `r1`.
- Timed-out calls are cancelled and cannot mutate a completed report.
- Mandatory brief sections survive maximum optional content.
- Fact-check evidence cannot be silently cut from malformed JSON.
- p95 remains within the agreed preflight latency ceiling.
- Existing retrieval quality is non-inferior.

#### Required tests

- concurrent result-ID collision;
- cancellation and post-timeout completion;
- whole-preflight deadline;
- long duplex plus fact-check evidence;
- maximum-size brief with mandatory sections;
- transport/concurrency cap;
- malformed/partial evidence prevention.

#### Rollback

Keep old orchestration behind a temporary configuration switch until replay validation is complete.

---

### INTEL-4 — Adaptive retrieval and evidence allocation

**Effort:** L  
**Risk:** Medium/High  
**Depends on:** INTEL-3

#### Goal

Use more context when it improves coverage, not on every turn.

#### Retrieval waves

**Wave 1**

- one `retrieve_story_context`;
- one concrete `search_story_memory`;
- disk LIVE BEAT and index status.

**Wave 2 only when**

- current-state/canon coverage is missing;
- top evidence is weak or duplicative;
- an exact name/date/place/chronology claim needs verification;
- distinct trigger families remain uncovered;
- temporal disagreement exists;
- a strong result needs adjacency expansion.

#### Recommended caps

- ordinary turn: one search, conditional second;
- triggered turn: maximum two searches;
- forced diagnostic turn: maximum three;
- initial results: six;
- forced results: up to eight;
- initial text: 1,600–1,800 characters per result;
- larger context only through deliberate expansion.

#### Evidence quotas

Before auditor injection, select approximately:

- two live/current-state items;
- two recent-event or active-arc items;
- two relationship precedents;
- up to two exact-fact or NPC items when relevant;
- one or two historical texture items.

Apply:

- temporal reranking;
- source diversity;
- deduplication;
- evidence coverage scoring;
- protected fact-check allocation.

Do not place memory protocol or repetitive persona instructions into ordinary narrative evidence slots.

#### Acceptance

- Quiet scenes do not pay for unnecessary extra searches.
- High-risk scenes retrieve distinct relevant history.
- Historical texture improves specificity without overriding current behavior.
- Temporal disagreement triggers targeted verification rather than context flooding.
- Selected-evidence relevance improves while latency remains bounded.

#### Rollout

1. Replay adaptive decisions over saved reports without changing live output.
2. Compare one-, two-, and three-search variants.
3. Canary on a small percentage of turns.
4. Expand only if temporal-error and latency thresholds remain green.

#### Rollback

Return planner to fixed existing query counts while preserving evidence telemetry.

---

### INTEL-5 — Measured quality escalation

**Effort:** M  
**Risk:** Medium  
**Depends on:** INTEL-4 telemetry and replay results

#### Goal

Spend more model reasoning and context only where measured quality justifies it.

#### Candidate changes

- low Guardian reasoning for ordinary continuous scenes;
- medium reasoning for:
  - temporal conflict;
  - high-risk intimacy/history;
  - low evidence coverage;
  - exact-fact ambiguity;
  - ensemble/knowledge-boundary pressure;
- test a larger evidence budget against 32,000 characters;
- test a larger final brief only after mandatory section reservation;
- optionally allow one additional search for a proven uncovered trigger family.

#### Do not do

- Do not force more context using a longer static system prompt.
- Do not increase all result counts globally.
- Do not send every retrieved chunk to the auditor.
- Do not make medium/high reasoning the default without latency evidence.
- Do not activate stronger random/NPC pressure merely because more context is available.

#### Acceptance

- Narrative-quality improvement is demonstrated on replay/live comparison.
- Temporal mistakes are non-inferior.
- Mandatory brief sections survive 100%.
- Timeout rate remains below the agreed threshold.
- p95 latency remains acceptable to the Operator.

#### Rollback

Restore adaptive reasoning/budget thresholds to the previous measured values.

## Telemetry required across WPs

Capture:

- actual vector-search count;
- MCP calls attempted, completed, cancelled, and timed out;
- active/peak connections;
- results fetched, selected, discarded, and expanded;
- duplicate source/section ratio;
- source-role distribution;
- superseded evidence rate;
- live-state conflict count;
- disk/index revision divergence;
- roster evidence source per NPC;
- serendipity source/tier/fingerprint;
- dramaturg cache age/fingerprint;
- estimated tokens at retrieval, auditor, and brief stages;
- truncation/omission by field;
- mandatory-block survival;
- Director correction and false-correction rates;
- receptive-agency false positives;
- p50/p95 latency by phase.

Do not store raw private narrative in normal telemetry.

## Ordered recommendation

1. **INTEL-0** — clean baseline and instruction review.
2. **INTEL-1** — shared scene-confidence gate.
3. **INTEL-2** — sidecar/cache isolation.
4. **INTEL-3** — retrieval correctness and bounded execution.
5. **INTEL-4** — adaptive retrieval.
6. **INTEL-5** — measured token/reasoning escalation.

Do not combine these into one large implementation session.

## Operator ACK gates

Require Maz's explicit approval before:

- committing/reindexing the Saturday-morning current state;
- activating v6.2/v2.4 instruction files;
- starting each INTEL WP;
- changing token limits or retrieval call counts;
- enabling medium reasoning more broadly;
- changing random-event or NPC-pressure activation;
- changing public tool schemas;
- modifying canon or roadmap priority.

## Definition of done

- Optional narrative systems remain useful when state is current.
- They degrade safely when state is stale or uncertain.
- Forward played consensus is not rewound by stale disk state.
- More retrieval is conditional and demonstrably useful.
- The auditor receives temporally ranked, diverse, compact evidence.
- Mandatory novelist guidance cannot be truncated away.
- Character Balance is protected without repeated prompt pressure.
- No raw thread archive or private prose is automatically indexed or added to routine telemetry.

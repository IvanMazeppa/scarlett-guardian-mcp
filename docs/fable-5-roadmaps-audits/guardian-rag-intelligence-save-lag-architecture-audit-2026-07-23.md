# Guardian + RAG intelligence and save-lag architecture audit

**Date:** 2026-07-23  
**Scope:** Read-only architectural audit requested from the Gemini prompt  
**Status:** Findings and implementation sequence only; no runtime or canon changes authorized

## Executive verdict

Gemini correctly identified save-file lag as a shared failure source for Scene Roster, Serendipity Weaver, and Dramaturg Momentum.

However, two proposed remedies need correction:

1. These features are not dormant systems waiting to be safely activated. Their deterministic paths already run during preflight. The defect is that stale state reaches them before save-lag mitigation is applied.
2. Guardian does not currently suffer mainly from too few retrieval calls. It already fetches more material than the auditor and final brief can consume. Blindly increasing calls or token limits would add latency, temporal mud, duplicated evidence, and more prompt steering.

The high-ROI strategy is:

- quarantine stale scene state before it reaches optional narrative systems;
- make those systems degrade conservatively and preserve forward play;
- fix retrieval correctness, evidence selection, cancellation, and final-brief priorities;
- then introduce adaptive extra retrieval only when evidence coverage is genuinely weak.

## Immediate working-tree safety findings

### Character-balance implementation

Commit `a3e87af` implemented the intended runtime changes:

- generated `scarlett_next_intention` remains in the report schema but is not rendered to the novelist;
- the old compulsory leadership block became a Character Balance block;
- Director's Correction no longer requires a harsh response;
- receiving care, following, yielding, resting, vulnerability, and letting Benjamin lead are explicitly protected.

The implementation did not alter canon, public APIs, RAG, write-back, dramaturgy, or telemetry.

Two concerns remain:

1. `tests/scene-cast.test.ts` weakened an unrelated cast-size assertion from 130 to 160 words. That was outside the hotfix scope and hides a separate budget overrun.
2. Tests verify prompt text but do not include a live semantic duplex case where Scarlett validly receives care or follows Benjamin and must receive no correction.

The later commits were broader than the original hotfix:

- `0f7b8d9`: intimacy-history and resonance changes across seven files.
- `1e132ce`: save-lag, private-brief suppression, scene-roster, and telemetry changes across ten files with more than 700 inserted lines.

Those commits may contain useful work, but they mean the promised “one-commit rollback” is no longer clean because later code overlaps the same prompt and brief functions.

### Uncommitted RAG state

The RAG working tree currently contains:

- an uncommitted Saturday-morning rewrite of `project_source_files/current-state.md`;
- three untracked v6.2/v2.4 instruction files attributed to Antigravity.

The Saturday-morning beat may be valid play, but the file also embeds control language into canon:

- “proving to herself that she doesn't have to be ‘on’”
- “Character Balance”
- “Character Balance rules apply”

That is instruction leakage. The narrative beat and the model-control policy must be separated before this file is committed or reindexed.

The three instruction files repeat Character Balance at Agent, Project, and Skill layers. Activating all three risks replacing one repetitive autonomy instruction with a repetitive anti-autonomy correction. They should be deduplicated and reviewed before upload.

## Current execution order and the central defect

Current preflight broadly does this:

1. Resolve duplex.
2. Read disk LIVE BEAT and run initial vector retrieval.
3. Detect possible save lag.
4. Pass the same disk-derived LIVE BEAT into dramaturg, roster, agendas, and serendipity.
5. Add save-lag guidance only when building the auditor prompt and final correction.

The key problem is ordering. Save lag is detected, but stale state has already influenced the optional narrative systems.

The fix is not three unrelated patches. Preflight needs one resolved scene-confidence decision immediately after comparing:

- disk LIVE BEAT;
- Benjamin's current message;
- previous Scarlett duplex;
- recent context;
- state/index freshness and provenance.

Roster, serendipity, dramaturg, auditor, and write-back should all consume that same decision.

## Feature audit

### Scene Roster / NPC State

Current behavior:

- Roster uses user text, previous Scarlett text, disk Present cast, LIVE BEAT cues, arc pressure, and cached NPC intersections.
- `recent_context` does not participate in roster resolution.
- Stale Present data can activate offstage NPCs as current supporting cast.
- Missing registry tails still permit a generic “supporting presence” block.
- NPC persistence is comparatively safe: scene-close gating and human review protect knowledge changes.

Minimal robustness policy:

- When save lag is suspected, allow only NPCs explicitly addressed in the current user turn or clearly speaking in the previous Scarlett turn.
- Suppress Present-cast, arc-cast, cache-only, and cue-only activation unless current-turn evidence corroborates them.
- Let explicit current `recent_context` corroborate cast.
- Missing registry/knowledge-boundary data should omit the NPC brief rather than emit a generic presence.
- Provisional scene state must force NPC writes to human review.

### Serendipity Weaver

Current behavior:

- Runs every preflight.
- Base random chance is 30%, rising to 60% during drought.
- Deferred events and agenda intersections can outrank random catalog events.
- Scene-mode detection ignores previous Scarlett and recent context.
- Agenda matching uses superseded LIVE BEAT cues as positive evidence.
- Sidecar state is global rather than thread/scene scoped.
- If the auditor is unavailable, a raw deterministic fallback can reach the final brief.

Minimal robustness policy:

- Include user, duplex, and recent context in scene-mode classification.
- On disagreement, choose the safer mode: intimate/vulnerable rather than professional or downtime.
- Remove superseded cues from positive agenda matching.
- Require current-turn corroboration for agenda or cached NPC pressure.
- Under save lag or auditor failure, permit only ambient events; defer NPC, engaging, disruptive, Ryan, or knowledge-sensitive events.
- Give deferred events a scene fingerprint and expiry so they cannot cross unrelated scenes or threads.

### Dramaturg Momentum

Current behavior:

- Deterministic momentum runs every preflight.
- The cached LLM dramaturg is validated against the arc-plan hash but not the live-scene hash.
- It does not use user text, duplex, or recent context when deciding the live beat.
- Current private-scene suppression hides momentum from the final brief but not necessarily from the auditor.
- Arc-plan text and cache can remain on an earlier beat after disk play advances.

Minimal robustness policy:

- When save lag is suspected, omit exact Story Momentum from both auditor and final brief.
- Substitute only: “Continue the played scene; preserve downstream schedule pressure without advancing it.”
- Fingerprint dramaturg cache against location, story time, Present cast, and live cues as well as the plan hash.
- Refresh or invalidate on disk state revision, not only plan changes, transitions, or turn count.
- Detect active plans containing an obsolete embedded “current live beat.”

## Retrieval and context audit

### Existing retrieval is already aggressive

Every preflight starts:

- one `retrieve_story_context`;
- one to three `search_story_memory` calls;
- `get_live_story_state`;
- `index_status`;
- optional expansion, NPC expansion, and fact verification.

One `retrieve_story_context` internally performs three vector searches. A normal triggered turn therefore already causes roughly five or six vector searches plus the Guardian LLM call.

Potential raw retrieved text is approximately:

- quiet turn: 39,000 characters;
- triggered turn: 63,000 characters;
- forced turn: up to 105,000 characters.

The auditor evidence cap is 32,000 characters, and the final Grok brief is only 6,500 characters. Much of the fetched material is discarded.

### Why more volume would not currently improve intelligence

- The auditor keeps only six results from each response and truncates each to 1,200 characters.
- The evidence payload is hard-cut from the tail, where fact checks often appear.
- Results above six and text beyond 1,200 characters mainly add transport and latency.
- The final brief is hard-cut at 6,500 characters, potentially deleting Character Balance or Director's Correction from the end.
- RAG recency protection is stronger in deterministic precedent selection than in the raw evidence shown to the auditor.
- Policy and persona documents can occupy narrative evidence slots.
- Multiple concurrent searches reuse global IDs like `r1`; a later expansion can target a result from the wrong search.
- Soft timeout helpers do not cancel underlying work.

The current bottleneck is selection and temporal authority, not token scarcity.

## Recommended architecture

### WP INTEL-0 — Freeze and verify current state

Goal:

- prevent unapproved control language from entering canon or Grok instruction layers.

Actions:

- preserve the genuine Saturday-morning narrative delta if Operator-approved;
- remove model-policy terms from current state before commit/reindex;
- review and deduplicate the three v6.2/v2.4 instruction files;
- restore the independent Scene Cast test threshold or fix the formatter in a separate WP;
- add one live semantic receptive-agency no-correction case.

No runtime expansion should begin before this safety check.

### WP INTEL-1 — Resolved scene-confidence gate

Goal:

- ensure every optional narrative system receives the same assessment of scene freshness.

Add a small resolved object containing:

- disk-state available/hash/mtime;
- index revision when available;
- save-lag suspected;
- played-evidence confidence;
- current scene mode;
- current cast confidence;
- provenance from disk, user, duplex, and recent context.

Apply it before roster, dramaturg, serendipity, and write-back.

Acceptance:

- stale Present cannot summon offstage NPCs;
- save-lag scenes receive no exact stale momentum;
- non-ambient serendipity fails closed under uncertainty;
- current user/duplex consensus preserves forward play rather than rewinding;
- no provisional NPC or state update auto-approves.

### WP INTEL-2 — Sidecar and cache hardening

Goal:

- prevent stale/global optional state from crossing scenes or threads.

Actions:

- fingerprint dramaturg cache with live scene;
- key serendipity/deferred events by thread and scene;
- add expiry and applicability evidence;
- remove superseded-cue activation;
- report cache age/source/fingerprint.

### WP INTEL-3 — Retrieval correctness before retrieval growth

Goal:

- make existing calls trustworthy and bounded.

Actions:

- expand by exact `source_file + section` rather than global `rN`;
- implement true cancellation;
- add total and optional-depth deadlines;
- reserve final-brief space for correction and character balance;
- replace hard JSON/Markdown tail cuts with per-section budgets;
- record fetched/selected/discarded evidence and actual token estimates.

Suggested operational limits:

- initial retrieval deadline: 14 seconds;
- optional-depth budget: 5 seconds total;
- auditor deadline: 12 seconds;
- total preflight deadline: 30–32 seconds;
- initial MCP concurrency: 3;
- optional concurrency: 2.

Do not raise the 32,000-character auditor evidence limit during this WP.

### WP INTEL-4 — Adaptive retrieval and evidence allocation

Goal:

- spend more tokens only when they buy distinct, relevant context.

Wave 1:

- one live preflight retrieval;
- one concrete corpus search.

Wave 2 only when:

- no current-state/canon coverage exists;
- top evidence is low-confidence or duplicative;
- a factual claim needs verification;
- a distinct trigger family remains uncovered;
- temporal disagreement exists;
- a strong result is truncated and needs adjacency.

Recommended caps:

- ordinary: one search, conditional second;
- triggered: maximum two;
- forced diagnostics: maximum three;
- six initial results; eight only in forced mode;
- 1,600–1,800 characters per result unless deliberately expanded.

Use a token-aware evidence allocator with quotas:

- two live/current-state items;
- two recent-event/arc items;
- two relationship precedents;
- up to two exact-fact/NPC items when relevant;
- one or two historical texture items.

Apply temporal reranking before the auditor sees evidence.

### WP INTEL-5 — Quality escalation

Only after INTEL-1 through INTEL-4 are measured:

- use medium reasoning for high-risk, temporal-conflict, or low-coverage turns;
- retain low reasoning for ordinary continuous scenes;
- evaluate 32k versus a larger evidence budget using saved-report replay;
- consider a larger final brief only after section budgets guarantee mandatory-block survival;
- canary adaptive retrieval before making it default.

Do not “force aggressive context use” through a longer static system prompt. Use conditional evidence coverage and retrieval planning.

## Telemetry and evaluation required

Measure:

- actual vector-search count;
- attempted/completed/cancelled/timed-out MCP calls;
- fetched, selected, and discarded evidence;
- duplicate source/section ratio;
- superseded evidence rate;
- live-state conflict count;
- state/index revision divergence;
- scene roster evidence source;
- serendipity source/tier/fingerprint;
- dramaturg cache age and live fingerprint;
- auditor and final-brief estimated tokens;
- fields truncated or omitted;
- mandatory correction/balance block survival;
- false Director correction rate;
- receptive-agency false-positive rate;
- p50/p95 total latency.

Add integration cases for:

- stale Present naming an offstage NPC;
- simultaneous roster/serendipity/momentum save lag;
- stale dramaturg cache after a disk-only scene update;
- disruptive event with missing or provisional state;
- global deferred event crossing threads;
- concurrent expansion ID collision;
- timed-out calls completing after report serialization;
- long duplex starving fact-check evidence;
- final-brief mandatory sections surviving maximum content;
- private scenes retrieving historical texture without turning it into a persona lecture.

## Direct response to Gemini's directives

1. Make the optional narrative systems robust against save lag: yes, through a shared scene-confidence gate and conservative degradation.
2. Increase tokens and calls: permitted, but not recommended yet. Existing volume exceeds current consumption capacity.
3. Force more context use through prompts: reject the “force” framing. Improve evidence selection, temporal authority, and conditional retrieval first.

## Explicit non-goals for this audit

- no canon rewrite;
- no reindex;
- no automatic activation of more random or NPC events;
- no broad prompt expansion;
- no blanket increase in search count;
- no model-instruction duplication;
- no roadmap demotion or rejection of operator ideas;
- no implementation until Maz selects a WP.

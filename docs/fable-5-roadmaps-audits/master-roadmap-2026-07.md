# Master Roadmap — Guardian & RAG Memory, Consolidated Execution Plan

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent) — consolidation of all designs in this folder  
**Status:** DOCS-ONLY. This file authorizes no code. It is the single index every executor session opens first.  
**Executors:** Grok 4.5 / Grok Build (implementation) · Gemini 3.1 Pro (review, goldens, prompts) · Fable 5 (architecture, docs) · Operator (integration, approvals, live play)

---

## 0. Source documents (read the relevant one before starting any ticket)

| # | Document | Pillar |
|---|----------|--------|
| D1 | `guardian-report-quality-audit-2026-07.md` | Measured baseline (142 reports) |
| D2 | `guardian-eval-harness-design-2026-07.md` | Eval harness (L1/L2/L3, goldens, scorecards) |
| D3 | `guardian-telemetry-dashboard-design-2026-07.md` | Local observability dashboard |
| D4 | `guardian-writeback-recency-serendipity-roadmap-2026-07.md` | Recency (A), Serendipity 2.0 (B), Staging write-back (C) |
| D5 | `memory-compression-pipeline-roadmap-2026-07.md` | Event-log rotation + arc compression (RAG side) |
| D6 | `browser-bridge-duplex-architecture-2026-07.md` | Shadow sidecar duplex + interceptor fallback |
| D7 | `guardian-dramaturg-design-2026-07.md` | Arc plans, momentum, NPC agendas, intention, echoes |
| D8 | `guardian-persona-engine-design-2026-07.md` | Volatility map, arc-close reconciliation, instruction sync |
| D9 | `guardian-npc-state-management-design-2026-07.md` | Scene roster, cast block, stealth canon, NPC deltas |
| D10 | `executor-preferences-grok-build-2026-07.md` | Scheduling law — this roadmap obeys it |
| D11 | `guardian-report-quality-critique-2026-07.md` | Earlier qualitative critique (context) |

---

## 1. Scheduling law (from D10 — non-negotiable)

1. **Strictly sequential.** One work package (WP) per executor session; each WP verified green before the next starts. Parallel tracks only after an explicit contract freeze, and never on the same shared files.
2. **Ticket size:** ~1–3 core source files + tests + a short doc touch. No "implement the pillar" sessions. Every WP below is pre-split to fit this box.
3. **Verification per WP:** `npm test && npm run build` (both repos where touched) **plus** the WP's stated acceptance check. From WP-2.x onward: `npm run eval:fast` is mandatory for any Guardian change.
4. **Contract ownership:** Guardian owns MCP tool names/arg schemas, `GuardianReport`/brief shape, `preflight.ts`, `llm-assessment.ts`, `memory-writeback.ts`, Guardian `server.ts`. RAG owns `source-priority.ts`, indexer/reindexer, manifest, vector store IDs. Narrative files under `project_source_files/` are human-gated. This roadmap and the design docs are Fable/operator-owned — executors implement, never fork the north star mid-slice.
5. **Session handoff template** (operator pastes into every new executor session):

```text
Baseline tag/commit: <hash or tag>
Branch: <name>
Master roadmap WP: <id, e.g. WP-3.2>
Design doc: <D-number + section>
Do not edit: [files owned by other side / other WPs]
Acceptance: npm test && npm run build [+ eval:fast / preflight check per WP]
Last green preflight artifact: <report id if relevant>
```

---

## 2. Agent role assignments

| Agent | Role | Typical outputs |
|-------|------|-----------------|
| **Grok 4.5 (CLI/Cursor)** | Primary implementer | Code WPs, tests, migrations |
| **Gemini 3.1 Pro** | Reviewer + golden author + prompt engineer | Golden-case expectations (D2 §2.2 — the "only genuinely human part"), auditor/dramaturg prompt reviews, WP diffs review, red-team of gates (mutant checks) |
| **Fable 5** | Architecture + docs | Design amendments, contract-change notes, this roadmap's upkeep |
| **Operator** | Integration layer + canon authority | Commits/tags, staged-update approvals, live-play validation, cloud instruction pastes, arc-close ceremony sittings |

Rule of thumb: anything that writes canon or expectations gets a second pair of eyes — Grok implements the gate, Gemini tries to break it, operator approves the output.

---

## 3. Dependency spine (why the phases are ordered this way)

```text
Phase 0  Stabilize (commit + green + tag)          ── nothing builds on sand
Phase 1  Safety rails: eval harness + telemetry    ── protect everything after
Phase 2  Foundations: chunking, parseLiveBeat,     ── parseLiveBeat is consumed by
         staging proof, rotation                       recency, dramaturg, roster, write-back
Phase 3  Duplex automation (shadow sidecar)        ── unlocks corrections + drift alarm
Phase 4  Write-back full + Serendipity 2.0         ── scene_transition unlocks arc-close triggers
Phase 5  Dramaturg + NPC state                     ── consumes serendipity tiers + roster
Phase 6  Arc-close ceremony: compression,          ── story-scheduled (Germany arc close)
         persona reconciliation, plan drafting
Phase 7  Index-level recency, graduated trust,     ── needs one full reindex + burn-ins done
         interceptor fallback, polish
```

Two **story-scheduled milestones** anchor the calendar:

- **Affalterbach presentation** (imminent in-story) = first live ensemble stress test → NPC P0 (Phase 5) should land before it if pace allows; if not, it becomes the acceptance scene for whenever NPC P0 ships.
- **Germany arc close** = the first arc-close ceremony (compression + persona reconciliation + next-plan draft, one review sitting) → Phase 6 must be ready at that joint.

---

## 4. Phase 0 — Stabilize the baseline (operator + Grok, ~1 session)

No new features. From D10 §4.

| WP | Task | Owner | Acceptance |
|----|------|-------|-----------|
| 0.1 | Commit both repos on `feature/guardian-depth-duplex-p0-p1-20260714`, separate commits by concern (Guardian code/tests · RAG reindexer/state · docs). No secrets. | Operator + Grok | `git status` clean, both repos |
| 0.2 | Verify green on committed tip: Guardian `npm test && npm run build`; RAG `npm run build`; one live or replayed preflight interpretable (reference artifact: `preflight-full-2026-07-15T02-51-26-420Z`) | Grok | All green |
| 0.3 | Tag baseline (e.g. `guardian-baseline-2026-07-15`); commit all D1–D11 docs + this roadmap as read-only input | Operator | Tag exists; docs in history |
| 0.4 | Cut `feature/master-roadmap-v1` (or per-phase branches) from the tag | Operator | Every future WP starts from a known-green ancestor |

**Backlog explicitly not blocking baseline** (D10 §4.6): store/manifest mismatch, precedent recency, browser bridge, stage-approve workflow, event-log multi-section indexing, `RagMcpClient` connection reuse. All appear as WPs below.

---

## 5. Phase 1 — Safety rails (eval harness P0 + telemetry P0)

Both are pure additions — no behavior change to the pipeline — and both pay for every later phase. Eval first (it gates merges); telemetry can interleave.

### Eval harness (D2 §6 P0)

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 1.1 | Golden case schema (zod) + loader + `CassetteRagClient` (loud on cassette miss → `PLAN_DRIFT`) | NEW `evals/schema.ts`, `evals/cassette-client.ts` | Unit tests green |
| 1.2 | `curate-golden.ts` extractor (report JSON → skeleton case) | NEW script | One case extracted from a real report in < 10 min |
| 1.3 | Runner: L1 execution (`--llm-mode off/frozen`), expectation engine, scorecard md+json; `eval:fast` + `eval:baseline` npm scripts | NEW `evals/runner.ts`, `package.json` | `eval:fast` < 30 s, zero network |
| 1.4 | Seed 15 goldens: 5 good Jul-13-era, 5 failure-era (meta leak, empty weave, temporal mud), 5 duplex/write-back. **Gemini authors expectations; operator reviews.** | `evals/golden/**` | All 15 pass on baseline; first baseline snapshotted |
| 1.5 | Mutant self-test: reintroduce one historical defect per class, confirm scorecard goes red; document workflow contract in both `AGENTS.md` | evals + docs | Each mutant caught |

### Telemetry (D3 §9 P0)

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 1.6 | `telemetry.ts`: event type, in-process timers, fire-and-forget NDJSON append; instrument `rag-client.ts` + end of `runGuardianPreflight` | NEW `src/guardian/telemetry.ts`; edits | Preflight p95 delta < 5 ms; write failure never errors the turn |
| 1.7 | `backfill-telemetry.ts` over `docs/guardian-reports/`; `/telemetry/api/summary` + minimal `/dashboard` (latency, duplex, facts cards) | NEW script; `server.ts`; `public/` | Dashboard loads < 2 s over 142+ backfilled reports |

**Gate from here on:** every Guardian code WP ends with `eval:fast` green; prompt/schema WPs add `eval:llm --category <relevant>` once WP-4.6 lands L3.

---

## 6. Phase 2 — Foundations (chunking, live beat, staging proof, rotation)

The highest-ROI structural fixes. `parseLiveBeat` (WP-2.2) is the single most-consumed new module in the entire roadmap — recency, write-back, dramaturg, and roster all import it.

| WP | Ticket | Files | Source | Acceptance |
|----|--------|-------|--------|-----------|
| 2.1 | Reformat `event-log.md` + chronological-summaries 4/5/6 to `## Session —` headings (verbatim content); reindex all four; update format template + maintenance guide | 4 corpus files, docs | D5 §3.1 | No episodic chunk > ~4 KB; newest-event truncation bias unreproducible |
| 2.2 | `parseLiveBeat` + `scoreRecency`; wire into `selectPrecedents` (both call sites); replace Germany-arc hardcoded regexes in scene/tone fallbacks with live-beat cues; `get_live_story_state` added to parallel dispatch | NEW `src/guardian/recency.ts`; `preflight.ts` (points A); NEW `tests/recency.test.ts` | D4 §A.3 | Recency tests green; temporal-mud goldens pass |
| 2.3 | LIVE BEAT block in auditor prompt (supersession instruction) | `llm-assessment.ts` (point B) | D4 §A.3 | eval:fast green; one live preflight shows no superseded-beat regression |
| 2.4 | De-hardcode `isMaterialMemoryUpdate` (live-beat delta signal); beat-advance appends emit `## Session —` headings | `memory-writeback.ts` | D4 §C.3, D5 §3.2 | Write-back tests green |
| 2.5 | **Operational:** execute staging path once end-to-end manually (stage → list → approve → bg reindex) to flush unknown-unknowns; save the report pair as evidence | none (ops) | D4 P0-5 | A saved report shows `stage_story_update` for the first time ever |
| 2.6 | RAG: `reject_staged_story_update` + `list_staged_story_updates include_content` | RAG `server.ts` | D4 P0-6 | Tool round-trip verified |
| 2.7 | RAG: `rotation.ts` + `rotate_event_log` tool (dry-run first) + auto-trigger post-write + env config; `arc_chronicle` / `historical_narrative` source roles + enums | NEW `src/rotation.ts`; RAG `server.ts`, `source-priority.ts` | D5 §3.3–3.5 | Verbatim invariant test green; dry-run plan sane on live log |

Phase 2 exit: chunking sane, live beat parsed, staging proven, rotation armed. `eval:baseline` re-snapshotted.

---

## 7. Phase 3 — Duplex automation (shadow sidecar)

Ends manual OOC pasting. From D6 §4 P0/P1. Server side first (Grok), then userscript (Grok + operator calibration).

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 3.1 | `DuplexCache` + `POST /duplex-cache` + TTL config; merge logic in preflight entry; `duplex_source` report field ("caller" wins) | NEW `duplex-cache.ts`; `server.ts`; `preflight.ts`; `models.ts` | Unit tests; `DUPLEX_INPUT_MISSING` fires only when both empty |
| 3.2 | Userscript v2: config modes, GM transport, status pill, completion detector, layered-selector scraper | `scripts/guardian-browser-bridge.user.js` | Manual: scrape matches on-screen bubble (hash check) |
| 3.3 | Calibration mode (click-to-pin selector, GM storage); bearer/tunnel config moved to GM storage | same | Calibration < 1 min after simulated selector break |
| 3.4 | **Operational:** one live RP session; verify `duplex_source: "bridge_cache"` on every post-first turn in saved JSONs | ops | ≥ 90% duplex-present rate (D6 acceptance) |
| 3.5 | Robustness: thread-key extraction + multi-thread disambiguation; regeneration handling; 90 s idempotency cache | userscript; `server.ts` | Two-thread test does not cross-feed |

Telemetry note: WP-3.1 populates the dashboard's `duplex.source` dimension automatically (D3 §3).

---

## 8. Phase 4 — Write-back full lifecycle + Serendipity 2.0

Order within phase: C before B (both extend the auditor schema; D4 §0).

### Write-back (Pillar C completion)

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 4.1 | `scene_transition` auditor field + `stage_transition` decision class | `llm-assessment.ts` (E), `memory-writeback.ts` | eval:fast + schema tests |
| 4.2 | `generateStateRewrite` + `validateStateRewrite` + `.guardian/protected-facts.txt` (seeded from v6.1 §1 + story-bible §1 — this file is also the persona-invariants list, D8 §4) | NEW `state-rewrite.ts`; NEW `tests/state-rewrite.test.ts` | Golden rewrite passes; all mutants fail |
| 4.3 | Write-branch rework in preflight + `GUARDIAN_AUTO_APPROVE` (default `beats`) + `memory_write` always recorded | `preflight.ts` (F), `config.ts` | Report field present 100% of new reports |
| 4.4 | `review-staged.ts` CLI (list/diff/approve/reject) | NEW script | Operator round-trip on a real staged update |
| 4.5 | **Burn-in (operational, spans weeks):** transitions stage-and-hold; after 3 consecutive clean human-approved rewrites, flip to `beats_and_valid_transitions` | `.env` | D4 §C.4 protocol followed |

### Serendipity 2.0 (Pillar B)

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 4.6 | `serendipity-weaver.ts`: tiers, scene modes, deferral queue, arc threads, state file; preflight integration (point D) | NEW module; `preflight.ts`; NEW tests | 50-turn simulation: fire rate 20–35%, intimate admits ambient only, Ryan stages in order |
| 4.7 | Auditor weave field (`serendipity_weave`) + brief rendering | `llm-assessment.ts` (C), `compile-grok-brief.ts` | eval:fast; live weave reads scene-aware |
| 4.8 | Eval L3 tier lands here (frozen-evidence auditor calls, N-trials, flakiness metric) + duplex precision/recall pair-cases + grow goldens toward 50 | `evals/runner.ts`, goldens (Gemini authors) | `eval:llm --category duplex,write-back` green; cost within single-digit dollars |

---

## 9. Phase 5 — Dramaturg + NPC state (the fourth seat and the ensemble)

Dramaturg P0 is deliberately LLM-free (D7 §4); NPC P0 is deterministic (D9 §8). Both consume Phase 2's `parseLiveBeat`; NPC P1 consumes Phase 4's write-back staging.

### Dramaturg

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 5.1 | Retro-fit Nürburgring doc → `arc-plans/arc-09-nurburgring-track-day.md` with beat annotations; `arc_plan` source role (priority 88) + enum + reindex | corpus; RAG `source-priority.ts`, `server.ts` | Plan retrieves at near-live rank |
| 5.2 | `parseArcPlan` + deterministic beat-diff + mechanical momentum line; momentum block in auditor prompt + brief render | NEW `dramaturg.ts`; `llm-assessment.ts`; `compile-grok-brief.ts` | Brief carries a fresh momentum line with an active plan |
| 5.3 | `runDramaturgPass` LLM call + cache + scene-transition/staleness triggers (background refresh, zero added turn latency) | `dramaturg.ts`, `preflight.ts` (G) | Hot path stays one LLM call/turn |
| 5.4 | `npc-agendas.md` (top 4 NPCs) + agenda intersections → serendipity weaver (agenda events outrank catalog) | corpus; `serendipity-weaver.ts` | Agenda event observed routing at correct tier |
| 5.5 | `scarlett_next_intention` + `resonance_echo` fields, prompts, brief render, echo budget (≤1, code-enforced) | `llm-assessment.ts`, `compile-grok-brief.ts` | Echoes/turn ≤ 0.5 on scorecard; no-outcome audit clean |

### NPC state

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 5.6 | `npc_canon` source role (priority 78) for `secondary-characters-bible.md` + `family-dynamics.md`; enum + reindex; registry tail-fields on top ~8 NPCs (merge npc-agendas content) | RAG `source-priority.ts`, `server.ts`; corpus | NPC chunks stop retrieving at bottom tier |
| 5.7 | `scene-roster.ts` (aliases, activation, cap 4) + `**Present:**` convention + `parseLiveBeat.presentCast`; exact-section fetch for active NPCs | NEW module; `recency.ts`; RAG retriever/server | Roster goldens assert exact rosters; < 1 s added |
| 5.8 | Scene Cast block in brief (mandatory ⚠ boundary lines, 90-word budget); ensemble-dilution clause in duplex prompt | `compile-grok-brief.ts`, `llm-assessment.ts` | Ensemble goldens: zero boundary violations; ⚠ present 100% |
| 5.9 | `npc_state_changes` schema + routing through staging (`knowledge` = human-always) | `llm-assessment.ts`, `memory-writeback.ts`, `preflight.ts` | Played disposition shift survives to next session's brief |
| 5.10 | **Story-scheduled:** Affalterbach presentation as live ensemble stress test | ops | D9 §9 autonomy + safety criteria |

---

## 10. Phase 6 — The arc-close ceremony (story-scheduled: Germany arc close)

Three staged proposals, one operator sitting (D8 §5.1). Everything here reuses the staging/review machinery from Phase 4.

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 6.1 | `compress-arc.ts` (milestone extraction → narrative record → gate → stage) + `compression-gate.ts` + prompts + golden/mutant tests | NEW RAG script + module | Hand-shrunk fixture passes; mutants fail each of the 6 checks |
| 6.2 | `--finalize` housekeeping + `ARC_INDEX.md` lifecycle | script | Manifest consistent after chronicle retirement |
| 6.3 | `persona-volatility-map.json` + DELEGATED conversions (Benjamin bible emotional-state → delegation line; master-context timeline tail); reindex | NEW map; corpus | Stale-section class structurally removed |
| 6.4 | `persona-gate.ts` + mutant tests (CORE touch / quorum miss / unbounded diff all rejected) | NEW module + tests | CORE mechanically unreachable |
| 6.5 | `reconcile-persona.ts` (evidence pool, propose, gate, stage) + drift alarm from duplex-corrections log | NEW script | Dry-run produces cited, bounded diffs only |
| 6.6 | `draft-arc-plan.ts` (next-arc draft from bible + open threads, staged, never auto-activated) | NEW script | Draft readable; operator edits < authoring from scratch |
| 6.7 | **The ceremony (operational):** at Germany arc close run compression + reconciliation + plan draft; operator reviews all three in one sitting; approve; reindex | ops | First cold record passes gate + human review; persona diffs quorum-cited; next plan activated |
| 6.8 | Retire `pickPreferredSceneResults` bible demotion (eval-verified no regression) — the proof the data lifecycle now works | `preflight.ts` | eval:fast green with heuristic removed |

---

## 11. Phase 7 — Index-level recency, graduated trust, fallback, polish

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| 7.1 | `story_epoch` + `is_live_state` attributes at index time (arc number from `ARC_INDEX.md` = epoch); **one full reindex batched with store/manifest reconciliation** | RAG reindexer/indexer; NEW epoch map | Manifest matches active store; epochs stamped |
| 7.2 | Epoch-distance demotion Guardian-side; retriever surfaces `story_epoch`; cross-layer dedup guard | `recency.ts`; RAG `retriever.ts` | Luxembourg-era chunks demoted during later arcs |
| 7.3 | Graduated trust: auto-approve VOLATILE reconciliations + valid transitions after burn-ins (3 clean cycles each); STABLE stays human forever | config | Burn-in logs cited |
| 7.4 | Interceptor fallback: `format: "brief"` on `/preflight`, interceptor mode on v2 scraper (manual-submit, fail-open), instruction-layer skip line; certify once, then park | `server.ts`; userscript; instruction files | One supervised end-to-end session, then dormant |
| 7.5 | Telemetry P1/P2: serendipity/dramaturg panels, chunk-size trends, rollup cache, eval scorecard panel; L2 retrieval eval bridging `eval:memory` | dashboard; evals | D3 + D2 P2 acceptance |
| 7.6 | Backfill compression of chronological-summaries 4/5/6, one at a time, human-approved | ops | After first natural arc proved the pipeline |
| 7.7 | `generate-instruction-sync.ts` + version-hash convention in bootstrap templates | NEW script | Marriage-test flow (D8 §9) under 15 min operator time |

---

## 12. Standing rules that survive every phase

1. **Pressure, never outcomes** (D7): no schema field anywhere may express how an open beat resolves.
2. **Rotation is autonomous because it loses nothing; compression is gated because it can** (D5).
3. **Caller wins** on duplex; the cache only ever raises the present-rate (D6).
4. **CORE identity is mechanically unwritable**; STABLE changes are human-approved forever (D8).
5. **Knowledge-boundary changes are story events, never automated writes** (D9).
6. **Cassettes are frozen history**; a red eval is fixed by fixing code or consciously amending the expectation — never deleting the case (D2).
7. **One LLM call per turn on the hot path**; scene-cadence intelligence runs in the background and serves the *next* turn (D7 §3.1).
8. **Every write goes through staging + backup + background reindex** — no raw `fs` writes to canon, ever.

---

## 13. Progress ledger

Operator/executor: mark WPs here as they land (this table is the cross-session memory).

### Phase 0 baseline (shared tag on both repos)

| Field | Value |
|-------|--------|
| Tag | `guardian-baseline-2026-07-15` |
| Integration branch | `feature/master-roadmap-v1` (cut from tag; prior work on `mega-roadmap-odyssey`) |
| Guardian SHA | `32031095df92be067aef8eab7f55f4b19f35720d` |
| RAG SHA | `d23b6f27b6cfb5480f289a90ebc38b1ff335580c` |
| Green | Guardian `npm test && npm run build` green; RAG `npm run build` green |
| Reference preflight | `docs/guardian-reports/preflight-full-2026-07-15T02-51-26-420Z.json` (gitignored reports dir; local artifact) |
| Fable open Qs | `fable-5-followup-from-grok-build-2026-07.md` Q1–Q11; **executing under Defaults if silent** until Fable ACK |
| Secrets | `.env` gitignored both repos; never committed |

| WP | Status | Evidence (commit / report / scorecard) |
|----|--------|----------------------------------------|
| 0.1–0.4 | **done** | Guardian `3203109` docs archive; RAG `d23b6f2` compression pointer; tag `guardian-baseline-2026-07-15`; branch `feature/master-roadmap-v1` |
| 1.1 | **done** | `evals/schema.ts` + `evals/cassette-client.ts` + `tests/eval-harness-1.1.test.ts`; `RagToolCaller` interface on preflight/ooc; `npm test` green |
| 1.2 | **done** | `evals/curate-from-report.ts` + `scripts/curate-golden.ts` + `tests/curate-golden.test.ts`; `npm run curate:golden`; live report smoke green |
| 1.3 | **done** | `evals/expectations.ts` + `evals/runner.ts`; `eval:fast` / `eval:baseline`; smoke golden `gt-000-hermetic-smoke`; frozen LLM hook on preflight; scorecards under `evals/runs/` (gitignored); first baseline `evals/baselines/guardian-baseline-2026-07-15.json` |
| 1.4 | **done** | Gemini expectations on 15 goldens + smoke; operator reviewed. `eval:fast` **16/16** green; baseline `evals/baselines/after-wp-1.4.json`. Inventory: `evals/golden/MANIFEST-wp-1.4.md`. Note: `gt-040` `scarlett_previous_message` still null in tree (duplex text not persisted if paste missed). |
| 1.5 | **done** | Mutants in `tests/eval-mutants-1.5.test.ts` (meta leak, temporal-mud, unexpected write, duplex correction suppressed). Workflow contract in Guardian `AGENTS.md` + RAG `AGENTS.md`. |
| 1.6 | **done** | `src/guardian/telemetry.ts` + ALS tool timings in `rag-client` / cassette; emit at end of preflight (fire-and-forget NDJSON under `.guardian/telemetry/`). Tests: never fail turn; overhead << 5ms. |
| 1.7 | **done** | `scripts/backfill-telemetry.ts`, `telemetry-aggregate.ts`, `GET /dashboard` + `/telemetry/api/{health,summary,recent}`, `public/dashboard.*`. |
| 2.1 | **done** | `## Session —` headings on `event-log.md` + chronological summaries 4/5/6; maintenance guide updated; reindex four files. Pre-phase2 preserve branches/tags on both repos. |
| 2.2 | **done** | `src/guardian/recency.ts` (`parseLiveBeat`/`scoreRecency`); `get_live_story_state` in parallel dispatch; `selectPrecedents` both sites; scene/tone fallbacks use live cues; `tests/recency.test.ts`. |
| 2.3 | **done** | LIVE BEAT block above auditor evidence (`formatLiveBeatBlock` + `buildAuditorUserMessage`); supersession instruction in system prompt; `liveBeat` passed from preflight; `tests/llm-assessment-live-beat.test.ts`. Preserve: `preserve/roadmap-wp23-live-beat-auditor-20260716`. |
| 2.4 | **done** | De-hardcoded `isMaterialMemoryUpdate` (generic advance language + `hasLiveBeatDelta`); `## Session —` on beat-advance formats; `liveBeat` into `decideMemoryWrite` from preflight. Preserve: `preserve/roadmap-wp24-writeback-delta-20260716`. |
| 2.5 | **done** | Ops ceremony: stage → list → dry-run → approve → bg reindex on `event-log.md` (test append only). Evidence: `docs/fable-5-roadmaps-audits/wp-2.5-staging-ceremony-evidence-2026-07-16.md`; operator log `rag-memory-mcp/temp/approve-ceremony.txt`. Helper: `rag-memory-mcp/scripts/wp25-staging-ceremony.ts`. |
| 2.6 | **done** | RAG `list_staged_story_updates include_content` + `reject_staged_story_update` (archive under `staged-updates/rejected/`). Round-trip verified on throwaway event-log draft. Preserve: `preserve/roadmap-wp26-reject-list-content-20260716`. |
| 2.7 | **done** | RAG `rotation.ts` + `rotate_event_log` (dry_run default) + auto-trigger after event-log writes + `EVENT_LOG_*` env; `arc_chronicle` role (prio 75) + `historical/arc-*` → `historical_narrative`. Verbatim tests + live dry plan green. Evidence: `wp-2.7-event-log-rotation-evidence-2026-07-16.md`. Preserve: `preserve/roadmap-wp27-event-log-rotation-20260716`. |
| **FOLLOW-UP (ops)** | **partial** | Staged queue: **Jun 23 antigravity test rejected** 2026-07-17 via `review:staged`. Remaining: Jul 15 + Jul 16 `current-state` pendings (review with `npm run review:staged`). |
| 3.1 | **done** | `DuplexCache` + `POST/GET /duplex-cache` + `GUARDIAN_DUPLEX_CACHE_TTL_MS`; preflight merge (caller wins); report `duplex_source`; telemetry uses report source. Unit tests green; `eval:fast` 16/16. Preserve: `preserve/roadmap-wp31-duplex-cache-20260716`. **2026-07-17 fix:** empty `thread_key` → newest fresh entry (not `fresh.length===1`); `DELETE /duplex-cache` clear. |
| 3.2 | **done** | Userscript v2.0 `scripts/guardian-browser-bridge.user.js`: shadow default (completion detector + layered scrape + GM POST `/duplex-cache` + status pill); modes interceptor/calibrate stub; menu for URL/token/debug scrape. Install: `docs/browser-bridge-v2-install.md`. Preserve: `preserve/roadmap-wp32-browser-bridge-v2-20260716`. |
| 3.3 | **partial / stub** | Calibrate mode + GM storage for URL/token/selector override already in bridge v2; full polish optional. Not blocking Phase 4. |
| 3.4 | **done** | Live proof: `duplex_source: "bridge_cache"` without OOC paste of `scarlett_previous_message`. Evidence: `wp-3.4-live-bridge-cache-green-2026-07-17.md`; report `preflight-full-2026-07-17T03-22-10-667Z.json`. Newest-wins fix `e05a08c` de-risked multi-entry cache. Shadow architecture **green**. |
| 3.5 | deferred | Robustness (thread-key, multi-thread tests, 90s idempotency) — optional; duplex daily path de-risked at 3.4. Revisit when operator requests. |
| 4.1 | **done** | Auditor `scene_transition` schema field + system prompt; `stage_transition` decision class in `decideMemoryWrite`; report `scene_transition` + `memory_write.action=stage_transition`; preflight stages with transition citations. Tests + eval:fast 16/16. Evidence: `wp-4.1-scene-transition-2026-07-17.md`. Preserve: `preserve/roadmap-wp41-scene-transition-20260717`. |
| 4.2 | **done** | `state-rewrite.ts` (`generateStateRewrite` medium terra + `validateStateRewrite` gates); `.guardian/protected-facts.txt`; preflight transition path stages **overwrite** rewrite; `held_for_review` on gen/validate fail; `GUARDIAN_AUTO_APPROVE` default `beats` (hold transitions). Tests + eval:fast 16/16. Evidence: `wp-4.2-state-rewrite-2026-07-17.md`. Preserve: `preserve/roadmap-wp42-state-rewrite-20260717`. |
| 4.3 | **done** | Write-branch: beat path stages **event-log + current-state**; `GUARDIAN_AUTO_APPROVE` (default `beats` auto-applies beat stages; transitions still hold unless `beats_and_valid_transitions`); **`memory_write` always on report** (try/catch + mirror to assessment). Hermetic eval uses `AUTO_APPROVE=none`. Evidence: `wp-4.3-memory-write-always-2026-07-17.md`. |
| 4.4 | **done** | `scripts/review-staged.ts` + `npm run review:staged` — list/show/diff/dry-run/approve/reject against RAG staging tools. Doc: `docs/review-staged-cli.md`. Preserve: `preserve/roadmap-wp44-review-staged-20260717`. |
| 4.5 | pending | Burn-in ops for auto-approve transitions |
| 4.6 | **done** | `serendipity-weaver.ts`: tiers, scene modes, deferral queue, Ryan arc stages, drought fire chance, `.guardian/serendipity-state.json`; preflight uses weaver; `serendipity.ts` thin wrapper. Tests: intimate ambient-only, deferral, arc order, 50-turn sim. Evidence: `wp-4.6-serendipity-weaver-2026-07-17.md`. Preserve: `preserve/roadmap-wp46-serendipity-weaver-20260717`. |
| 4.7 | **done** | Auditor `serendipity_weave` schema field; pick before assess; user-message SERENDIPITY block; preflight prefers weave over catalog (null = veto); brief **World Weaver** prefers weave and strips SERENDIPITY labels. Tests + eval:fast 16/16. Evidence: `wp-4.7-serendipity-weave-2026-07-17.md`. Preserve: `preserve/roadmap-wp47-serendipity-weave-20260717`. |
| 4.8 | **done** | L3 `eval:llm` + duplex pair + 31 goldens. Evidence: `wp-4.8-eval-l3-2026-07-17.md`. Live L3 needs valid API key. |
| 5.1–5.10 | pending | |
| 6.1–6.8 | pending | |
| 7.1–7.7 | pending | |

---

## 14. One-line summary

**Stabilize a tagged baseline, then build the safety rails first (eval harness + telemetry), fix the foundations everything imports (session chunking, `parseLiveBeat`, staging, rotation), automate duplex invisibly, complete the write lifecycle and living world, seat the dramaturg and the ensemble, and converge at the story's own joints — the Affalterbach ensemble test and the Germany arc-close ceremony — executing the whole thing as small, sequential, verified, contract-owned tickets because that is how the executor actually delivers quality.**

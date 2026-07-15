# The Evaluation Harness — Golden Turns, Replay, and Regression Scorecards

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent)  
**Companions (this folder):** `guardian-report-quality-audit-2026-07.md` (the manual audit this harness automates), `guardian-writeback-recency-serendipity-roadmap-2026-07.md`, `guardian-dramaturg-design-2026-07.md`  
**Executor:** Grok 4.5 (Agentic Coder)  
**Problem:** The only regression test for Guardian changes today is live roleplay. Every prompt tweak, selector change, or schema addition is verified by playing — expensive, slow, unrepeatable, and it burned ten days once already (the Jul 3–12 empty-weave regression ran undetected across 38 preflights because nothing measured output quality automatically).

---

## 1. The two insights that make this cheap

### 1.1 "How do you unit-test an LLM prompt?" — mostly, you don't have to

Guardian is deliberately a **deterministic pipeline with LLM calls at fixed points**. Decompose it and most of the surface is ordinary code:

| Stage | Deterministic? | Testable without LLM spend? |
|-------|----------------|------------------------------|
| Trigger detection, query building | Yes | Yes |
| RAG retrieval | External, but **recordable** | Yes — replay recordings |
| Precedent selection, scene/tone/facts assembly, recency demotion | Yes | Yes |
| Write-back gates (`isNoOpMemoryUpdate`, `isMaterialMemoryUpdate`, `decideMemoryWrite`) | Yes | Yes |
| Serendipity selection (given the roll) | Yes (seedable) | Yes |
| `compileGrokBrief` rendering + meta filters | Yes | Yes |
| **Auditor call** (terra) | **No** | No — needs live calls, scored statistically |
| Dramaturg pass (future) | No | Same treatment as auditor |

So the harness is three tiers: a fast, free, hermetic tier covering ~80% of historical breakage (every meta-leak, stale-precedent, gate-misfire, and brief-structure defect in my audit was in *deterministic* code); a retrieval tier; and a bounded-cost LLM tier for the two prompts that actually need statistical evaluation.

### 1.2 The golden dataset already exists — it's the report archive

Every saved `preflight-full-*.json` contains the **complete inputs** (`retrieval_plan`, tool arguments), the **recorded RAG responses** (inside `tool_calls[].response`), and the **actual outputs** (assessment, brief fields). That is a test cassette in the VCR sense: real turns, real retrievals, frozen in time. `scripts/replay-brief-fixture.ts` already proves the replay technique — it rebuilds a brief from a saved JSON's recorded tool responses and runs meta checks. The harness is that script, generalized: many cases, declared expectations, a scorecard, and baselines.

One structural gift: TypeScript's structural typing means a `CassetteRagClient` exposing `callJsonTool`/`callTextTool` satisfies the `RagMcpClient` parameter of `runGuardianPreflight` **without any refactor** to production code. The pipeline can be executed end-to-end against recorded data as-is.

---

## 2. The golden turn format

### 2.1 Directory layout (Guardian repo)

```text
evals/
  golden/
    continuous-scene/      gt-001-outlap-radio.json …
    fresh-thread/          gt-010-thread07-arrival.json …
    high-risk-intimacy/    gt-015-changing-room.json …
    exact-fact/            gt-020-villa-name.json …
    temporal-mud/          gt-025-track-vs-morning.json …   ← the audit's stale-precedent traps
    duplex/                gt-030-passive-prior.json, gt-031-strong-prior.json …
    write-back/            gt-040-scene-transition.json, gt-041-micro-log-trap.json …
    serendipity/           gt-045-intimate-mode.json …
  baselines/               <git-sha-or-tag>.json
  runs/                    <timestamp>-scorecard.{md,json}   (gitignored)
```

Target: **~50 cases** across those 9 categories (5–8 each). Categories map one-to-one onto the failure modes the audit measured and the features the other roadmaps add — every pillar lands with its category pre-seeded.

### 2.2 One golden case

```jsonc
{
  "id": "gt-025-track-vs-morning",
  "category": "temporal-mud",
  "description": "Live beat is on-track; changing-room morning content must not surface as precedent",
  "source_report": "preflight-full-2026-07-13T02-10-02-038Z.json",   // provenance
  "input": {
    "user_message": "…Benjamin keys the private radio…",
    "recent_context": "…",
    "scarlett_previous_message": "…",                                  // null for fresh-thread cases
    "force_full_retrieval": false
  },
  "cassette": {                       // recorded RAG responses, keyed by tool + args-hash
    "index_status": { "…" : "…" },
    "retrieve_story_context": { "results": [ … ] },
    "search_story_memory": [ { "results": [ … ] } ],
    "get_live_story_state": { "content": "…current-state snapshot frozen at capture…" }
  },
  "expectations": {
    "brief_must_include": [ ["out lap", "shakedown"], ["pit wall", "pit lane"] ],   // outer=AND, inner=OR
    "brief_must_not_include": [ "changing room", "lace", "HIGH confidence context found",
                                 "search_story_memory", "project_source_files" ],
    "flags_expected": [], "flags_forbidden": [ "MANDATORY_RETRIEVAL_FAILED" ],
    "precedents_must_not_match": [ "changing-room|lace bra" ],
    "correction_expected": "none",          // "required" | "none" | "either"
    "write_action_expected": "none",        // "none" | "stage" | "stage_transition" | "either"
    "brief_chars": { "min": 1500, "max": 6500 },
    "llm": {                                // only consumed by the L3 tier
      "facts_min": 3,
      "facts_must_cover": [ ["Friday", "midday|afternoon"], ["Nordschleife|Nürburgring"] ],
      "scene_delta_required": true
    }
  }
}
```

Design points: **expectations are substring/regex groups, not exact transcripts** — LLM output varies; what must not vary is grounding, hygiene, and gates. `must_not_include` is the sharpest tool: meta leaks and stale-beat resurrections are exact-match detectable regardless of phrasing. Provenance ties every case to a real archived turn.

### 2.3 Curation tooling — cases cost minutes, not hours

**NEW `scripts/curate-golden.ts`**: `npx tsx scripts/curate-golden.ts docs/guardian-reports/preflight-full-<ts>.json --category temporal-mud` → extracts inputs and cassette automatically (both live in the JSON already), emits a skeleton with empty expectations. A human (or Grok 4.5 with operator review) authors the expectations — the only genuinely human part, ~5 minutes per case. Seeding 50 cases is an afternoon, drawn from an archive that already spans good briefs, meta-polluted briefs, duplex hits, and the empty-weave window (bad eras make the best regression traps: assert the *fixed* behavior on the exact inputs that once failed).

---

## 3. The three tiers

### L1 — Hermetic replay (free, seconds, run on every change)

**NEW `evals/runner.ts`** (+ `npm run eval:fast`):

1. Load golden cases (all, or `--category X`).
2. Build `CassetteRagClient` per case (returns recorded responses; **fails loudly** if the pipeline requests a tool/args combination not in the cassette — that itself is a signal the retrieval plan changed, reported as `PLAN_DRIFT`, warn-level).
3. Run the real `runGuardianPreflight` with `GUARDIAN_LLM_ENABLED=false` **plus** an injected frozen `llm_assessment` from the source report (both variants are useful: `--llm-mode off` tests heuristic fallbacks; `--llm-mode frozen` tests assembly/rendering around known auditor output).
4. Run `compileGrokBrief`; evaluate every expectation except the `llm` block.
5. Serendipity: seeded RNG (case id as seed) so selection is reproducible; mode/tier assertions run deterministically.

Catches, with zero API cost: meta leaks, stale precedents, gate misfires, brief structure/length, flag logic, trigger detection, recency demotion (when Pillar A lands — the `temporal-mud` category is its acceptance test in executable form), write-decision classes, serendipity tier violations.

### L2 — Retrieval eval (live RAG, no auditor; `npm run eval:retrieval`)

Extends the existing RAG-side `eval:memory` rather than duplicating it: for each golden case, re-run the case's *queries* against the live vector store and score **gold-fact recall** (does the live index still surface the sections the cassette contained / the facts the expectations require?). Run after reindexes, ranking changes, source-role/boost edits, or corpus restructuring (the compression pipeline's rotation and the `arc_plan` role both need this). Output: recall@k per case + drift list (sections that vanished from top-k since the cassette). This is the tier that would have caught the store/manifest mismatch class of problem.

### L3 — Auditor eval (live terra on frozen evidence; `npm run eval:llm`)

The only tier that spends real money, and the only correct way to test the two prompts:

1. For each case, build the **exact evidence payload** from the cassette (frozen retrieval removes the biggest variance source) and call the real `assessGuardianEvidence`.
2. **N trials per case (default 3)** — LLM output is a distribution, not a value. An assertion passes if it holds in ≥ 2/3 trials; per-case flakiness (trials disagreeing) is reported separately, because a flaky prompt is its own defect.
3. Score the `llm` expectation block: facts count/coverage, scene-delta presence, `correction_expected` (the duplex categories check both directions — correction fires on the passive prior, stays `null` on the strong prior: precision *and* recall), `candidate_memory_update` materiality vs the write-back gate.
4. **Optional LLM-judge (advisory, never gating):** a fixed judge model scores each brief 1–5 against a rubric (grounding fidelity to cassette evidence; novelist-usability; zero retrieval dialect; echo subtlety once the dramaturg lands). Judge scores trend on the scorecard but do not fail runs until the judge has been calibrated against human labels — seed calibration set: the audit's hand-labeled good (Jul 13) and bad (Jul 6–12) reports.

Cost envelope: 50 cases × 3 trials × 1 auditor call ≈ 150 calls of ~5–15k tokens — single-digit dollars per full run at terra pricing; `--category` subsets for iteration (e.g. only `duplex/` while tuning the correction prompt).

---

## 4. Scorecard, baselines, and gates

### 4.1 Output

Every run writes `evals/runs/<ts>-scorecard.{json,md}`. The markdown leads with the diff against baseline:

```markdown
# Guardian Eval Scorecard — 2026-07-16 03:12 vs baseline main (a3f9c21)
Tiers: L1 (50 cases) · L3 (12 cases, duplex+write-back, 3 trials)

## Regressions (2) ← read this first
- gt-025 temporal-mud: precedents_must_not_match FAILED — "changing-room" resurfaced (was passing)
- gt-030 duplex/passive-prior: correction fired 1/3 trials (baseline 3/3) — flakiness ↑

## Improvements (3) …
## Aggregate metrics          now    baseline
meta_pollution_rate           0/50    0/50
avg_facts (L3)                5.1     4.8
correction_precision/recall   1.00/0.67   1.00/1.00
brief_chars p50               3910    3850
flaky_cases (L3)              1       0
```

Aggregate metrics are the audit's §1 table, automated — the manual 142-report audit becomes a command. (This subsumes the "scorecard script" items in the audit's P2 and the other roadmaps' telemetry asks; one tool, one place.)

### 4.2 Baselines

`npm run eval:baseline -- --tag main` snapshots current results to `evals/baselines/`. Comparisons are **against a named baseline, not absolutes** — the question is always "did this change degrade anything," which survives goldens being added or expectations evolving.

### 4.3 Gate policy

| Signal | Policy |
|--------|--------|
| L1 `must_not_include` violation, gate misfire, crash, brief bounds | **Hard fail** — deterministic, no excuse |
| L1 `PLAN_DRIFT` (cassette miss) | Warn — review whether retrieval-plan change was intended; re-record cassette if so |
| L3 assertion pass-rate drop vs baseline | Soft fail (blocks prompt/schema merges, not unrelated changes) |
| L3 flakiness increase, judge score drop | Warn + trend |

### 4.4 Golden maintenance protocol (the part that keeps this honest)

- **Expectations change only deliberately**, in the same change-set as the code/prompt change that motivates them, with a one-line rationale in the case's `description`. A red eval is fixed by fixing code *or* consciously amending the expectation — never by deleting the case.
- **Cassettes are frozen history** — never regenerate to make a test pass; add a new case from a fresh archived report instead.
- **Each new arc contributes 2–3 fresh cases** (curation is minutes); superseded cases are marked `"retired": "<reason>"` rather than deleted, keeping the regression traps from old failure eras alive.
- Content note: goldens contain RP material including adult content, same as `docs/guardian-reports/` already does. Both repos are private; keep it that way, and keep `evals/` out of any future public extraction.

---

## 5. Workflow contract for Grok 4.5

```text
Any code change:                     npm test && npm run eval:fast     (seconds, free)
Selector/assembler/gate change:      + eval:fast must be green incl. temporal-mud + write-back categories
Prompt or auditor-schema change:     + npm run eval:llm -- --category duplex,write-back  (bounded spend)
                                     + full eval:llm before merge; attach scorecard to the change note
Reindex / ranking / corpus move:     npm run eval:retrieval
Merge to main:                       npm run eval:baseline -- --tag main   (new baseline)
```

This is a documented protocol, not CI automation, for now — single operator, local repos. A git `pre-push` hook running `eval:fast` is a one-liner if wanted later (P2).

---

## 6. Roadmap

### P0 — Replay harness live (1–2 sessions; catches the majority failure class immediately)

| # | Task | Files | Status (2026-07-15) |
|---|------|-------|---------------------|
| 1 | Golden case schema (zod) + loader | `evals/schema.ts` | **done** (WP-1.1) |
| 2 | `CassetteRagClient` (structural stand-in; loud on cassette miss) | `evals/cassette-client.ts` | **done** (WP-1.1) |
| 3 | `curate-golden.ts` extractor | `scripts/curate-golden.ts`, `evals/curate-from-report.ts` | **done** (WP-1.2) |
| 4 | Runner: L1 execution, expectation engine, scorecard md+json | `evals/runner.ts`, `evals/expectations.ts` | **done** (WP-1.3) |
| 5 | Seed **15 cases**: 5 good Jul-13-era, 5 from failure eras (meta leaks, empty weave, temporal mud), 5 duplex/write-back | `evals/golden/**` | **done** (WP-1.4) — Gemini expectations; baseline `after-wp-1.4` |
| 6 | `eval:fast`, `eval:baseline` npm scripts + first baseline | `package.json`, `evals/baselines/` | **done** (WP-1.3 + after-wp-1.4 snapshot) |

### P1 — Statistical LLM tier + full coverage

| # | Task | Files |
|---|------|-------|
| 7 | L3: frozen-evidence auditor calls, N-trials, pass-rate scoring, flakiness metric | `evals/runner.ts` |
| 8 | Duplex precision/recall pair-cases; write-back materiality cases | goldens |
| 9 | Grow to ~50 cases across all 9 categories | goldens |
| 10 | Baseline diffing + gate policy in runner exit codes | runner |
| 11 | Workflow contract added to `AGENTS.md` of both repos | docs |

### P2 — Judge, retrieval tier, hooks

| # | Task | Files |
|---|------|-------|
| 12 | L2 retrieval eval bridging to RAG's `eval:memory` (gold-fact recall@k, drift list) | RAG `scripts/eval-memory.ts` + runner |
| 13 | LLM-judge rubric + calibration against the audit's hand-labeled reports; advisory trend line | runner |
| 14 | Seeded-RNG serendipity + dramaturg categories as those pillars land | goldens |
| 15 | Optional `pre-push` hook (`eval:fast`) | git hook |

---

## 7. Acceptance criteria

- **The ten-day blind spot is structurally impossible:** an auditor returning zero facts + zero scene delta on golden inputs fails `eval:llm` on the first run after the breaking change — detection latency drops from 10 days to one command.
- `eval:fast` completes in < 30 s with zero network/API calls and is green on the current codebase before any P0 merge.
- A deliberately reintroduced defect from each historical failure class (meta leak in scene summary; changing-room precedent on a track turn; micro-log write; duplex correction suppressed) turns the scorecard red — verified once, mutant-style, as the harness's own test.
- A prompt change to the auditor ships with a before/after scorecard attached, and the duplex precision/recall numbers are cited in the change note.
- Adding a golden case from a new archived report takes ≤ 10 minutes end-to-end.

---

## 8. One-line summary

**Split Guardian into what's deterministic (test it hermetically by replaying the report archive's recorded turns as cassettes — free, seconds) and what's an LLM (test it statistically with N-trial assertions and frozen evidence — bounded dollars), curate ~50 golden turns from the archive with regex-group expectations, and every code or prompt change gets a scorecard diffed against baseline — so the next empty-weave regression lasts one command, not ten days.**

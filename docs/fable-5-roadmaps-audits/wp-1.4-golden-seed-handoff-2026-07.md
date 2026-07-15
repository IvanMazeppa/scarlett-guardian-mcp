# WP-1.4 handoff — Seed 15 golden cases

**Date:** 2026-07-15  
**Status:** READY TO START (blocked on authorship split, not on tooling)  
**Branch:** `feature/master-roadmap-v1`  
**Depends on:** WP-1.1–1.3 **done** (`eval:fast` green on `gt-000-hermetic-smoke`)

---

## Recommendation (Grok Build — lead implementer)

| Question | Answer |
|----------|--------|
| Move straight to 1.4? | **Yes** — next sequential WP. Do **not** skip to 1.5 mutants or 1.6 telemetry until ~15 goldens exist. |
| Live RP / Grok cloud test? | **No** — not required for 1.4. Hermetic eval only. Operator live tests wait for later WPs (staging ceremony, duplex bridge, story milestones). |
| Operator testing now? | Optional: run `npm test && npm run eval:fast` once after pull. No more. |
| What Gemini needs | **Expectation authorship** on curated skeletons (see paste block below). Not pipeline code. |
| What Grok does in 1.4 | Curate 15 skeletons from archive → place under `evals/golden/**` → run `eval:fast` after Gemini/operator expectations land → re-baseline. |

**Do not parallelize 1.6 telemetry yet** — scheduling law is sequential; 1.4 is the value of the harness.

---

## Ownership split (from master roadmap)

| Role | WP-1.4 work |
|------|-------------|
| **Grok Build** | Pick 15 source reports; `npm run curate:golden`; fix cassette/ids/paths; ensure cases load; after expectations land, make `eval:fast` green; snapshot baseline. |
| **Gemini 3.1 Pro** | Author `expectations` blocks (phrase groups, must_not traps, flags, write/correction, brief_chars). Red-team: would a historical defect fail this case? |
| **Operator** | Approve final 15; paste duplex `scarlett_previous_message` when notes say it was provided but text is missing; review adult/RP content OK in private repo. |
| **Fable 5** | No action required unless schema shape should change. |

---

## Target mix (exactly 15 + keep smoke)

| Bucket | Count | Categories (suggested) | Report era |
|--------|------:|--------------------------|------------|
| A — Good | 5 | `continuous-scene`, `fresh-thread`, `exact-fact` | Jul 13+ good briefs |
| B — Failure traps | 5 | `temporal-mud`, meta-leak era, empty-weave era | Jul 3–12 / known bad turns — assert **fixed** behavior on those inputs |
| C — Duplex / write-back | 5 | `duplex`, `write-back` | Jul 14–15 duplex notes; staged write reports |
| Smoke (already) | 1 | `other` / `gt-000-hermetic-smoke` | synthetic — keep |

Ids: `gt-001`… style; see `evals/golden/README.md`.

---

## Tooling (already shipped)

```bash
# skeleton from archive (~minutes each)
npm run curate:golden -- docs/guardian-reports/preflight-full-<ts>.json \
  --category temporal-mud --sequence 25 --id gt-025-track-vs-morning

# after expectations filled
npm test && npm run eval:fast
npm run eval:baseline -- --tag after-wp-1.4
```

**Known gap:** full reports do not store `scarlett_previous_message` text. Curator/operator must paste prior Scarlett turn for duplex cases when `retrieval_notes` say duplex was provided.

**Cassettes are frozen** — never regenerate to force a pass; fix code or deliberately amend expectations with rationale in `description`.

---

## Paste block for Gemini 3.1 Pro (adjacent terminal)

```text
You are Gemini 3.1 Pro (review / goldens). Do NOT implement Guardian pipeline code.

Contract: scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md
Eval design: docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md §2
Schema: evals/schema.ts (GoldenExpectations)
Handoff: docs/fable-5-roadmaps-audits/wp-1.4-golden-seed-handoff-2026-07.md

WP-1.1–1.3 are DONE. eval:fast is green on gt-000-hermetic-smoke.
Your job for WP-1.4: author expectations on golden JSON skeletons Grok places under
evals/golden/<category>/gt-*.json (or review skeletons and propose expectation patches).

For each case, fill:
- brief_must_include: outer AND, inner OR phrase groups (grounding that must appear)
- brief_must_not_include: meta leaks + stale-beat traps (sharpest tool)
- flags_expected / flags_forbidden
- precedents_must_not_match: regexes for stale content (temporal-mud)
- correction_expected: none | required | either  (duplex pairs need both directions)
- write_action_expected: none | stage | stage_transition | either
- brief_chars: reasonable min/max
- description: one-line rationale if expectations encode a historical defect

Do NOT edit cassettes to make tests pass. Do NOT invent CORE canon.
Leave llm: block empty unless documenting L3 intent for later.
After drafting, list any cases that need operator duplex paste or report re-pick.
Operator reviews before merge; Grok runs eval:fast and re-baselines.
```

---

## Exit criteria (WP-1.4 acceptance)

- [ ] 15 narrative goldens + smoke under `evals/golden/**`
- [ ] Gemini expectations authored; operator reviewed
- [ ] `npm run eval:fast` green (hard fails = 0)
- [ ] Baseline snapshotted (`eval:baseline -- --tag after-wp-1.4` or similar)
- [ ] Progress ledger §13 updated to **1.4 done**

---

## Explicitly not in 1.4

- Live Grok cloud / ngrok RP test  
- Mutant self-test (WP-1.5)  
- Telemetry dashboard (WP-1.6–1.7)  
- L3 `eval:llm` (later)

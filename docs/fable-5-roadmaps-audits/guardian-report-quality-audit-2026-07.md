# Guardian Report Quality Audit — Measured Second Opinion

**Date:** 2026-07-14  
**Author context:** Independent re-analysis (Fable 5, Extra High), performed after the earlier critique in `guardian-report-quality-critique-2026-07.md`. This pass is **quantitative**: every full report JSON in `docs/guardian-reports/` was parsed and measured, and the code paths that assemble the brief were traced to root causes.

**Operator note (updated 2026-07-14 evening):** Fable P0 items 1–4 largely **shipped and observed live** on `preflight-full-2026-07-14T05-40-36-278Z.json`:

- evidence 32k; terra weave 6 facts + scene_delta; expand_context ok (3 sections); verify skipped (no exact patterns); `memory_write` field present (`none` / no-op candidate).
- Duplex still **missing from Grok tool args** — not a missing server feature; hardened CRITICAL MANDATORY description + logs.
- Staging E2E still needs a material candidate to prove `stage_story_update` in a saved report.
- Still open from this audit: temporal precedent recency, store/manifest match, connection reuse, scorecard script, serendipity retune.

**Corpus:** 142 full-report JSONs + paired streamlined briefs, 2026-06-23 → 2026-07-13.  
**Operator stance (unchanged):** Quality over thrift. Token cost and latency acceptable up to Grok's timeout ceiling. Guardian is the replacement for Grok's lost agent team.

---

## 1. Headline numbers

Measured across all 142 saved preflights:

| Metric | Value | Reading |
|--------|-------|---------|
| Scene summary polluted with RAG meta (full JSON) | 134 / 142 (94%) | Fixed only in the very latest reports (Jul 13: 0/3) |
| Emotional context polluted with RAG meta | 135 / 142 (95%) | Same trajectory |
| LLM auditor enabled | 85 / 142 (60%) | On since late June |
| **LLM on but produced zero facts AND zero scene delta** | **38 / 85 (45%)** | Concentrated Jul 3–12 — see §3 |
| Duplex correction (`grok_performance_correction`) fired | 12 / 142 (8%) | Duplex effectively dormant |
| Serendipity nudge present | 6 / 142 (4%) | World-weaver nearly silent |
| Confidence score exactly 100 | 47 / 142 (33%) | Score saturates; gate rarely gates |
| `do_not_proceed` / `proceed_with_caution` | 4 + 2 / 142 (4%) | Same conclusion |
| Deep searches per preflight: exactly 1 | 91 / 142 (64%) | Fan-out clamp dominates |
| Deep searches ≥ 2 | 51 / 142 (36%) | Never more than 2 |
| Expand used | 102 / 142 (72%) | Almost all June; ~0 since Jul 4 |
| Verify used | 65 / 142 (46%) | Same pattern |
| Write attempted (`update_story_state`) | 77 / 142 (54%) | All **live** appends |
| **Write attempts that failed** | **53 / 77 (69% June-era)** | Timeout class, fixed Jul 6 by background reindex |
| **`stage_story_update` calls across all reports** | **0** | Staging pipeline has never executed in production |
| `memory_write` decision field present in report | 0 / 142 | The P1 write-gate code postdates every saved report |
| Active store ID ≠ local manifest ("Matches Manifest: no") | 87 / 142 (61%) | Persistent index-hygiene warning |
| Open-threads section containing tool instructions (full JSON) | 135 / 142 (95%) | Brief-level filters catch some, not all |

---

## 2. Timeline of quality by day (July)

| Day | Reports | Live writes OK / failed | LLM on | LLM empty weave | Meta-polluted scene | Expand used |
|------|--------:|------------------------:|-------:|----------------:|--------------------:|------------:|
| 07-01 | 2 | 0 / 2 | 2 | 0 | 2 | 2 |
| 07-03 | 6 | 0 / 5 | 6 | 6 | 5 | 3 |
| 07-04 | 1 | 0 / 1 | 1 | 1 | 1 | 0 |
| 07-05 | 5 | 0 / 5 | 5 | 5 | 5 | 0 |
| 07-06 | 8 | 7 / 0 | 8 | 8 | 8 | 0 |
| 07-08 | 6 | 6 / 0 | 6 | 6 | 6 | 0 |
| 07-09 | 3 | 3 / 0 | 3 | 3 | 3 | 0 |
| 07-10 | 2 | 2 / 0 | 2 | 2 | 2 | 0 |
| 07-11 | 2 | 2 / 0 | 2 | 2 | 2 | 0 |
| 07-12 | 4 | 4 / 0 | 4 | 4 | 3 | 0 |
| **07-13** | **3** | — | **3** | **1** | **0** | 0 |

Three distinct stories in one table:

1. **Write timeouts fixed 2026-07-06.** June: 0 successful writes, 40 failures. Jul 6 onward: writes succeed cleanly. This confirms the background-reindex fix and dates it precisely.
2. **Expand/verify amputated ~2026-07-04** as part of the same timeout firefight — and never restored, even after the actual cause (blocking reindex) was fixed on Jul 6. The disable is now pure quality loss with no remaining justification.
3. **The auditor ran empty for ten days (Jul 3–12).** Every LLM-enabled preflight in that window returned zero `supported_facts` and zero `scene_state_delta` — cost incurred, no weaving delivered. June's auditor runs (43) never did this. The regression window correlates with the switch to `gpt-5.6-terra` at `GUARDIAN_LLM_REASONING_EFFORT=low` (the code comment explicitly notes low effort was chosen to keep terra cost near the prior mini model). The two latest Jul 13 reports (02:10, 05:34) produce 6 solid facts each — something fixed between Jul 13 01:10 and 02:10 (likely the schema field descriptions now instructing "3–6 plain-language continuity bullets"). **Verify this fix holds; it is the single biggest quality lever in the data.**

---

## 3. Verdict

The two newest reports (Jul 13, 02:10 and 05:34) are the best in the archive: novelist-usable scene summary, six concrete grounded facts, clean status line, no tool dialect in the fact list. The system has just crossed the threshold from "plumbing leaks into the brief" to "genuine helping hand."

But the archive shows this quality is **days old and fragile**, and three structural gaps remain even in the best briefs:

1. **Depth starvation** — max 2 corpus searches ever; expand/verify still hard-disabled after their justification expired; evidence to the auditor capped at 12,000 chars while retrieval can return ~50,000+ chars per preflight (2 searches × 10 results × 3,000 + preflight 6 × 2,500). The auditor sees roughly a quarter of what was retrieved.
2. **Dormant intelligence features** — duplex corrections 8%, serendipity 4%, staging write-back 0%. Three designed features, none earning their keep in production.
3. **A gate that never gates** — 96% of preflights say "proceed," a third at exactly 100 confidence. The deterministic score saturates by construction (35+40+10+10+5); it discriminates almost nothing.

---

## 4. What the best briefs get right (keep and amplify)

From `preflight-streamlined-2026-07-13T05-34-16-471Z.md` and `…02-10-02…`:

- Scene summary is prose a novelist can act on (pit lane, first lap, radio, who is present).
- Key facts are auditor-woven continuity bullets, not flag strings or trigger labels.
- Status/confidence header gives permission cleanly.
- No tool names, no file paths, no scores in what Grok reads.
- Brief length ~3,900 chars against a 6,500 cap — **2,600 chars of unused headroom** that could carry emotional weave, a second precedent, or a turn-specific delta.

---

## 5. Defects, with root causes in code

### 5.1 Stale precedents dominate (temporal mud)

Measured: the topic "Event Log — Scarlett & Benjamin Narrative" appears as a top-2 precedent **65 times**; "Mythological Bond and Power Transfer" (thread-01 historical) **34 times**; "Notes for Next Response" **36 times**. The same few chunks are pinned as "precedents" across dozens of unrelated turns — including changing-room notes reappearing after the live beat moved to the track.

Root cause: `selectPrecedents` in `preflight.ts` scores by rank score + source-role boost + keyword overlap. There is **no recency signal** — nothing compares a chunk's implied story-time against `current-state.md`'s live beat. Historical threads get a flat −40 unless family/trauma triggers fire, but *recent-but-superseded* beats (this morning's changing room vs. this afternoon's lap) have no demotion at all.

### 5.2 Scene/tone fallbacks are arc-hardcoded

`summarizeCurrentState` (line ~575) falls back to using Benjamin's message as the scene beat only if it matches a regex containing `friday|thursday|nordschleife|nürburgring|paddock|pit lane|race suit|locker|villa|luxembourg|track`. `buildToneGuidance` has similar hardcoded mood keyword lists. **These are Germany-arc literals baked into code.** The moment the story moves to Affalterbach, the Gulfstream home, or the wedding arc, these fallbacks silently stop matching and the brief degrades — and nobody will know why. This is a time bomb, not a bug yet.

### 5.3 Auditor is throttled below its job description

- `GUARDIAN_LLM_REASONING_EFFORT=low` — chosen for cost parity with the old mini model; correlates with the Jul 3–12 empty-weave regression.
- `GUARDIAN_LLM_MAX_EVIDENCE_CHARS=12000` — the auditor is asked to weave a corpus it mostly cannot see.
- The auditor's output currently feeds only `supported_facts` / `scene_state_delta` / corrections. Emotional context, precedent selection, and open threads are assembled by regex heuristics *around* the LLM instead of *by* it.

### 5.4 Confidence scoring saturates

`scoreConfidence`: high preflight (35) + one high memory (40) + any results (10+10) + trigger bonus (5) = 100. One decent retrieval maxes the gate. Result: 33% of reports at exactly 100, and "proceed" 96% of the time. The number carries almost no information for Grok, and `proceed_with_caution` — the genuinely useful middle state — fired twice in 142 runs.

### 5.5 Staging write-back has never run

`.env` says `GUARDIAN_MEMORY_WRITE_MODE=stage`, `decideMemoryWrite` defaults to stage, tests exist — but **zero `stage_story_update` calls and zero `memory_write` fields appear in any saved report**. All 77 production writes were legacy live appends to `current-state.md`. Either the staging code shipped after the last saved report (Jul 13) or the preflights ran from a branch without it. Until one staged update is observed end-to-end (stage → list → approve → background reindex), treat the staging pipeline as **untested in production**.

### 5.6 Serendipity is configured to be invisible

15% base chance, suppressed entirely when any intimacy/recovery/family/trauma trigger fires — and this RP is dense with those triggers. Result: 6 nudges in 142 turns. If the world-weaver matters, it needs either a higher base rate, a narrower suppression list, or trigger-aware event selection (e.g., allow Shevchenko/Albion work events during track scenes even when an intimacy trigger coincides).

### 5.7 Index hygiene

61% of reports show the active vector store ID differing from the local manifest's store ID. Retrieval still works (the active store is queried), but expand-neighbor lookups and `index_status` trust depend on the manifest matching. One reconciling reindex — or a manifest update tool — closes this permanently.

---

## 6. Full-duplex dialogue auditing — status

Implemented: `scarlett_previous_message` input → auditor critique → `grok_performance_correction` → "DIRECTOR'S CORRECTION" block in the brief.

Measured: 12 corrections in 142 reports (8%), and saved inputs rarely show the previous-Scarlett feed populated. The feature works when fed (the Jul 6 correction — "don't passively echo Benjamin's recovery offer" — is exactly the agent-team behavior wanted) but it is starved of input, not broken.

Restoring it is a **caller-side** fix: whatever invokes `guardian_memory_preflight` (Grok's tool call template, or the bridge) must include Scarlett's last reply every turn. Consider making the MCP tool description state this expectation explicitly so Grok fills the parameter.

---

## 7. Upgrade roadmap

Ordered by measured impact per unit of work. Cost/latency accepted; the only hard constraint is Grok's timeout.

### P0 — Lock in and extend the auditor (this week)

1. **Verify the Jul 13 weave fix holds.** Run 5–10 preflights; confirm `supported_facts` ≥ 3 and non-empty `scene_state_delta` every time. If any come back empty, raise `GUARDIAN_LLM_REASONING_EFFORT` from `low` to `medium` — the empty-weave window correlates with the low-effort terra switch, and quality-first policy justifies the spend.
2. **Raise `GUARDIAN_LLM_MAX_EVIDENCE_CHARS`** from 12,000 to ≥ 32,000 so the auditor sees most of what retrieval returns. This is a one-line `.env` change with direct weave-quality payoff.
3. **Re-enable expand + verify in preflight** — their disable was a shotgun fix for the write-timeout bug that background reindex already solved (proven by the Jul 6 write-success flip). Wrap each in a per-call time budget (e.g., 8–10 s) so a slow expand degrades gracefully instead of stalling the turn.
4. **Raise search fan-out**: 2–3 targeted corpus queries when triggers fire, 3–4 under `force_full_retrieval`. The clamp comments in `buildMemoryQueries` already say "depth can rise later" — later is now.
5. **Feed duplex every turn**: update the tool description for `scarlett_previous_message` so Grok reliably passes it; log a warning when a preflight arrives without it during an active session.

### P1 — Make the LLM the weaver, fix the selectors (next 1–2 weeks)

6. **Widen the auditor's job**: have it emit emotional context, 1–3 precedent *selections with one-line relevance rationale*, and open threads — replacing the regex assemblers (`buildToneGuidance`, parts of `selectPrecedents`, `collectOpenThreads`) as the primary path, with heuristics demoted to fallback. This directly attacks the 95% meta-pollution and stale-precedent stats at their source.
7. **Add recency to precedent scoring**: pass the live `current-state.md` "Where We Are" snapshot into selection and demote chunks whose story-time is superseded (changing-room vs. on-track). Even a coarse "same-day earlier beat" demotion kills most of the temporal mud.
8. **Remove arc-hardcoded keyword regexes** from `summarizeCurrentState` / `buildToneGuidance` before the story leaves the Germany arc, or the brief silently degrades. Replace with the auditor path (item 6) or with keywords derived from live state rather than literals in code.
9. **Rework confidence into bands that discriminate**: require corroboration (live-state + corpus agreement) for 90+; reserve 100 for verified exact-fact turns; let `proceed_with_caution` actually fire on partial evidence. A gate that always says yes is decoration.
10. **Prove the staging pipeline end-to-end once**: trigger a material update, confirm `stage_story_update` → `list_staged_story_updates` → `approve_staged_story_update` → background reindex, and confirm `memory_write` appears in the saved report. Until then it is untested code on the critical canon path.
11. **Reconcile store ID vs. manifest** (RAG side) so `Active Config Matches Manifest` reads `yes` and expand neighbors are trustworthy.

### P2 — Polish and instrumentation (after P1)

12. **Spend the brief's headroom**: current best briefs use ~3,900 of 6,500 chars. Add a "This Turn's Delta" line (what changed since last preflight), a third temporally-relevant precedent when available, and richer emotional weave. Rotate or compress the static Qualified Autonomy block (e.g., full text every N turns, one-line reference otherwise).
13. **Tune serendipity**: raise base chance toward 25–30% and/or narrow suppression so non-intimate world events (Shevchenko, weather, phones) can fire during track scenes; 4% is invisible.
14. **Report scorecard script**: a small `scripts/` tool that runs the §1 metrics over `guardian-reports/` on demand, so quality regressions (like the Jul 3–12 empty-weave window) are caught in a day instead of ten.
15. **Connection reuse in `RagMcpClient`** once fan-out grows (each tool call currently opens a fresh MCP connection; fine at 4 calls, wasteful at 8–10).
16. **Golden-turn eval set**: 5–10 archived turns with known-correct facts; replay through preflight after each change (extends `scripts/replay-brief-fixture.ts`).

---

## 8. Definition of done — a "great" brief

For a typical in-character turn, the streamlined brief should:

1. Open with one tight scene paragraph: where, when, who, physical setup — in story language.
2. List 3–6 must-ground facts, auditor-woven, zero tool dialect.
3. Offer 1–3 precedents that match the *live* beat's timeframe, each with a reason it matters now.
4. Name Scarlett's emotional stance *this beat* — not a digest from days ago unless still active.
5. Include a Director's Correction when the previous Scarlett reply was passive or trope-drifted; omit the section otherwise.
6. Flag only real continuity risks; never coach Grok to call tools inside the novelist brief.
7. Carry a confidence number that actually varies with evidence quality.
8. Reference standing protocol without reprinting it in full every turn.

---

## 9. Suggested build order (concrete)

```text
1. .env: GUARDIAN_LLM_MAX_EVIDENCE_CHARS=32000; consider effort low→medium
2. Run 5 preflights; confirm weave fix holds (facts ≥ 3 every run)
3. preflight.ts: re-enable expandBestContext + verifyExactClaims with 8–10s budgets
4. preflight.ts: buildMemoryQueries clamp 1→2-3 (triggered), 2→3-4 (force-full)
5. server.ts: tool description nudge so Grok passes scarlett_previous_message
6. llm-assessment.ts: extend schema — emotional_context, precedent selections, open_threads
7. compile-grok-brief.ts: prefer auditor fields; heuristics as fallback only
8. selectPrecedents: live-state recency demotion
9. One end-to-end staged write-back test; confirm memory_write in saved report
10. RAG: reconcile store/manifest; scorecard script for ongoing QA
```

---

## 10. Bottom line

The measured record shows a system that spent June fighting a write-timeout bug (correctly fixed by background reindex on Jul 6), spent early July paying for an auditor that returned nothing (regression fixed ~Jul 13, needs confirmation), and arrived — in its two newest reports — at genuinely good novelist briefs. The path forward is not more caution: it is **feeding the now-working auditor everything** (more searches, expand, verify, bigger evidence window, the previous Scarlett reply), letting it write more of the brief than regexes do, and adding recency awareness so yesterday's beats stop haunting today's scene. Every disabled or dormant feature in this audit — expand, verify, duplex, staging, serendipity — was designed for exactly the agent-team role Guardian is meant to fill; the work is switching them back on deliberately, one at a time, with the scorecard watching.

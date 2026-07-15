# Guardian Report Quality Critique & Forward Advice

**Date:** 2026-07-14  
**Corpus reviewed:** `scarlett-guardian-mcp/docs/guardian-reports/` (streamlined `.md` + paired full `.json`)  
**Operator stance:** Quality over thrift. Token cost and latency are acceptable if Grok does not time out. Guardian should act as the missing “agent team” — deep corpus retrieval + LLM intelligence woven into a helping hand for Grok.

This document captures the critique and advice from the Jul 2026 review. It does not replace architecture deep-dives; it focuses on **what the reports actually give Grok** and how to improve them.

Related:

- `docs/architecture-deep-dive-2026-07.md` (Guardian)
- `../rag-memory-mcp/docs/architecture-deep-dive-2026-07.md` (RAG)

---

## 1. Context correction (important)

Earlier “simplify / disable LLM / minimize retrieval” guidance was a **debug-era** response to write-path timeouts and prompt bloat. It is no longer the north star.

Clarifications from the operator:

| Topic | Reality |
|-------|---------|
| Grok tool-calling | Grok 4.3 is consistently delivering preflights via MCP |
| Timeouts | Caused largely by **blocking reindex** on write; fixed by **background reindex** |
| LLM assessment | Wanted **on** — weave corpus into intelligent briefs |
| Simplification | Rejected as the goal; push report quality forward |
| Full duplex | Wanted restored (audit Scarlett’s previous message) |
| Bridge | Secondary while MCP path works |

**Do not confuse:** “don’t dump RAG plumbing into Scarlett’s mouth” ≠ “starve retrieval or turn off the auditor.”

---

## 2. What was reviewed

Saved pairs under `docs/guardian-reports/`:

- `preflight-streamlined-*.md` — what Grok is meant to read (`compileGrokBrief`)
- `preflight-full-*.json` — debug archive (tool_calls, llm_assessment, flags, precedents)

Sample window included recent Nordschleife / Black Panther arc reports (2026-07-13 … earlier June timeout-era runs).

---

## 3. Verdict in one paragraph

When the LLM auditor successfully synthesizes evidence, the streamlined brief is already a strong helping hand (clear scene, grounded key facts, usable status). The failure mode is **not** “too much intelligence.” It is **uneven weaving**: stale precedents competing with the live beat, thin emotional context, RAG coaching dialect leaking into Scene Summary, underused duplex corrections, and timeout-era amputations (expand/verify off, conservative search fan-out) that still starve the auditor of depth.

---

## 4. What “good” already looks like

Strong examples (later Jul 13):

- `preflight-streamlined-2026-07-13T05-34-16-471Z.md`
- `preflight-streamlined-2026-07-13T02-10-02-038Z.md`

Why they work:

- **Scene summary** is novelist-usable prose (pit lane / first lap / radio / Shevchenko).
- **Key facts** are concrete continuity bullets from `llm_assessment.supported_facts` (aero package, who is where, recovery state).
- Retrieval actually ran: `index_status` + `retrieve_story_context` + **two** `search_story_memory` calls; LLM enabled (`gpt-5.6-terra`).
- Status/confidence communicate permission to proceed without tool-instruction noise in the fact list.

This is the pattern to amplify.

---

## 5. Weaknesses still present even in “good” briefs

1. **Temporal mud** — Live beat says first lap / pit lane, while precedents still lead with changing-room lace / “approaching Nordschleife on the road,” and open threads obsess over grass + motion sickness. Grok gets competing timelines.

2. **Thin emotional weave** — e.g. `embrace and Swedish declarations of love before she rolled out` is a stub, not a relational beat sheet. Facts outpace emotion.

3. **Static protocol tax** — Every brief reprints the full Qualified Autonomy block. Useful as standing canon; as every-turn payload it crowds turn-specific memory.

4. **Corpus underfed relative to quality goal** — Expand/verify hard-disabled in `preflight.ts` (`DISABLED TO FIX TIMEOUTS`). Default memory query budget still conservative (often 1; max 2 under `force_full_retrieval`).

5. **Index hygiene risk** — Recent retrieval notes show active Vector Store ID ≠ last local manifest store ID. Dangerous for expand/neighbor fidelity and “full corpus” confidence.

---

## 6. Failure modes that actively hurt Grok

Worse examples (mid / earlier):

- `preflight-streamlined-2026-07-12T22-05-13-428Z.md`
- `preflight-streamlined-2026-07-06T22-19-38-324Z.md`

Patterns:

| Failure | Effect on Grok |
|---------|----------------|
| Scene Summary = RAG coaching (“HIGH confidence context found from `project_source_files/…`… Call `search_story_memory`…”) | Model attends to tooling, not story |
| Key Facts = hard-flag strings (`PREFLIGHT_NOT_SUFFICIENT`) | No novelist-usable grounding |
| Precedents = raw historical dumps (myth tattoos, old intimacy extracts) with weak live relevance | Wrong era / wrong beat resurfaces |
| Open Threads include Guardian tool instructions | Novelist brief polluted with librarian SOP |
| Emotional context copied from wrong era (Luxembourg letters while race-suit beat is live) | Tone drift |

These are **unfiltered retrieval plumbing** problems, not arguments against depth.

---

## 7. Full-duplex dialogue auditing

Designed path:

- Input: `scarlett_previous_message`
- Auditor output: `grok_performance_correction` → “Director’s Correction” in the brief

Observed:

- Corrections appear in only a minority of recent reports (~12 / last 80 sampled).
- Saved full JSON often lacks a populated duplex input trail.
- When corrections *do* fire, they are valuable (e.g. don’t passively echo Benjamin’s recovery offer).

**Conclusion:** Duplex is implemented but mostly dormant. Restoring a reliable previous-Scarlett feed is high-ROI agent-team slack.

---

## 8. Timeout-era amputations still in code

Still present in `src/guardian/tools/preflight.ts` as of this review:

- Expand + verify blocks commented/disabled to fix timeouts
- `buildMemoryQueries` clamps fan-out (`.slice(0, 1)` / `.slice(0, 2)`)

RAG write path already background-reindexes; that was the main write-timeout class. Re-enable deeper retrieval with **explicit time budgets**, not permanent feature deletion.

---

## 9. Reframe: quality vs “simplify”

| Debug-era framing | Quality-first framing |
|-------------------|------------------------|
| Cut LLM / cut retrieval | Keep LLM **on**; feed it **more** corpus |
| Shorter brief = safer | Richer brief, but **novelist-shaped** |
| Disable expand/verify | Re-enable under timeout budgets |
| Bridge-first | MCP path primary while Grok 4.3 tool-calling holds |
| Cost as hard constraint | Cost secondary; timeouts are the hard constraint |

`compileGrokBrief` (soft cap ~6500 chars) is the right *delivery format*. Grow its **substance**; keep tool_calls / scores / file-path coaching out of what Grok reads.

---

## 10. Forward advice — ordered for quality ROI (revised 2026-07-14)

**Revision note:** Order updated after Fable’s quantitative audit (`guardian-report-quality-audit-2026-07.md`) and after P1 write-back / live-state work landed the same day. Original Cursor priorities remain valid; sequencing is tighter.

### Already landed (do not re-do as if missing)

- Meta strip / `compileGrokBrief` (Jul 13+ good briefs: no RAG meta in Scene Summary)
- Schema fields for weave + null `candidate_memory_update` — **live Jul 14: 6 supported_facts + scene_delta**
- `GUARDIAN_LLM_MAX_EVIDENCE_CHARS=32000`
- Expand + selective verify **re-enabled** with 10s budgets — **live Jul 14: expand ok (3 sections)**
- Search fan-out up to 2 triggered / 3 force_full
- Stage-default write-back + material gate (`memory-writeback.ts`) — live Jul 14 shows `memory_write: none` (no-op candidate); **stage E2E still unproven** until a material candidate appears
- Live `current-state` + `event-log` for Nürburgring Friday / out lap
- Duplex: CRITICAL tool description + missing log + hard_flag — **Grok still often omits the arg** (caller/habit)

### P0 — Remaining / next

1. ~~Confirm weave / 32k evidence / expand~~ **done** (keep watching).
2. **Duplex feed in practice** — Grok project skill / OOC checklist + optional non-optional param experiment.
3. **Search fan-out when AMG/track triggers fire** — Green Hell/radio/pit wall patterns added 2026-07-14.
4. **Precedent temporal recency** (still open).

### P1 — Weaver + temporal selectors

6. **Precedent recency / stale-beat demotion** (same-day earlier beat loses to live “Where We Are”).
7. **LLM weaves more of the brief** — emotional context, 1–3 precedent rationales, open threads; heuristics as fallback only.
8. **Remove Germany-arc-hardcoded fallback regexes** in scene/tone helpers (time bomb once story leaves Nordschleife).
9. **Prove staging E2E once** — stage → list → approve → reindex; confirm `memory_write` in a saved full JSON.
10. **Store vs manifest reconcile** on RAG side (61% mismatch in archive).
11. Confidence bands that discriminate (optional; score is mostly decorative today).

### P2 — Polish & instrumentation

12. Spend brief headroom (~3.9k of 6.5k): turn delta, third precedent, richer emotion; soft QA block.
13. Serendipity retune (4% is invisible).
14. Scorecard script over `guardian-reports/` (catch empty-weave windows in a day).
15. Connection reuse when fan-out grows.
16. Bridge / eval suite later.

---

## 11. Definition of done for a “great” helping-hand brief

For a typical IC turn, Grok should receive something that:

1. States **where/when/who/physical setup** in one tight scene paragraph.
2. Lists **3–6 must-ground facts** with no tool names or scores.
3. Offers **1–3 temporally relevant precedents** (not raw section dumps).
4. Names **live emotional stance** for Scarlett this beat (not a week-old letter digest unless still active).
5. Flags **only real continuity risks** (wrong location, contradicted history) — not creative RP actions.
6. Includes **duplex correction** when Scarlett’s last reply was passive, parroting, or trope-drifted; otherwise omits the section.
7. Mentions standing protocol briefly or by reference — without drowning the turn-specific memory.
8. Never tells Grok to “call search_story_memory” inside the novelist brief.
9. Carries a confidence number that actually varies (or omits a saturating 100% decoration).

---

## 12. Suggested immediate build sequence

```text
1. .env: GUARDIAN_LLM_MAX_EVIDENCE_CHARS=32000; watch weave; effort low→medium only if empty
2. Spot-check 5 preflights against §11 (facts ≥ 3, no meta, live beat)
3. preflight.ts: call expandBestContext + verifyExactClaims again with 8–10s budgets
4. preflight.ts: raise buildMemoryQueries clamps for triggered / force-full
5. server.ts: strengthen scarlett_previous_message tool description; log duplex missing
6. selectPrecedents: live-state recency demotion
7. llm-assessment + compile: emotional_context / precedent rationales / open_threads from auditor
8. One staged write E2E; confirm memory_write in full JSON
9. RAG: reconcile OPENAI_VECTOR_STORE_ID vs last-index.json vector_store_id
10. scripts: report scorecard over guardian-reports/
```

**Companion quantitative audit:** `docs/fable-5-roadmaps-audits/guardian-report-quality-audit-2026-07.md` (Fable — 142-report measurements). Prefer that file for numbers; this file for qualitative failure modes and framing.

---

## 13. Bottom line

Guardian is already past “does preflight arrive?” The next win is **agent-quality briefs**: deeper corpus use, LLM weaving, duplex critique, and ruthless filtering of retrieval meta — while keeping latency under Grok’s timeout ceiling. That matches the project’s original purpose better than further minimization.

The measured archive (Fable) adds: the empty-weave Jul 3–12 window was real; expand was amputated after the timeout cause was already fixed; staging has never appeared in saved reports yet; duplex/serendipity are starved, not missing from the codebase.

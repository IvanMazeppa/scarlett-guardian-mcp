# Fable 5 initial audit + ideas — 2026-07-18

**Scope:** Light mid-check WP-5.1–5.5 (dramaturg half of Phase 5), forward-path freeze, operator ideas intake.  
**Not in scope:** Phases 0–4 re-audit (live-proven), implementation.  
**Evidence read:** WP evidence docs 5.1–5.5, `dramaturg.ts`, `serendipity-weaver.ts` (agenda routing), `compile-grok-brief.ts` (momentum/intention/echo render), latest eval scorecard, WP-5.1 ops notes.

---

## Operator ideas (decisions)

Pre-read from `phase-6-immersion-engine-ideas-2026-07.md` (operator's Media Injector concepts). Table stays open for live additions this session.

| Idea | Disposition | Ticket hint | Phase |
|------|-------------|-------------|-------|
| 2.1 Dynamic BGM injection (`[BGM:]` tags → hidden iframe) | **Park — Phase 6/7**, new pillar "Media Injector" (userscript module) | Instruction-layer tag protocol + scraper hides tag; eval meta-filters must whitelist `[BGM:` so it's not flagged as pollution | 7+ |
| 2.2 Cinematic image gen (shadow worker / local LoRA) | **Park — Phase 7+**; highest fragility (hidden-tab scraping) | Guardian-side trigger already exists free: `scene_transition` field. Browser half is the hard part; prefer Option B (local SD) for consistency + no DOM races | 7+ |
| 2.3 Custom TTS (Scarlett voice) | **Park**; pure userscript module, zero Guardian change | ElevenLabs/xAI voice behind a play button first; auto-play later | 7+ |
| 2.4 World Weaver soundscapes (`ambient_audio` state) | **Adopt-after-5.9 (cheap enabler only)**: expose already-computed `scene_mode` (+ optional ambient hint) on the report JSON | 1 ticket: `scene_mode` onto `GuardianReport` + telemetry event; Media Injector consumes later with zero rework | enabler now, module 7+ |
| 2.5 Diegetic telemetry widget (AMG pit-wall overlay) | **Park**; data already exists via `/telemetry/api/*` + report fields | Userscript module reads what's already served | 7+ |

**Design-law check on all five:** none violate pressure-not-outcomes or the hot-path law — everything is presentation-layer on data Guardian already computes. The one architectural rule to set now: **the Media Injector consumes existing report/telemetry fields; it never gets its own preflight or LLM call.**

---

## 5.1–5.5 light audit

| WP | Verdict | Note |
|----|---------|------|
| 5.1 arc_plan role | **pass** | Rank proof solid (0.902 arc_plan above current_state on the target query). Ops footgun logged honestly: accidental full index created orphan store `vs_6a5af4…`; manifest now only partial. Feeds WP-7.1 — see risks. |
| 5.2 parse + mechanical momentum | **pass** | LLM-free confirmed; momentum renders in brief + auditor (LIVE BEAT → STORY MOMENTUM → evidence order per D7). Trivial dead loop at `dramaturg.ts` ~279 (cosmetic only). |
| 5.3 LLM pass + cache | **pass** | Hot-path law intact: `resolveHotPathDramaturg` never touches network; refresh is fire-and-forget with in-flight coalescing; eval-mode skips schedule. Cache-preference + trigger logic matches D7 §3.1. |
| 5.4 agendas → weaver | **pass** (one soft risk) | Routing law correct in code: deferred queue → agenda (no drought roll, cooldown respected) → catalog. Over-tier defers; family stealth note hardcoded into agenda `grokNote`. Soft risk below. |
| 5.5 intention + echo | **pass** | Echo budget enforced at render time (`enforceResonanceEchoBudget` in the brief compiler — code, not prompt); intention outcome-language cleaned; both omit when null. |

### Checklist answers

- **Pressure-not-outcomes structural?** Mostly yes — dramaturg pass schema has only pressure-typed fields, and momentum falls back to the mechanical line if outcome language detected. **One drift to note:** the outcome guard is a narrow regex (`she will win|crash|succeed`) applied to `momentum_line` only; per-beat `pressure` strings from the LLM are accepted unfiltered (the code comments acknowledge this). Free-text pressure could smuggle an outcome past the guard. Not a blocker — the prompt forbids it and the fallback exists — but it should become an eval golden (`dramaturg/` category: outcome-language mutant fails).
- **Hot path latency law (5.3)?** Intact. One structured LLM call per turn; dramaturg refresh serves the *next* turn.
- **Momentum useful or noise?** Structurally sound (Beat 3/4 + remaining + pressure, ≤520 chars in brief). Verdict on usefulness belongs to live play — operator should say after the track-day finish whether Grok visibly advances the day from it.
- **Agenda routing safe?** Yes, with a durability caveat: deferred **agenda** events live in an in-process map; a Guardian restart drops them, and reconstruction only works if the same intersection recurs. Acceptable degradation (worst case = event silently not surfacing), but worth a one-line note in 5.9's staging work if deferral matters more later.
- **Intention/echo scarcity?** Enforced in code, not just prompt. Scorecard helper exists; the ≤0.5/turn average needs a live-session sample to confirm.
- **Dual-repo contract?** Clean on roles/index (RAG-side) vs brief/auditor (Guardian-side). **One accepted exception to record:** Guardian reads `arc-plans/` and `npc-agendas.md` directly from the sibling repo's disk (`loadActiveArcPlan`, `loadNpcAgendasMarkdown`) rather than via RAG tools. Fine on a single host; becomes a break point if the repos ever separate. Ledger note, no action.
- **Silent drift from D7/D9?** Only the two items above (pressure-string guard narrowness; disk-read exception). Both recorded here.

---

## Risks before 5.6

1. **PLAN_DRIFT on gt-014 is live in the latest scorecard** (`expand_context_around_chunk` args not in cassette — retrieval plan changed since recording). Warn-level per D2, but 5.7's exact-section NPC fetch will change the retrieval plan *again* and multiply this noise. **Re-curate or deliberately amend gt-014 (and any siblings) before starting 5.6/5.7**, so plan-drift warnings stay meaningful signals.
2. **Store/manifest hygiene after the WP-5.1 orphan-store accident.** 5.6 requires reindexing `secondary-characters-bible.md` + `family-dynamics.md` into the **live** store. Use `reindex-one-file.ts` against `.env` store `vs_6a2d…` only; never a full index without `--reuse`. The full reconciliation stays WP-7.1 — but the footgun is armed *now*.
3. **Ops, minor:** scripts must run from `scarlett-guardian-mcp/` — a `wp25-staging-ceremony.ts` invocation from the workspace root failed with MODULE_NOT_FOUND (terminal 15). Path habit, not a defect.

---

## Forward path — confirmed

```text
5.6 npc_canon ranking + registry tail     ← next executor session
5.7 scene-roster + Present: + presentCast   (+ re-record goldens if plan drifts — expected)
5.8 Scene Cast brief block + duplex ensemble clause
5.9 npc_state_changes → staging (knowledge = human-always)
5.10 Affalterbach live ensemble stress test (ops/story gate)
→ Phase 6 arc-close ceremony when the Germany arc closes
```

No reordering needed. One amendment: fold "re-curate affected goldens" into 5.7's acceptance explicitly (it changes the retrieval plan by design).

## Recommended next executor session

**go 5.6** — `npc_canon` role (priority 78) on both NPC files + registry tail-fields on top ~8 NPCs; acceptance: NPC chunks no longer retrieve at `supporting_backstory` tier (rank proof like WP-5.1's), reindex via `reindex-one-file.ts` against the live store only, `npm test && eval:fast` green. Precondition: risk #1 (gt-014 golden) resolved first — 15-minute curation ticket.

## Explicit non-actions

- No re-audit of duplex / write-back / eval rails (Phase 4 L3 green stands).
- No rework of the 5.3 outcome guard now — becomes an eval golden, not a code churn.
- No Media Injector implementation — concepts parked with dispositions above; only the `scene_mode` report-field enabler is ticket-sized before Phase 7.
- Master roadmap §13 ledger should be updated to mark 5.1–5.5 done with evidence links (docs-only edit, operator or next session).

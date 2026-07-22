# Fable 5 — Progress Audit: Phases 1–5.9 + Nordschleife Live Test — 2026-07-20

**Scope:** Ledger verification, measured analysis of the live-test window (Jul 16–19, 18 saved preflights), telemetry/dashboard inspection, review of Gemini's implementation report, and pre-flight checks for the new thread.  
**Companions:** `roadmap-implementation-report-2026-07-20.md` (Gemini), `master-roadmap-2026-07.md` §13, WP evidence docs 5.6–5.9.

---

## 1. Ledger verification — Phase 5 code complete

The §13 ledger is accurate against the evidence docs: **WP 0.1 through 5.9 are done** (with 3.3 partial-stub and 3.5 deferred, both consciously). Remaining: 4.5 burn-in (ops, ongoing), 5.10 Affalterbach (now **Monday** in-story per the revised itinerary), Phases 6–7. The roadmap's execution discipline held: every WP has an evidence doc, preserve branch, and green gate. Eight days from baseline tag to a working ensemble stack is the strongest possible validation of the small-sequential-verified ticket law.

## 2. The live window, measured (18 full reports, Jul 16–19)

| Metric | Value | Reading |
|--------|-------|---------|
| LLM facts per turn | 5–6, every report | **Empty-weave class extinct** (was 45% of LLM-enabled reports in the June–July archive) |
| Scene delta present | 18/18 | Auditor weaving reliably |
| Duplex via bridge | 11/16 post-fix (69%) | Works when healthy — but see §3 |
| Director's Corrections fired | 5/18 (28%) | vs 8% in the old archive — **duplex is earning its keep** |
| `do_not_proceed` | 1 | **The gate gated, correctly** — see below |
| Story Momentum present | 9/9 since WP-5.2 landed | Beat 3 tracked accurately across the whole set piece |
| Scarlett's Intention present | 10/10 since WP-5.5 | Concrete, initiating, no outcome language observed |
| Resonance echo | 0/18 | Scarcity working; arguably over-scarce (watch, don't tune yet) |
| Serendipity fired | 8/18 (44%) | Above the 20–35% design band — includes agenda-driven events, so acceptable; watch |
| `memory_write` recorded | 18/18 | The observability spine holds (was 0/142 in the old archive) |
| Scene roster populated | Every report since WP-5.7 | Shevchenko/AMG engineers active, crowd backgrounded, cap respected |

**The headline moment:** `preflight-full-2026-07-17T23-48-08` — confidence 100 but **`do_not_proceed`**, with a precise correction: *"Scarlett's prior reply improperly reset the live track-test scene into an invented crash-and-recovery paddock scenario and made her wholly reactive."* That is the first meaningful block in the entire archive, it caught a real scene reset, and it required duplex + LIVE BEAT + the auditor working together. The audit's old complaint — "a gate that never gates" — is closed. Note it fired *despite* the saturated confidence score, confirming the deterministic score is now vestigial as a gate (the LLM block path is doing the work).

**Latency:** totals 18–28 s; `retrieve_story_context` dominates (~10 s), auditor 5–15 s. Within Grok's timeout with margin. The single biggest future win remains RAG connection reuse (Phase 7 backlog), not feature trimming.

## 3. Frictions confirmed (Gemini's report is accurate; two additions)

1. **Bridge tail decay — confirmed and worse than it looks.** The last 5 reports of Jul 19: 4/5 `duplex_source: "absent"`. Session-start works; sessions *end* with the bridge degraded (crash wipe, OOC-ack scrapes). The window's 69% bridge rate is well short of the ≥90% acceptance target from D6. Gemini's two fixes (min-length/structure filter on scrape; localStorage cross-thread handshake) are correct and **WP-3.5 should be un-deferred to next executor session** — it now has live evidence instead of speculative value.
2. **The OOC-ack poisoning risk is real but bounded:** `/duplex-cache` zod requires only `min(20)` chars, so a 55-char "Understood" acknowledgment passes validation and can corrupt the next correction. Cheap server-side hardening belongs in the same WP: raise the floor (e.g. 200 chars) or reject content without sentence structure — belt to the userscript's braces.
3. **NEW — eval events contaminate live telemetry.** Two events on Jul 19 (22:58, 23:06 — coinciding with the WP-5.9 eval runs) logged `total: 1ms, duplex: caller, facts: 2`. They drag the dashboard's `p50_total_ms` to a meaningless **1 ms** and inflate duplex/facts stats. Events need a `source: live | eval | backfill` tag and the summary API needs to default to live-only. Small ticket, large trust dividend.
4. **Manual-edit indexing gap — agreed with a nuance.** `get_live_story_state` reads disk, so LIVE BEAT is *always* fresh after a manual `current-state.md` edit; only vector retrieval staleness is at issue. A debounced file-watcher on `project_source_files/` firing background reindex is the right Phase 7 shape. Not urgent enough to jump the queue.

## 4. Dashboard usability upgrades (for WP-7.5, in value order)

1. **Source filter** (live/eval/backfill) — prerequisite for every other number being trustworthy (§3.3).
2. **Duplex timeline strip** — per-turn `bridge_cache`/`caller`/`absent` chips for the current session, so bridge decay is visible *while playing* instead of in a post-mortem.
3. **Correction viewer** — the correction text on click. The Jul 17 catch is the single most persuasive artifact the system has produced; today it's buried in JSON.
4. **Staged-updates panel with approve/reject** (Gemini's suggestion, endorsed) — `review:staged` as a click UI. Makes the Phase 6 ceremony a one-screen sitting. Two staged `current-state` pendings from Jul 15–16 are still sitting in the queue — clear them before the new thread.
5. Momentum/beat + serendipity tier panels once telemetry carries those fields (already planned).

## 5. Answers to Gemini's roadmap suggestions

| Suggestion | Verdict |
|------------|---------|
| Smart scraping + cross-thread handshake | **Adopt now** — un-defer WP-3.5, one session, includes server-side floor (§3.2) |
| File-watcher auto-indexing | **Adopt in Phase 7** — correct fix, wrong urgency; LIVE BEAT already immune |
| Dashboard staging UI | **Adopt as WP-7.5 headline** — with the §4 list above |

---

## 6. New-thread opener — review

The structure is right (OOC preflight instruction, verbatim IC block, `force_full_retrieval: true`, seamless-continuation `recent_context`). Two hazards and one nit before sending:

1. **`current-state.md` is one beat behind the opener — fix before sending.** The live file still reads "post-shakedown debrief, pit box" with no 6:54.2 anywhere, while the opener asserts the historic lap is run and they're in the changing room. The auditor's standing rule is *"if evidence conflicts with the LIVE BEAT, the LIVE BEAT wins"* — you would be starting the new thread with Guardian's ground truth contradicting your opening premise, and the recency layer treating your live scene as a potential reset. **Edit `current-state.md` first** (location: private paddock changing room; time: Friday late afternoon post-6:54.2; Recent Key Events: the lap + the catch at the car), then `npm run index:changed`. Disk edit alone fixes LIVE BEAT; the reindex fixes retrieval.
2. **Changing-room supersession trap.** The *morning* changing-room intimacy is in the superseded-cues list, and your new scene is in the changing room again. The escape hatch (user message referencing the location halves demotion) plus a fresh LIVE BEAT pointing at the changing room should resolve it — but this is exactly the temporal-mud shape the system demotes, so fix #1 is what prevents your opener from fighting the recency layer.
3. **Clear or re-seed the duplex cache.** The last bridge scrape of the old thread may be an OOC acknowledgment (Gemini's confirmed failure mode). Before the first turn: either `DELETE /duplex-cache`, or manually POST the final real Scarlett RP block. Absent duplex on turn 1 is fine (no prior turn to correct); a *poisoned* duplex is not.
4. Nit: the GM directive's "Let the adrenaline crash and the private intimacy take over" edges from pressure toward scripting Scarlett's response. As operator you hold human-GM privilege — but "she is exhausted and the suit needs to come off; where it goes is hers" is the same instruction in the house style, and it gives Grok's Scarlett the first move rather than a stage direction.
5. Arc-plan hygiene, same sitting: arc-09's Beat 4 still points at a same-evening "Affalterbach runway" that the revised itinerary (hotel recovery weekend → Autobahn → **Monday** HQ) has overtaken. Amend Beat 4 or mark arc-09 complete and draft arc-10 — otherwise the momentum line will apply gentle pressure toward a departure that no longer exists.

---

## 7. Position and next moves

Phase 5 is code-complete and live-validated on the best set piece the archive has recorded. The system caught a real continuity failure, tracked beats across a multi-day session, kept the ensemble peripheral without dilution, and wrote its own observability trail. Recommended order:

1. **Now (operator, 15 min):** current-state edit + reindex, arc-09 Beat 4 amendment, duplex cache clear, clear the two staged pendings → send the opener.
2. **Next executor session:** un-deferred WP-3.5 (smart scrape + handshake + server floor) — highest live-pain-per-ticket.
3. **Then:** telemetry source-tagging (small), dashboard staging UI (WP-7.5 pulled forward if the ceremony nears).
4. **Story-scheduled:** 5.10 becomes the Monday Affalterbach presentation; the Germany arc close (Phase 6 ceremony) follows the Gulfstream home.

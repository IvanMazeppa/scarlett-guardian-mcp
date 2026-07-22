# Fable 5 — Response to Sol's Phase 5 Narrative Architecture Review — 2026-07-20

**In answer to:** `phase-5-narrative-architecture-review-2026-07-20.md` (gpt-sol)  
**Verification:** Both load-bearing technical claims were checked against source before adjudication (citations below). This document defines the remediation tickets and dispositions; the master roadmap ledger (§13) has been amended to match.

---

## 1. Verification of Sol's claims

| Claim | Verdict | Evidence |
|-------|---------|----------|
| WP-5.7 exact-section expand never resolves | **Confirmed — real defect** | `scene-roster.ts` `sectionNeedle: "Mr Shevchenko"` (short); manifest `findSection` (`rag-memory-mcp/src/manifest-index.ts` ~177) matches exact or normalized-**full** labels only; `splitMarkdownSections` (`markdown.ts` ~53) stores full ancestry (`"… > Mr Shevchenko"`). Guardian's catch swallows the miss (`preflight.ts` ~1365 `catch { /* optional */ }`) — invisible soft-fail every turn |
| Eval runs mutate live runtime state | **Confirmed — worse than telemetry** | `preflight.ts`: `runSerendipityTurn(...)` called without `persist: false` and `resolveHotPathDramaturg({ bumpTurn: true })` unconditionally — hermetic eval advances live serendipity cooldowns/drought and the dramaturg turn counter. (Dramaturg *network* refresh is correctly skipped via `skipForEval`; the *state writes* are not) |
| Telemetry contaminated by eval | Confirmed | Already flagged in my Nordschleife audit §3.3 (the 1 ms events); Sol correctly widens it to sidecar state |
| WP-5.8 lacks full ensemble golden layer | Confirmed | Unit tests only; no 4-NPC + crowd + dilution-pair goldens exist |
| WP-5.9 hermetic-only proof | Confirmed | `wp-5.9-npc-state-changes-evidence-2026-07-19.md` says so itself; live persistence proof deferred to 5.10 — correct plan, now explicit in 5.10 acceptance |
| Durable canon trails the 6:54.2 outcome | Confirmed | `current-state.md` still at post-shakedown pit box (itinerary updated, headline result absent) — already item #1 in my audit's pre-thread checklist |

Sol's qualification stands: **"Phase 5 code-complete" is accurate; "Phase 5 accepted" is not.** The ledger now reflects this (5.7 marked `done — defect open`).

## 2. Remediation work packages (pre-Affalterbach, in order)

These follow D10 sizing. R1 was already recommended in my Nordschleife audit; R2–R4 are new from Sol's review.

| WP | Ticket | Files | Acceptance |
|----|--------|-------|-----------|
| **R1** (= un-deferred 3.5) | Duplex integrity: scraper ignores non-narrative bubbles (< ~200 chars, no sentence structure), selects last *substantial* RP block; GM-storage snapshot seeds new threads; server-side content floor on `/duplex-cache` | `guardian-browser-bridge.user.js`; `server.ts` | ≥90% valid duplex after first turn; short ack cannot poison a correction; thread restart needs no manual ritual |
| **R2** | Exact-section contract repair. **Chosen design: make `findSection` needle-aware server-side** — after exact + normalized-full match, fall back to unique last-segment/suffix match on the ancestry-stripped label; ambiguous needle returns undefined (never guesses). Guardian side: log failed NPC expands as a `retrieval_notes` warning instead of silent catch | RAG `manifest-index.ts` + integration test against the real manifest; Guardian `preflight.ts` (~5 lines) | Shevchenko/Lynn/Karin/AMG-engineer registry sections resolve from real manifest; ambiguous needles refuse; failed expands visible in report |
| **R3** | Live/eval/backfill isolation: `source` tag on telemetry events + summary API defaults to live-only; eval runs use `persist: false` serendipity + `bumpTurn: false` (or temp-dir sidecars via existing `rootDir` params) | `telemetry.ts`, `telemetry-aggregate.ts`, `preflight.ts`, `evals/runner.ts` | Running `eval:fast` twice changes zero bytes under `.guardian/` (except eval's own temp dir); dashboard p50 excludes eval events |
| **R4** | Ensemble + negative-space goldens (Sol's promised acceptance layer + idea #7): 4-active + crowd fixture; family stealth ⚠ on every applicable turn; dilution correction pair (passive fires / Scarlett-led doesn't); Service-pressure contrastive cases (indirect pressure, invitation to disclose, refusal-stays-valid, no invented operational detail) | `evals/golden/ensemble/**`, `evals/golden/negative-space/**` (Gemini authors expectations) | All green on current build before Affalterbach; mutants (stealth ⚠ dropped, forced disclosure) fail |

**WP-5.10 acceptance is amended** to include Sol's additions: one played NPC disposition change travels through staging and appears in a later live brief; the false-correction side of the dilution pair verified live; R2's registry evidence visibly reaching the auditor.

## 3. Character-first proposals — dispositions

| # | Proposal | Disposition | Reasoning |
|---|----------|-------------|-----------|
| 1 | Character Agency Observatory | **Adopt — Phase 6.5, offline-only** | Right instrument at the right layer: classifies *played* turns (intention vs Benjamin's prompt vs actual reply) from the archive; no live prompt change until a baseline exists. Natural sibling of the eval harness; scorecard gains an agency-mix panel. Authority boundary as stated: observes, never decides |
| 2 | Semantic Open-Fork Validator | **Adopt — as advisory judge, not a gate** | Correct diagnosis (my 5.1–5.5 audit flagged the same narrow regex). L3-style LLM judge asking "do ≥2 materially different Scarlett responses remain valid?" over pressure artifacts. Advisory until calibrated against operator labels (same protocol as D2's judge) — a false-positive *gate* on momentum lines would be worse than the disease |
| 3 | Choice-Respecting Thread Ledger | **Adopt — the strongest new idea; design in Phase 6.5, integrate with Living GM** | Genuinely new state the system lacks: `offered/engaged/declined/deferred/expired` per pressure hook, declining never advances, resurfacing must change form. Natural home: extend the serendipity state file's deferral machinery (already has queue + cooldowns) rather than a new sidecar; Living GM cards and NPC agenda events both register hooks in it. "Refusal changes the world" becomes code |
| 4 | Scarlett Desire Threads | **Park — build-only-if, exactly as Sol gates it** | Correct conditionality: needs the Observatory's baseline first to prove intention jitter/amnesia exists. Revisit after one Observatory report |
| 5 | NPC Beliefs vs Knowledge | **Park until Affalterbach proves need** | Sol's own build-only-if gate is right. The registry's disposition/wants fields can carry "suspects…" phrasing in the meantime without schema work |
| 6 | Canon Promotion Receipts | **Adopt-as-formalization — Phase 6** | ~80% exists (staged updates carry citations; review CLI records approve/reject). Formalize as a receipt line in the staged-update JSON + surface in the future dashboard staging panel. Cheap, and the Living GM inherits it for free |
| 7 | Negative-space / identity-pressure goldens | **Adopt now — folded into R4** | Cheapest high-value item in the review; protects the sparseness rule and refusal-validity before any GM work begins |
| 8 | Aftermath Affordances | **Adopt — Living GM card schema amendment** | `cost_echoes` + `recovery_affordances` added to the storyline card schema (affordances, not required scenes). Serves the 70/30 duty cycle mechanically. Done in the feasibility doc |
| 9 | Ensemble quality rubric | **Adopt — GM-0 seed pack requirement** | Orbit taxonomy (professional peer, queer community, chosen family, Swedish past-life, motorsport ally, non-Benjamin-mediated) + per-NPC bar (independent want, Scarlett-specific reason, knowledge boundary, offstage life, no permanence requirement) folded into the ensemble-gap seed. Done in the feasibility doc |

## 4. Living GM and parked ideas

Sol's recommendation (offline cold read after 5.10, apply nothing, one low-risk card max) **matches the existing O-1/O-2 protocol** in `fable5-living-gm-feasibility-2026-07-18.md` — no change needed, and the concordance of two independent reviews is itself useful evidence the protocol is right. All six of Sol's parked ideas (every-turn GM, offstage simulation, larger rosters, immediate volatile auto-approve, generated Service dossier, outcome-tree optimization, learned preference optimization) were already parked or never proposed; the last two are newly articulated and worth keeping in the parking note — **outcome-tree optimization and approval-trained preference tuning are now explicitly rejected**, with Sol's reasoning adopted verbatim (hidden outcome optimization biases pressure toward selected resolutions; recent approvals reflect mood, not character truth).

## 5. Sequence (supersedes nothing; slots into the existing plan)

```text
0. Operator: restore live truth (my audit §6 checklist — unchanged, still first)
1. WP-R1  duplex integrity            (1 session)
2. WP-R2  exact-section repair        (1 session, RAG-side + Guardian logging)
3. WP-R3  live/eval isolation         (1 session)
4. WP-R4  ensemble + negative-space goldens  (1 session, Gemini expectations)
5. WP-5.10 Affalterbach — amended acceptance (story-scheduled, Monday)
6. Phase 6 ceremony at Germany arc close
7. Phase 6.5: Agency Observatory → Thread Ledger design → GM-0 seeds → O-1 cold read
```

## 6. One-line summary

**Sol's review survives verification: two real defects (silent NPC-expand failure, eval runs mutating live sidecar state) become R2/R3 tickets alongside the already-planned duplex hardening and a real ensemble-golden layer — all four before Affalterbach — while the strongest character-first ideas (agency observation, fork validation, a ledger that remembers Scarlett's refusals) are adopted as the offline Phase 6.5 layer, and the Living GM protocol stands unchanged because two independent reviews converged on it.**

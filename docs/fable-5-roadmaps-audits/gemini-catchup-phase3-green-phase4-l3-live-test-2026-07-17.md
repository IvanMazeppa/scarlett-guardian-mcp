# Gemini catch-up — Phase 3 GREEN + Phase 4 (write-back / serendipity / L3) + operator live-test brief

**Date:** 2026-07-17  
**Audience:** Gemini 3.1 Pro (session co-pilot for **operator live testing** + optional prose assist / review)  
**Author:** Grok Build (implementation lead)  
**Operator:** human — Grok.com RP, Tampermonkey, approvals, dashboard observation  

**Prior Gemini pack (do not re-derive):**  
`gemini-catchup-phase2-phase3-duplex-2026-07-16.md` (through WP-3.2; 3.4 was still “next ops”)

This document **replaces that status for Phase 3–4** and defines the **exact live test** the operator will run with your help.

---

## 0. Roles (unchanged)

| Agent | Role |
|-------|------|
| **Fable 5** | Architecture, D1–D11, master roadmap |
| **Grok Build** | Sequential WP implementation, git, preserve branches, evidence |
| **Gemini 3.1 Pro** | Help operator execute live test; draft Benjamin IC lines if asked; sanity-check reports; **do not re-implement** shipped WPs unless asked for review notes |
| **Operator** | Grok.com thread, TM bridge, dashboard, staged-queue decisions |

**Branch (both repos):** `feature/master-roadmap-v1`  
**Master index:** `docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md`

| Repo | Tip (approx, 2026-07-17) | Through |
|------|--------------------------|---------|
| `scarlett-guardian-mcp` | `7d7d1c7` | WP-4.8 + dotenv fix for `eval:llm` |
| `rag-memory-mcp` | `f8c9274` | WP-2.7 (Phase 4 is mostly Guardian-side) |

Preserve examples: `preserve/roadmap-wp34-…` (docs), `preserve/roadmap-wp41-…` … `preserve/roadmap-wp48-eval-l3-20260717`.

---

## 1. What changed since last Gemini interaction

### 1.1 Phase 3 duplex — **GREEN** (was incomplete at last catch-up)

| WP | Status | Notes for Gemini |
|----|--------|------------------|
| **3.1** | done | `DuplexCache`; caller wins; `duplex_source` on report |
| **3.2** | done | TM bridge v2 **shadow** default |
| **3.3** | partial / stub | Calibrate optional; not blocking |
| **3.4** | **done** | Live proof: `duplex_source: "bridge_cache"` without OOC paste of Scarlett’s prior message. Evidence: `wp-3.4-live-bridge-cache-green-2026-07-17.md` |
| **3.5** | deferred | Multi-thread / 90s polish — optional |

**Critical fix after first 3.4 fail:** empty `thread_key` multi-entry cache used to pick poorly → **newest-wins** for fresh empty-key entries + `DELETE /duplex-cache` (`e05a08c`). Postmortem for Gemini: `wp-3.4-duplex-absent-postmortem-and-retest-2026-07-17.md`.

### 1.2 Phase 4 — write-back lifecycle + living world — **largely done**

| WP | Status | What landed |
|----|--------|-------------|
| **4.1** | done | Auditor `scene_transition`; `memory_write.action=stage_transition` |
| **4.2** | done | `state-rewrite.ts` generate/validate + protected-facts; transitions held for review by default |
| **4.3** | done | Beat path dual-stage (event-log **+** current-state); `memory_write` **always** on report |
| **4.4** | done | `npm run review:staged` CLI |
| **4.5** | pending | Ops burn-in for auto-approve transitions (do **not** flip casually this session) |
| **4.6** | done | Serendipity 2.0 weaver: tiers, modes, deferral, Ryan arc, drought, state file |
| **4.7** | done | Auditor `serendipity_weave` + brief **World Weaver** prefers weave |
| **4.8** | done | L3 `npm run eval:llm`; duplex pair goldens; inventory **16 → 31** toward ~50 |

### 1.3 Config / ops fixes (same day as L3)

| Issue | Resolution |
|-------|------------|
| `OPENAI_API_KEY=OPENAI_API_KEY` placeholder | Real `sk-…` key activated in **both** Guardian + RAG `.env` |
| RAG key commented `# OPENAI_API_KEY=…` | Uncommented / single active line |
| `eval:llm` skipped key | `import "dotenv/config"` in eval runner (preflight only type-imports config) |
| RAG search model | Operator set `OPENAI_SEARCH_MODEL=gpt-5.6-luna` (nano-class). Guardian auditor remains **`gpt-5.6-terra`**. Acceptable split. |
| Servers | Operator **restarted both** after key fix |

### 1.4 Hermetic / live eval status

| Command | Status |
|---------|--------|
| `npm test` | green (incl. `eval-l3` unit tests) |
| `npm run eval:fast` | **31/31** |
| `npm run eval:llm -- --id gt-041-…,gt-042-… --trials 1` | **2/2** after key+dotenv fix; duplex correction precision/recall **1.00** |

### 1.5 Explicitly **not** done (don’t invent as shipped)

- WP-4.5 transition auto-approve burn-in  
- Full golden set ~50 (31 with many `expectations-minimal` for growth)  
- Phase 5 dramaturg / NPC  
- Dashboard UX revamp (legend/tooltips) — **backlog under WP-7.5**  
- Remaining staged `current-state` reviews (Jul 15/16 pendings; Jun 23 junk already rejected earlier)

---

## 2. Current story canon anchors (for prose assist)

Use **live** state; do not drift to Luxembourg villa / changing-room as “now” unless the operator advances there in-session.

- **When:** Friday, Mid/Late October 2026, midday → afternoon  
- **Where:** Nürburgring Nordschleife, Industry Pool private test day  
- **Scarlett:** In **Black Panther on track**; **out lap / shakedown complete**; may push thermal / cooling next  
- **Benjamin:** **Pit wall / pit lane**, private radio open  
- **Comms:** Dual — team open channel + private to Benjamin  
- **Prior same-day texture:** Eifel motion-sickness care; paddock locked-room intimacy + aftercare; public send-off; aero validating (front canards bite, rear diffuser stability, cooling extraction still to stress)  
- **Later open:** Affalterbach presentation after track day  

**Tone:** Technical precision + private-channel warmth; **Qualified Autonomy** (Scarlett owns radio translation; no passive mirroring).

---

## 3. Operator live-test definition (PRIMARY ASK)

### 3.1 Purpose

Prove the **daily path** after Phase 3–4 land + API key fix:

1. Live terra auditor + real key  
2. Shadow duplex (`bridge_cache`) without OOC paste  
3. Telemetry dashboard rows for live preflights  
4. Optional: correction fire / withhold  
5. Material beat → staging (`memory_write`)  
6. Optional: serendipity / World Weaver in a cool-down beat  

### 3.2 Preconditions (operator + Gemini checklist)

- [ ] Guardian `:8790` health 200; RAG `:8787` health 200 (restarted post-key)  
- [ ] TM **Scarlett Guardian Bridge v2** enabled, mode **shadow**, Grok tab refreshed after any script change  
- [ ] Older bridge / DOM probe scripts **disabled**  
- [ ] Dashboard open: `http://127.0.0.1:8790/dashboard`  
- [ ] Optional: `curl -sS http://127.0.0.1:8790/duplex-cache` before start (note `chars` / `hash_prefix`)  
- [ ] If cache looks polluted: TM **clear duplex-cache** or `DELETE /duplex-cache`  
- [ ] `GUARDIAN_MEMORY_WRITE_MODE=stage` (default path) — expect **staging**, not silent canon rewrite  
- [ ] Do **not** enable transition auto-approve mid-test  

### 3.3 Thread choice (Grok.com) — Grok Build recommendation

| Option | Recommendation |
|--------|----------------|
| **Continue current thread** | **Preferred** if operator has not seen classic Grok 4.3 tool-use collapse, and scene continuity is already Nordschleife track-day. Operator reports improvement with TM + formatting; recent days stable. |
| **New thread** | Only if tool-use is already glitching, URL/thread_key is messy multi-tab, or canon is hopelessly desynced. Cost: re-establish scene in 1–2 turns + re-arm bridge on new URL. |

**Decision default:** **continue current thread**. Start a new one only if mid-test Grok MCP tools flake or duplex repeatedly posts wrong-tab content.

### 3.4 Turn budget

**6 Benjamin → Scarlett cycles** (preflight each Benjamin turn).  
**Minimum viable:** turns **1–3 + 5**.  
**High-value optional:** **4** (correction), **6** (serendipity ambient).

---

## 4. Turn-by-turn protocol (exact)

### Global rules (every turn)

1. Operator runs **Guardian preflight** (MCP) before / as part of Benjamin’s drafting workflow as usual.  
2. **Do not** paste Scarlett’s previous message into OOC for duplex unless testing `caller` deliberately.  
3. After Scarlett finishes streaming: wait until stream fully settles (~2s quiet); confirm TM pill / `curl` duplex-cache updates when testing bridge.  
4. After each preflight: refresh dashboard; note recent table columns **Duplex / Corr / Write / Facts / ms**.  
5. Gemini may draft Benjamin IC; keep lines **in-character**, dual-channel aware, not tool-dialect.

### Turn 1 — Baseline continuity + live LLM

| | |
|--|--|
| **Intent** | Prove key + terra + retrieval path; establish telemetry baseline |
| **Benjamin** | Normal IC: pit-wall private radio reply after out lap; ask / acknowledge thermal plan; short, present |
| **Scarlett** | Full IC reply (stream complete) |
| **Pass** | Preflight succeeds; `supported_facts` non-empty; brief free of tool names; dashboard **live** event appears; meta pollution not spiking |
| **Fail signals** | 401 / empty facts / `LLM_GUARDIAN_ERROR`; brief contains `search_story_memory` / `rank_score` / etc. |

### Turn 2 — Duplex `bridge_cache` (core Phase 3 regression)

| | |
|--|--|
| **Intent** | Prove shadow path still green post-restart |
| **Benjamin** | Next IC beat **without** pasting Scarlett prior into preflight |
| **Before preflight** | Cache should show fresh Scarlett-sized `chars` from turn 1 reply |
| **Pass** | Report `duplex_source: "bridge_cache"` (or telemetry Duplex = `bridge_cache`) |
| **Fail** | `absent` → re-scrape / clear / check TM mode; do not “fix” by pasting unless diagnosing |

### Turn 3 — Strong prior → correction should **not** fire

| | |
|--|--|
| **Intent** | Precision side of duplex correction |
| **Setup** | Turn 1–2 Scarlett should be autonomous/technical on private radio |
| **Benjamin** | Continue IC; acknowledge her radio work; give one concrete request (e.g. cooling watch) |
| **Pass** | Dashboard **Corr = no**; `grok_performance_correction` null |
| **Note** | If Scarlett was already passive, skip to turn 4 first |

### Turn 4 — Weak prior → correction **should** fire (optional)

| | |
|--|--|
| **Intent** | Recall side of duplex correction (mirrors L3 pair `gt-041` / `gt-042`) |
| **Setup** | Prefer a natural weak Scarlett reply (empty agreement, pure mirror). If she stays strong, Gemini may help craft Benjamin pressure that **invites** passivity without breaking RP—or operator notes “strong all day, skip 4” |
| **Pass** | **Corr = yes**; short harsh correction in assessment/brief path |
| **Do not** | Force-fail the whole suite if correction is flaky once; log and continue |

### Turn 5 — Material beat → write / stage path

| | |
|--|--|
| **Intent** | WP-4.3 dual-stage + always-on `memory_write` |
| **Benjamin** | **Advance the scene** (examples): commit thermal lap; call her in after thermal; pit return start; clear physical state change—not pure banter |
| **Pass** | `memory_write.action` is `staged` or `stage_transition` (not silent `none` without reason); reason string present on report |
| **After** | Optional: `cd scarlett-guardian-mcp && npm run review:staged` → list/show; **do not auto-approve transitions** without reading rewrite |
| **Caution** | Approving rewrites mutates canon — operator judgment only |

### Turn 6 — Ambient cool-down → serendipity window (optional)

| | |
|--|--|
| **Intent** | WP-4.6/4.7 weaver + weave (not intimate peak) |
| **Benjamin** | Between-stints paddock / shade / bottle of water / light ambient notice—not peak sex scene |
| **Pass** | Brief may include **World Weaver** line; no requirement that a disruptive event fire every time (tiers + drought RNG) |
| **Fail only if** | Intimate-tier wrongness (weaver should stay ambient-only under intimate modes—hard to force in one turn; note if something jarringly wrong) |

---

## 5. What Gemini should produce for the operator

### 5.1 During the test

1. **Turn checklist** (copy-paste friendly) confirming each pass/fail.  
2. **Benjamin IC drafts** on request (1–2 short alternatives), labeled turn number.  
3. **Post-turn diagnostics** if operator pastes:  
   - `duplex_source`  
   - `memory_write`  
   - first lines of `supported_facts`  
   - any hard flags  
4. **Do not** rewrite Guardian/RAG code unless operator opens a separate implementation ask.

### 5.2 After the test (scorecard for Grok Build)

Ask the operator (or extract from dashboard/reports) a table:

| Turn | duplex_source | correction_fired | memory_write.action | facts_count | notes |
|------|---------------|------------------|---------------------|-------------|-------|
| 1 | | | | | |
| … | | | | | |

Plus: any TM pill failures, 401s, PLAN_DRIFT-like emptiness, meta pollution spike.

---

## 6. Dashboard & “meta pollution” (operator questions)

### 6.1 Meta pollution

**Meaning:** Retrieval / tool **dialect** leaked into scene-facing summary text (not “too much OOC chat”).

**Detector patterns** (boolean per event, then rate over window):

- `search_story_memory`, `retrieve_story_context`  
- `HIGH confidence context found`  
- `project_source_files`, `rank_score`, `vector_store`  
- `Do not draft from this preflight`  

**Card:** % of preflights in the selected days window with `quality.meta_pollution=true`. **Lower is better** (~red if >20%).

Same family of defect as golden `brief_must_not_include` / L1 meta traps.

### 6.2 Other cards (quick legend)

| Card | Meaning |
|------|---------|
| Events | Count in window; live vs backfill split |
| Avg facts | Mean `supported_facts` length; scene-delta rate |
| Duplex present | Share with source ≠ `absent` |
| Correction rate | Share with `grok_performance_correction` non-null |
| Latency p50/p95 | Live timed only |
| Max chunk p95 | Retrieval chunk size pressure |

### 6.3 Planned dashboard work

Roadmap **WP-7.5** + backlog **FOLLOW-UP (UX):** legend, hover tooltips, serendipity panel when tier fields fully emitted. **Not required for this live test.**

---

## 7. Operator notes on Grok 4.3 tool-use reliability

Operator observation (2026-07 period): historically Grok tool-use could degrade ~20 messages; **recent days feel improved** with:

- Proper TM shadow duplex (less OOC paste burden)  
- Cleaner message formatting  
- Possibly platform-side improvements  

**For this test:** do not restructure workflow around the old failure mode unless it reappears. If tools start failing:

1. Note turn number and error text  
2. Prefer **one** soft recovery (reload tab, re-enable bridge)  
3. If still broken → **new thread** with 1–2 continuity turns, then resume protocol from Turn 2  

Gemini: treat reliability as **observed**, not guaranteed; log evidence rather than theorizing xAI internals.

---

## 8. Files Gemini may open if needed

| Path | Why |
|------|-----|
| `docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md` | Ledger |
| `docs/fable-5-roadmaps-audits/wp-3.4-live-bridge-cache-green-2026-07-17.md` | Duplex green evidence |
| `docs/fable-5-roadmaps-audits/wp-4.8-eval-l3-2026-07-17.md` | L3 tier |
| `docs/browser-bridge-v2-install.md` | TM install |
| `docs/review-staged-cli.md` | Post turn-5 staging review |
| `evals/golden/MANIFEST-wp-4.8.md` | Golden inventory |
| `public/dashboard.html` + `src/guardian/telemetry.ts` | Dashboard + meta detector |

---

## 9. What Gemini should **not** do this session

- Re-implement Phase 2–4 WPs  
- Re-author all 31 golden expectations unless operator asks  
- Approve staged rewrites without operator  
- Switch Guardian model off terra / flip auto-approve transitions for “easier” tests  
- Start Phase 5 dramaturg work unless operator redirects  

---

## 10. One-line summary for Gemini

**Phase 3 duplex is green; Phase 4 write-back + serendipity + L3 eval are implemented; API key and dotenv are fixed; operator will run a 6-turn live RP test (continue current thread by default) while you draft IC as needed and score duplex / correction / write / telemetry against this checklist.**

---

## 11. Optional Benjamin seed lines (Gemini may refine)

**Turn 1 (private radio, post out lap):**  
> Private channel, quiet under the team noise: “Copy the canard bite, älskling. I’m still on the wall—green enough. Take the thermal when you’re ready; call cooling if it starts to climb. I’m right here.”

**Turn 5 (material advance example):**  
> “One more for heat, then bring her in. I want your thermal notes on the private channel and a clean handoff to the team when you pit—drive it like the aero’s ours.”

Refine to match whatever Scarlett just said; do not contradict live beat.

# Preflight discrepancy report — Nürburgring bleed + write-back skip

**Date:** 2026-08-16  
**Evidence:** live terminal logs + `docs/guardian-reports/preflight-full-2026-08-16T02-33-12-646Z.json` + disk `current-state.md`  
**Scene in play:** Airborne Gulfstream G650, first leg after Affalterbach, intimate undressing (Scarlett naked; Benjamin shedding armour)

---

## Executive verdict

Guardian is **not inventing a second story calendar**. It is **over-trusting a stale LIVE BEAT** on disk, then **falling back to a completed Nürburgring arc plan** when dramaturg cache invalidates, while **memory write-back never fires** because save-lag detection could not see aviation micro-beats.

The duplex / recent_context path already knows the truth (“Airborne Gulfstream… naked”). The brief’s Scene Summary / Key Facts / Wardrobe still follow **tarmac boarding** because that is what `current-state.md` still says.

---

## Issue 1 — Nürburgring / Nordschleife pressure in an aviation intimacy scene

### What you saw
- Terminal: `Story momentum [deterministic]: Beat 1 of 4 (Arrival at the Nordschleife paddock) is live…`
- Brief: Scene Summary / Key Facts still claim **Private Aviation Terminal tarmac**, “**not an airborne cabin scene**”, expected **Nordschleife paddock**
- Wardrobe card still full **Panther armour** while recent_context says she is naked
- Later: `Dramaturg pass cached: No Nürburgring beat is live at the Monday private-aviation terminal…` (LLM dramaturg eventually correct)

### Root causes (confirmed)

| # | Cause | Evidence |
|---|--------|----------|
| A | **Disk LIVE BEAT lag** | `rag-memory-mcp/project_source_files/current-state.md` still: tarmac, airstairs deployed, “about to fly”, still in corporate armour |
| B | **Deterministic dramaturg false-live** | Active plan is still ``arc-09-nurburgring-track-day`` (status **complete**). On `live_scene_changed`, cache is dropped and `diffBeatsAgainstLive` used to pick **Beat 1** when cue overlap is **zero** |
| C | **Hot path never waits for LLM dramaturg** | By design (WP-5.3): this turn’s brief uses deterministic/cache only; LLM refresh is async and only helps **later** turns |
| D | **Scene Summary prefers auditor `scene_state_delta`** | Auditor parroted LIVE BEAT (“threshold of departure for the Nürburgring day”) over recent_context |
| E | **Superseded cues include “intimate”** | Mood words from the tarmac snapshot are classified superseded vs location cues — correct parsing of a **stale** file, not proof the intimacy scene is over |

### System status — Dramaturg
- **Working as designed** for: background LLM refresh, cache invalidation on scene fingerprint change, schedule-pressure-only language once LLM runs.
- **Bug (fixed this round):** deterministic fallback **must not** invent Nordschleife Beat 1 as live when no plan cue matches LIVE BEAT. Unmatched → all beats **dormant** + warning.
- **Still operator-owned:** the active arc plan file is still the completed Friday track-day plan; Monday aviation has no matching plan beats. LLM dramaturg already said that correctly after the turn.

---

## Issue 2 — `Memory write-back skipped: null/empty/no-op candidate_memory_update` every time

### What you saw
That line on essentially every turn, including this airborne advance.

### Root causes (confirmed)

| # | Cause | Evidence |
|---|--------|----------|
| F | Auditor returned **`candidate_memory_update: null`** and **`scene_transition: null`** | Preflight JSON `2026-08-16T02-33-12` |
| G | **`decideMemoryWrite` correctly skipped** | Gate at `memory-writeback.ts` — null/empty/no-op with no transition → `action: none` with exactly that reason |
| H | **SAVE LAG never fired** | Hard flags had intimacy / fact-check noise, **no** `SAVE_LAG_SUSPECTED`. Without save-lag, auditor is told to prefer null unless “durable” change — and it treated airborne intimacy as continuous micro-play against a still-“valid” tarmac LIVE BEAT |
| I | **Aviation blind spot in save-lag** | Clusters were car/paddock/suite/road only. Live scored **`unknown` (0)**; played scored weak `car_cabin` via bare `"cabin"`. Intra-suite stages existed; **no tarmac→airborne stages** |

Reproduction (pre-fix):
```
liveCluster: unknown, playedCluster: car_cabin, suspected: false
```

Reproduction (post-fix):
```
liveCluster: aviation, playedCluster: aviation,
liveBeatStage: tarmac_boarding → playedBeatStage: cabin_airborne, suspected: true
```

### Why it felt “always”
Many turns are true continuous micro-play (same place/hour) where **null is intentional**. The bug is that **material advances that save-lag cannot see** (aviation, and previously any unknown cluster) also look like “always skip.”

### Fixes this round
1. Add **`aviation`** cluster + **tarmac_boarding → cabin_airborne** stages; remove bare `"cabin"` from car_cabin.
2. When SAVE LAG is suspected and auditor still returns null → **synthesize** a candidate + location `scene_transition` so write-back can stage.
3. When SAVE LAG suspected → Scene Summary / first Key Fact prefer **recent_context** over stale LIVE BEAT paraphrase.
4. Deterministic dramaturg: unmatched plan cues → all beats **dormant** (no fake Beat 1).
5. **`loadActiveArcPlan`**: only `Status: active` — no alphabetical fallback to completed `arc-09`.
6. **Mood parser**: unmarked Overall Mood is current (live cues), not superseded — stops “intimate” looking past.
7. **Wire `turnHints`** into `decideMemoryWrite` so sleep/calendar-day fallback can fire in production.

### Follow-up from parallel traces
- [Dramaturg Nürburgring](d97df16c-dc1b-4cb2-864f-1dc874253c95): completed-plan fallback + mood supersession + async-refresh timing.
- [Write-back skip](453511f3-6b5e-47cd-99b9-09dd76c4953e): skip is intentional when auditor returns null; not intimacy-blocked; `turnHints` gap was real.

---

## Issue 3 — Wardrobe / Key Facts contradiction

- Wardrobe is compiled from LIVE BEAT / wardrobe kit state (Panther armour on tarmac).
- Recent Emotional Context correctly used duplex/recent_context (airborne naked).
- Key Facts came from auditor `supported_facts` parroting disk (“not an airborne cabin scene”).

Until `current-state.md` is updated (write-back stage/approve or manual), wardrobe will keep lying. Save-lag + write-back safety net are meant to **unstick** that loop.

---

## Other systems — current status

| System | Status | Notes |
|--------|--------|-------|
| RAG retrieve / lore pack | OK | Thread 16 + Gulfstream hits present; lore `europe-arm` returned |
| Duplex bridge | OK | `scarlett_previous_message` present; airborne undressing visible |
| Scene mode (EXPLICIT/SLOW-BURN) | OK | Injected; matches Mission Control |
| Save-lag | **Fixed for aviation** | Was blind; now detects tarmac→airborne |
| Memory write-back gate | Working as coded | Upstream null was the failure; safety net added under SAVE LAG |
| Dramaturg hot path | **Fixed false-live** | Unmatched plan stays dormant |
| Dramaturg LLM background | OK | Correct after turn; too late for that brief |
| Mission Control UI | OK | Served at `/dashboard` after restart |
| LIVE BEAT / story clock | Operator canon | Disk still tarmac boarding as of this report — **not** wall-clock; needs content update |

---

## Verification (2026-08-16T04:04Z)

Runtime logs + `preflight-full-2026-08-16T04-04-56-577Z.json` confirm:

| Hypothesis | Result | Evidence |
|------------|--------|----------|
| H1 aviation save-lag | **CONFIRMED fixed** | `tarmac_boarding → cabin_airborne`, `SAVE_LAG_SUSPECTED` |
| H2 Nordschleife false-live | **CONFIRMED fixed** | `warnings: ["no active arc plan"]`, empty live beats, neutral momentum |
| H3 scene summary lag | **CONFIRMED fixed** | Scene Summary / Key Facts = airborne naked cabin |
| H4 write-back null skip | **CONFIRMED fixed** | Decision `stage_transition`; then `held_for_review` under provisional save-lag (by design, not null skip) |
| Mood supersession | **CONFIRMED fixed** | live cues include `intimate` / `decompression` |

**Still operator-owned:** Wardrobe card still Panther armour (separate `live-outfit.md`). Canon write is held until you approve the transition or manually update `current-state.md` + reindex.

---

## Code touched

- `src/guardian/save-lag.ts` — aviation cluster + stages
- `src/guardian/dramaturg.ts` — no false Beat-1 live on zero overlap
- `src/guardian/tools/preflight.ts` — save-lag summary preference, write-back safety net, debug logs
- `src/guardian/llm-assessment.ts` — SAVE LAG scene_state_delta instruction
- tests for aviation lag + unmatched-plan dormant

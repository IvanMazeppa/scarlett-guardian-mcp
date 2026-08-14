# WP Evidence — Parroting Fix Phase 1 (2026-08-14)

**Proposal:** `fable5-parroting-fix-proposal-2026-08-14.md` (Phase 1)
**Diagnosis:** `grok-4.6-diagnostics-report-2026-08-14.md`
**Scope:** Surgical code fixes only. No auditor-prompt changes (Phase 2), no brief Intention render (Phase 3), no commit.

## Changes

### 1.1 Key Facts never open in clerk mode

- `src/guardian/tools/preflight.ts` `buildKeyFacts`: `FACT_CHECK_*` flags no longer enter Key Facts at all (they stay in `hard_flags` / full JSON). `MANDATORY_RETRIEVAL_FAILED` / `LLM_GUARDIAN_BLOCK` are **appended** (`push`), never **prepended** (`unshift`) — Key Fact #1 stays live scene grounding.
- `src/guardian/report/compile-grok-brief.ts` `pickKeyFacts` fallback: `FACT_CHECK_` removed from the blocking-flag regex.

### 1.2 Interiority ban + duplicate invention ban removed

- `src/guardian/tools/preflight.ts` `buildThingsToAvoid[0]` reworded to exactly match `DEFAULT_AVOID[0]` in `compile-grok-brief.ts`. The 40-char dedupe now removes the duplicate, and the ban on inventing "emotional precedents, internal reactions" is gone. Facts/names/dates/family/history remain forbidden.

### 1.3 A name in a private thought is not "addressed"

- `src/guardian/scene-roster.ts`: `"addressed"` now requires the NPC on-stage in the user's turn — alias inside **quoted dialogue** (`"…"`/`“…”`), or alias + **physical presence markers** in the same sentence (arrives, at/outside the door, waiting by, walks in, is here, …). Alias in narration/interior monologue downgrades to `"mentioned"` (passive-gated, so it cannot pierce quiet private scenes).
- Defense in depth: `GuardianReport.scene_roster` gains `couple_only_present` (populated in `preflight.ts`); `isQuietPrivateCoupleScene` ignores non-`present_cast` actives when the LIVE BEAT Present is couple-only.

### 1.4 Save-lag sees intra-suite advance

- `src/guardian/save-lag.ts`: new suite micro-beat progression (`sofa_living` → `shower_bath` → `dressing` → `departure`). Same-cluster beat lag (played ≥2 token hits, ahead of disk) now sets `suspected: true` → existing plumbing engages: `SAVE_LAG_SUSPECTED` hard flag, auditor SAVE LAG block (mandates `candidate_memory_update`), rewind softening, prose unblock.
- `isLocationRewindCorrection` extended: "Rewind (Scarlett) to…", "rewind to the live…", "still on the sofa/bed", "back to the sofa/living area", "sofa/living-area beat". Anatomy/identity rewinds deliberately do NOT match and stay in force during lag.
- `applySaveLagSoftening` emits a beat-aware message when lag is intra-cluster.

## Tests added (hermetic traps)

- `tests/preflight.test.ts`: `buildKeyFacts` — FACT_CHECK_ excluded; live fact first; block flag last.
- `tests/scene-roster.test.ts`: interior monologue does not activate in private suite; narration naming → `mentioned`; quoted dialogue still → `addressed`.
- `tests/save-lag-quiet-echo.test.ts`: intra-suite beat lag detected (sofa vs dressing); no false lag on aligned beats; 14 Aug rewind phrasing recognized while anatomy rewind is not; beat-aware softening message; quiet-couple defense with a talked-about `addressed` NPC.

## Test-harness maintenance (environmental failures, pre-existing)

Two suite failures existed before this change-set and blocked the gate:

1. `tests/dramaturg.test.ts` asserted arc-09 is `Status: active`; the arc lifecycle moved it to `complete` (arc-14 is `draft`). Asserts now test the parser/loader **contract** (status extracted as declared; non-active fallback legal only when no plan on disk is active, matched on the line-anchored Status meta line only).
2. `tests/telemetry-aggregate.test.ts` used absolute July timestamps against a relative `days: 30` window — a calendar time bomb that started failing ~Aug 9. Fixture timestamps are now relative to now.

**Operator note:** no arc plan is currently `active` on disk — arc-14 (`arc-14-affalterbach-presentation.md`) is still `draft` while the story is on the Affalterbach day. Consider setting it `active` (and reindexing) per its own lifecycle note.

## Gate results

- `npm run build` — clean.
- `npm test` — all suites green (including new traps).
- `npm run eval:fast` — **36/36 passed, 0 failed**, 41 warns (identical warn count to pre-change baseline; scorecards `evals/runs/2026-08-14T10-56-04-577Z-*` before traps, `2026-08-14T10-58-51-672Z-*` after).

## Crisis replay (deterministic layer)

Replayed the archived 06:58 crisis artifacts through the new code:

- The **actual** Director correction from `preflight-full-2026-08-14T06-58-45-688Z.json` ("Rewind to the live sofa beat: the prior reply moved Scarlett through a shower, dressing sequence, and doorway departure…") is now recognized by `isLocationRewindCorrection` → `true`.
- The frozen card (sofa / "have not dressed") vs the played morning (shower done, shirt/trousers) → `detectSaveLag`: `suspected: true`, `liveBeatStage: sofa_living`, `playedBeatStage: dressing`.
- `applySaveLagSoftening` → `softened: true`, `shouldBlockProse: false`, correction replaced with: `SAVE LAG (intra-scene beat): disk LIVE BEAT still shows 'sofa_living' while played turns agree on 'dressing' in the same suite_hotel. Prefer the played beat; do not rewind forward motion already established in play. Operator should update current-state.md.`

The auditor-behavior layer (risky-claim false negative, echo exemption) is Phase 2, gated on `eval:llm -- --category duplex,write-back --trials 3` plus the two new goldens from the crisis reports.

## Not in this change-set

- Foreign in-flight diffs (`llm-assessment.ts`, `memory-writeback.ts`, their tests — WP-5.9-adjacent work) were present in the tree before this WP and are untouched.
- No commit made; no goldens curated yet (Phase 2 change-set).

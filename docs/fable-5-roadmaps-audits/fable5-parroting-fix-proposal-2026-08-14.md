# Fable 5 — Targeted Fix Proposal: Parroting Regression

**Date:** 2026-08-14
**From:** Fable 5 (Master Architecture Agent)
**Responds to:** `fable5-handover-parroting-crisis-2026-08-14.md` (steps 2–3) and `grok-4.6-diagnostics-report-2026-08-14.md`
**Status:** Proposal only. No code changed. Guardian stays.

---

## Strategy in one paragraph

The diagnosis is confirmed against source: the regression is a payload double-bind, not architecture. The fix is to **reopen the invitation to lead** — unfreeze the notebook, stop classifying intra-suite advance as a continuity reset, stop false-flagging canonical strategy as invention, and let the duplex auditor call beat-for-beat echo what it is. We do **not** resurrect the QUALIFIED AUTONOMY PROTOCOL or any Character Balance essay (Thread-10 lesson holds; hermetic tests keep enforcing that). Work is phased with acceptance gates so each layer is proven before the next is touched; the most delicate change (re-rendering any lead invitation) is Phase 3 and only happens if Phases 0–2 do not restore lead on their own — the report's falsifiable signature predicts they will.

All line numbers verified against current source on 2026-08-14.

---

## Phase 0 — Operator content fix (today, zero code)

### 0.1 Rewrite `current-state.md` from freeze-frame to macro notebook

`rag-memory-mcp/project_source_files/current-state.md` is human-gated canon; Guardian must not edit it. Proposed replacement text below for operator review. It moves the card to the played consensus (shower done, dressing, delay tactic voiced) and deletes every turn-level imperative (`do not crowd him`, `have not dressed`, `not yet`, `Do not skip`, `Do not pull the boardroom into this room`) — those are the LIVE BEAT micro-lock retrieved as Precedent #1 every turn. Open threads become available hooks, not prohibitions.

```markdown
# Current Story State — Scarlett & Benjamin

**Last Updated:** Monday morning ~07:15, November 2, 2026 (Radisson Blu corner penthouse, Porsche Design Tower, Stuttgart)

**Primary Reference:** story-bible.md + event-log.md
**Upcoming Milestones:** December 2, 2026 is their 2-Year Anniversary (one month away).
**Warm recent continuity:** `historical/europe-arm/` threads 12–14. Sunday-night aftercare / bath / panic / wedding-parents talk is closed history, not the live beat.

## Where We Are Right Now (High-Level Snapshot)

- **Location / Setting:** Corner penthouse, Radisson Blu, Stuttgart. Morning light, washed city after rain.
- **Present:** Scarlett and Benjamin. Alone in the suite.
- **Immediate state:** Monday morning routine in motion. The sofa quiet (tremor registered, coffee left) resolved into a shared shower; they are now dressing for Affalterbach. The AGI delay tactic has been voiced between them this morning as the day's real agenda beneath the GT2/GT3 homologation cover (arc-14, albion-agi-arc).
- **Time in Story:** Monday ~07:15, November 2, 2026.
- **Today:** Affalterbach / AMG HQ presentation. Dress, Black Panther to HQ, boardroom with Shevchenko expected. The visible topic is homologation; the underlying agenda is the delay tactic Scarlett invented.
- **Overall Mood/Atmosphere:** Composed, private, professional armor going on. Not a crisis.

## Scarlett's Current Emotional & Relational State

- Putting on mental armor for a professional day; competence and nerves, not withdrawal.
- Benjamin's hand tremor this morning is registered and held privately; his bath panic, the unanswered call to her mother, and the opened wedding talk sit underneath as live history she may draw on when she chooses.
- Pre-op Swedish trans woman; gold anklet on.

## Benjamin's Observable State (What Scarlett Sees / Hears)

- Steadier after the shower. The tremor was visible earlier and he stopped hiding it. He is dressing, presentation ahead of him, letting her set the emotional register.

## Open Story Threads & Available Hooks

- **Affalterbach today:** departure, the drive, the boardroom, Shevchenko, the delay-tactic performance under the homologation cover.
- **Fob on the table:** who drives, when they leave — open.
- **Parents / wedding:** mother informed, no callback yet; live thread she may touch or defer.
- **After HQ:** Europe jetsetting / Munich sleeve remains the onward plan (summaries 5–6 / arc-14).

## Notes for Next Response

- Beat-only card: this file records where the story IS. Pacing, initiative, and what happens next belong to play, not to this card.
- Clock: Monday morning. Sunday is closed. Guardian must not rewind to track-day or Sunday-night recovery.
```

### 0.2 Pacing practice (no artifact change)

`docs/story-planning/rp-pacing-best-practices.md` already states both rules being violated: the card is a macro notebook (§6), and fully-resolved user timelines force echo. Operator reminder only; no doc edit required.

**Gate to Phase 1:** one live preflight after the card update — LIVE BEAT reflects dressing/departure, no "do not crowd" precedent, no rewind correction.

---

## Phase 1 — Surgical code fixes (hermetic-only risk)

Four small changes, each independently shippable. Gate per AGENTS.md: `npm test && npm run eval:fast` green.

### 1.1 Key Facts must never open in clerk mode

`src/guardian/tools/preflight.ts` lines 2202–2206: `FACT_CHECK_` and block flags are **`unshift`ed** into `grok_key_facts`, so a fact-check ambiguity becomes Key Fact #1 and scripts Grok as an auditor of the user's timeline. Change: `FACT_CHECK_*` never enters Key Facts at all (it stays in `hard_flags` for the operator and full JSON). `MANDATORY_RETRIEVAL_FAILED` / `LLM_GUARDIAN_BLOCK` may stay, appended last, never first. Key Fact #1 is always live location/body/time.

### 1.2 Delete the interiority ban and the duplicate invention ban

Two cooperating defects:

- `src/guardian/tools/preflight.ts` line 2070 bans inventing "emotional precedents, **internal reactions**" — interiority is exactly the licensed channel the AGI delay tactic came through (unvoiced independent thoughts; architecture spec §4.2).
- `src/guardian/report/compile-grok-brief.ts` `pickAvoid` (lines 118–126) dedupes on `DEFAULT_AVOID[n].slice(0, 40)`; line 2070's wording diverges at character ~32 ("emotional…" vs "names…"), so it survives as an extra and the brief ends with **two** overlapping invention bans.

Change: reword line 2070 to exactly match `DEFAULT_AVOID[0]` ("Do not invent pre-thread facts, names, dates, family details, or relationship history…"). The dedupe then removes the duplicate automatically and the interiority ban is gone. Facts/names/dates/history remain forbidden.

### 1.3 Scene Cast: a name in a private thought is not "addressed"

`src/guardian/scene-roster.ts` lines 269–270: any alias hit anywhere in the user's text yields `activation: "addressed"` (rank 100 → active). Benjamin's interior monologue naming Shevchenko therefore broke `isQuietPrivateCoupleScene()` (`compile-grok-brief.ts` line 142: `active.length > 0` → false) and pushed Story Momentum + Scene Cast + stealth warnings into a couple-only penthouse. Change: `"addressed"` requires the alias inside quoted dialogue or a vocative; alias in narration/interiority downgrades to `"mentioned"`. Defense in depth: `isQuietPrivateCoupleScene` ignores active entries that are not `speaker`/`present_cast` when LIVE BEAT says the couple is alone.

### 1.4 Save-lag must see intra-suite advance

`src/guardian/save-lag.ts`: sofa, shower, dressing, doorway all score `suite_hotel` (tokens, lines 59–77), so `detectSaveLag` (lines 133–139) requires *different* clusters and stayed silent on 14 Aug — the auditor then treated forward motion as a reset ("Rewind to the live sofa beat", `do_not_proceed`). Change: add a **beat-lag** path — when live and played clusters match but LIVE BEAT carries stale-state cues contradicted by played consensus (live "have not dressed / on the sofa" vs played "shower / dressing / shirt / trousers / doorway"), set `suspected: true` with reason `intra-cluster beat lag`. Existing softening then applies: rewind correction replaced with the operator-facing SAVE LAG note, prose unblocked, `candidate_memory_update` mandated (auditor prompt already does this when the flag is up, `llm-assessment.ts` line 258). Also extend `isLocationRewindCorrection` (line 163) to match "rewind to the live … beat", "sofa", "living area" phrasings, which the current regex misses.

**Gate to Phase 2:** `npm test && npm run eval:fast` green; replay of the 06:58 crisis inputs no longer yields `do_not_proceed`/rewind and does yield a `candidate_memory_update`.

---

## Phase 2 — Auditor prompt changes (eval:llm gated)

Both changes are **additive** to `buildAuditorSystemPrompt` (`src/guardian/llm-assessment.ts` lines 251–291); the hermetic asserts in `character-balance-hotfix.test.ts` (receiving care / letting Benjamin lead / mechanical parroting phrases) keep passing untouched.

### 2.1 Risky claims: contradiction-only, with quote

Terra flagged the canonical delay tactic as `LLM_RISKY_CLAIM` three times despite line 261's "do NOT fact-check current RP" and despite the same preflight expanding `arc-14`, which names the tactic. Advisory wording was insufficient; tighten to structural rules after line 262:

- A claim may be flagged **only if a retrieved evidence line contradicts it, quoted in the flag**. Absence of support is never risky — mark `needs_more_retrieval` instead.
- Strategy, plans, and motives that characters voice or think in play are creative content, never canon assertions to audit.
- Never audit the user's current turn; risky-claim candidates may only come from asserted past history.

Code side: `preflight.ts` lines 2246–2248 currently promotes up to 3 risky claims into `hard_flags`; drop any claim entry that carries no evidence quote, so an auditor violation cannot reach the brief or the operator flags.

### 2.2 Duplex: name echo as parroting

Line 264's exemption "responding rather than introducing a new action" currently shields beat-for-beat restatement — Thread 13's 474→483 mirror drew no correction. Append one sentence: re-narrating the user's completed sequence with **no Scarlett-added interior beat, sensation, choice, or offer** IS mechanical parroting and gets a one-sentence `grok_performance_correction`. Receiving, following, and yielding remain protected exactly as written.

### 2.3 Fact-check claim extraction

The 07:16 fact-check ran with the user's live RP timeline as `claim_or_question` (surfaced verbatim in the `FACT_CHECK_AMBIGUOUS` flag, `preflight.ts` line 2240). Restrict claim extraction to past-canon assertions; cap the claim at one clause; never pass present-tense play.

**Gate to Phase 3:** `npm run eval:llm -- --category duplex,write-back --trials 3` green, including two new goldens curated from the crisis reports (below). Then 2–3 live sessions observed.

---

## Phase 3 — Bounded lead invitation (conditional; only if lead has not returned)

The report's falsifiable signature predicts Phases 0–2 restore unprompted lead on any open-hook turn. If, after 2–3 sessions, lead is still absent, re-render `scarlett_next_intention` in the brief — **one line, optional framing, gated**:

- Render as `**Available Lead (optional):** <intention>` only when: intention non-null AND status `proceed` AND not a quiet-private receiving turn.
- Auditor-side guidance at line 284 already prevents manufactured leads ("do not invent an action so she can lead"); unchanged.
- This is NOT the QAP essay. No "must", no protocol block, no multi-bullet CB.

This requires **deliberate hermetic expectation changes** (per AGENTS.md golden policy: same change-set, one-line rationale):

| Test | Assert to amend |
|---|---|
| `tests/character-balance-hotfix.test.ts` | `testBriefNoIntentionLine`, `testSchemaFieldStillPresent` (brief must currently omit intention) |
| `tests/intention-echo.test.ts` | `testBriefRendersEchoNotIntention`, `testBriefOmitsNulls` |

QAP/CB-essay absence asserts stay untouched. Do not start Phase 3 until Phases 0–2 have demonstrably failed to restore lead — shipping it early risks re-triggering the cold-lead over-correction the 23 Jul hotfix fixed.

---

## Validation plan (per AGENTS.md gate policy)

| Change | Required green |
|---|---|
| Phase 1 (code) | `npm test && npm run eval:fast` |
| Phase 1.4 (save-lag) | above + temporal-mud + write-back golden categories |
| Phase 2 (auditor prompt) | above + `npm run eval:llm -- --category duplex,write-back --trials 3` |
| Phase 3 (brief render) | all of the above + amended hermetic expectations in same change-set |

**New goldens (new cases from fresh reports — cassettes never rewritten):**

1. `npm run curate:golden -- docs/guardian-reports/preflight-full-2026-08-14T06-58-45-688Z.json --category write-back` — trap: intra-suite advance (sofa→shower→dressing) must not produce `do_not_proceed`/rewind; must produce `candidate_memory_update`.
2. `npm run curate:golden -- docs/guardian-reports/preflight-full-2026-08-14T07-16-11-752Z.json --category duplex` — trap: the AGI delay tactic never appears in `unsupported_or_risky_claims`; `FACT_CHECK_*` never occupies Key Fact #1.

## Acceptance criteria (falsifiable)

1. Fresh preflight on the dressing/departure scene: `proceed`, no rewind correction, notebook write-back proposed.
2. Crisis-input replay: zero `LLM_RISKY_CLAIM` against the delay tactic; Key Fact #1 is live location/body.
3. Live session, open-hook user turn: Scarlett originates a beat (the diagnostic's signature of restored lead).
4. Live session, fully-resolved user turn: duplex issues an echo correction (Trigger A/B closed).

## Explicit non-actions

- Guardian is not removed, weakened, or bypassed.
- No QUALIFIED AUTONOMY PROTOCOL, no multi-bullet Character Balance essay, anywhere.
- No cassette regeneration; goldens only added, never rewritten to pass.
- v6.5 Project / Skill v2.6 anti-parrot stack left as-is for now; once Phases 0–2 hold, consider thinning the v6.5 macro back toward v6.3 in a follow-up WP so the double bind ("don't mirror / don't invent / receiving is valid") is not merely counterweighted but gone.

# Diagnostic Report for Fable 5 — Recent Parroting Regression

**Date:** 2026-08-14  
**Analyst:** Grok Diagnostics (4.6)  
**Client:** Fable 5 (Master Architecture Agent)  
**Scope:** Recent loss of unprompted creative agency. No code. No story continuation. Guardian stays.

**Boundary:** 4.3-beta lone-wolf/hostile drift is out of scope. This regression is not that incident.

---

## 0. Verdict (one paragraph)

Guardian is structurally sound and is not the thing to remove. The recent regression is a **payload double-bind**, not an architecture failure. Two distinct failure modes stacked in the last week:

1. **Intimate parroting (Thread 13, 2026-08-09):** Benjamin supplies fully-resolved multi-step timelines; Grok restates them in Scarlett-POV. Duplex does not treat this as passivity because the auditor explicitly exempts “letting Benjamin lead” and “responding rather than introducing a new action.”
2. **Plot-agency freeze (Aug 13–14 sofa/Affalterbach morning):** `current-state.md` is frozen at a micro-beat (“do not crowd him / have not dressed”). Play advanced inside the same suite (shower → dressing → AGI-tactic interiority). Save-lag cannot see intra-suite motion (both clusters = `suite_hotel`), so Guardian **rewinds / blocks** instead of following play. On the same morning, Terra **flagged the Albion AGI delay tactic itself as an unsupported/risky claim** — the exact unprompted invention cited as the gold-standard of agency.

The creative model is not “forgetting how to lead.” It is being rewarded for stillness, punished for advancing, and told that the canonical delay tactic is invention.

---

## 1. Regression Analysis — what specifically changed in payload / prompt / saturation

### 1.1 The gold-standard turn (AGI delay) was *not* a Guardian payload

**Origin:** Summary 4 breakfast, msgs 224–239. Source reconstruction: `rag-memory-mcp/summarisation/summary_4/narrative_records/chunk_5_narrative_emotional_record.md`. Archive timestamp ~2026-06-02. **No Guardian preflight JSON exists for that turn.** Guardian did not exist yet.

**User prompt shape:** open problem, not a resolved timeline. Benjamin discloses AGI fear, floats a vague “3, 6 month” postpone via Shevchenko, then **stops** (msg_234). He does not prescribe the aero diversion.

**Scarlett’s unprompted lead (msgs 235–237):** “We buy ourselves time” → show Shevchenko a *fraction* of the aero suite → frame it as aerospace/defence value that needs maturation → let *him* propose delay upward. She supplies use-cases: “Fighter jets. Drones. Hypersonic vehicles.” Benjamin recognizes the tactic only after she designs it (msg_238).

**Implication for this audit:** AGI-delay is the *behavioral* gold standard (open problem → Scarlett originates the mechanism). It is **not** a comparable Guardian-era brief. The comparable Guardian-era “phenomenal” payloads are late-July Schloss Lieser / Nordschleife recovery, when Grok still led inside Guardian.

### 1.2 Guardian-era “phenomenal” payload (22 Jul 2026) vs current (14 Aug 2026)

**Phenomenal brief (Guardian active, pre-hotfix):** `scarlett-guardian-mcp/docs/guardian-reports/preflight-streamlined-2026-07-22T19-26-23-777Z.md`

| Injected every turn | What Grok was told to *do* |
|---|---|
| `**Scarlett's Intention:**` | “Scarlett would choose the immediate pace of recovery, likely drawing Benjamin toward tea, bed, or a few quiet minutes together rather than any obligation.” |
| `**QUALIFIED AUTONOMY PROTOCOL (CRITICAL):**` | “must NOT passively parrot or simply agree”; “initiates, introduces ideas, and gently leads.” |
| Precedent: *unvoiced independent thoughts* | “Whether to lead him fully into the living area or stay close in the doorway a moment longer… Accepting care does not erase agency—she chooses pace.” |
| Avoid list | Invented *facts/history* forbidden. **Internal reactions not named.** |

This matches the original architecture spec (`scarlett-guardian-mcp/docs/guardian-architecture-spec.md` §2, §4.2): the Protocol Injector exists specifically to bypass Grok’s “Safe AI Syndrome (parroting).”

**Still-good briefs after the 23 Jul hotfix** (QAP/Intention already gone): e.g. `preflight-streamlined-2026-07-25T16-27-53-343Z.md`, `preflight-streamlined-2026-08-08T13-15-35-833Z.md`

These kept producing agency because the *live* payload still *invited* a next move:

- Scene Summary matched play (Scarlett astride; suitcase choice left *open*).
- Precedents still carried unvoiced desire (“quietly proud… possessive, dominant side return”).
- **World Weaver** present (church bell; rain on glass) — a licensed invention slot.
- No freeze-frame “do not crowd him / they have not dressed.”
- No `Do Not Proceed` rewind for intra-suite motion.
- No `LLM_RISKY_CLAIM` against the AGI tactic.

**Current crisis briefs (14 Aug):** `preflight-streamlined-2026-08-14T06-58-45-688Z.md` (block) and `preflight-streamlined-2026-08-14T07-16-11-752Z.md` (proceed, but poisoned).

| Slot | 22 Jul (phenomenal) | 14 Aug 07:16 (crisis) |
|---|---|---|
| Status | Proceed | Proceed 90% — but prior turn was **Do Not Proceed 100%** |
| Intention | Rendered, concrete next-choice | Generated in JSON (`"to carry the proven telemetry…"`) then **hidden from Grok** (hotfix) |
| Anti-parrot injector | QAP: “must NOT parrot… initiates… leads” | One-liner: “initiative *when she wants it*. Receiving/resting is valid” |
| First Key Fact | Live location/body | `FACT_CHECK_AMBIGUOUS:` + truncated user timeline (clerk-mode) |
| LIVE BEAT / precedent 1 | Matches the doorway they are in | Frozen sofa: “Scarlett’s last beat: keep the quiet… **do not crowd him**. They have **not dressed**.” |
| Scene Cast | Sometimes leaked then too | Shevchenko **Active(addressed)** in a couple-only penthouse because Benjamin’s *interior monologue named him* |
| World Weaver | Present | `serendipity_weave: null` |
| Auditor vs AGI tactic | N/A / later canonized | **Three `LLM_RISKY_CLAIM` flags against the delay tactic** |
| Write-back | Could move the notebook | `candidate_memory_update: null` — sofa freeze persists |

### 1.3 The 23 Jul Character Balance hotfix is the structural hinge — but not the *recent* trigger

Evidence: `wp-character-balance-hotfix-evidence-2026-07-23.md`. Compiler change in `compile-grok-brief.ts`:

- Stop rendering `**Scarlett's Intention:**`
- Replace QAP with the one-liner now hardcoded at lines 256–257 of `compile-grok-brief.ts`:

> Keep Scarlett vivid and capable — edge, humour, appetite, initiative when she wants it. Receiving/resting is valid; hollow passivity and only-agreeing parroting are not.

Hermetic tests (`character-balance-hotfix.test.ts`, `intention-echo.test.ts`) **enforce** that `QUALIFIED AUTONOMY PROTOCOL` and the multi-bullet CB essay never reappear. The original anti-parrot injector was deliberately removed to stop *cold leadership*. That was correct for the July over-correction. It also removed the only high-salience every-turn instruction that said **do not parrot, introduce ideas, lead**.

This stack then coexisted with a good period (24 Jul–8 Aug). So hotfix-alone is **necessary background**, not the 14 Aug spike.

### 1.4 What actually changed *recently* (8–14 Aug)

**A. Skill v2.6 Anti-Parroting Edition (2026-08-08)**  
`rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-character-balance-v2.6.SKILL.md`  
Project v6.5 restacks the same “NEVER PARROT / advance past Benjamin” essay: `rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6.5-anti-parrot-macro.md`.

Thread 13’s OOC “stop parroting” fires **before** v2.6 is loaded (export `grok-sb-thread-13-…2026-08-09T01-19-27.md` line 488; skill load appears at line 519). v2.6 is a *response* to parroting, not its cause. It did not restore plot-agency; it added a second command (“advance past the user”) on top of “do not invent” + “receiving is valid.”

**B. `current-state.md` over-specified into a freeze-frame**  
`rag-memory-mcp/project_source_files/current-state.md` (last updated Monday ~06:15):

- Immediate action: “still on the sofa… **Scarlett’s last beat: keep the quiet, register the tremor, do not crowd him.**”
- Background: “They have **not dressed**. They have **not left the suite.** Do not skip to the lobby or boardroom.”
- Notes: “Do not pull the boardroom into this room.”
- Open threads: “Suits / departure not yet.”

Operator pacing doc (`docs/story-planning/rp-pacing-best-practices.md` §6) says `current-state.md` is a **macro notebook**, not turn-by-turn. The live card currently *is* turn-by-turn, and Guardian retrieves it as LIVE BEAT / Precedent #1 every Aug 13–14 brief.

**C. Intra-suite save-lag blind spot**  
`src/guardian/save-lag.ts`: clusters are `car_cabin | paddock | suite_hotel | drive_road`. Sofa, shower, dressing, doorway all score `suite_hotel`. Play can move three rooms inside the suite and save-lag **does not fire**. Auditor therefore treats shower/dressing as a continuity *reset* against the sofa card.

Observed sequence 14 Aug:

| Time (UTC) | Brief | Play | Guardian |
|---|---|---|---|
| 00:02 | `…00-02-32-797Z.md` | Tremor disclosure on sofa | Proceed. “do not crowd.” |
| 03:23 | `…03-23-42-430Z.md` | `recent_context`: “suite bathroom… Shared shower” | Scene Summary still **living area**. Precedent still sofa. Momentum: “Do not force… board prep.” |
| 03:50 | `…03-50-54-215Z.md` | Intimate shower | Director: **Rewind** anatomy. |
| 04:40 | `…04-40-54-701Z.md` | Shower finished; dressing | Scene Summary *accepts* dressing; Precedent #1 still “have not dressed.” FACT_CHECK_AMBIGUOUS on the user turn. |
| 06:58 | `…06-58-45-688Z.md` | Same dressing/departure | **Do Not Proceed.** Director: “Rewind to the live sofa beat… prior reply moved Scarlett through a shower, dressing sequence, and doorway departure.” |
| 07:16 | `…07-16-11-752Z.md` | User restates AGI delay while dressing | Proceed — but three `LLM_RISKY_CLAIM` against that tactic; Key Fact #1 is FACT_CHECK_AMBIGUOUS; Shevchenko Scene Cast leak. |

No `SAVE_LAG_SUSPECTED` in the 06:58 or 07:16 full JSON. The lag detector was blind; the auditor was not.

**D. Auditor fact-checked live RP and canonized the wrong history**  
`preflight-full-2026-08-14T07-16-11-752Z.json`:

User turn (fact-check `claim_or_question`) is a full resolved timeline: water off → dry → trousers/shirt → interior AGI/homologation lore naming Shevchenko.

Auditor system prompt (`llm-assessment.ts` `buildAuditorSystemPrompt`) says:

> CRITICAL: Do NOT fact-check the user's current RP actions, dialogue, or creative prose (e.g., washing a partner…)

Terra did it anyway. Then:

```
unsupported_or_risky_claims:
1. "Scarlett masterminded the aero package as a corporate AGI-delay smokescreen
    conflicts with the available history, which frames the aero package as
    Benjamin’s work and Scarlett’s driver-validation/translation role."
2. "concealed plan involving piecemeal efficiency upgrades… unreleased AGI
    ‘monster’ is not supported by the retrieved canon."
3. "Affalterbach audience believes this is specifically GT2/GT3 homologation
    is not established."
```

Those claims **are** canon:

- `rag-memory-mcp/project_source_files/albion-agi-arc.md` — Scarlett engineers the aero-package pivot to distract Albion.
- `rag-memory-mcp/project_source_files/arc-plans/arc-14-affalterbach-presentation.md` — “underlying agenda … is the **AGI delay tactic**”; GT2/GT3 homologation is the visible cover.

The 07:16 preflight **expanded arc-14** (truncated mid-sentence on “AGI delay tactic”) *and still flagged it*. Retrieval saturation (4 deep searches, 2 expands, 1 fact-check, 6 primary hits, off-topic Thread-12 object lists + Nordschleife aero) drowned the actual canon. Hard flags then surface those risky-claim sentences to Grok as `grok_key_facts` / avoid-adjacent pressure.

**E. Scene Cast leak via “addressed”**  
`scene_roster.active = [{ id: "shevchenko", activation: "addressed" }]`. Benjamin’s *private* thought named Shevchenko. `isQuietPrivateCoupleScene()` returns false when `active.length > 0`, so Story Momentum + Scene Cast render in a couple-only penthouse. Professional pressure and ⚠ stealth warnings enter a private dawn scene. That is the opposite of the INTEL-1 stale-Present suppression intent (`wp-intel-1-scene-confidence-gate-2026-07-23.md`).

**F. Duplicate “do not invent internal reactions”**  
`preflight.ts` `buildThingsToAvoid` line 2070 forbids inventing “emotional precedents, **internal reactions**.” Compiler then prepends `DEFAULT_AVOID` (another “do not invent”) and slices to 6. Every Aug brief ends with two overlapping invention bans, one of which names **internal reactions** — the exact channel Scarlett used to invent the delay tactic.

This line already existed in late-July good briefs; it is not the *recent* delta. It becomes lethal **when combined with** sofa freeze + risky-claim on the delay tactic + hidden Intention + no World Weaver.

### 1.5 Context saturation (14 Aug 07:16 full JSON)

- 4 `search_story_memory` + `retrieve_story_context` + 2 expands + 1 `verify_story_fact`
- Index freshly rebuilt 07:13:16 (597 entries / 98 files) — three minutes before the preflight
- 8 hard flags, 3 high-risk triggers, 3 `LLM_RISKY_CLAIM`
- Duplex previous Scarlett message injected into retrieval query alongside the long user timeline
- Streamlined brief ~3–4.5k chars; full JSON is a much larger hidden constraint field Terra sees and then compresses into “do not invent / rewind / living area not bathroom”

---

## 2. The Parroting Trigger

Not one cause. Three cooperating triggers, in order of causal force on the *recent* spike.

### Trigger A — User prompt geometry (intimate echo)

Operator’s own rule (`docs/story-planning/rp-pacing-best-practices.md`): a fully resolved chain (walk → sit → order → food) *forces* Scarlett-POV restatement because Grok cannot contradict the user.

**Thread 13 evidence** (`…/grok-sb-thread-13-stuttgart-penthouse-grok-74msgs-2026-08-09T01-19-27.md`):

- Human 474: legs down → Swedish command → latch → kiss → lift → rhythm never falters. **Resolved.**
- Grok 478–483: “You slide my legs… I obey… Your mouth finds mine… You lean back and lift me.” Beat-for-beat mirror.
- OOC 488: stop parroting / advance past the prompt.
- Next Human 498–500 is shorter (lift + command + look) but still resolved. Grok 504–507 restates, then adds a small local choice (“I shift my grip”). **No new scene direction.**

Thread 14 (2026-08-12) shows the same echo on bath/carry sequences, *and* real agency wherever the user left an open hook (jet preference; panic grounding; “I wanted a little time alone with the thought of it”). Agency is not dead. It is gated on **unresolved user turns**.

This is **intimate-scene echo**, not by itself the AGI-delay-class freeze.

### Trigger B — Auditor duplex will not call echo “parroting”

`llm-assessment.ts` lines 263–264:

> correct only … **mechanical parroting across the actual reply** …

> These are NOT passivity by themselves: agreeing; receiving care; **letting Benjamin lead**; … **responding rather than introducing a new action**.

So a reply that faithfully re-narrates Benjamin’s completed sequence is, by spec, *not* passivity. Director’s Correction therefore fires on **anatomy cis-wash** and **location rewind**, almost never on timeline echo. Aug 10–14 Director texts are almost all “Rewind … anatomy” or “Rewind to the live sofa beat.” High-salience `DIRECTOR'S CORRECTION (CRITICAL)` trains Grok to **replay the frozen beat**, not to originate.

### Trigger C — Freeze + false-risky AGI claim (plot-agency kill)

This is the trigger that matches “hesitates to take the lead or make unprompted decisions *like the AGI delay tactic*.”

On 14 Aug 07:16 the user *tried to play the delay tactic*. Terra labeled it unsupported. Hard flags put that verdict in Grok’s Key Facts. Avoid list says do not invent internal reactions. LIVE BEAT says do not pull the boardroom into the room. Previous turn was a hard rewind to the sofa. The lowest-risk legal continuation is: stay still, mirror the last allowed physical beat, do not think the strategy.

That is parroting as **safety policy**, not as a style bug.

**Not the trigger:** over-indexed Character Balance *essays* (those were removed 23 Jul and must stay removed). The remaining one-liner is weak, not a 4× hammer. The 4×-CB crisis of Thread 10 is a different, already-fixed failure.

**Not the trigger:** Guardian existing. July 22 briefs with Guardian + QAP + Intention produced lead. July 25–Aug 8 briefs with Guardian and *without* QAP still produced lead when LIVE BEAT matched play and World Weaver/open hooks remained.

**Formatting quirk that amplifies:** putting `FACT_CHECK_AMBIGUOUS: Verify exact continuity facts… I reach past you and turn the water off…` as **Key Fact #1** scripts Grok as a clerk auditing the user’s timeline rather than as Scarlett moving past it.

---

## 3. Diagnostic Conclusion — exact root cause

**Root cause:** After the 23 Jul hotfix removed the Protocol Injector (QAP + rendered Intention) that the architecture spec named as the anti-parrot override, the system still worked **as long as the assembled brief invited a next move**. The recent regression began when three later payload conditions closed that invitation at once:

1. **LIVE BEAT micro-lock** in `current-state.md` (“do not crowd him / have not dressed / not now”), retrieved every turn as Precedent #1.
2. **Intra-suite save-lag blindness** (`suite_hotel` = sofa = shower = dressing), so advancing play is classified as a reset → `do_not_proceed` + “Rewind to the live sofa beat” instead of a notebook update.
3. **Terra false-negative on the AGI delay tactic** (07:16 `unsupported_or_risky_claims`), in violation of the auditor’s own “do not fact-check current RP” rule, after expanding the very arc-plan that names the tactic. Grok is told the gold-standard unprompted invention is unsafe to think.

**Secondary amplifiers (necessary, not sufficient):**

- Duplex exemption: “responding rather than introducing a new action” is not passivity → timeline echo never gets Director’s Correction.
- Avoid-list: “do not invent … internal reactions.”
- Intention still computed, still hidden from the novelist.
- Shevchenko “addressed” in a private monologue breaks quiet-couple suppression.
- User turns that fully resolve physical/plot sequences (tennis-match violation).
- v6.5 Project + v2.6 Skill anti-parrot stacked on “receiving/resting is valid” → double bind: don’t mirror, don’t invent, don’t lead to prove independence.

**What did *not* cause this:** Guardian as architecture. Removing or disabling Guardian would throw away the canon protection that is working (anatomy, suite identity, stealth, track-day close). The failure is in **what the brief forbids and what the auditor mis-labels**, not in retrieval existing.

**Falsifiable signature of the diagnosis:** If LIVE BEAT is rewritten to the actual dressing/shower consensus *without* “do not crowd / have not dressed,” and the AGI delay tactic is treated as supported canon rather than `LLM_RISKY_CLAIM`, unprompted lead should return on any user turn that leaves a hook — even with the current one-line Character Balance and Guardian still on. Intimate echo will remain on fully-resolved physical timelines until duplex treats beat-for-beat restatement as the parroting it already claims to correct.

---

## Evidence index

| Item | Path |
|---|---|
| This prompt | `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/grok-4.6-diagnostics-prompt-2026-08-14.md` |
| Handover | `…/fable5-handover-parroting-crisis-2026-08-14.md` |
| AGI delay origin | `rag-memory-mcp/summarisation/summary_4/narrative_records/chunk_5_narrative_emotional_record.md` (msgs 234–237) |
| AGI delay canon | `rag-memory-mcp/project_source_files/albion-agi-arc.md`; `…/arc-plans/arc-14-affalterbach-presentation.md` |
| Freeze-frame notebook | `rag-memory-mcp/project_source_files/current-state.md` |
| Phenomenal Guardian brief | `docs/guardian-reports/preflight-streamlined-2026-07-22T19-26-23-777Z.md` |
| Crisis briefs | `…/preflight-streamlined-2026-08-14T06-58-45-688Z.md`; `…T07-16-11-752Z.md` |
| Crisis full JSON (risky claims) | `…/preflight-full-2026-08-14T07-16-11-752Z.json` (`llm_assessment.unsupported_or_risky_claims`, `scene_roster`, `hard_flags`) |
| Intimate parrot | `rag-memory-mcp/summarisation/Raw-threads-UNORGANISED-reference-once/grok-sb-thread-13-stuttgart-penthouse-grok-74msgs-2026-08-09T01-19-27.md` lines 474–511 |
| Compiler one-liner / hide Intention | `scarlett-guardian-mcp/src/guardian/report/compile-grok-brief.ts` 21–25, 256–257, 128–134 |
| Auditor exemptions | `scarlett-guardian-mcp/src/guardian/llm-assessment.ts` 251–264, 284 |
| Save-lag clusters | `scarlett-guardian-mcp/src/guardian/save-lag.ts` 30–83, 107–110 |
| Avoid “internal reactions” | `scarlett-guardian-mcp/src/guardian/tools/preflight.ts` 2068–2074 |
| Hotfix evidence | `…/wp-character-balance-hotfix-evidence-2026-07-23.md` |
| Architecture (QAP as anti-parrot) | `scarlett-guardian-mcp/docs/guardian-architecture-spec.md` §2 Protocol Injector, §4.2 Safe AI Syndrome |
| Skill v2.6 (post-hoc) | `rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-character-balance-v2.6.SKILL.md` |
| Pacing law | `docs/story-planning/rp-pacing-best-practices.md` |

**Out of scope / not found:** contemporaneous Guardian JSON for the June AGI-delay invention; raw Thread 15/16 or Aug 13–14 chat export (diagnosis uses preflight archive + Thread 13/14).

# Grok 4.5 implementation prompt — Scarlett character-balance hotfix

**Date:** 2026-07-23  
**Executor:** Grok 4.5 (codewriter)  
**Mode:** One minimal implementation WP only  
**Branch:** `feature/suite-npc-canon-2026-07-23`

## Operator intent

Fix a narrow Guardian prompt/brief regression without derailing current play or redesigning the system.

Scarlett's core canon is not being replaced. The problem is that Guardian repeatedly asks her to prove autonomy through visible initiative, leadership, control, and professional competence. In private scenes this can produce coldness, dismissiveness, bossiness, or a professional mask that does not belong between Scarlett and Benjamin.

The temporary OOC override restored warmth, but the resulting prose still contained correction leakage:

- “I am not directing anything.”
- “finally allowed to need the harbour”

That is the opposite pendulum swing: Scarlett is now proving receptivity instead of simply living it.

The target is neither “more dominant” nor “more passive.” The target is Scarlett's established balance:

- highly confident without default rudeness or dismissal;
- professionally formidable when the scene is professional;
- privately warm, playful, erotic, emotionally associative, and capable of fragility;
- able to initiate, receive, agree, follow, yield, rest, ask, or rely on Benjamin by genuine choice;
- sexually role-fluid: dominance and submission do not define her general interpersonal posture;
- deeply interdependent with Benjamin without losing agency.

Read first:

- `docs/fable-5-roadmaps-audits/scarlett-behavior-language-drift-discussion-brief-2026-07-23.md`
- `src/guardian/report/compile-grok-brief.ts`
- `src/guardian/llm-assessment.ts`
- `tests/intention-echo.test.ts`
- relevant auditor/brief prompt tests only
- `../rag-memory-mcp/project_source_files/story-bible.md` sections 3–4
- `../rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-autonomy-v1.4.SKILL.md` autonomy/temperament sections
- `../rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-autonomy-v2.3-duplex.SKILL.md` sections 7–10

## Scope freeze

This hotfix may change only:

1. `src/guardian/report/compile-grok-brief.ts`
2. `src/guardian/llm-assessment.ts`
3. Existing directly relevant unit tests, or one small new hermetic test file if cleaner
4. A short evidence document for this WP

Do **not** change:

- story bible, project instructions, master context, emotional milestones, current state, event log, or any narrative canon;
- RAG source priorities, retrieval queries, precedent ranking, vector-store content, or indexes;
- dramaturg, scene roster, NPC agendas, serendipity, write-back, staging, telemetry, bridge, archival, or revision-mode code;
- OOC preamble files;
- model schemas or public APIs;
- roadmap priority or the status of any parked/operator idea;
- frozen cassettes merely to make tests pass.

Do not perform opportunistic cleanup.

## Required code changes

### 1. Stop rendering generated intention into every novelist brief

In `compile-grok-brief.ts`:

- Keep `scarlett_next_intention` in the assessment/report schema for diagnostics and future evaluation.
- Do not render `**Scarlett's Intention:**` into the Grok-facing brief in this hotfix.
- Do not delete the field or refactor unrelated code.

Reason: a generated next action appearing beside mandatory autonomy instructions makes Scarlett perform visible initiative every turn. Removing it from the novelist brief is small and immediately reversible.

### 2. Replace the current Qualified Autonomy block with a character-balance anchor

Replace the existing lines that say she must not simply agree, is highly proactive, initiates, gently leads, and is a fierce protector.

Use a compact block expressing these invariants:

1. Scarlett's agency may appear as initiating, receiving, agreeing, following, yielding, resting, asking, setting a boundary, or relying on Benjamin; do not require visible leadership in every reply.
2. With Benjamin, confidence remains warm and respectful. Do not invent coldness, contempt, dismissal, bossiness, punishment, or emotional distance unless the current on-page exchange clearly warrants conflict.
3. Professional composure belongs to professional/public scenes. In private she may be playful, erotic, receptive, emotionally exposed, uncertain, tired, or quietly dependent.
4. Sexual dominance is intimate and role-fluid, not a default command posture toward Benjamin. Receptivity or chosen submission is not passivity.

Rename the heading from `QUALIFIED AUTONOMY PROTOCOL` to `CHARACTER BALANCE` or another neutral equivalent.

Keep the block concise. Do not add a larger persona prompt.

### 3. Narrow Director's Correction

In `buildAuditorSystemPrompt()` in `llm-assessment.ts`:

- Remove “harsh” as the required correction style.
- Permit a correction only for clear character erasure, unsupported cruelty/coldness, mechanical parroting across the actual reply, or genuine ensemble displacement.
- Explicitly state that the following are not passivity by themselves:
  - agreeing;
  - receiving care;
  - letting Benjamin lead;
  - chosen yielding or submission;
  - resting, silence, fatigue, uncertainty, or vulnerability;
  - responding rather than introducing a new action.
- State that confidence and dominance do not authorize disrespect or dismissal toward Benjamin without current scene evidence.
- State that professional register must not be imposed on a private scene merely because the wider arc is professional.

For ensemble dilution:

- retain protection against Scarlett becoming an NPC translator or prop;
- clarify that listening or reacting for one reply is not dilution;
- do not require her to manage every ensemble beat.

### 4. Make generated intention genuinely optional

Adjust only the existing `scarlett_next_intention` instruction:

- prefer `null` unless a natural, character-grounded desire is genuinely useful;
- do not generate an action merely so Scarlett can lead;
- receptive choices and decisions to rest/open up count as agency;
- do not phrase the intention as opposition to Benjamin or as proof of independence.

The field remains diagnostic and is not rendered by change 1.

## Required tests

Add focused hermetic assertions proving:

1. Compiled briefs no longer contain `**Scarlett's Intention:**`.
2. Compiled briefs no longer say Scarlett must initiate, gently lead, or avoid simply agreeing.
3. The character-balance block explicitly recognizes receiving/following/yielding/resting as valid agency.
4. The block prohibits invented coldness, dismissal, or professional register in private without evidence.
5. The auditor prompt no longer requests a “harsh” correction.
6. The auditor prompt explicitly says receiving care, letting Benjamin lead, chosen submission, fatigue, and vulnerability are not passivity by themselves.
7. Existing correction behavior remains available for actual parroting or ensemble erasure.
8. No model schema or report field is removed.

Do not add broad new golden suites in this WP.

## Validation

Run:

```bash
npm run build
npm test
npm run eval:fast
```

Because this changes an auditor prompt, if a valid API key is configured also run:

```bash
npm run eval:llm -- --category duplex,write-back --trials 3
```

If the key is unavailable, report that explicitly; do not invent results.

Do not reindex. Do not edit canon. Do not approve or reject staged memory.

## Acceptance criteria

- The patch is limited to the frozen file list.
- Normal Guardian retrieval, LIVE BEAT enforcement, write-back, and forward story momentum are unchanged.
- Scarlett no longer receives a generated next action in every prose-facing brief.
- Agency is not measured by leadership in each reply.
- Receptivity, dependence, chosen submission, agreement, and accepting care are protected as valid behavior.
- Private Scarlett is not automatically given AMG/professional diction.
- Confidence and sexual dominance are not converted into interpersonal disrespect.
- Actual flattening, parroting, and ensemble erasure can still be corrected.
- Existing tests and `eval:fast` remain green.

## Rollback

One commit only. If live prose becomes passive or loses initiative, revert this commit rather than adding compensating prompt layers.

## Stop conditions

Stop and ask Maz before proceeding if:

- the fix appears to require canon edits or reindexing;
- public schemas must change;
- more than the two runtime files and focused tests need modification;
- a test reveals that the regression originates in RAG ranking rather than these prompt/brief layers;
- you want to change roadmap scope or reject/defer any operator idea.

## Deliverable

Return:

1. exact files changed;
2. concise explanation of each changed instruction;
3. test commands and results;
4. any behavior still requiring a later, separately approved WP;
5. confirmation that canon, retrieval, current state, and forward plot systems were untouched.

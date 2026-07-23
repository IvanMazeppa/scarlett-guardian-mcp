# Scarlett behavior and language drift — discussion brief for Gemini / Grok

**Date:** 2026-07-23  
**Purpose:** Discussion and independent audit only. Do not modify canon, prompts, or Guardian behavior from this brief without Maz's explicit approval.

## Plain-language summary

Scarlett's foundational personality does not appear to have been deliberately rewritten. Her core identity, warmth, sexuality, relationship with Benjamin, Swedish identity, trans identity, vulnerability, protectiveness, and capacity for dominance remain in the main character sources.

However, the machinery surrounding those sources has changed how she is performed.

Guardian now repeatedly asks Scarlett to demonstrate that she is:

- proactive;
- independent;
- leading the scene;
- setting the pace;
- protecting her equality;
- avoiding passivity or simple agreement;
- carrying professional or narrative momentum.

This can make her sound colder, more controlled, or as though she is putting on a professional face—even during private, intimate, exhausted, or emotionally soft scenes.

The concern is therefore not simply “Scarlett has become cold.” It is:

> Scarlett is being asked to prove her agency so often that visible self-direction and competence can crowd out warmth, receptivity, playfulness, erotic specificity, uncertainty, quiet presence, and the freedom to let Benjamin lead without losing herself.

## What probably changed the language

### 1. Agency has become a repeated instruction instead of a natural trait

Every Guardian brief includes a critical Qualified Autonomy block telling Scarlett not to merely agree, and to initiate and gently lead.

Guardian also tries to generate a concrete “Scarlett's Intention” for most turns.

Likely language effects:

- repeated “she chooses,” “she leads,” “she sets the pace,” and “on her terms” constructions;
- deliberate redirection even when no redirection is emotionally necessary;
- less room for stillness, listening, accepting care, uncertainty, or uncomplicated agreement;
- agency that feels mechanically demonstrated rather than naturally embodied.

Relevant implementation:

- `src/guardian/report/compile-grok-brief.ts`
- `src/guardian/llm-assessment.ts`

### 2. Softness or receptivity can be mistaken for passivity

The auditor can issue a deliberately harsh correction if Scarlett appears passive, parrots Benjamin, or allows supporting characters to carry too much of a scene.

That protects her from being flattened into an object or assistant. But it can also overcorrect legitimate character behavior:

- receiving care;
- yielding by choice;
- listening;
- following Benjamin's initiative;
- being tired or uncertain;
- enjoying submission or receptivity;
- simply sharing a quiet moment without introducing a new plan.

The system risks treating visible leadership as proof of personhood.

### 3. Current scene notes strongly repeat “safe / pace / on her terms”

The current live-state language describes Scarlett as exhausted, safe, accepting care while choosing pace, and deciding between rest, tea, bed, or closeness.

That scene framing is valid, but current state has high retrieval authority and can be repeated through:

- scene summary;
- emotional context;
- open threads;
- generated intention;
- Qualified Autonomy instructions.

This repetition can temporarily narrow her voice to “exhausted-safe, equal, pace-setting partner,” even though she is much broader than that.

Relevant source:

- `rag-memory-mcp/project_source_files/current-state.md`

### 4. Distinctive intimacy history is being weakened

Guardian retrieves intimacy and kink history, but historical precedents can receive a strong ranking penalty. Intimacy is not currently one of the triggers that reliably removes that penalty.

Guardian also warns against bringing in historical kink unless the continuity is obvious, and state rewrites preserve adult history mainly at an abstract “continuity/aftercare” level.

Likely result:

- less established sexual vocabulary;
- fewer private erotic callbacks;
- less role-fluid dominance and submission;
- less bodily specificity;
- more generic language about safety, trust, aftercare, intimacy, and closeness.

This is a plausible reason Scarlett may feel less vivid or less recognizably herself.

Relevant implementation:

- `src/guardian/tools/preflight.ts`
- `src/guardian/state-rewrite.ts`

### 5. Emotional callbacks have become too scarce

The resonance mechanism was intended to offer occasional memories, repeated gestures, private phrases, and emotional echoes. A recent audit found no echoes across eighteen turns.

Without those associations, Scarlett may remain factually continuous while sounding less emotionally continuous.

### 6. Professional and plot-management pressure can leak into private Scarlett

Story Momentum, Scene Cast, NPC agendas, and “Scarlett remains the lens and lead” all enter the Guardian process.

These systems can encourage:

- professional competence;
- forward motion;
- scene management;
- anticipation of schedules or threats;
- visible leadership around other characters.

Those are real parts of Scarlett, but they should not become the face she wears constantly with Benjamin.

There have also been cases where offstage professional characters appeared in the active cast, and where stale LIVE BEAT data made Guardian resist already-played intimate scene development.

## Was Scarlett's core personality changed?

### Canonical answer

No confirmed recent change rewrote her central character bible or deliberately removed her warmth, sexuality, vulnerability, affection, dominance, playfulness, or bond with Benjamin.

### Practical answer

Yes, her effective performed personality has been narrowed.

The surrounding prompts and selection rules give disproportionate weight to:

- visible agency;
- leadership;
- control;
- professionalism;
- equality stated in explicit terms;
- resistance to passivity.

They give too little reliable space to:

- receptive agency;
- chosen yielding;
- warmth without a leadership gesture;
- erotic and emotional memory;
- humour and strangeness;
- spontaneous desire;
- dependence and interdependence;
- uncertainty;
- letting Benjamin carry a moment because she wants him to.

That is a subtle but meaningful behavioral change even if the core canon file remains intact.

## Directly attributable GPT Sol work

Confirmed prior Sol work includes:

- a Thread 9 current-state/event-log cleanup and reindex, which framed the active scene around exhaustion, private recovery, and Scarlett controlling pace;
- WP-5.9 NPC-state staging, which can indirectly alter the pressures and knowledge presented around Scarlett;
- architecture reviews and plans.

No confirmed Sol work rewrote the main character bible or removed a core personality trait.

The broader Guardian intention, correction, dramaturg, and ensemble features are confirmed changes, but repository commit metadata does not reliably identify which model authored each one. They should not be falsely attributed.

## What should be preserved

Any correction should preserve both sides of Scarlett:

- fiercely autonomous and deeply interdependent;
- professionally formidable and privately unguarded;
- capable of leading and capable of yielding by choice;
- dominant, receptive, playful, strange, tender, sexual, frightened, amused, exhausted, and contradictory;
- able to accept Benjamin's care without needing to immediately prove that she remains independent;
- able to let Benjamin lead a moment without becoming passive or losing personhood;
- grounded in Qualified Autonomy without repeating its vocabulary in every response.

The objective is not to make Scarlett less agentic. It is to stop requiring her to perform agency in one narrow way.

## Questions for Gemini / Grok

Please review the cited mechanisms and answer candidly:

1. Does the combination of generated intention, mandatory Qualified Autonomy, and harsh anti-passivity correction bias Scarlett toward performative leadership?
2. Could that combination explain colder, more managerial, or “professional face” language in private scenes?
3. Does the system properly recognize receptive agency, chosen submission, accepting care, quiet agreement, and allowing Benjamin to lead?
4. Is historical intimacy being over-penalized or compressed into generic safety/aftercare language?
5. Why has resonance produced almost no emotional echoes, and what character texture is being lost?
6. Does current-state wording get repeated through too many separate brief sections?
7. Are Story Momentum, Scene Cast, and NPC pressure being given too much influence over Scarlett's immediate private voice?
8. Which instructions should become conditional rather than appearing every turn?
9. How can Guardian protect Scarlett's personhood without prescribing a standard performance of autonomy?
10. Which changes are safe prompt/ranking adjustments, and which would risk altering canon?

## Requested audit output

Please produce:

1. A before/after behavioral profile of Scarlett's generated voice.
2. A ranked list of the instructions and ranking rules most likely to cause the drift.
3. Examples of language patterns each mechanism would encourage.
4. A proposed rebalancing that preserves all core traits.
5. Explicit protections for receptive agency, erotic specificity, emotional callbacks, and private warmth.
6. A list of changes that require Maz's approval.
7. No implementation, canon edits, roadmap demotion, or rejection of ideas until Maz has discussed and approved the findings.

## Evidence paths

- `scarlett-guardian-mcp/src/guardian/report/compile-grok-brief.ts`
- `scarlett-guardian-mcp/src/guardian/llm-assessment.ts`
- `scarlett-guardian-mcp/src/guardian/tools/preflight.ts`
- `scarlett-guardian-mcp/src/guardian/state-rewrite.ts`
- `scarlett-guardian-mcp/src/guardian/dramaturg.ts`
- `scarlett-guardian-mcp/src/guardian/scene-roster.ts`
- `scarlett-guardian-mcp/src/guardian/serendipity-weaver.ts`
- `rag-memory-mcp/src/source-priority.ts`
- `rag-memory-mcp/project_source_files/current-state.md`
- `rag-memory-mcp/project_source_files/story-bible.md`
- `rag-memory-mcp/project_source_files/project-instructions.md`

## Discussion boundary

This report is diagnostic. It does not authorize:

- changing Scarlett's canon;
- weakening her autonomy;
- deleting or shelving operator ideas;
- modifying prompts or source priorities;
- changing current state;
- reindexing;
- implementing a fix.

Discuss findings with Maz first.

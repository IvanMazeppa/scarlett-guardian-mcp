# Gemini prompt — complete remaining NPCs (Shevchenko/Ryan template)

**Date:** 2026-07-24  
**Operator:** Maz (budget: keep heavy research on Gemini; freeze with Grok/Sol only when needed)  
**Gold template:** `docs/fable-5-roadmaps-audits/npc-research-shevchenko-ryan-2026-07-22.md`  
**Workflow:** `docs/fable-5-roadmaps-audits/npc-and-place-enrichment-workflow-2026-07-22.md`  
**Live merge targets (do NOT edit unless Operator freezes):**  
- `rag-memory-mcp/project_source_files/secondary-characters-bible.md`  
- `rag-memory-mcp/project_source_files/npc-agendas.md`  
- family stealth: `family-dynamics.md` (only if must-not-learn changes)

---

## Copy everything below the line into Gemini

---

You are helping complete **NPC research drafts** for the Scarlett & Benjamin long-form RP / Guardian RAG system. You are **not** the live novelist and you must **not** invent scandals, outing events, or Germany on-site appearances without labelling them as Operator-authorised inventions.

### System context (short)

Guardian uses:

1. **Identity + registry tails** in `secondary-characters-bible.md` (Disposition / Wants / Knows / Must not learn / Last seen — STABLE vs VOLATILE).  
2. **Pressure agendas** in `npc-agendas.md` (wants, cues, max tier — **never** scripted dialogue).  
3. **LIVE BEAT Present** in `current-state.md` decides who is in the room *this beat*.  

Scene Cast and serendipity pull from those files. Private couple scenes (suite bed) must **not** get offstage engineers unless Benjamin’s turn brings them.

### Gold-standard completed example (follow this shape)

Reference file already filled and **MERGED**:

`npc-research-shevchenko-ryan-2026-07-22.md`

For **each** NPC produce the same structure:

```markdown
## [Display name] ([optional full name]) — freeze summary

### Canon-locked
- (facts already in bible / bibles / event-log / master-context — cite source if known)

### Invented (Operator-authorised gap fill)
- (physical, manner, professional texture clearly labelled as invented)

### Do not invent later without freeze
- (hard bans: e.g. suite intrusion, outing Scarlett, graphic DV on stage, Service blackmail)

### Proposed registry tail (for secondary-characters-bible.md)
**Disposition (couple):** … (VOLATILE or STABLE)
**Wants now:** … (VOLATILE)
**Knows:** … (STABLE/VOLATILE as appropriate)
**Must not accidentally learn:** … (STABLE for stealth)
**Last seen:** … (VOLATILE)

### Proposed agenda block (for npc-agendas.md)
- **want:** one pressure sentence (no dialogue)
- **cues:** keywords that may activate when relevant
- **suggestedTier:** ambient | peripheral | engaging | disruptive
- **notes:** offstage vs on-site rules for Germany / Schloss Lieser / Affalterbach
```

### Rules (hard)

1. **Stealth canon:** Ryan, Lynn, Chris, Deb, extended Evans family — **Must not accidentally learn: Scarlett is trans** unless Operator freezes a story-event reveal. Never auto-out her.  
2. **Ryan** is real-person-inspired fiction: treat carefully; no graphic DV staging; no on-site Germany unless frozen; contact = texts/calls only by default.  
3. **Shevchenko** is already done — use only as quality bar, do not rewrite unless asked.  
4. Prefer **roles + 1–2 named faces** for corps (AMG engineers, Albion) rather than a phonebook of 20 full bios.  
5. Agendas are **pressure only** — never pre-written dialogue for Grok.  
6. Label every new claim: `canon-locked` | `invented-gap-fill` | `needs-Operator-fact` | `do-not-invent`.  
7. Do **not** place NPCs in the Schloss Lieser suite bedroom unless LIVE BEAT Present lists them.  
8. Affalterbach/Monday = schedule pressure offstage unless scene is professional.  
9. Output **research drafts only**. Do not claim merge/reindex is done. Operator freezes → human merge → single-file reindex.  
10. No speech/TTS instructions. No Character Balance essays. No system prompt for Scarlett’s private voice.

### Priority batch (work these first)

Produce one freeze-summary **each**, in order:

1. **Lynn** (Benjamin’s mother — stealth; limited capacity)  
2. **Chris & Deb Evans** (family logistics; can be one combined section + optional separate tails)  
3. **AMG telemetry engineers** (group role + optional **one** named lead face if useful)  
4. **Maya** (queer friend circle)  
5. **Priya**  
6. **Theo**  
7. **Karin** (Vaxholm / Sweden — offstage unless Sweden arc)  
8. **Dr Berg**  
9. **Rafael** (if present in bible — light touch)  
10. **Albion / generic HQ pressure** (role, not 10 people)

Skip full rewrites of Shevchenko and Ryan unless gaps remain after reading the gold file.

### Quality bar (from Shevchenko/Ryan)

- Specific enough for Scene Cast one-liners (pressure + ⚠ boundary).  
- Physical + voice texture when invented is **brief** (age, height, manner — not a novel).  
- Clear **Last seen** for Germany recovery weekend (offstage vs phone range).  
- Clear **Do not invent** list so future agents cannot escalate threat arcs.  
- Agenda tier sensible: family logistics often `peripheral`; Ryan threat never auto-jumps to disruptive on a private suite beat.

### If sources are missing

If you cannot read the repo files, still produce drafts using:

- Public pattern from the gold Shevchenko/Ryan summaries in this prompt.  
- Conservative placeholders marked `needs-Operator-fact`.  
- Ask Maz for paste of the relevant bible section only when blocked.

### Deliverable format for Maz

1. One markdown document titled `npc-research-batch-[date].md`.  
2. Sections per NPC as above.  
3. Final checklist:

```markdown
## Merge checklist (Operator)
- [ ] Lynn bible + agenda
- [ ] Chris/Deb bible + agenda
- [ ] AMG engineers (group) + optional named lead
- [ ] Maya / Priya / Theo
- [ ] Karin / Dr Berg / Rafael (light)
- [ ] Operator freeze each block
- [ ] Merge into secondary-characters-bible.md + npc-agendas.md
- [ ] Single-file reindex only those files
- [ ] Smoke query each name
```

### Opening task for Gemini

Start with **Lynn**, then **Chris & Deb**. For each: invent only what is needed for 3D pressure; mark invented lines; never invent outing Scarlett or Germany suite intrusion.

When finished with the full priority batch, stop and wait for Operator freeze. Do not merge into live corpus yourself.

---

## Operator notes (not for Gemini unless useful)

### Dramaturg / serendipity after Thread 10

**Neither was disabled.**

| System | Status |
|--------|--------|
| Dramaturg | **ON** by default (`GUARDIAN_DRAMATURG_ENABLED`) |
| Serendipity weaver | **ON** |
| What changed | INTEL-1 **scene-confidence**: when state is *provisional* (save-lag / stale Present / missing LIVE BEAT), serendipity caps to **ambient-only** and dramaturg uses a **neutral** momentum line for that turn only. Fresh aligned LIVE BEAT → normal behaviour. |
| Sidecar `rm` | Cleared **cache files only**; they regenerate. Not a feature kill-switch. |

### Roadmap

Clear to continue Sol plan after INTEL-0/1:

1. **INTEL-2** — sidecar/cache fingerprinting (next code WP)  
2. INTEL-3 — retrieval correctness / budgets  
3. INTEL-4 — adaptive retrieval  
4. INTEL-5 — measured escalation  

Narrative NPC enrichment (this Gemini batch) can run **in parallel** without blocking INTEL-2, as long as merge + reindex stay human-gated.

### Token budget tip

Use Gemini for research drafts; use Grok only for: freeze review, merge wording, one preflight smoke, and IC play.

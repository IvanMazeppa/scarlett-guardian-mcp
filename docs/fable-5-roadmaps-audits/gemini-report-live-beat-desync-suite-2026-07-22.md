# Gemini report — LIVE BEAT desync (cabin vs suite/shower) + prompt guidance

**Date:** 2026-07-22  
**Audience:** Gemini (play co-pilot / prompt hygiene)  
**Operator:** Maz  
**Status:** Continuity **repaired offline**; re-preflight from fixed LIVE BEAT  

---

## 1. What happened (plain language)

Play advanced quickly across many locations in Thread 9:

1. Nürburgring changing room / pit box  
2. Night drive  
3. Arrived Schloss Lieser (car cabin, engine off)  
4. Rushed into hotel → private suite  
5. Shower aftercare  
6. Towels → bathroom doorway → noticing the suite  

The **Guardian save file** (`rag-memory-mcp/project_source_files/current-state.md`) lagged at step **3** (or earlier) for a long time.

Guardian treats that file as **LIVE BEAT ground truth**. When Grok wrote suite/shower prose, preflight often returned:

- Outdated cues (Black Panther / parked / arrived)  
- Scene cast noise (Shevchenko / AMG still “active”)  
- **DIRECTOR'S CORRECTION** telling Scarlett the suite/shower was invented and to return to an older beat  

That was **save lag**, not the model “lying” and not a reason to unwind played aftercare.

### Location cards are not enough alone

These were indexed into the vector store and help **detail** when retrieved:

- `project_source_files/location-descriptions/schloss-lieser-suite.md`  
- `project_source_files/location-descriptions/schloss-lieser-hotel-castle.md`  

They do **not** override LIVE BEAT. If `current-state.md` says “car,” the auditor will still fight “suite.”

### Operator fix (done 2026-07-22)

| Action | Result |
|--------|--------|
| Rewrote `current-state.md` | Post-shower, towels, bathroom doorway of suite |
| Appended `event-log.md` | Rush-in → shower → doorway notice |
| Reindexed both | Live vector store updated |
| Rejected stale staged suite rewrite | Avoid conflicting pending overwrite |
| Cleared dramaturg cache | Reduce stale momentum/cast |
| Fixed **Present** line | Only “Scarlett and Benjamin only” (naming offstage NPCs on Present was polluting scene roster) |

**Guardian server restart was not required** for the disk LIVE BEAT fix (each preflight re-reads live state). Reindex **was** required so RAG chunks match.

### Current live beat (for Gemini / Grok)

- **Where:** Schloss Lieser private suite — bathroom doorway looking into living area  
- **Who:** Scarlett + Benjamin only  
- **What:** Towels on; shared shower finished; Benjamin just noticed the opulence for the first time (“rushed past / only saw you”)  
- **Not:** Car cabin, changing room, pit box, engineers in the room  
- **Affalterbach:** Monday, not tonight  

---

## 2. Why this kept recurring (system + process)

1. **Multi-scene play outran human/auto save** — write-back often stays `none` on continuous intimate beats; staged transitions need review; multi-hour gaps without `current-state` update = guaranteed desync.  
2. **Auditor is designed to enforce LIVE BEAT** — correct when save is right; punitive when save is stale.  
3. **OOC consult loops** — Grok correctly noticed desync and called `guardian_ooc_consult`, but without an offline state fix the next preflight repeated the same error.  
4. **Present-line parsing** — listing “offstage Shevchenko / AMG” on the same Present line caused scene roster to treat them as present_cast.  

Process rule going forward: after any durable place change (car → lobby → suite → post-shower), Operator or implementer must **update the save file + reindex** (or approve a valid staged rewrite). Say: *“update save file to [beat].”*

---

## 3. Prompt / instruction changes (for Gemini and Operator)

### 3.1 OOC block when play has moved (paste into Thread 9 when needed)

```text
OOC — CONTINUITY (operator-fixed LIVE BEAT)

Disk current-state was updated offline. Present beat is NOT the car and NOT the paddock.

LIVE BEAT now:
- Schloss Lieser private suite
- Shared shower finished; towels on
- Bathroom doorway looking into living area
- Benjamin just registered the suite’s luxury for the first time (they rushed in)
- Present: Scarlett and Benjamin only; engineers/Shevchenko offstage

If guardian_memory_preflight returns cabin/parked-car or a DIRECTOR'S CORRECTION denying the suite/shower:
- Trust this OOC + user IC over the stale snapshot once Operator has confirmed the fix
- Do NOT unwind shower/aftercare
- Write Scarlett from the towel doorway beat

Call guardian_memory_preflight first with:
- scarlett_previous_message = your exact previous IC reply
- user_message = Benjamin’s latest IC
- recent_context = one line matching LIVE BEAT above
- force_full_retrieval = false (true only if tools/state clearly broken)

Do not invent engineers into the suite.
```

### 3.2 GM Directive / stress-test prompts (Gemini-authored)

**Add:**

- Explicit **LIVE BEAT one-liner** every few IC turns when location changes.  
- After any travel/check-in/shower complete: *“Operator: update current-state if not already done.”*  
- **Anti-reset:** “Do not return to cabin/paddock if recent IC establishes suite.”  

**Avoid:**

- Long multi-beat time jumps in one GM directive without a state-update reminder.  
- Present-line wording that names offstage NPCs on the same line as Present (put them under Open threads / Offstage).  

### 3.3 Project / skill / OOC prefix (Grok canvas or local)

Prefer **`rag-memory-mcp/docs/single-agent-ooc-prefix-v5.txt`** (revision contract) plus this addition when co-piloting travel arcs:

```text
LIVE BEAT AUTHORITY
- Disk current-state is ground truth for location/time/cast.
- If played IC and LIVE BEAT conflict, flag OOC: "save lag — need operator current-state update" rather than rewriting played aftercare out of existence.
- Location description files support sensory detail; they do not move LIVE BEAT by themselves.
```

### 3.4 When Guardian blocks suite that is already played

1. Operator updates `current-state.md` (+ event-log if useful) + `npm run index:changed` for those files.  
2. Re-run preflight once.  
3. Only then continue IC. Do not burn turns on OOC consult loops alone.

### 3.5 “Rushed / didn’t notice the room”

Valid play framing. Gemini/Grok may use suite location cards for **doorway noticing** without forcing a full hotel tour on entry.

---

## 4. Grok platform note (canvas / cloud files)

Operator reports Grok has moved toward a **canvas / live cloud file** system instead of the old project-source + connectors dialogue model. Cloud file repo may currently be empty.

**Implications for Gemini / ops:**

- Canonical narrative memory for this project remains the **local dual-repo** (`rag-memory-mcp/project_source_files` + Guardian + vector store).  
- Canvas edits on Grok’s servers are **not** automatically LIVE BEAT unless Operator mirrors them into local `current-state` and reindexes.  
- Do not assume Grok canvas = RAG canon.  
- When advising the Operator, prefer “edit local current-state / reindex” over “upload to Grok cloud for continuity.”  

(Exact canvas UX may evolve; treat local + vector store as source of truth for Guardian.)

---

## 5. Track-day image — how to use it (recommendation)

**File:** `rag-memory-mcp/temp/imagine-c179d0c7-4ed1-4e8d-8c0d-5ea53ef90e5b.jpg`  
(~492 KB JPEG, 1792×1008 — Scarlett-like redhead in AMG suit, matte Black Panther, pit lane / engineers)

### Best use ranking

| Rank | Method | When | Why |
|------|--------|------|-----|
| **1** | **Native Grok image attachment** on the IC/OOC message (or chat upload if UI allows) | One-shot visual for this turn / flashback | Model sees the image; no Drive round-trip; controlled to **one** image |
| **2** | **Grok cloud files / canvas** (if image can sit next to the thread) | Reuse across a few turns without re-attaching | Handy if canvas is sticky to the session |
| **3** | **Google Drive connector** | Only if attachment fails and Drive is already trusted | Extra tool latency; retrieval may be flaky; easy to pull wrong file |
| **4** | Don’t put full image in every turn | Ongoing play | Context cost; visual drift vs canon (helmet off, suit branding, pit staff) |

### Recommendation

- **Use the image sparingly:** attach **once** when you want a visual anchor (e.g. post-stint memory, pit-lane flashback, or “this is how she looked after the lap”).  
- Prefer **native attachment** over Drive for a single image.  
- **Do not** re-attach every message; after first use, reference in text: *“the pit-lane image we used earlier — helmet in hand, matte Black Panther behind her.”*  
- Optional: keep a **short text caption in canon** (not full binary) under a location/visual note if you want retrieval without tokens of pixels every turn.  
- Expect **visual ≠ hard canon** unless Operator freezes details (suit colours, freckles, exact aero package). Good for mood; LIVE BEAT + character bible still win on identity rules.

### Example OOC + IC framing

```text
OOC: One reference image attached (track/pit after the stint). Use for visual mood only; LIVE BEAT remains [current beat]. Do not invent new track action.

[IC Benjamin…]
```

### Context window

One ~0.5 MB image is usually acceptable for a single turn on modern multimodal Grok. Multiple images or every-turn reattach is when costs and drift explode. **One image, occasional reuse by text reference = fine.**

---

## 6. What Gemini should do in play right now

1. Treat LIVE BEAT as **suite doorway / post-shower** (Operator fixed).  
2. Continue Scarlett from towels + doorway + Benjamin’s “I only saw you” beat.  
3. Optional light suite detail from location cards as they notice the room.  
4. Do not re-open cabin/paddock.  
5. If preflight still shows car cues, stop and tell Operator “save lag again” rather than fighting three OOC consults.  
6. Personality: keep Qualified Autonomy / aftercare agency; do not flatten into passive shower object.

---

## 7. Related local docs

- `docs/operator-how-to-regenerate-safely.md`  
- `docs/fable-5-roadmaps-audits/npc-and-place-enrichment-workflow-2026-07-22.md`  
- `rag-memory-mcp/docs/hotel-location-card-from-photos.md`  
- `rag-memory-mcp/docs/single-agent-ooc-prefix-v5.txt`  
- Branch: `feature/schloss-location-ops-2026-07` (both repos)

---

## 8. One-line summary for Gemini

**Play was ahead of the save file; Guardian correctly enforced a stale car-arrival LIVE BEAT against suite/shower IC until Operator rewrote current-state and reindexed — use the fixed doorway beat now, add LIVE BEAT lines to GM prompts after travel, and prefer a single native image attach for the track visual rather than Drive every turn.**

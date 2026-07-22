# NPC + place enrichment workflow

**Date:** 2026-07-22  
**Operator priority:** Shevchenko + Ryan first; later AMG / Albion / Mercedes ensemble; places same pipeline.  
**Authority:** Operator freezes draft → then live edit + reindex. Agents do not invent scandals or jump Ryan threat stages.

---

## 1. How the stack uses this (why enriching matters)

```text
LIVE BEAT (current-state **Present:**)
        │
        ▼
Scene roster (5.7) ──► which NPCs are "in the room" (cap ~4)
        │
        ▼
Exact-section expand (R2) ──► pull that NPC's bible section
        │
        ▼
Scene Cast brief (5.8) ──► pressure-only lines for Grok
        │
        ▼
npc-agendas (5.4) ──► offstage wants / serendipity
        │
        ▼
npc_state_changes (5.9) ──► played change → STAGED bible rewrite (you approve)
```

| Layer | File | What you put there |
|-------|------|---------------------|
| **Identity + body + history** | `secondary-characters-bible.md` | Who they are; look; voice; history |
| **Registry tail (machine)** | Same file, per NPC | Disposition / Wants / Knows / Must not learn / Last seen (STABLE vs VOLATILE) |
| **Pressure schedule** | `npc-agendas.md` | What they want *now*, cues, tier — never scripted dialogue |
| **Stealth policy** | `family-dynamics.md` | Family must-not-learn (Ryan included) |
| **Places** | `location-descriptions/*.md` | Navigable room/building layout for prose + orientation |
| **Now** | `current-state.md` | Who is present *this beat* only |

Guardian does **not** need a photo. It needs **text chunks** that retrieve cleanly under headings.

---

## 2. Character pipeline (Shevchenko → Ryan → later corps)

### Step A — Mine (no live edit)
1. RAG queries + historical thread secondary files.  
2. Write a **research draft** (this folder or `temp/`).  
3. Split lines into: **already canon** | **proposed enrich** | **needs Operator fact** | **do not invent**.

### Step B — Operator texture
Especially for **Ryan** (real-person inspired):  
you add voice, mannerisms, contradictions, specific history — still **fiction** in-world.  
Agent fills structure; you supply the 3D life.

### Step C — Freeze draft
You say: **approve Shevchenko bible** / **approve Ryan bible** (or edit first).

### Step D — Apply
1. Edit `secondary-characters-bible.md` (identity + registry tail).  
2. Align `npc-agendas.md` (pressure only).  
3. Touch `family-dynamics.md` only if stealth/policy changes.  
4. `npm run index:changed -- --source-file …` (correct labels).  
5. Optional: smoke `npm run query -- "Ryan …"` / `"Shevchenko …"`.

### Step E — Play
Gemini/Grok: when Present or cues fire, Scene Cast + expand use the richer chunk.  
**Played** disposition changes → 5.9 stages a rewrite; you still approve.

### Corps later (AMG / Albion / Mercedes)
Same steps, but prefer **roles + 1–2 named faces** (e.g. “AMG lead telemetry — [Name]”) rather than a phonebook. Word-of-mouth at HQ = agenda pressure, not 20 new full bios.

---

## 3. Place / building pipeline (your suite experiment, systemized)

You already proved the idea with multi-angle photos → Gemini narrative. Fit:

### Step A — Capture
- Photos/angles of real or reference spaces (hotel suite, paddock box, Affalterbach lobby, etc.).  
- Optional: floor sketch (doors relative to bed, bathroom, window).

### Step B — Gemini (or any VLM) brief
Ask for **navigation-grade** text, not only vibe:

```text
From these images, write a continuity location card:
- Overall layout (how rooms connect; entry path)
- Zones: entrance, seating, bed, bath, windows, working surfaces
- Fixed landmarks characters can orient to (fireplace left of door, etc.)
- Circulation: where someone walks from door → bath → bed
- Sensory anchors (materials, light) without purple prose overload
- Do NOT invent rooms not visible
- Flag uncertainty as UNCERTAIN:
```

### Step C — Canon file
Save under:

`rag-memory-mcp/project_source_files/location-descriptions/<slug>.md`

Use clear `#` / `##` headings (indexer splits on headings).  
Template exists: `location-descriptions/villa-petrusse-suite-luxembourg-hotel.md`  
(Improve structure next time with explicit `##` sections for retrieval.)

### Step D — Reindex that file  
Same as NPCs.

### Step E — Link from live state
When the scene is there, `current-state.md` location line should **name** the place so retrieval and LIVE BEAT agree  
(e.g. Schloss Lieser suite — after you approve suite stage or write it).

**Optional later (ask you before building):**  
- `location` source_role boost (today locations may sit under generic profiles)  
- Scene-transition helper that suggests location card on durable move  

---

## 4. What enriches vs what pollutes

| Do | Don’t |
|----|--------|
| Specific, playable traits | Dump real person’s legal name / doxxing |
| Contradictions (Ryan: charming + predatory) | Script his next crime beat in agendas |
| Shevchenko: principled + impatient | New classified Service scandal |
| Place: door left of fireplace | Invent a second wing not in photos |
| STABLE vs VOLATILE tags on registry | Auto-update “Knows: Scarlett is trans” |

---

## 5. Parallel with Gemini RP stress

- You/Grok Build: research + drafts offline.  
- Gemini: hotel/play.  
- Don’t reindex mid-preflight if you can help it; reindex between sessions.  
- Duplex refills on next substantial Scarlett IC.

---

## 6. Current batch status

| Subject | Status |
|---------|--------|
| Workflow (this doc) | live |
| Shevchenko research draft | see companion file |
| Ryan research draft | see companion file |
| Live bible/agenda edits | **waiting Operator freeze** |
| Places batch | ready when you pick first site (Schloss suite recommended after cabin) |

# WP-5.4 — NPC agendas → serendipity weaver

**Date:** 2026-07-18  
**Repos:** Guardian + RAG corpus  
**Status:** done  

## Ticket

`npc-agendas.md` (top 4 NPCs) + agenda intersections route through serendipity weaver and **outrank** the random catalog at the tier the scene mode admits.

## Delivered

| Item | Detail |
|------|--------|
| Corpus | `rag-memory-mcp/project_source_files/npc-agendas.md` — Shevchenko, AMG engineers, Ryan, Chris & Deb |
| Parse / intersect | NEW `src/guardian/npc-agendas.ts` — parse, word-aware cue match, merge with dramaturg LLM intersections |
| Weaver | `selectSerendipity(..., { npcIntersections })` — after deferred queue, **before** fireChance/catalog; over-tier → defer |
| Preflight | Builds intersections from LIVE BEAT + user message (+ cached dramaturg), logs `(agenda)` on pick/defer |
| RAG | `npc-agendas.md` priority **85** (letter-tier supporting); reindexed into live store |

## Routing law

1. Deferred queue (unchanged)  
2. **Agenda intersections** (no drought roll; cooldown still applies)  
3. Catalog fireChance + weighted pick  

Intimate/vulnerable still cap at ambient → engaging Shevchenko **defers** (tested).

## Acceptance

- Hermetic: agenda outranks catalog; over-tier defers; parse ≥4 NPCs; track-day cues hit Shevchenko/AMG not Ryan  
- `npm test` green; `eval:fast` **31/31**  
- Live log example (professional pit): `NPC agendas intersecting: Mr. Shevchenko[engaging]` → serendipity `agenda_… (agenda)`

## Out of scope

- WP-5.5 intention/echo  
- WP-5.6 `npc_canon` role for full secondary-characters bible  

## Verify

```bash
npm test && npm run eval:fast
# Restart Guardian after deploy
```

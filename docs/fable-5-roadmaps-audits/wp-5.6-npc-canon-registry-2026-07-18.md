# WP-5.6 — `npc_canon` source role + registry tails

**Date:** 2026-07-18  
**Repos:** RAG (role + corpus) + Guardian docs/ledger  
**Status:** done  

## Ticket

`npc_canon` source role (priority **78**) for `secondary-characters-bible.md` + `family-dynamics.md`; enum + reindex; registry tail-fields on top ~8 NPCs (merge `npc-agendas.md` content).

## Delivered

| Item | Detail |
|------|--------|
| Role | `npc_canon` priority 78 / boost 0.03 (between event_log 80 and arc_chronicle 75) |
| Files | Explicit PROFILES for both NPC files; `SOURCE_ROLE_ENUM` + retriever explanation / medium importance |
| Registry tails | Disposition, Wants now, Knows, Must not accidentally learn, Last seen on: Shevchenko, Ryan, Lynn, Debbie, Chris, Dan, Maya, Karin, Dr Berg |
| Stealth | Family tails point at family-dynamics.md; knowledge change = human story event |
| Agendas merge | Shevchenko / Ryan / Chris-Deb wants from live `npc-agendas.md` into registry VOLATILE lines |
| Tests | `test-rotation` asserts role + priority sandwich |

## Acceptance

- NPC files no longer fall through to bottom-tier supporting_backstory (50).  
- Hermetic role tests green; build green.  
- Live reindex of both files into active vector store.

## Out of scope (next)

- 5.7 `scene-roster.ts` + Present:  
- 5.8 Scene Cast brief block  
- 5.9 npc_state_changes staging  

## Verify

```bash
cd rag-memory-mcp && npm run build && npm run test:rotation
npx tsx scripts/reindex-one-file.ts project_source_files/secondary-characters-bible.md
npx tsx scripts/reindex-one-file.ts project_source_files/family-dynamics.md
```

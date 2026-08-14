# Wardrobe system (pointer)

Canonical design: `../rag-memory-mcp/docs/visual-lore/wardrobe-system-design.md`  
Work log: `../rag-memory-mcp/docs/visual-lore/wardrobe-system-work-log.md`

**v1 (2026-08-14):** `src/guardian/wardrobe.ts` reads `live-outfit.md` from disk (not RAG), always injects LIVE wearing, and on tight change-beats offers register ∩ kit looks. Brief block is essential in `compile-grok-brief.ts`. Write-back candidate is computed; **not** auto-persisted yet.

Do not implement random keyword roulette.

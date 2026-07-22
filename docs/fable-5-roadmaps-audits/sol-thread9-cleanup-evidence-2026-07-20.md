# Sol Thread 9 Continuity Cleanup Evidence — 2026-07-20

## Scope result

Thread 9 continuity hygiene is complete. No WP-R1–R4, Living GM, Phase 6, or unrelated feature code was changed.

**Go/no-go:** **GO** for coding to begin at **WP-R1 only**, after Operator ACK.

## Files changed

Durable narrative/source changes:

- `rag-memory-mcp/project_source_files/current-state.md`
- `rag-memory-mcp/project_source_files/event-log.md`
- `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/sol-thread9-cleanup-evidence-2026-07-20.md`

Local/runtime synchronization:

- `rag-memory-mcp/.env` — `OPENAI_VECTOR_STORE_ID` aligned to the completed full-reindex store.
- `rag-memory-mcp/.rag-memory-mcp/last-index.json` — canonical targeted-reindex manifest promoted after the two edited files were replaced.
- The reindex tooling created timestamped local manifest backups under `.rag-memory-mcp/manifest-backups/`.

## Residual lag corrections

- **Dominant feelings:** “energized / ready to be exacting” → physically spent in the post-stint adrenaline crash, with pride in the completed 6:54.2 beginning to land.
- **Unvoiced desires:** “first debrief / next evaluation run” → get out of the soaked Nomex, recover privately, and choose how to process the completed achievement; engineers already have the telemetry.
- **Benjamin observable state:** “at the driver’s side / pit-box atmosphere” → inside the locked changing room, focused on Scarlett’s recovery while engineers remain outside.
- **Autonomous plans:** implied professional follow-up → Scarlett chooses the help, pace, speech, rest, or redirection; Benjamin’s care is available rather than scripted.
- **Response notes:** predetermined intimacy / “in Benjamin’s arms” → private relief and care are available, while Scarlett’s Qualified Autonomy controls what happens next.
- **NPC/run cue:** “decisions about the next run” → no new character enters; Shevchenko and engineers process the completed run offstage.
- **Event durability:** log stopped after the first shakedown lap → added a factual Friday-late-afternoon session block for the Map 6 thermal push, 6:54.2, greasy rears, team shock, pit lean, and locked changing-room retreat.

Preserved anchors: 6:54.2, thermal/cooling and greasy-rear facts, Friday hotel/weekend recovery itinerary, Monday Affalterbach, the anti-reset instruction, and the Qualified Autonomy line.

## Itinerary verification

- Arc-09 Beat 4 remains **Friday evening luxury-hotel recovery near Nürburg/Eifel**, with exact property and departure timing open.
- Beat 4 explicitly forbids same-day Affalterbach and does not force hotel check-in during the changing-room scene.
- AMG HQ at Affalterbach remains downstream on **Monday**.

No itinerary edit was required.

## Hygiene and vector-store verification

- **Staged queue:** empty.
- **Duplex cache:** not empty after ongoing bridge activity; one fresh 2,238-character entry was present. This is not the cleared short “Understood” payload, but message bodies are intentionally absent from the observability endpoint. Duplex selection remains fragile until WP-R1.
- **Full-reindex claim:** manifest already named `vs_6a5da57de1248191959f4764ed453943`, but `.env` and the running RAG process still named old store `vs_6a2d14890d6c81919a2177f5a65a059e`. `.env` was corrected and the RAG server restarted.
- **Final active store:** `.env`, canonical manifest, and `/health` now agree on `vs_6a5da57de1248191959f4764ed453943`.
- **Targeted reindex:** final manifest contains 513 canonical sections, including seven `current-state.md` sections and five `event-log.md` sections. No `project_source_files/current-state.md` or `project_source_files/event-log.md` duplicate labels remain.

The first documented `index:changed` path form exposed the known single-root/source-label mismatch and temporarily added duplicate labels instead of replacing stale entries. Those duplicate remote files and manifest entries were removed. The final run used canonical labels against an isolated manifest copy, replaced the stale sections, and promoted the corrected manifest; no new vector store was created.

## Verification commands and results

- `npm run review:staged -- list` — PASS, “No pending staged updates.”
- Guardian `GET /duplex-cache` metadata — PASS, one substantial fresh entry; no short poison signature.
- RAG `GET /health` after restart — PASS, vector search active on `vs_6a5da57de1248191959f4764ed453943`.
- `npm run index:changed ...` for `current-state.md` and `event-log.md` — PASS after canonical-label workaround; 12 corrected sections indexed.
- `npm run query -- "What is the current scene after Scarlett's 6:54.2 lap?"` — PASS, high-confidence retrieval led with corrected `current-state.md` and the new Friday close in `event-log.md`.
- Stale-language search for “ready to be exacting,” “first debrief,” “next evaluation run,” driver-side Benjamin, and “next run” — PASS, no residual matches.
- Arc-09 search for Beat 4 / Friday hotel / Monday Affalterbach — PASS.
- `git diff --check` — PASS.

No build or test suite was run because this cleanup changed Markdown canon and local index configuration only, not runtime code.

## Remaining risks

- The current changing-room scene must supersede the earlier morning changing-room memory; retrieval now ranks the corrected live state first, but authors must still treat older occurrences as history.
- Browser duplex capture can still replace a valid long reply with a short non-narrative bubble until WP-R1 adds scraper and server-side floors.
- `index:changed` remains operationally brittle for a single `memory_dirs` root; use canonical-label care or a full reindex until a separately authorized tooling fix exists.

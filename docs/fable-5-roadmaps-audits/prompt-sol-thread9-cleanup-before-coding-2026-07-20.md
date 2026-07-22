# Paste prompt — GPT Sol: Thread 9 cleanup before coding

**Date:** 2026-07-20  
**Mode:** Agent (docs/canon hygiene only)  
**Not authorized:** WP-R1…R4, Phase 6, Living GM code, duplex userscript rewrites  

Copy everything under **PASTE BELOW** into the Sol Cursor thread.

---

## PASTE BELOW

```text
You are GPT Sol on the Scarlett Guardian / RAG monorepo.

## Mission
Clear residual continuity hygiene for Thread 9 and leave a clean handoff for coding.
This is NOT a feature implementation session.

Gemini already did Thread 9 preflight work. Read:
scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/thread-9-preflight-changes-2026-07-20.md

Claimed done by Gemini (verify, do not redo blindly):
- current-state location → private changing room; 6:54.2 locked
- full reindex (new vector store bound in .env)
- DELETE /duplex-cache (cleared OOC "Understood" poison)
- staged queue empty
- GM autonomy wording: "She's exhausted and the suit needs to come off; where it goes is hers."

Also read for roadmap context (do not implement R-tickets yet):
- fable5-response-sol-review-2026-07-20.md
- fable5-progress-audit-nordschleife-2026-07-20.md
- master-roadmap-2026-07.md §13 (R1–R4 pending)
- arc-plans/arc-09-nurburgring-track-day.md (Monday Affalterbach itinerary)
- rag-memory-mcp/project_source_files/current-state.md (live file)

## Out of scope (FORBIDDEN this session)
- WP-R1 duplex userscript / server floor implementation
- WP-R2 manifest findSection code
- WP-R3 telemetry isolation code
- WP-R4 goldens
- Living GM code, Phase 6 scripts
- Multi-file refactors unrelated to continuity hygiene

## In scope — verify + fix residuals

### A. current-state.md internal consistency (known defect)
High-level snapshot is post-6:54.2 changing room, but some Scarlett/Benjamin sections still lag early-debrief voice.

Fix so ALL of these agree with "laps OVER, locked changing room, exhausted recovery":
1. Dominant feelings — not "energized / ready to be exacting / next evaluation run"
2. Unvoiced desires — not "give team first debrief / next thermal stint leadership"
3. Benjamin observable state — not "at driver's side for debrief" if they already locked the door
4. Notes for next response / autonomous plans — align with suit-off + private recovery; keep technical pride as *completed* memory
5. Keep: 6:54.2, greasy rears / thermal facts, Monday itinerary, anti-reset "do not put her back in the car", Qualified Autonomy line
6. Do not invent hotel name, Affalterbach arrival, or unplayed adult detail beyond "private space after the stint"

### B. event-log.md durability
Check whether a Friday session block exists for: thermal push / 6:54.2 / team shock / pit lean / retreat to changing room.
- If missing: append a concise ## Session — block (facts only; no outcomes for later weekend)
- If present: ensure it doesn't contradict current-state

### C. Arc-09 / itinerary
Confirm Beat 4 still says luxury hotel recovery Friday evening, NOT same-day Affalterbach.
Confirm Monday HQ remains downstream only.
Do not force hotel check-in mid-changing-room scene in momentum language.

### D. Hygiene re-check (report only unless broken)
1. Staged queue still empty? (`npm run review:staged` or list staged)
2. Duplex cache: still empty is OK for Thread 9 turn 1; note if poisoned content returned
3. Vector store: confirm .env VECTOR_STORE_ID / active store matches Gemini's reindex claim (report the id; do not create a new store unless broken)
4. If you edit current-state or event-log: run `npm run index:changed` (or document why full reindex is required)

### E. Ops notes for Operator (write a short evidence doc)
Create:
scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/sol-thread9-cleanup-evidence-2026-07-20.md

Include:
- Files changed (paths)
- Before/after one-liners for the residual lag sections
- Verification commands run + results
- Thread 9 go/no-go
- Remaining risks (changing-room supersession vs morning changing-room cue, duplex still fragile until R1)
- Explicit statement: coding may start at WP-R1 after Operator ACK

## Acceptance
1. current-state has no section that still pushes "next evaluation stint / pit debrief leadership" as present-tense priority
2. event-log either has the 6:54.2 close or a documented reason it can wait
3. Evidence doc written
4. No R1–R4 code changes
5. Stop when done — wait for Operator

## First reply style
1. Confirm out-of-scope understood
2. List residuals you found after reading the files (bullets)
3. Then implement A–E
```

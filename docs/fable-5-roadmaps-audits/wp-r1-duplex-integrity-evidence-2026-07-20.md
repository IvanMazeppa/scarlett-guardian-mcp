# WP-R1 — Duplex integrity evidence

**Date:** 2026-07-20  
**Branch:** `feature/post-wp59-affalterbach`  
**Design:** Fable response to Sol + Nordschleife audit §3 (un-deferred 3.5)

## Implemented

### Server (`duplex-cache.ts`, `server.ts`)

- `DEFAULT_DUPLEX_MIN_CHARS = 200` (was effective min 20).
- `isSubstantialDuplexMessage()` rejects:
  - short payloads after normalize
  - pure OOC acks (`Understood`, `Got it`, …)
  - long text without sentence end / multi-line / first-person dialogue cues
- `POST /duplex-cache` returns **422** with `{ reason, min_chars }` when the floor fails (does not store).
- Successful store still logs thread/chars/hash as before.

### Userscript v2.1.0 (`scripts/guardian-browser-bridge.user.js`)

- Scrape walks from the end and keeps only **substantial** assistant bubbles (same floor).
- Skips short OOC completions before POST.
- On successful POST, stores **last-good** snapshot in GM storage (`guardian_last_good_scarlett`).
- On SPA **thread URL change** (and empty scrape on cold start), **seeds** `/duplex-cache` from that snapshot so a new thread is not stuck on `absent` until the first new Scarlett turn.

### Tests

- `tests/duplex-cache.test.ts` updated for 200-char samples + structure gate.

## Acceptance mapping

| Criterion | Status |
|-----------|--------|
| Short ack cannot poison cache | Server 422 + client skip |
| Select last substantial RP block | Client scrape walk + floor |
| Thread restart / new thread seed | GM last-good → POST seed |
| ≥90% duplex in live play | Ops follow-up after operator reinstalls v2.1 |

## Verification

```bash
npm test && npm run build && npm run eval:fast
```

## Operator action required

1. **Reinstall / update** Tampermonkey script from `scripts/guardian-browser-bridge.user.js` (v2.1.0).
2. **Restart Guardian** so server floor is live (`npm run dev` / process manager).
3. Optional: `DELETE /duplex-cache` once after upgrade if a borderline entry remains.
4. Live Thread 9: watch pill for `duplex ✓` on real IC turns; confirm short OOC does not show success.

## Boundaries

- No RAG changes.
- No WP-R2/R3/R4.
- Caller-wins preflight merge unchanged.

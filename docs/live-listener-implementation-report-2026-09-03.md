# Live Listener Implementation Report

**Date:** 2026-09-03  
**Repo:** `scarlett-guardian-mcp`  
**Status:** Implemented, gated **off by default**, unit tests and `eval:fast` green, live smoke passed on a throwaway port.

This document describes the Live Listener that was built from [live_listener_architecture_proposal.md](live_listener_architecture_proposal.md). It covers what exists on disk, how to install and enable it, what was verified, what went wrong during the build, and what can still go wrong in production.

---

## 1. What this is

The Fable-5 loop is still: **Grok writes Scarlett**, Guardian intercepts the next user turn on `/preflight`, RAG supplies canon. Preflight RAG is slow (often 5–15s) and competes with the auditor budget.

The Live Listener is a **background researcher** that runs in the gap after Scarlett’s reply is captured and before Benjamin clicks Send. It:

1. Reads the last in-character Scarlett message (from `POST /duplex-cache`).
2. Extracts named entities with a cheap model (`gpt-4o-mini` by default).
3. Looks those entities up in RAG.
4. Compresses hits into 3-bullet dossiers.
5. Caches them in process memory.
6. On the next `/preflight`, injects those dossiers into Grok’s brief with a Map lookup — **no extra RAG or LLM on the hot path**.

It is **not** a second Node process, not a log-tailer, and not the existing Scene Cast / `resolveSceneRoster` system. Scene Cast is a deterministic “who is physically in the shot” list. Active Roster is historical grounding for *mentioned* people and places.

---

## 2. Architectural decisions (vs the proposal)

| Proposal | What shipped | Why |
|---|---|---|
| Background “daemon” | In-process worker in Guardian, Dramaturg-style fire-and-forget | Matches this codebase; no second process to tunnel or supervise |
| Roadmap WP-8.2 `scripts/live-listener.ts` log tail | **Not built.** Hook is `POST /duplex-cache` | Duplex is already the Scarlett-reply capture path |
| Flush cache at preflight | **TTL expiry** (default 30 min), no flush-on-inject | Flushing breaks Grok regenerations and idle typing |
| `gpt-4o-mini` researcher | `GUARDIAN_LISTENER_MODEL` default `gpt-4o-mini` | Must not burn `GUARDIAN_MODEL` (terra) |
| Dump raw RAG into the prompt | 3 bullets, ~350 chars/dossier, block cap 1200 chars | Protect Grok’s context |
| `active_roster.json` on disk | In-memory `Map` only | Volatile by design; dies on process restart |
| NPC Actor / Environment Director | Out of scope | Cache + worker are the extension point |

```
Tampermonkey  --POST /duplex-cache-->  Guardian (200 immediately)
                                         |
                                         v  fire-and-forget
                                    Live Listener
                                      NER (mini)
                                      RAG expand / search
                                      summarize (mini)
                                      ActiveRosterCache.upsert
Benjamin Send --POST /preflight-->  O(1) getFresh(threadKey)
                                         |
                                         v
                                    compileGrokBrief
                                    **Active Roster (background dossiers):**
```

---

## 3. What was created

### 3.1 New modules

| File | Role |
|---|---|
| [src/guardian/active-roster.ts](../src/guardian/active-roster.ts) | Per-thread `Map` cache, 2-hour per-entity memo, dossier clamp, brief formatter |
| [src/guardian/live-listener.ts](../src/guardian/live-listener.ts) | NER → filter → two-lane RAG → summarize → cache; per-thread coalescing lock |
| [tests/active-roster.test.ts](../tests/active-roster.test.ts) | TTL, overwrite, memo, isolate, brief omit/inject |
| [tests/live-listener.test.ts](../tests/live-listener.test.ts) | NER fail-soft, two-lane fetch, abort, coalescing, timeout |

### 3.2 Integration edits

| File | Change |
|---|---|
| [src/guardian/config.ts](../src/guardian/config.ts) | Five new env vars (see §4) |
| [.env.example](../.env.example) | Documented those vars; default enabled=false |
| [src/guardian/server.ts](../src/guardian/server.ts) | After a successful duplex store, `scheduleLiveListenerResearch(...)` un-awaited |
| [src/guardian/tools/preflight.ts](../src/guardian/tools/preflight.ts) | O(1) `resolveActiveRosterForPreflight`; skip when `isolateSidecars` |
| [src/guardian/report/models.ts](../src/guardian/report/models.ts) | Optional `active_roster` on `GuardianReport` |
| [src/guardian/report/compile-grok-brief.ts](../src/guardian/report/compile-grok-brief.ts) | Optional `**Active Roster (background dossiers):**` next to Scene Cast |
| [src/guardian/telemetry.ts](../src/guardian/telemetry.ts) | `kind: "live_listener"` NDJSON events |
| [src/guardian/telemetry-aggregate.ts](../src/guardian/telemetry-aggregate.ts) | Dashboard loaders **skip** `live_listener` lines so they cannot crash on missing `duplex` |
| [package.json](../package.json) | New tests wired into `npm test` |

### 3.3 Unrelated one-line fix (needed for `npm test`)

[src/guardian/wardrobe.ts](../src/guardian/wardrobe.ts) — `VENUE_CLASS_CHANGE` now matches `board the Gulfstream` as well as `boarding the Gulfstream`. An existing wardrobe unit test already expected that. It is **not** part of Live Listener behavior.

### 3.4 What was not created

- No `scripts/live-listener.ts`
- No on-disk `active_roster.json`
- No Mission Control UI for dossiers
- No NPC Actor / Environment Director agents
- Live `.env` was **not** flipped to enabled (operator must opt in)

---

## 4. Installation and enablement

Code is already in the Guardian tree. There is no separate package to install. Enabling is configuration + restart.

### 4.1 Prerequisites (already the normal Guardian stack)

1. RAG memory MCP on `8787` (`npm run dev` in `rag-memory-mcp`).
2. Guardian on `8790` (`npm run dev` in `scarlett-guardian-mcp`).
3. `OPENAI_API_KEY` set in Guardian `.env` (same key the auditor uses).
4. Browser bridge posting Scarlett replies to `POST /duplex-cache` (Tampermonkey). Without duplex, the listener never wakes.

### 4.2 Env vars

Add to `scarlett-guardian-mcp/.env` (names are in `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `GUARDIAN_LISTENER_ENABLED` | `false` | Master switch. Must be the string `true` (or `1`). |
| `GUARDIAN_LISTENER_MODEL` | `gpt-4o-mini` | NER + summarizer. Do not point this at terra. |
| `GUARDIAN_LISTENER_TTL_MS` | `1800000` (30 min) | How long a thread’s dossiers stay injectable |
| `GUARDIAN_LISTENER_TIMEOUT_MS` | `20000` | Soft deadline for one research pass |
| `GUARDIAN_LISTENER_MIN_CONFIDENCE` | `0.6` | Drop low-relevance NER hits (waiters, etc.) |

Also required at runtime: `OPENAI_API_KEY`. The worker will not arm without it.

`GUARDIAN_LLM_ENABLED` is **not** required. Listener has its own gate so you can run prefetch while the auditor is off, or the reverse.

### 4.3 Restart (required)

`tsx src/guardian/server.ts` does **not** hot-reload. After changing `.env` or pulling this code:

```bash
cd ~/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
# stop the existing npm run dev (Ctrl+C), then:
npm run dev
```

Until that restart, port 8790 is still the pre-listener binary. A live smoke during development used a **temporary** Guardian on **8791**; that process was killed afterward and is not part of the production loop.

### 4.4 Confirm it is on

1. Guardian log after duplex should still show `Duplex cache set: thread=...`. Listener success is quiet; failures log `Live Listener RAG miss` / `summarize failed`.
2. Tail telemetry:

```bash
grep '"kind":"live_listener"' .guardian/telemetry/events-$(date -u +%F).ndjson | tail
```

A healthy line looks like:

```json
{"v":1,"kind":"live_listener","thread_key":"...","entities_extracted":4,"dossiers_written":3,"ok":true,"model":"gpt-4o-mini","latency_ms":{"total":5517,"ner":1534,"rag":2221,"summarize":1761}}
```

3. Next MCP/HTTP preflight for that `thread_key` should include:

```text
**Active Roster (background dossiers):**
- **Karin:** ...
```

HTTP `POST /preflight` returns the full JSON report (`active_roster` field). The MCP tool `guardian_memory_preflight` returns `compileGrokBrief` markdown (the block Grok sees).

### 4.5 Turn it off

Set `GUARDIAN_LISTENER_ENABLED=false` (or omit it) and restart. Duplex and preflight behave as before. Empty cache never emits the heading, so goldens stay stable.

---

## 5. Runtime behavior in detail

### 5.1 Wake

Only after `POST /duplex-cache` **succeeds** (substantial IC floor, ≥200 chars + narrative structure). A 422 rejection does not schedule research. The 200 is returned before the worker finishes.

### 5.2 Researcher pipeline

1. **Same-hash skip** — identical Scarlett text (same SHA-256) for that thread is not re-researched.
2. **NER** — `chat.completions` + `json_object`. Output: `{ entities: [{ entity, type: person|location|lore, confidence }] }`.
3. **Filter** — drop Scarlett/Benjamin (and Ben/Scar/Loughrey-only names), confidence below threshold, duplicates. Cap **4** entities per run.
4. **Memo** — if that entity was researched in the last **2 hours**, reuse the dossier (no RAG).
5. **Two-lane fetch** (fresh `RagMcpClient`, `connect()` once, `pLimit(2)`):
   - Known NPC (alias in `DEFAULT_NPC_REGISTRY`) → `expand_context_around_chunk` at `{sourceFile, sectionNeedle}`. Fallback to search if expand is empty.
   - Unknown → `search_story_memory` with `source_roles: ["npc_canon","story_bible","arc_chronicle"]`, `max_results: 4`.
6. **Summarize** — one mini-model call for all fetched blobs, ≤3 bullets each. If that call fails, first sentences of the RAG text are used.
7. **Write** — replace that thread’s roster (does not accumulate forever). Update entity memo.

### 5.3 Coalescing

If a second duplex arrives while a pass is in flight for the same `thread_key`, the latest payload is queued and run after. Concurrent overlapping OpenAI/RAG for one thread is avoided.

### 5.4 Preflight inject

- Lookup uses `thread_key` when present; if omitted (typical MCP), **newest fresh** roster (same rule as duplex cache).
- Hermetic eval (`disableTelemetry` / `isolateSidecars` / frozen auditor) **never** reads the cache.
- Quiet private couple scenes **omit Scene Cast** but **still show Active Roster** — dossiers are for mentioned history, not present-cast.
- Heading is omitted when there are no dossiers with bullets.

### 5.5 Telemetry

Written to `.guardian/telemetry/events-YYYY-MM-DD.ndjson` via `setImmediate`. Failure to write never fails duplex or preflight. Mission Control charts ignore these lines (`kind === "live_listener"`).

---

## 6. Outcome / verification (2026-09-03)

| Gate | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | Pass (after type fixes; see §7) |
| `npm test` | Pass, including new `active-roster` and `live-listener` files |
| `npm run eval:fast` | **38/38 passed**, 0 failed, 30 warns (existing PLAN_DRIFT noise, not new goldens) |
| Live smoke | Temporary Guardian `GUARDIAN_PORT=8791 GUARDIAN_LISTENER_ENABLED=true` |

Smoke sequence:

1. `POST /duplex-cache` with a 381-char Scarlett turn mentioning Karin, Vaxholm, St Moritz. `200 { ok: true }`.
2. Telemetry: `entities_extracted: 4`, `dossiers_written: 3`, `ok: true`, ~5.5s total (NER ~1.5s, RAG ~2.2s, summarize ~1.8s).
3. `POST /preflight` with the same `thread_key`, empty duplex field → `duplex_source: bridge_cache`, `active_roster` present with bullets.
4. `compileGrokBrief` rendered:

```text
**Active Roster (background dossiers):**
- **Karin:** Age: ~50s–60s.; Old childhood friend of Scarlett, supportive of her feminine nature, resides in Vaxholm, Sweden.; Last seen in Vaxholm; not involved in Germany track-day unless necessary.
- **Vaxholm guest house:** Location of Karin's residence and Scarlett's birthplace.; Significant for Scarlett's early identity journey.; Noted for a potential emotional connection to past memories.
- **St Moritz chalet:** Modest holiday home in Soglio, Swiss–Italian Alps.; Visited on November 4, 2026; final day with Gulfstream prior to returning home.; Not a ski resort; indicated skiing could occur in nearby Engadine/St. Moritz.
```

The 8791 process was then killed. **Production 8790 was not switched on.** Operator still needs §4.

---

## 7. What went wrong during the process

These were found and fixed in the same change-set unless noted.

### 7.1 TypeScript: brief vs dossier `sources`

`GuardianReport.active_roster` originally duplicated a looser type (`sources` optional inner fields). `formatActiveRosterBlock` expected `ActiveRosterDossier[]`. Fixed by typing the report field as `ActiveRosterDossier`. Stub RAG `callJsonTool` in tests was not generic; added `as T`.

### 7.2 Parallel RAG closed the MCP session (`Connection closed`)

First live smoke logged:

```text
Live Listener RAG miss for St Moritz chalet: MCP error -32000: Connection closed
```

Cause: `RagMcpClient.callTextTool` treats an unconnected client as one-shot — connect, call, **close**. Two `pLimit(2)` calls raced and tore down the transport.

Fix: `await ownedClient.connect()` once per pass, then reuse the session; close in `finally`.

After the fix, RAG completed (`rag` ~2s) and dossiers were written.

### 7.3 Dossiers stored with empty `bullets` (brief heading would vanish)

Second smoke wrote four roster entries with `"bullets": []`. `formatActiveRosterBlock` skips empty bullets, so Grok would have seen **no** Active Roster block even though the cache “hit.”

Cause: `dossiers.map(clampDossier)`. `Array.map` passes **index** as the second argument. `clampDossier(dossier, maxChars)` treated index `0` as `maxChars = 0`, then immediately broke the bullet loop.

Fix: `dossiers.map((d) => clampDossier(d))` (same for memo hits). Tests now assert `bullets.length > 0`.

This is the most important bug in the build: without it, the feature would look “on” in telemetry (`dossiers_written: 4`) and still inject nothing useful.

### 7.4 Wardrobe unit test failure (pre-existing, unblocked)

`npm test` failed in `tests/wardrobe.test.ts` on:

```text
isWardrobeChangeBeat("we leave Affalterbach and board the Gulfstream G650") === true
```

The regex only had `boarding`, not `board`. One-line change in `wardrobe.ts`. Independent of Live Listener; required for the repo test gate.

### 7.5 Port 8791 leftovers

Development started extra Guardian processes on 8791. `EADDRINUSE` and later `exit 137` (SIGKILL via `fuser -k 8791/tcp`) were from those temp servers, not a production crash. 8790 was left running.

### 7.6 NER / summarizer quality (not a crash; content)

Live mini-model output is useful but imperfect:

- “St Moritz chalet” was partly grounded in **Soglio** / Engadine (related Europe-arm travel, not a dedicated St Moritz card).
- “Vaxholm guest house” reused Karin’s bible section (reasonable alias overlap: Karin registry includes `vaxholm`).
- “archipelago” as lore was sometimes dropped as low-confidence; when kept, search can pull weakly related trauma/family chunks.

The pipeline did what it was told: semantic search + 3 bullets. It cannot invent a cleaner canon than the corpus and the query.

---

## 8. Potential issues going forward

### 8.1 Operator: 8790 still off until restart + flag

If duplex works but there is no `live_listener` telemetry and no brief block, the running process is old or `GUARDIAN_LISTENER_ENABLED` is not `true`. This is the most likely “it doesn’t work” report.

### 8.2 Depends on duplex, not on preflight

If Tampermonkey shadow mode is off, Scarlett’s reply never hits `/duplex-cache`, and the listener never runs. Preflight still works; it just has no prefetch.

### 8.3 Race: user sends faster than the worker

Typical research is ~4–8s. If Benjamin sends in under that window, preflight may miss the new roster (TTL lookup of a previous turn, or empty). The next turn will see it. This is inherent to prefetch; it does not block Send.

### 8.4 Process restart wipes the cache

In-memory only. After `npm run dev` restart, the first turn has no Active Roster until the next duplex+research cycle.

### 8.5 Extra OpenAI + RAG cost

Each Scarlett reply can cost **two** mini completions (NER + summarize) plus up to four RAG searches/expands, capped at 4 entities, coalesced per thread. This is separate from terra auditor spend. If Grok regenerates often, duplex overwrites and re-triggers (unless the text hash is identical).

`gpt-4o-mini` must exist on the account. If the model slug is wrong, NER fails fail-soft (empty roster, duplex still 200).

### 8.6 Mini-model hallucination / wrong dossier

Summaries are instructed to use source text only, but mini models still compress loosely (St Moritz ↔ Soglio). Grok can treat bullets as hard canon. Mitigations already in code: confidence floor, protagonist drop, 3-bullet cap, 1200-char block. Remaining risk: bad retrieval for vague entities (`archipelago`, `guest house`).

### 8.7 Registry coverage

Known-NPC expand only works for `DEFAULT_NPC_REGISTRY` aliases (Shevchenko, Ryan, Karin, …). Anyone else is embedding search. New recurring NPCs should be added to the registry if addressed expand is wanted.

### 8.8 Quiet-scene policy

Active Roster **injects in private couple scenes**. That is intentional (mentioned ex / family / place). If a call from Karin should not leak into a suite brief, this will still show her dossier. Tightening that would be a product decision, not a bug.

### 8.9 Thread key mismatch

Cache is keyed like duplex. MCP preflights that omit `thread_key` get the **newest** fresh roster. Two Grok tabs within TTL can cross-contaminate (same known duplex issue). Prefer setting `thread_key` on both duplex and preflight.

### 8.10 Streamable HTTP / second MCP client

Listener opens its **own** MCP client to `RAG_MCP_URL` (`/mcp-v2`). Preflight uses a different client. RAG must accept concurrent Streamable HTTP sessions. The connect-once fix handles intra-listener parallelism; a RAG crash still fail-softs per entity.

### 8.11 Telemetry / dashboard

Listener events share the daily NDJSON file. Aggregators skip them. A naive `JSON.parse` + `event.duplex.source` script on the raw file will throw. Use `kind !== "live_listener"` or `isLiveListenerTelemetryEvent`.

### 8.12 Eval / PLAN_DRIFT

Do **not** add RAG calls inside `runGuardianPreflightInner` for this feature. Extra hot-path tools make cassette goldens warn `PLAN_DRIFT`. Listener stays off the hot path on purpose.

### 8.13 Security

Listener uses the same `OPENAI_API_KEY` and RAG bearer as Guardian. It does not expose a new public route. It does send Scarlett’s last IC reply to OpenAI mini for NER/summarize — same class of data as the auditor, cheaper model.

---

## 9. Suggested operator checklist (first live evening)

1. Confirm RAG `GET http://127.0.0.1:8787/health`.
2. Set `GUARDIAN_LISTENER_ENABLED=true` in Guardian `.env`.
3. Restart Guardian on 8790.
4. Play one turn so Tampermonkey posts duplex.
5. Within ~20s, confirm a `live_listener` NDJSON line with `ok: true` and `dossiers_written > 0`.
6. On the following Send, confirm the Active Roster block in the Grok-facing brief (MCP result), not only HTTP JSON.
7. If the block is missing: check timing (sent too fast), empty bullets (should be fixed), isolate/eval flags (not used live), or thread_key mismatch.

---

## 10. Future work (explicitly not in this drop)

From the original proposal §4:

- **NPC Actor** — specialized dialogue draft for on-stage supporting cast, passed to Grok as constraint.
- **Environment Director** — time-of-day / weather injection (e.g. Soglio rain vs invented sun).

Natural hooks: `ActiveRosterCache` + `scheduleLiveListenerResearch` coalescing. Do not put either on the preflight hot path.

# WP-3.4 Technical Report: `duplex_source: "absent"` Postmortem, Fix (Option A), and Retest Protocol

**Date:** 2026-07-17  
**Audience:** Gemini 3.1 Pro (simplify into operator step-by-step) · Operator · Grok Build  
**Status:** Root cause fixed in code (`e05a08c`); **retest not yet green** until operator restarts Guardian and runs the protocol below  
**Related roadmap:** Master WP-3.1–3.4; Fable D6 shadow-sidecar architecture  

**Repos (for Gemini’s simplified guide):** Prefer **Option A path** (newest-wins + clean retest). Use **Option B path** only if A fails after a correct restart and single-thread post.

---

## 1. Executive summary

### What we tried
WP-3.4 mini live test: prove that Scarlett’s previous IC reply can reach Guardian **without** the operator pasting `scarlett_previous_message` into OOC, via:

1. Tampermonkey **shadow** bridge scrapes Scarlett’s bubble → `POST /duplex-cache`
2. Grok MCP calls `guardian_memory_preflight` with **empty** duplex field
3. Server merges from cache → report field `duplex_source: "bridge_cache"`

### What happened
- Bridge scrape/post **succeeded** (operator and Gemini verified ~2611 chars in cache).
- Preflight still recorded **`"duplex_source": "absent"`** (and typically `DUPLEX_INPUT_MISSING`).

### Root cause (architectural, not operator error)
`DuplexCache.getFresh()` when `thread_key` is missing/empty required **exactly one** fresh cache entry (`fresh.length === 1`). MCP preflights almost never send `thread_key`. If **two or more** threads had posts within the 45-minute TTL (main RP + smoke test + second tab), the cache **deliberately refused to answer** → absent.

### Fix implemented (Option A + clear ops)
| Item | Detail |
|------|--------|
| **Option A** | Empty `thread_key` → return **newest** fresh entry by `capturedAt` (DESC), not require singleton |
| Keyed path | Unchanged: if `thread_key` is provided, **exact** match only |
| **Option C (ops)** | `DELETE /duplex-cache` (+ optional `?thread_key=`); Tampermonkey menu “clear duplex-cache” |
| Commit | Guardian `e05a08c` on `feature/master-roadmap-v1` |
| Preserve | `preserve/roadmap-wp34-duplex-newest-wins-20260717` |

**Option B** (require MCP `thread_key` from client) is **deferred** (WP-3.5-class). Grok’s MCP tool already accepts optional `thread_key`, but the cloud model does not reliably populate it; relying on that is not viable for retest today.

---

## 2. System architecture (relevant subset)

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser: grok.com + Tampermonkey                           │
│  scripts/guardian-browser-bridge.user.js v2 (mode=shadow)   │
│                                                             │
│  On Scarlett complete (or menu "post scrape"):              │
│    scrape last assistant bubble → normalize → sha256        │
│    GM_xmlhttpRequest POST {base}/duplex-cache               │
│      body: { scarlett_message, thread_key, content_hash,    │
│              captured_at }                                  │
│    thread_key from URL path when possible                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Guardian :8790                                             │
│  POST /duplex-cache → duplexCache.set(entry)  [in-memory]   │
│  GET  /duplex-cache → stats only (no bodies)                │
│  DELETE /duplex-cache → clear all or one thread             │
│                                                             │
│  MCP / POST /preflight → runGuardianPreflight               │
│    resolveDuplexInput():                                    │
│      1) caller scarlett_previous_message non-empty →        │
│         duplex_source = "caller"  (always wins)             │
│      2) else getFresh(thread_key, TTL)                      │
│         hit → duplex_source = "bridge_cache"                │
│         miss → duplex_source = "absent"                     │
│            + hard_flag DUPLEX_INPUT_MISSING                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  RAG :8787 (retrieval only for this test)                   │
│  docs/guardian-reports/preflight-full-*.json saved on MCP   │
└─────────────────────────────────────────────────────────────┘
```

### Key files
| Path | Role |
|------|------|
| `src/guardian/duplex-cache.ts` | Cache, hash, `getFresh`, `resolveDuplexInput` |
| `src/guardian/tools/preflight.ts` | Merge at entry; sets `report.duplex_source` |
| `src/guardian/server.ts` | HTTP duplex-cache + MCP tool schema |
| `scripts/guardian-browser-bridge.user.js` | Shadow scrape/post/pill/menu |
| `docs/guardian-reports/preflight-full-*.json` | Ground truth for `duplex_source` |

### Config
| Env | Default | Meaning |
|-----|---------|---------|
| `GUARDIAN_DUPLEX_CACHE_TTL_MS` | `2700000` (45 min) | Freshness window |
| Bridge `guardian_base_url` | `http://127.0.0.1:8790` | Must match the Guardian the MCP connector uses |

**Critical invariant:** Tampermonkey and Grok MCP must hit the **same** Guardian process. Tunnel vs localhost split = silent cache miss.

---

## 3. Preflight duplex resolution (behavioral contract)

```ts
// Pseudocode after e05a08c
function getFresh(threadKey, ttlMs, now):
  if threadKey trimmed non-empty:
    return entry for that key if age <= ttl else undefined
  else:
    return argmax(entries where age <= ttl, key=capturedAt)  // NEWEST WINS
    // previously: return only if count(fresh) === 1 else undefined  // BUG for daily ops
```

| `scarlett_previous_message` | Cache | Result `duplex_source` |
|----------------------------|-------|-------------------------|
| Non-empty | * | `"caller"` |
| Empty | Hit | `"bridge_cache"` |
| Empty | Miss | `"absent"` |

Report field is written on every preflight; telemetry prefers `report.duplex_source`.

---

## 4. Failure analysis (first WP-3.4 attempt)

### Evidence that worked
- Manual / menu post populated cache: **~2611 characters**.
- `GET /duplex-cache` showed entries; thread keys included a real Grok conversation id form.
- Operator saw shadow arm + scrape pills; post pill sometimes missed (UI fade) — **curl is authoritative**.

### Evidence that failed
- Saved preflight JSON: `"duplex_source": "absent"`.
- Gemini investigation: **two entries** within TTL at diagnose time.

### Causal chain
1. Smoke test and/or second Grok surface posted entry A.  
2. Main thread posted entry B (2611 chars) with its `thread_key`.  
3. MCP preflight sent **no** `thread_key` (model/tool default).  
4. Old `getFresh(undefined)`: `fresh.length === 2` → **undefined**.  
5. Preflight correctly recorded absent + `DUPLEX_INPUT_MISSING`.  
6. Operator interpreted as “bridge failed”; bridge had succeeded — **merge policy failed**.

### Why the old policy existed
D6 design preferred refusing over guessing wrong-thread text (auditor would critique the wrong Scarlett turn). That is correct when **thread identity is known**. MCP does not provide identity today, so singleton-or-nothing is **too strict** for single-operator daily use.

### Residual risks after Option A
| Risk | Severity | Mitigation |
|------|----------|------------|
| Newest entry is from wrong tab | Medium | Clear cache before critical tests; close junk tabs; prefer one RP thread |
| Stale content within TTL | Low–Med | TTL 45m; clear before retest; re-post after Scarlett |
| Caller still pastes duplex | Low | OOC says omit field; `caller` is still duplex-present |
| Wrong Guardian host | High | Align TM base URL with MCP connector |
| Process not restarted after pull | High | Retest **requires** Guardian restart on `e05a08c+` |

---

## 5. What was implemented (code-level)

### 5.1 `getFresh` change (`duplex-cache.ts`)
- **Before:** no key → only if `fresh.length === 1`.  
- **After:** no key → max `capturedAt` among fresh entries.  
- **Keyed:** unchanged exact match.

### 5.2 `clear` API
- `duplexCache.clear()` → all  
- `duplexCache.clear(threadKey)` → one  

### 5.3 HTTP
```http
DELETE /duplex-cache
DELETE /duplex-cache?thread_key=<id>
```
Auth: same bearer as other Guardian routes. Response: `{ ok, removed, scope, entries_remaining }`.

### 5.4 Userscript
Menu: **Guardian: clear duplex-cache (server)** → `DELETE {base}/duplex-cache`, clears local last-hash so re-post is not deduped away.

### 5.5 Tests
- `testNewestWinsWithoutKey` — two threads, empty key → newer body.  
- Explicit wrong key → still absent.  
- Explicit correct key → that thread.  
- Clear thread / clear all.  
- Full `npm test` green at commit time.

### 5.6 Not implemented (Option B deferred)
- Forcing Grok client to pass conversation id into MCP tool args.  
- Server-side thread inference from request headers (none available over MCP).  
- Cross-thread safety beyond “newest wins when unkeyed”.

---

## 6. Git / branch state

| Repo | Branch | Tip (fix) |
|------|--------|-------------|
| `scarlett-guardian-mcp` | `feature/master-roadmap-v1` | `e05a08c` Fix: Duplex cache newest-wins when MCP omits thread_key |
| Preserve | `preserve/roadmap-wp34-duplex-newest-wins-20260717` | same fix |

RAG repo not required for this retest beyond being healthy for preflight retrieval.

---

## 7. Retest protocol (technical — for Gemini to simplify)

### 7.1 Goal
One preflight report with:

```json
"duplex_source": "bridge_cache"
```

without operator-supplied `scarlett_previous_message`.

### 7.2 Path Option A (default — use this first)

**Phase 0 — Load fixed server**

1. Stop old Guardian process (port 8790 must not be stale build).  
2. `cd scarlett-guardian-mcp && git pull` (or ensure `e05a08c+`) && `npm run dev`.  
3. `curl -sS http://127.0.0.1:8790/health` → `ok: true`.  
4. Optionally refresh Tampermonkey script from disk if menu lacks “clear duplex-cache”.

**Phase 1 — Hygiene**

5. `curl -sS -X DELETE http://127.0.0.1:8790/duplex-cache` → `removed` ≥ 0, `entries_remaining: 0`.  
6. Close extra Grok tabs that might auto-post; keep **one** RP conversation.  
7. Tampermonkey: Bridge v2 **Enabled**, mode **shadow**, page **hard-refreshed**.

**Phase 2 — Populate cache from main thread only**

8. On the **same** conversation that will receive Benjamin’s next message:  
   - Preferred: let Scarlett finish a **new** full reply; wait streaming stop + ~2s quiet; watch for pill.  
   - Or: menu **scrape now** → **post scrape → duplex-cache**.  
9. `curl -sS http://127.0.0.1:8790/duplex-cache`  
   - Expect `entries` ≥ 1, `chars` large (hundreds–thousands), `age_ms` small if just posted.  
   - If multiple entries remain, **newest** (lowest age / latest capture) is what unkeyed preflight will use — ensure that newest is the **main** thread’s Scarlett text.

**Phase 3 — Preflight without duplex paste**

10. Send Benjamin’s turn using either pure IC (if model already preflights) or OOC template that **explicitly omits** `scarlett_previous_message` (see §8).  
11. Wait for Scarlett/tool completion.

**Phase 4 — Verify**

12. Newest file under `docs/guardian-reports/preflight-full-*.json`.  
13. Assert:

| Field | Pass | Fail / partial |
|-------|------|----------------|
| `duplex_source` | `"bridge_cache"` | `"absent"` fail; `"caller"` partial (model still sent duplex) |
| `hard_flags` | no `DUPLEX_INPUT_MISSING` | present with absent |
| Streamlined brief | clean novelist prose | meta/RAG dialect bleed (separate issue) |

14. Report result to Grok Build for ledger evidence.

### 7.3 Path Option B (fallback only if A fails after correct restart)

Use only after confirming:

- Guardian tip is post-`e05a08c` (restart done),  
- Cache had a large fresh entry,  
- `GET /duplex-cache` healthy,  
- Still `absent` on newest report.

Then:

1. **Force single entry:** DELETE cache; post **once** from main thread; ensure `entries === 1` before Benjamin.  
2. **OOC with explicit duplex as control:** temporarily paste Scarlett’s previous message into `scarlett_previous_message` — expect `duplex_source: "caller"`. If still absent, preflight path is broken (wrong host / report not from this Guardian).  
3. **Align hosts:** Confirm Grok connector URL and TM `guardian_base_url` are the same origin (both localhost:8790 or both same tunnel).  
4. **Optional thread_key experiment:** If testing via `POST /preflight` curl, pass `thread_key` matching cache entry — proves keyed path. Does not fix MCP omission without model cooperation.  
5. Escalate to Grok Build with: full `GET /duplex-cache` JSON, newest preflight path, connector URL (redact secrets), Guardian log lines around preflight.

Do **not** implement Option B product code in this retest cycle unless Grok Build opens a WP.

---

## 8. Message templates (for operator / Gemini prose assist)

### 8.1 OOC wrapper (Option A retest — omit duplex)

```text
[OOC — WP-3.4 retest after newest-wins fix]
Call guardian_memory_preflight before any Scarlett IC prose.
- user_message = the Benjamin IC block below (verbatim)
- recent_context = one short line of live where/when/who/mood
- Do NOT set scarlett_previous_message (omit or empty).
  Shadow bridge already POSTed Scarlett's last reply to this machine's
  Guardian /duplex-cache. Server must merge duplex_source=bridge_cache
  using newest fresh cache entry when thread_key is absent.
- force_full_retrieval = false
After preflight: Scarlett IC only. No tools, JSON, or meta in prose.

[IC — Benjamin]
<<BENJAMIN IC TEXT HERE>>
```

### 8.2 Control OOC (Option B diagnostic only — force caller)

```text
[OOC — diagnostic control]
Call guardian_memory_preflight.
- user_message = Benjamin IC below
- scarlett_previous_message = <<PASTE FULL PREVIOUS SCARLETT REPLY>>
Expect duplex_source=caller. If absent, Guardian path is wrong.

[IC — Benjamin]
<<BENJAMIN IC TEXT HERE>>
```

### 8.3 Gemini IC assist one-liner

```text
Write one Benjamin IC message (this thread's voice, 1–3 short paragraphs)
continuing the current Nordschleife/paddock beat after Scarlett's last reply.
No OOC, no tool talk. I will wrap it in the WP-3.4 retest OOC that omits
scarlett_previous_message.
```

---

## 9. Operator checklist (machine-readable)

```
[ ] Guardian restarted on e05a08c+
[ ] curl health 8790 ok
[ ] DELETE /duplex-cache (clean slate)
[ ] Only one Grok RP tab (preferred)
[ ] TM Bridge v2 enabled, mode=shadow, page refreshed
[ ] Scarlett reply posted to cache (auto or menu)
[ ] GET /duplex-cache shows large chars, low age_ms for newest
[ ] Benjamin sent with OOC omitting scarlett_previous_message
[ ] Newest preflight-full-*.json has duplex_source=bridge_cache
[ ] Result reported to Grok Build
```

---

## 10. What Gemini should produce

Please create a **simplified step-by-step guide for the human operator** that:

1. Assumes **Option A retest** as the primary path (newest-wins fix already in code).  
2. Uses short numbered steps, no deep architecture unless a failure branch needs it.  
3. Includes a **failure branch**: “If still absent after restart → Option B diagnostics” (single entry, control caller paste, host alignment) — **not** “implement Option B in product”.  
4. Includes the OOC template from §8.1 and a short IC prompt for story help.  
5. Ends with how to recognize pass (`bridge_cache`) vs partial (`caller`) vs fail (`absent`).  
6. Reminds: **restart Guardian** is mandatory; old process still has the buggy `getFresh`.

Do **not** re-implement Guardian/RAG code. Do **not** reopen Phase 2. Optional: one-paragraph residual-risk note for multi-tab newest-wins.

---

## 11. Paste block for Gemini terminal

```text
You are Gemini 3.1 Pro. Read the full technical report:

scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/wp-3.4-duplex-absent-postmortem-and-retest-2026-07-17.md

Context: WP-3.4 live test got duplex_source=absent despite a successful
~2611-char bridge POST. Root cause: getFresh required fresh.length===1 when
MCP omitted thread_key. Fixed in e05a08c (newest-wins + DELETE /duplex-cache).

Your job: Write a simplified, operator-facing step-by-step retest guide.
Primary path = Option A (after Guardian restart). Fallback diagnostics = Option B
as described in the report (not product Option B code). Include OOC template
that omits scarlett_previous_message. No code changes.
```

---

## 12. Appendix — curl reference

```bash
# Health
curl -sS http://127.0.0.1:8790/health

# Cache stats (no message bodies)
curl -sS http://127.0.0.1:8790/duplex-cache

# Clear all
curl -sS -X DELETE http://127.0.0.1:8790/duplex-cache

# Clear one thread
curl -sS -X DELETE 'http://127.0.0.1:8790/duplex-cache?thread_key=YOUR_ID'

# Manual post (optional; normally TM does this)
curl -sS -X POST http://127.0.0.1:8790/duplex-cache \
  -H 'Content-Type: application/json' \
  -d '{"scarlett_message":"Long enough Scarlett IC text here for min 20 chars...","thread_key":"manual-test"}'
```

---

## 13. Document history

| When | What |
|------|------|
| 2026-07-16 | WP-3.1 cache + merge; WP-3.2 shadow bridge; mini test guide |
| 2026-07-16–17 | Live test: post ok, duplex_source absent; Gemini multi-entry diagnosis |
| 2026-07-17 | Option A fix + DELETE + this postmortem/retest report |

**End of report.**

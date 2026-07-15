# Invisible Browser Bridge — Architecture for Automatic Duplex Capture

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent) — companion to `../full-duplex-feature-status-2026-07.md`, `guardian-report-quality-audit-2026-07.md` (this folder)  
**Executor:** Grok 4.5 (Agentic Coder)  
**Problem:** Full duplex works end-to-end (proven live 2026-07-15: `Duplex: scarlett_previous_message provided`, 5 woven facts, clean brief) — but only because the operator manually copies Scarlett's previous reply into an OOC block every turn. This document designs the automation that removes the human from that loop.

---

## 1. Current state (measured, not assumed)

| Fact | Evidence |
|------|----------|
| Duplex pipeline works when fed | `preflight-full-2026-07-15T02-51-26-420Z.json`: duplex present, auditor ran, correction correctly `null` for a strong prior turn |
| Grok omits the optional arg on its own | `DUPLEX_INPUT_MISSING` in earlier reports; corrections fired only ~8% across the 142-report audit |
| Schema/description hardening already done | `server.ts`: duplex field listed first, CRITICAL MANDATORY wording (Layer A–C of the status doc) |
| `/preflight` already accepts the duplex field | Shared `PreflightInputSchema` between MCP tool and REST endpoint — the bridge needs **no schema work** |
| CORS already open on Guardian | `server.ts` middleware — browser calls permitted |
| v1.0 bridge exists | `scripts/guardian-browser-bridge.user.js`: working send interception (capture-phase Enter + `isTrusted` click), React-safe `setNativeValue`, `GM_xmlhttpRequest` for CSP bypass, `allowProgrammaticSubmit` re-entry guard |
| v1.0 bridge gaps | No DOM scraping of Scarlett's reply; injects a **verbose full report** (its own `compactGuardianReport`) — the documented prompt-bleed failure; no coexistence plan with the now-working MCP connector path |
| Hard constraints from DOM probing | Page `fetch()` blocked by CSP → `GM_xmlhttpRequest` mandatory; React-controlled textarea → native setter + input event; auto-submit fragile → staged rollout |

### The key architectural realization

The prompt from the other LLM assumes the bridge must **intercept the send, call Guardian, and inject the brief**. That is one mode — but it re-introduces every fragility we measured (auto-submit races, prompt bleed, double-preflight cost) and it is **not needed to solve duplex**, because:

> **Grok's MCP path already works.** The only thing missing from it is one argument. The bridge doesn't need to replace the retrieval path — it needs to *deliver one string to Guardian out-of-band*, and let Guardian merge it server-side when Grok's tool call arrives without it.

So the architecture has two modes, deployed in order:

- **Mode 1 — Shadow Sidecar (primary, truly invisible):** the bridge never touches the composer, never intercepts send, never injects anything. It watches the DOM, captures Scarlett's reply when generation completes, and POSTs it to a new Guardian endpoint. When Grok's next MCP preflight arrives missing `scarlett_previous_message`, Guardian fills it from this cache. Zero prompt changes, zero OOC blocks, zero visible artifacts, no double retrieval, and the MCP connector path stays exactly as it is today.
- **Mode 2 — Full Interceptor (fallback, hard compliance):** the v1.0 intercept-inject-submit flow, rebuilt on the same scraper and with server-compiled briefs — held in reserve for the day Grok's tool-calling compliance regresses (the original reason the bridge was drafted).

Mode 1 ships first because it converts the riskiest failure modes (auto-submit, prompt bleed) into non-events. Mode 2 shares 80% of its code (scraper, transport, config) and is a config flag away when needed.

---

## 2. Mode 1 — Shadow Sidecar

### 2.1 Turn lifecycle

```text
 Scarlett finishes streaming reply
        │  (bridge MutationObserver detects completion:
        │   stop-button gone / no text mutation for 1500 ms)
        ▼
 Bridge scrapes last assistant bubble → normalized text
        │  GM_xmlhttpRequest  POST /duplex-cache
        │  { scarlett_message, thread_key, captured_at, content_hash }
        ▼
 Guardian stores it (in-memory, TTL 45 min, keyed by thread_key)
        …
 User types Benjamin's next turn, presses send (bridge does NOT interfere)
        ▼
 Grok calls guardian_memory_preflight via MCP connector
        │  scarlett_previous_message present?
        │    yes → use it (caller wins), duplex_source = "caller"
        │    no  → cache fresh? → merge it, duplex_source = "bridge_cache"
        │           no cache   → duplex_source = "absent" (+ existing flag)
        ▼
 Preflight runs with duplex; Director's Correction path live every turn
```

### 2.2 Guardian server changes

#### NEW `src/guardian/duplex-cache.ts`

```ts
export interface DuplexCacheEntry {
  scarlettMessage: string;
  threadKey: string;        // from Grok URL path (conversation id) or "default"
  capturedAt: number;       // epoch ms
  contentHash: string;      // sha256 of normalized text — dedup + observability
}

export class DuplexCache {
  set(entry: DuplexCacheEntry): void;                       // replaces per threadKey
  getFresh(threadKey: string | undefined, ttlMs: number): DuplexCacheEntry | undefined;
  // getFresh falls back to the most recent entry across threads when
  // threadKey is unknown (MCP calls carry no thread id) IF only one
  // thread has been active within the TTL — ambiguity returns undefined.
}
```

In-memory only (single operator, single Guardian instance; a restart losing 45 min of cache is acceptable — the next Scarlett reply repopulates it). No disk, no PII at rest.

#### EDIT `src/guardian/server.ts` — one new endpoint

```ts
app.post("/duplex-cache", (req, res) => {
  if (!requireGuardianAuth(req, res)) return;
  // zod: { scarlett_message: string.min(20), thread_key?: string, content_hash?: string }
  // normalize, hash, store; respond { ok, thread_key, chars, hash }
});
```

Notes: reuses the existing bearer + CORS middleware; `1mb` JSON limit already configured is ample; log one line (`Duplex cache set: <thread> <chars> chars`) — never the content.

#### EDIT `src/guardian/tools/preflight.ts` — merge point (~5 lines)

At entry to `runGuardianPreflight`: if `input.scarlett_previous_message` is empty/missing, consult `duplexCache.getFresh(...)`. On merge, set a new report field `duplex_source: "caller" | "bridge_cache" | "absent"` (models.ts addition) and log it. The existing `DUPLEX_INPUT_MISSING` flag now fires only when *both* caller and cache come up empty.

**Safety rule — caller always wins.** If Grok did pass the field (the instruction-layer work may yet succeed), the cache is ignored. This makes the sidecar purely additive: it can only raise the duplex-present rate, never corrupt it.

**Staleness rule.** TTL 45 min (config `GUARDIAN_DUPLEX_CACHE_TTL_MS`) + single-active-thread disambiguation. A stale or ambiguous cache entry is *worse* than no duplex (the auditor would critique the wrong turn), so the cache declines to answer rather than guess. The report's `duplex_source` field makes every merge auditable in the saved JSON.

### 2.3 Userscript v2 — scraping architecture

Rewrite `scripts/guardian-browser-bridge.user.js` as v2.0 with three internal modules (single file, Tampermonkey-compatible):

**(a) Completion detector.** A `MutationObserver` on the conversation container. Scarlett is "complete" when: the streaming/stop affordance disappears **and** no character mutations for 1500 ms **and** the last message is not authored by the user. Guards: ignore mutations caused by our own overlay; re-arm on URL change (SPA navigation between threads).

**(b) Bubble scraper — layered selector strategy.** Grok's DOM is unstable across deploys, so selectors are data, not code:

```js
const SELECTOR_LAYERS = [
  GM_getValue("guardian_selector_override", null),      // operator-pinned, survives updates
  '[data-testid*="message"]:not([data-testid*="user"])', // semantic guesses, cheap to extend
  '[class*="message-row"], [class*="response"]',
  // last resort: structural heuristic — direct children of the scroll container,
  // partitioned by author via presence of the user-avatar/edit affordance
];
```

Extraction: take the **last** assistant-authored container; `innerText` minus known chrome (copy/regenerate buttons, timestamps, feedback widgets — remove matching child nodes from a clone before reading). Normalize whitespace; cap at 12,000 chars (auditor evidence budget); hash.

**(c) Calibration mode (replaces guesswork with one click).** `CONFIG.mode = "calibrate"`: overlays a click-to-pick element inspector; the operator clicks Scarlett's bubble once; the script derives the most specific stable selector (prefers `data-*` attributes over classes), stores it via `GM_setValue`, and echoes what it will scrape for visual confirmation. This is the productized version of the DOM probe that already proved interception works — calibration takes a minute after any Grok redeploy instead of a debugging session.

**(d) Transport.** `GM_xmlhttpRequest` POST to `CONFIG.guardianUrl + "/duplex-cache"` on every completed Scarlett reply; skip if hash equals last-sent (regenerations replace by design — a *newer* different hash simply overwrites). Status pill (small, corner, auto-fade): `🛡 duplex ✓ 3.2k chars` or `🛡 offline` — observability without noise.

Config block additions: `mode: "shadow" | "interceptor" | "calibrate"`, `threadKeyFromUrl: true`, bearer token via `GM_setValue` (not hardcoded in source — v1.0 hardcodes tunnel URLs; keep `@connect` domains current but move secrets to storage).

### 2.4 Why Mode 1 wins on every measured failure axis

| Historic failure | Interceptor exposure | Shadow sidecar |
|------------------|----------------------|----------------|
| Auto-submit races / lost sends | High (blocks real sends) | **None** — never touches send |
| Prompt bleed (Scarlett quoting Guardian JSON) | Medium (injects into prompt) | **None** — injects nothing |
| Double preflight cost (bridge + MCP both fire) | High without dedup | **None** — MCP remains the only preflight |
| Grok CSP | Solved via GM_xhr | Same solution, fewer calls |
| DOM drift breaking the bridge | Breaks the whole turn flow | Degrades to today's behavior (duplex missing), RP unaffected |

That last row is the operational argument: **shadow-mode failure is invisible and non-blocking.** The worst case is exactly the status quo.

---

## 3. Mode 2 — Full Interceptor (fallback, hardened v2)

Kept current in the same script, activated by `CONFIG.mode = "interceptor"`. Only build after Mode 1 is stable; only *use* if MCP tool-calling compliance regresses. Changes from v1.0:

1. **Server-compiled brief, not client compaction.** v1.0's `compactGuardianReport` re-implements report compaction badly (dumps hard flags/raw precedents — the measured prompt-bleed cause). Fix server-side: `/preflight` accepts `{ format: "brief" }` and returns `{ brief_markdown, proceed_recommendation, confidence_score, report_id }`, where `brief_markdown` is `compileGrokBrief(report)` — the **same** filtered brief the MCP path produces. One compaction pipeline, one source of truth. (~10 lines in `server.ts`; `compileGrokBrief` already exists.)
2. **Duplex from the scraper.** The interceptor now sends `scarlett_previous_message` (from module (b)) in the same `/preflight` call — full duplex without OOC.
3. **Injection format:** original user text + `\n\n<guardian_context>\n{brief_markdown}\n</guardian_context>`. Instruction layer (project/skill text) gains one line: *"If the incoming message contains a `<guardian_context>` block, treat it as your completed preflight — do NOT call guardian_memory_preflight again this turn."*
4. **Belt-and-braces dedup server-side:** Guardian keeps a 90-second idempotency cache keyed by `sha256(user_message)`; a second preflight for the same turn (bridge then MCP, or vice versa) returns the cached report instead of re-running retrieval + auditor. Cheap insurance in mixed deployments, useful even in pure MCP mode (connector retries).
5. **Staged submit:** `autoSubmitAfterPreflight: false` initially — inject, focus, let the operator press Enter (which the `allowProgrammaticSubmit` guard already permits). Flip to auto only after a week of clean manual-mode injections. All v1.0 safeguards retained (`isTrusted`, capture phase, re-entry flag).
6. **Fail-open by default:** Guardian unreachable → send the original message untouched + red pill. `failClosed: true` opt-in for continuity-critical sessions (preserves v1.0's `do_not_proceed` blocking behavior).

---

## 4. Roadmap

### P0 — Shadow duplex, end of manual OOC (2–3 sessions of work)

| # | Task | Files |
|---|------|-------|
| 1 | `DuplexCache` module + `/duplex-cache` endpoint + config (TTL) | NEW `src/guardian/duplex-cache.ts`; `server.ts`; `config.ts` |
| 2 | Merge logic + `duplex_source` field + logging | `tools/preflight.ts`; `report/models.ts` |
| 3 | Userscript v2 skeleton: config modes, transport, status pill | `scripts/guardian-browser-bridge.user.js` |
| 4 | Completion detector + scraper with layered selectors | same |
| 5 | Calibration mode (click-to-pin selector, GM storage) | same |
| 6 | Live validation: one RP session, check saved JSONs for `duplex_source: "bridge_cache"` on every post-first turn | operational |

### P1 — Robustness

| # | Task | Notes |
|---|------|-------|
| 7 | Thread-key extraction from Grok URL + multi-thread disambiguation test | Two threads open in parallel must not cross-feed |
| 8 | Regeneration/edit handling (newer hash overwrites; verify auditor sees the *final* version) | |
| 9 | Idempotency cache (90 s, keyed by user-message hash) | `server.ts` — serves Mode 2 later and connector-retry dedup now |
| 10 | Scorecard additions: duplex-present rate, `duplex_source` distribution, cache-merge staleness histogram | audit script |

### P2 — Interceptor fallback (build, shelve, document)

| # | Task | Notes |
|---|------|-------|
| 11 | `format: "brief"` on `/preflight` | server-side compaction, one source of truth |
| 12 | Interceptor mode on the v2 scraper (manual-submit first, fail-open default) | same script, config flag |
| 13 | Instruction-layer line: skip tool call when `<guardian_context>` present | versioned instruction files |
| 14 | One supervised live session in interceptor mode to certify the fallback works, then park it | operational |

---

## 5. Acceptance criteria

- **Invisibility:** a full RP session with zero OOC blocks typed, zero injected text in the composer, zero extra visible artifacts beyond the status pill.
- **Duplex rate:** ≥ 90% of post-first-turn preflights carry a real `scarlett_previous_message` (the status doc's completion criterion #1), with `duplex_source` distribution visible in saved JSONs.
- **Correctness:** the cached message the auditor received is byte-identical (post-normalization) to the bubble on screen — verify by hash on 3 spot-checks, including one regeneration.
- **Non-interference:** with the bridge disabled mid-session, RP continues exactly as today (missing-duplex flag returns; nothing else changes).
- **Fallback readiness:** interceptor mode demonstrated once end-to-end (scrape → brief → inject → manual submit → Scarlett grounded, no meta bleed) then left dormant.

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Grok DOM redeploys break selectors | Layered selectors + 1-minute calibration mode; shadow-mode failure = status quo, not breakage |
| Stale/wrong-thread cache feeds auditor the wrong reply | TTL + thread keys + single-active-thread rule + decline-on-ambiguity; `duplex_source` audit trail |
| Bearer token in userscript source | Move to `GM_setValue` storage; `@connect` pinned to tunnel domain |
| Tunnel URL churn (ngrok free) | Config in GM storage, editable without reinstalling the script; or stable Cloudflare tunnel |
| Grok starts filling the arg itself (instruction layers succeed) | Caller-wins rule makes the sidecar harmlessly redundant — the desired end state |
| Double preflight in future mixed mode | Idempotency cache (P1-9) |

---

## 7. One-line summary

**Don't intercept the send to fix duplex — the MCP path already works and is missing only one string; ship an observe-only sidecar that scrapes Scarlett's finished reply and lets Guardian merge it server-side (invisible, non-blocking, fail-safe), and keep the full intercept-inject bridge as a built-but-shelved fallback for the day tool-calling compliance regresses.**

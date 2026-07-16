# Gemini catch-up — Phase 2 complete + Phase 3 duplex in progress

**Date:** 2026-07-16  
**Audience:** Gemini 3.1 Pro (review / goldens / optional prose assist)  
**Author:** Grok Build (implementation lead)  
**Operator:** human integration + live RP  

This document brings Gemini up to speed after Phase 2 implementation and early Phase 3 shadow-duplex work. **Do not re-implement Phase 2.** Optional: light review notes if anything looks unsafe; primary ask may be helping the operator draft Benjamin’s next IC line for a controlled duplex live test (see §7).

---

## 0. Roles (unchanged)

| Agent | Role |
|-------|------|
| **Fable 5** | Architecture, D1–D11 pack, master roadmap |
| **Grok Build** | Sequential WP implementation, git, preserve branches, server ops evidence |
| **Gemini 3.1 Pro** | Golden expectations, prompt review, red-team, optional operator-side prose assist |
| **Operator** | Approvals, Tampermonkey, live Grok.com RP, smoke tests |

**Branch (both repos):** `feature/master-roadmap-v1`  
**Master index:** `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md`

| Repo | Tip (approx) | Notes |
|------|----------------|-------|
| `scarlett-guardian-mcp` | `ffdccb0` | Through WP-3.2 |
| `rag-memory-mcp` / grok-rag-mcp | `f8c9274` | Through WP-2.7 |

Preserve branches exist per WP (e.g. `preserve/roadmap-wp27-…`, `preserve/roadmap-wp31-…`, `preserve/roadmap-wp32-…`).

---

## 1. Progress ledger (where we are)

### Phase 0–1 — done (prior)
- Baseline tag `guardian-baseline-2026-07-15`
- Eval harness L1: schema, cassettes, `eval:fast` **16/16**, mutants, telemetry + `/dashboard`
- Gemini already owned WP-1.4 golden expectations (complete)

### Phase 2 — Foundations — **all done**

| WP | Summary |
|----|---------|
| **2.1** | `## Session —` headings on `event-log.md` + chronological summaries 4/5/6; reindex; maintenance guide |
| **2.2** | `parseLiveBeat` / `scoreRecency`; live state in parallel dispatch; recency in `selectPrecedents`; tests |
| **2.3** | LIVE BEAT block in auditor prompt + supersession instruction |
| **2.4** | Live-beat-aware material gate for write-back; beat-advance uses `## Session —` |
| **2.5** | **Ops ceremony:** stage → list → dry-run → **approve** → bg reindex on **event-log only** (test bullet, not story canon). Operator-run approve succeeded. Evidence: `wp-2.5-staging-ceremony-evidence-2026-07-16.md` |
| **2.6** | RAG `list_staged_story_updates` + optional `include_content`; `reject_staged_story_update` → `staged-updates/rejected/`. Helper CLI extended. |
| **2.7** | `rotation.ts`, `rotate_event_log` (default dry_run), auto-rotate thresholds, `arc_chronicle` role (prio 75), `historical/arc-*` → `historical_narrative`. Verbatim unit tests; **no production peel** of live log (only 3 sessions; under threshold). |

### Phase 3 — Duplex automation — **in progress**

| WP | Status | Summary |
|----|--------|---------|
| **3.1** | **done** | In-memory `DuplexCache`; `POST/GET /duplex-cache`; preflight merge (**caller wins**); report `duplex_source`: `caller` \| `bridge_cache` \| `absent`; `DUPLEX_INPUT_MISSING` only if both empty; TTL 45 min (`GUARDIAN_DUPLEX_CACHE_TTL_MS`) |
| **3.2** | **done** | Tampermonkey userscript v2.0 **shadow** default: completion detector, layered scrape, GM POST `/duplex-cache`, status pill, menu (mode/URL/token/debug). Install: `docs/browser-bridge-v2-install.md` |
| **3.3** | pending | Calibrate polish (basic calibrate stub already in v2) |
| **3.4** | **next ops** | Live RP: prove `duplex_source: "bridge_cache"` without manual OOC paste |
| **3.5** | pending | Multi-thread / regen / 90s idempotency |

### Deferred ops (not blocking)

**Staged `current-state.md` queue hygiene** (three pendings under `rag-memory-mcp/.rag-memory-mcp/staged-updates/`):

1. Jun 23 — antigravity test junk → **reject** when convenient  
2. Jul 15 — cooling-lap continuity bullet — review later  
3. Jul 16 — thermal validation pit return — review later  

Do **not** approve blindly. Reject tool is WP-2.6. Roadmap has a FOLLOW-UP row.

---

## 2. Architecture of what just shipped (duplex)

```text
Scarlett finishes streaming on grok.com
        │
        ▼
Tampermonkey shadow bridge scrapes last assistant bubble
        │  GM_xmlhttpRequest
        ▼
POST Guardian /duplex-cache  { scarlett_message, thread_key, content_hash }
        │  in-memory TTL 45m, keyed by thread_key
        …
User sends Benjamin turn (no OOC duplex paste required)
        │
        ▼
Grok MCP → guardian_memory_preflight
        │  if scarlett_previous_message empty → merge from cache
        │  duplex_source = bridge_cache | caller | absent
        ▼
Auditor can fire Director's Correction; report saved under docs/guardian-reports/
```

**Safety rules:**

- Caller always wins over cache  
- Stale/ambiguous cache declines (wrong-turn critique worse than missing duplex)  
- Shadow mode never injects into the composer (no prompt-bleed class of failure)

---

## 3. Issues / friction encountered (honest)

| Issue | Impact | Resolution / status |
|-------|--------|---------------------|
| Long Grok Build sessions / connectivity / false weekly limit | Operator confusion mid-WP-2.3–2.5 | Resumed in new sessions; work continued |
| Live RAG on :8787 still on **pre-2.6** code when operator ran `list --include-content` | Response lacked `proposed_content` / `include_content` | Needs **RAG restart** after pull; operator deferred queue cleanup |
| Directory confusion (`npx` ceremony script) | Operator ran from wrong cwd | Clarified: always `rag-memory-mcp/` |
| WP-2.5 approve left to operator | Correct (writes live event-log) | Operator succeeded; ceremony session left in event-log (harmless technical note) |
| Temporary “post scrape” pill sometimes not noticed | UX only | Server showed `chars: 2611` → success |
| Interceptor mode menu confuses | Operator tried interceptor briefly | Guidance: daily use = **shadow** only; reload after mode change |
| Old Tampermonkey scripts (v1 preflight bridge, DOM probe, etc.) | Clutter / risk of conflict | Operator removed them |
| Guardian :8790 sometimes not running when CLI probes | Smoke false negatives | Operator restarts as needed; health currently OK |
| Phase 2 “review” not formally Gemini-signed | Gemini may have been waiting | This pack is the catch-up; Phase 2 is implementation-complete with evidence docs |

**Not issues (working as designed):**

- Shadow UI is intentionally subtle  
- Auto-rotate does nothing on 3-session hot log  
- `eval:fast` remains mandatory for Guardian code WPs  

---

## 4. Evidence docs (read if reviewing)

Under `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/`:

- `wp-2.5-staging-ceremony-evidence-2026-07-16.md`  
- `wp-2.6-reject-list-content-evidence-2026-07-16.md`  
- `wp-2.7-event-log-rotation-evidence-2026-07-16.md`  
- `wp-3.1-duplex-cache-evidence-2026-07-16.md`  
- `wp-3.2-browser-bridge-v2-evidence-2026-07-16.md`  
- `browser-bridge-duplex-architecture-2026-07.md` (Fable D6)  
- Install: `../browser-bridge-v2-install.md`

---

## 5. Current runtime snapshot (2026-07-16, operator session)

- Guardian health: ok on `:8790`  
- RAG health: ok on `:8787` (vector store configured)  
- Duplex cache: **1** entry, **2611** chars, thread_key from live Grok URL, hash prefix present  
- Bridge: shadow mode installed; older TM scripts removed  

---

## 6. What Gemini should / should not do now

**Do:**

- Absorb this pack so Phase 2 review wait can close  
- Optionally note residual risks (staging queue, interceptor misuse, DOM drift)  
- Help operator draft **one** high-quality Benjamin IC message for the live duplex test (§7), grounded in current scene (Nordschleife / paddock / post-stint intimacy from recent event-log / current-state)  
- Stay out of RAG/Guardian implementation unless Grok asks for review on a specific diff  

**Do not:**

- Re-open Phase 2 design  
- Rewrite the userscript or server  
- Author a large new golden set unless a WP (e.g. 4.8) starts  
- Paste secrets, bearer tokens, or full adult ERP transcripts into commits  

---

## 7. Immediate goal of the live test (WP-3.4 start)

Prove: after Scarlett’s reply is scraped into `/duplex-cache`, the **next** preflight can show:

```json
"duplex_source": "bridge_cache"
```

without the operator pasting `scarlett_previous_message` in OOC.

Success criteria for this mini-test (one cycle):

1. Shadow armed; Guardian up  
2. Scarlett completes a new reply → bridge posts (pill or cache chars update)  
3. Benjamin message sent; MCP preflight runs  
4. Newest `docs/guardian-reports/preflight-full-*.json` has `duplex_source: "bridge_cache"` (or `caller` if model still sent duplex — acceptable but note it)  
5. Streamlined brief still clean (no meta bleed)

Full ≥90% rate over a whole session can wait for a longer night; one green `bridge_cache` is enough to de-risk.

---

## 8. Paste block for Gemini terminal (short)

```text
You are Gemini 3.1 Pro. Catch up via:
scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/gemini-catchup-phase2-phase3-duplex-2026-07-16.md

Phase 0–2 DONE on feature/master-roadmap-v1 (Guardian ~ffdccb0, RAG ~f8c9274).
Phase 3: WP-3.1–3.2 done (DuplexCache + shadow Tampermonkey bridge). Next ops: WP-3.4 mini live test.

Do NOT implement code. Optionally: (1) brief Phase 2 residual-risk notes;
(2) help operator craft ONE Benjamin IC reply for the duplex live test per the step-by-step
in the same doc § live-test guide / operator will paste story context.

Staging queue hygiene is deferred. Prefer shadow mode; ignore interceptor for daily use.
```

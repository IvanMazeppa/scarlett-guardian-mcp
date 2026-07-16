# WP-3.2 evidence — Browser bridge v2 (shadow duplex) — 2026-07-16

**Status:** done (code + install doc; live RP rate is WP-3.4)  
**Owner:** Grok Build  
**Roadmap:** D6 §2.3 / master WP-3.2

## Delivered

| Piece | Location |
|-------|----------|
| Userscript v2.0.0 | `scripts/guardian-browser-bridge.user.js` |
| Install + smoke checklist | `docs/browser-bridge-v2-install.md` |

## Features (acceptance mapping)

| Requirement | Implementation |
|-------------|----------------|
| Config modes | `shadow` (default), `interceptor` (legacy fail-open), `calibrate` (selector pin stub → WP-3.3) via GM storage + Tampermonkey menu |
| GM transport | `GM_xmlhttpRequest` POST to `{base}/duplex-cache` with optional bearer |
| Status pill | Fixed corner pill: armed / posting / ✓ chars / offline |
| Completion detector | MutationObserver + streaming stop check + `quietMs` (1500) re-check |
| Layered scraper | GM selector override → data-testid → class heuristics → structural fallback; chrome strip; max 12k chars; SHA-256 hash; skip identical re-posts |

## Server smoke (this session)

Guardian was already restarted with WP-3.1. Manual POST accepted:

```text
POST /duplex-cache → ok, thread_key wp32-smoke
GET /duplex-cache → entries include wp32-smoke
```

## Operator install (you)

1. Tampermonkey → new script → paste `scripts/guardian-browser-bridge.user.js`.  
2. On grok.com: confirm console `Guardian Bridge v2] shadow mode`.  
3. Menu **scrape now** then **post scrape → duplex-cache** on a thread with Scarlett text.  
4. `curl http://127.0.0.1:8790/duplex-cache` shows a new entry.

## Explicitly later

- **WP-3.3** — polish calibration + move more defaults into GM storage UX  
- **WP-3.4** — one full RP session; ≥90% `duplex_source: bridge_cache` in saved reports  
- **WP-3.5** — multi-thread + regeneration + 90s preflight idempotency  

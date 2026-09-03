# Guardian Browser Bridge v2 — install & smoke (WP-3.2)

**Script:** `scripts/guardian-browser-bridge.user.js` (v2.1.0 — WP-R1 smart scrape + last-good seed)  
**Server:** WP-3.1 `POST /duplex-cache` on Guardian (`:8790`)  
**Ghostwriter (v2.5.0 ✨ Polish + style dropdown):** [ghostwriter-operator-guide.md](./ghostwriter-operator-guide.md)

## What it does (default = shadow)

1. Watches the Grok conversation DOM for Scarlett’s reply to finish streaming.  
2. Scrapes the last assistant bubble (layered selectors).  
3. `GM_xmlhttpRequest` → `POST {guardianBaseUrl}/duplex-cache`.  
4. Corner pill: `🛡 duplex ✓ 3.2k chars` or `🛡 offline`.  
5. **Never** touches the composer or Send — MCP preflight still runs as usual; Guardian fills duplex from cache when the model omits the arg.

## Install (Tampermonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).  
2. Dashboard → **Create a new script**.  
3. Replace the template with the full contents of  
   `scarlett-guardian-mcp/scripts/guardian-browser-bridge.user.js`.  
4. Save.  
5. Open `https://grok.com` (or your Grok host) and confirm the console log:  
   `[Guardian Bridge v2] shadow mode → http://127.0.0.1:8790/duplex-cache`

### Menu (Tampermonkey → script menu on grok.com)

| Command | Purpose |
|---------|---------|
| mode → shadow / interceptor / calibrate | Persist mode (`guardian_mode`) — **reload page** after change |
| set base URL… | e.g. `http://127.0.0.1:8790` or Cloudflare tunnel origin |
| set bearer token… | If `GUARDIAN_MCP_BEARER_TOKEN` is set on the server |
| scrape now (debug) | Log last bubble + hash (hash-check acceptance) |
| post scrape → duplex-cache | Force one POST without waiting for completion |
| clear duplex-cache (server) | `DELETE /duplex-cache` — wipe all in-memory entries (then re-post from main thread) |

Storage keys (no secrets in the script body): `guardian_base_url`, `guardian_bearer_token`, `guardian_mode`, `guardian_selector_override`, `guardian_last_duplex_hash`.

## Local network notes

- Guardian must be up: `cd scarlett-guardian-mcp && npm run dev` → `:8790`.  
- Tampermonkey `@connect 127.0.0.1` is declared; first run may ask permission to talk to localhost.  
- For a public tunnel, set base URL to `https://….trycloudflare.com` (no path).

## Smoke checklist

### A. Server health

```bash
curl -sS http://127.0.0.1:8790/health
curl -sS http://127.0.0.1:8790/duplex-cache
```

### B. Manual scrape → cache (from menu)

1. On a Grok thread where Scarlett has already replied, run **scrape now (debug)**.  
2. Confirm console shows `chars` and `hash`.  
3. Run **post scrape → duplex-cache**.  
4. Pill should show `duplex ✓ … chars`.  
5. Check server:

```bash
curl -sS http://127.0.0.1:8790/duplex-cache
# entries >= 1, threads[].chars match
```

### C. Hash match (acceptance for WP-3.2)

1. Copy Scarlett’s on-screen bubble text (select all in the bubble).  
2. Menu **scrape now** — preview/hash in console.  
3. Optional: post and compare `hash` prefix with server log line  
   `Duplex cache set: … hash=…`.

### D. Live shadow (next RP turn)

1. Leave mode = **shadow**.  
2. Let Scarlett finish a new reply (wait for streaming to stop).  
3. Pill should auto-post within ~2s of quiet.  
4. Next Benjamin turn: Grok MCP preflight may omit duplex; full report JSON should show  
   `"duplex_source": "bridge_cache"` (proves WP-3.1+3.2 together — formal ops gate is **WP-3.4**).

## Modes

| Mode | Behavior |
|------|----------|
| **shadow** (default) | Duplex cache only; safe; recommended |
| **interceptor** | Legacy send intercept + `/preflight` (fail-open unless fail_closed); prefer not to use daily |
| **calibrate** | Click Scarlett bubble once → save selector override (expanded in WP-3.3) |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Pill offline | Guardian down / wrong base URL / bearer mismatch |
| Scrape empty | Run **calibrate** and click Scarlett’s bubble; or Grok DOM changed |
| Posts old message | Reload tab after thread switch; script re-arms on URL change |
| Permission denied to 127.0.0.1 | Allow domain in Tampermonkey for this script |

## Out of scope (later WPs)

- **WP-3.3** — richer calibration UX + all config via GM storage defaults polish  
- **WP-3.4** — full RP session ≥90% `bridge_cache` rate  
- **WP-3.5** — multi-thread disambiguation hardening + 90s idempotency  

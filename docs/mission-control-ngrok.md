# Mission Control — ngrok Hobbyist setup

Guardian is the **only** public endpoint. RAG stays on `127.0.0.1:8787`.

**Hard rule:** edge Basic Auth applies only to `/dashboard`, `/telemetry`, and `/control`. Never challenge `/mcp`, `/preflight`, `/duplex-cache`, or `/health` — Grok will misread HTML auth as “OAuth Credentials Required” (see `docs/ngrok-oauth-disaster-report.md`).

Hobbyist benefits used here:

- Persistent ngrok-branded domain (`*.ngrok.app`)
- No interstitial warning page
- Traffic Policy (path-scoped Basic Auth)

## One-time: reserve a domain

1. Open [https://dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains) while logged into your Hobbyist account.
2. Click **New Domain** / **Create Domain**.
3. Choose an **ngrok-branded** hostname (example shape: `scarlett-guardian.ngrok.app`). Pick whatever is free — do not invent a custom apex domain (that needs Pay-as-you-go).
4. Confirm / create. Copy the hostname only (no `https://`).
5. In `scarlett-guardian-mcp/.env` add (never commit this file):

```text
NGROK_STATIC_DOMAIN=your-chosen-name.ngrok.app
```

6. Do **not** create a separate public endpoint for RAG. Hobbyist allows only a few online endpoints — spend one on Guardian.

## One-time: local Traffic Policy credentials

```bash
cd scarlett-guardian-mcp
cp ngrok/traffic-policy.example.yml ngrok/traffic-policy.local.yml
```

Edit `ngrok/traffic-policy.local.yml` and replace `USER:PASSWORD` with a username and password you will use for Mission Control (phone / laptop browser). Keep the file gitignored.

## Daily start

Terminal A — RAG (local only):

```bash
cd ../rag-memory-mcp && npm run dev
```

Terminal B — Guardian:

```bash
cd ../scarlett-guardian-mcp && npm run dev
```

Terminal C — tunnel:

```bash
cd ../scarlett-guardian-mcp && npm run tunnel
```

## Smoke checks

```bash
# No password — must succeed
curl -sS "https://$NGROK_STATIC_DOMAIN/health"

# No password — must be 401
curl -sS -o /dev/null -w "%{http_code}\n" "https://$NGROK_STATIC_DOMAIN/dashboard"

# With Basic Auth — must be 200
curl -sS -u 'USER:PASSWORD' -o /dev/null -w "%{http_code}\n" "https://$NGROK_STATIC_DOMAIN/dashboard"

# MCP path must NOT prompt for Basic Auth
curl -sS -o /dev/null -w "%{http_code}\n" "https://$NGROK_STATIC_DOMAIN/mcp"
```

Grok connector `serverUrl`:

```text
https://YOUR_DOMAIN/mcp
```

Browser bridge (Tampermonkey): set base URL to `https://YOUR_DOMAIN` (origin only, no `/mcp`). Menu: **Guardian: use Mission Control domain…**

Mission Control UI:

```text
https://YOUR_DOMAIN/dashboard
```

Enter the Basic Auth credentials when the browser prompts.

## Story time vs wall-clock (non-negotiable)

Narrative calendar is **only** LIVE BEAT / `current-state.md` (`Time in Story` / `Last Updated`). It can skip, hold, or run several days in a row. It must **never** be tied to the real-world date on your PC.

Mission Control labels:

- **Story time / LIVE BEAT** — canon from disk
- **Ops window / event timestamps** — when a preflight *ran on your machine* (telemetry). Useful for latency charts; useless as story date.

If play has moved (e.g. Monday 2 November 2026) but `current-state.md` still says Mid/Late October, that is save-lag — update the file and reindex; do not “fix” it by using today’s real date.

## Optional later: Google OAuth

Same path expressions; swap the `basic-auth` action for `oauth` + an email allowlist. Keep `/mcp` unauthenticated at the edge.

# Ngrok OAuth Disaster Report

**Date:** 2026-06-23
**Incident:** Grok repeatedly throwing "OAuth Credentials Required" for both RAG and Guardian MCP servers.
**Root Cause:** Ngrok Interstitial HTML Page + Grok Pre-Flight Pings

## What Went Wrong
Earlier in the project, the system was configured to use **Cloudflare Tunnels** (`cloudflared`). Cloudflare provides a clean, direct tunnel to the local port.

During today's Guardian setup, the instructions switched to using **ngrok** (`ngrok http --url=...`). 

The free tier of ngrok injects a mandatory HTML interstitial warning page ("You are about to visit an ngrok URL"). While there is a header designed to bypass this (`ngrok-skip-browser-warning: 1`), Grok's Custom Connector UI performs an initial validation ping to the URL **before** it fully applies the custom user headers. 

Because the initial ping lacks the bypass header, ngrok returns the HTML warning page. Grok's MCP client expects an SSE stream or JSON response. When it receives a full HTML webpage instead, the client catastrophically misinterprets the response as a redirect to an OAuth Login portal, triggering the "OAuth Credentials Required" UI block.

## Why it happens to both RAG and Guardian
This is a network-layer issue caused entirely by the ngrok tunnel, which is why the error instantly infected the RAG server as soon as it was placed behind the same ngrok tunnel. It has nothing to do with the Guardian code, the `.env` file, or the Bearer token.

## Immediate Resolution Plan
**Stop using ngrok immediately.** The system must return to Cloudflare Tunnels to avoid the interstitial page.

1. Close the terminal running ngrok (`Ctrl+C`).
2. Start a Cloudflare tunnel pointing to the Guardian port (8790):
   ```bash
   cloudflared tunnel --url http://localhost:8790
   ```
3. Cloudflare will output a clean, temporary URL (e.g., `https://random-words.trycloudflare.com`).
4. Paste that new Cloudflare URL into Grok.
5. Paste the new Cloudflare URL into the Tampermonkey script `CONFIG.guardianUrl`.

Because Cloudflare has no interstitial warning page, Grok will instantly connect and see the MCP server without throwing the OAuth screen.

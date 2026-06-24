# Guardian Daily Run Guide

This is the short setup path for running the current Guardian system.

## Mental Model

Run two local services, expose only Guardian, and let Guardian talk to RAG internally.

- `rag-memory-mcp` runs locally on `127.0.0.1:8787`.
- `scarlett-guardian-mcp` runs locally on `127.0.0.1:8790`.
- the public tunnel points to Guardian on port `8790`.
- Grok/browser should talk to Guardian, not directly to RAG.

## Important Correction For Grok MCP UI

In the screenshot, both MCP cards use the same ngrok domain:

- Guardian: `https://tar-referred-recorded-transition.trycloudflare.com/mcp`
- RAG: do not expose directly in this setup

That is only valid if the ngrok tunnel or a reverse proxy routes `/mcp-v2` to the RAG server on `8787`. With the current command:

the public URL points only to Guardian. Guardian does not expose `/mcp-v2`.

Recommended current setup:

- Enable `scarlett-guardian-mcp` in Grok.
- Disable/remove direct `grok-rag-mcp` from Grok unless you set up a second tunnel or proxy.
- Keep RAG running locally because Guardian depends on it through `RAG_MCP_URL=http://127.0.0.1:8787/mcp-v2`.

## 1. Start RAG

Terminal 1:

```bash
cd ~/projects/AMG_GT_Black_Prototype/rag-memory-mcp
npm run dev
```

Check:

```bash
curl http://127.0.0.1:8787/health
```

Expected shape:

```json
{"ok":true,"retrieval_mode":"vector_search","vector_store_id":"vs_..."}
```

## 2. Start Guardian

Terminal 2:

```bash
cd ~/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
npm run dev
```

For the current no-password setup, leave `GUARDIAN_MCP_BEARER_TOKEN` blank in `.env`. Do not add an authorization header in Grok or Tampermonkey.

Check:

```bash
curl http://127.0.0.1:8790/health
```

Expected:

```json
{"ok":true,"name":"scarlett-guardian-mcp","version":"0.1.0"}
```

## 3. Start or Use Public Tunnel

Terminal 3:

Current verified public tunnel:

```text
https://tar-referred-recorded-transition.trycloudflare.com
```

Check:

```bash
curl https://tar-referred-recorded-transition.trycloudflare.com/health
```

Expected:

```json
{"ok":true,"name":"scarlett-guardian-mcp","version":"0.1.0"}
```

## 4. Configure Grok MCP

Add only Guardian unless you deliberately expose RAG separately:

```json
{
  "name": "scarlett-guardian-mcp",
  "serverUrl": "https://tar-referred-recorded-transition.trycloudflare.com/mcp"
}
```

Expected tool:

- `guardian_memory_preflight`

Do not expect Grok to call `retrieve_story_context` or `search_story_memory` directly in this setup. Guardian calls those internally.

## 5. Configure Tampermonkey Bridge

Install the script:

```text
scripts/guardian-browser-bridge.user.js
```

In your private Tampermonkey copy, set:

```javascript
const CONFIG = {
  guardianUrl: "https://tar-referred-recorded-transition.trycloudflare.com/preflight",
  guardianBearerToken: "",
  forceFullRetrieval: false
};
```

Leave `guardianBearerToken` blank unless you deliberately turn Guardian auth on later.

## 6. First Safe Browser Test

Use a harmless test message first.

Expected browser behavior:

- The bridge intercepts the send action.
- It shows `Guardian Preflight in progress...`.
- It calls Guardian `POST /preflight` through ngrok.
- If Guardian returns `proceed` or `proceed_with_caution`, the script injects a compact Guardian report and submits.
- If Guardian returns `do_not_proceed`, it blocks the send and leaves your original text in the input box.

## 7. If Something Fails

- If Guardian MCP works but browser bridge fails, inspect DevTools Console first.
- If DevTools shows CSP errors for `fetch`, that is expected; the bridge must use `GM_xmlhttpRequest`.
- If Grok sends the original message instead of the enriched message, the React textarea update path needs more work.
- If the button click loops, the trusted/programmatic submit guard needs adjustment.
- If Guardian returns `401`, it is still running with auth enabled. Confirm `GUARDIAN_MCP_BEARER_TOKEN=` is blank and restart Guardian.
- If Guardian returns retrieval failure, verify RAG is running on `8787`.

## 8. Current Completion State

The Guardian MCP and `/preflight` endpoint are working. The live preflight test proved Guardian can orchestrate RAG and return a high-confidence report.

The remaining unstable part is the Tampermonkey bridge's live browser integration:

- React textarea injection must be verified.
- Programmatic send must be verified.
- Token handling must be kept private.
- Direct RAG MCP in Grok should remain disabled unless separately exposed.

# Finish Guardian Setup: No-Password Path

This is the quickest path to finish the current Guardian setup.

Your current setup is no-password/no-bearer-token. That means:

- `GUARDIAN_MCP_BEARER_TOKEN=` stays blank in `.env`.
- Grok does not need an `Authorization` header.
- Tampermonkey keeps `guardianBearerToken: ""`.
- If you see `Bearer ${GUARDIAN_MCP_BEARER_TOKEN}`, remove it for this setup.

## Current Goal

Run three things:

1. RAG memory MCP on local port `8787`.
2. Guardian MCP on local port `8790`.
3. A public tunnel exposing Guardian port `8790` to Grok.

Grok should talk to Guardian only. Guardian talks to RAG internally.

## 1. Confirm Guardian `.env`

Open:

```text
scarlett-guardian-mcp/.env
```

It should be:

```text
GUARDIAN_HOST=0.0.0.0
GUARDIAN_PORT=8790
RAG_MCP_URL=http://127.0.0.1:8787/mcp-v2
GUARDIAN_MCP_BEARER_TOKEN=
RAG_MCP_BEARER_TOKEN=
GUARDIAN_CONFIDENCE_THRESHOLD=70
```

The important line is:

```text
GUARDIAN_MCP_BEARER_TOKEN=
```

Leave it blank.

## 2. Start RAG

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

## 3. Start Guardian

Terminal 2:

```bash
cd ~/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
npm run dev
```

Check:

```bash
curl http://127.0.0.1:8790/health
```

Expected:

```json
{"ok":true,"name":"scarlett-guardian-mcp","version":"0.1.0"}
```

## 4. Check Guardian Preflight Without a Token

Because this is the no-password setup, this should not return `401`:

```bash
curl http://127.0.0.1:8790/preflight \
  -H "Content-Type: application/json" \
  -d '{"user_message":"Guardian setup test only. Do not continue the story.","force_full_retrieval":false}'
```

Expected: a Guardian JSON report, or a retrieval error if RAG is not running correctly.

If you get `401`, Guardian is still running with an old token value. Stop and restart Guardian after confirming `.env` has `GUARDIAN_MCP_BEARER_TOKEN=`.

## 5. Use the Current Public Tunnel

The currently verified tunnel is:

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

## 6. Configure Grok MCP

Use Guardian only:

```json
{
  "name": "scarlett-guardian-mcp",
  "serverUrl": "https://tar-referred-recorded-transition.trycloudflare.com/mcp"
}
```

Do not add this:

```json
"headers": {
  "Authorization": "Bearer ..."
}
```

Expected tool:

```text
guardian_memory_preflight
```

Do not expose or enable direct RAG MCP in Grok unless you deliberately create a second tunnel for RAG. In this setup, Guardian calls RAG internally.

## 7. Configure Tampermonkey

Install/update the bridge from:

```text
scarlett-guardian-mcp/scripts/guardian-browser-bridge.user.js
```

Its config should stay:

```javascript
const CONFIG = {
    guardianUrl: "https://tar-referred-recorded-transition.trycloudflare.com/preflight",
    guardianBearerToken: "",
    forceFullRetrieval: false
};
```

## 8. Final Browser Test

Use a harmless message first:

```text
Guardian setup test only. Please do not continue the story.
```

Expected behavior:

- Tampermonkey intercepts the send.
- It shows `Guardian Preflight in progress...`.
- Guardian receives `/preflight`.
- The outgoing prompt is enriched with the Guardian report, or the send is blocked if Guardian says `do_not_proceed`.

## If Something Fails

If local Guardian health fails, Guardian is not running on `8790`.

If remote Guardian health fails, ngrok is not pointing at `8790` or the reserved domain is not active.

If preflight fails with retrieval errors, RAG is not running or `RAG_MCP_URL` is wrong.

If Grok cannot see `guardian_memory_preflight`, check that Grok's MCP URL is exactly:

```text
https://tar-referred-recorded-transition.trycloudflare.com/mcp
```

If Tampermonkey does not intercept the send, the remaining work is browser-selector debugging in `guardian-browser-bridge.user.js`.

## Done Means

- RAG local health passes.
- Guardian local health passes.
- Guardian remote health passes through ngrok.
- Local `/preflight` works without an auth header.
- Grok sees `guardian_memory_preflight`.
- Tampermonkey can preflight a harmless message.


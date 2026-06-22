# Scarlett Guardian MCP

External Guardian MCP server for the Scarlett & Benjamin narrative memory system.

This server does not replace `rag-memory-mcp`. It wraps the existing RAG MCP with a stricter pre-prose enforcement layer. The Guardian exposes one main tool:

- `guardian_memory_preflight`

The tool calls the sibling RAG MCP before any in-character Scarlett prose:

1. `index_status` for diagnostics.
2. `retrieve_story_context` for live-scene preflight.
3. `search_story_memory` for deep corpus continuity.
4. Returns a structured Guardian report with confidence, hard flags, precedents, and proceed recommendation.

## Why This Exists

Grok 4.3 can skip retrieval when a scene feels emotionally continuous. That preserves short-term narrative flow but breaks long-term character fidelity. The Guardian makes retrieval a separate mechanical gate.

If the Guardian returns `do_not_proceed`, the model should not write Scarlett prose. It should stop OOC and repair retrieval.

## Requirements

- Node.js 20+
- Running sibling RAG MCP at `http://127.0.0.1:8787/mcp-v2` by default
- `npm install` in this repo

## Setup

```bash
cp .env.example .env
npm install
npm run build
```

Edit `.env` if your RAG server URL or ports differ:

```text
GUARDIAN_HOST=0.0.0.0
GUARDIAN_PORT=8790
GUARDIAN_MCP_BEARER_TOKEN=
RAG_MCP_URL=http://127.0.0.1:8787/mcp-v2
RAG_MCP_BEARER_TOKEN=
RAG_MCP_TIMEOUT_MS=30000
GUARDIAN_CONFIDENCE_THRESHOLD=70
```

Set `GUARDIAN_MCP_BEARER_TOKEN` before exposing Guardian through a tunnel or public host. When set, `POST /mcp` requires `Authorization: Bearer <token>`. `GET /health` stays public but only returns shallow service status.

## Run

Terminal 1, existing RAG:

```bash
cd ../rag-memory-mcp
npm run dev
```

Terminal 2, Guardian:

```bash
cd ../scarlett-guardian-mcp
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8790/health
```

Expected shallow response:

```json
{"ok":true,"name":"scarlett-guardian-mcp","version":"0.1.0"}
```

## Remote Tunnel

Expose Guardian, not the sibling RAG MCP:

```bash
ngrok http --url=deceiving-pummel-ajar.ngrok-free.dev 8790
```

Remote health:

```bash
curl https://deceiving-pummel-ajar.ngrok-free.dev/health
```

Remote MCP endpoint:

```text
https://deceiving-pummel-ajar.ngrok-free.dev/mcp
```

Keep the RAG server, Guardian server, and tunnel running while external MCP clients are connected.

## Browser Bridge Endpoint

In addition to the MCP endpoint, Guardian exposes a plain JSON preflight endpoint:

```text
POST /preflight
```

It uses the same bearer-token protection as `POST /mcp` and runs the same Guardian logic as `guardian_memory_preflight`. This endpoint exists so a future browser/Tampermonkey bridge can call Guardian directly without implementing the MCP protocol.

Example:

```bash
curl http://127.0.0.1:8790/preflight \
  -H "Authorization: Bearer $GUARDIAN_MCP_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_message": "Benjamin latest message here",
    "recent_context": "Optional compact recap",
    "force_full_retrieval": false
  }'
```

The response is the raw `GuardianReport` JSON. A browser bridge can use `proceed_recommendation` to decide whether to inject the report into the outgoing prompt or block the send entirely.

## Antigravity / Gemini MCP Config

Use `serverUrl` for the Guardian server:

```json
{
  "mcpServers": {
    "scarlett-guardian-mcp": {
      "serverUrl": "http://127.0.0.1:8790/mcp",
      "headers": {
        "Authorization": "Bearer ${GUARDIAN_MCP_BEARER_TOKEN}"
      }
    }
  }
}
```

This repo includes a workspace example at `.agents/mcp_config.json` and a standalone example at `examples/antigravity-mcp_config.json`.

For the ngrok route, change `serverUrl` to `https://deceiving-pummel-ajar.ngrok-free.dev/mcp` and keep the same authorization header.

## Smoke Test Expectations

Before using a Guardian report for prose, confirm:

- The client can initialize the Guardian MCP server and list `guardian_memory_preflight`.
- An unauthenticated `POST /mcp` returns `401` when `GUARDIAN_MCP_BEARER_TOKEN` is set.
- An authenticated `guardian_memory_preflight` call returns `tool_calls` with successful `index_status`, `retrieve_story_context`, and `search_story_memory` entries.
- `retrieval_status` is `success` or `partial`; `failed` means the caller should stop OOC and repair retrieval.

## Known Weak Point

The current MVP assumes the external MCP client/model passes Benjamin's latest message into `guardian_memory_preflight`. That is enough to validate the remote Guardian path, but it still relies on the generating model following the tool-use rule.

A future hardening step should capture the latest user-authored browser message outside the model loop. One practical option is a Tampermonkey/browser script adapted from the existing thread-export workflow: intercept or detect the last user-written message, call `POST /preflight`, then either inject the Guardian report into the outgoing prompt or block the send on `do_not_proceed`. A watched-folder bridge is another viable variant if direct browser-to-Guardian calls are awkward.

## Tool Contract

Input:

```json
{
  "user_message": "Benjamin's latest in-character message",
  "recent_context": "Optional compact recap",
  "force_full_retrieval": false
}
```

Output (GuardianReport) includes:

- `retrieval_status`: `success`, `partial`, or `failed`
- `confidence_score`: 0-100
- `proceed_recommendation`: `proceed`, `proceed_with_caution`, or `do_not_proceed`
- `current_state_summary`
- `critical_precedents`
- `emotional_tone_guidance`
- `things_to_avoid`
- `open_threads`
- `hard_flags`
- `retrieval_notes`
- `retrieval_plan` (includes the exact queries and detected triggers used)
- `tool_calls` (full trace of calls to the RAG MCP)

## Current Limitations

The current `rag-memory-mcp/src/server.ts` exposes `retrieve_story_context`, `search_story_memory`, `get_live_story_state`, and `index_status`.

Older planning docs mention `expand_context_around_chunk` and `verify_story_fact`, but those tools are not present in the current RAG source. This Guardian does not call them yet.

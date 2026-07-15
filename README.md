# Scarlett Guardian MCP

External Guardian MCP server for the Scarlett & Benjamin narrative memory system.

This server does not replace `rag-memory-mcp`. It wraps the existing RAG MCP with a stricter pre-prose enforcement layer and optional low-cost LLM synthesis. The Guardian exposes:
 
 - `guardian_memory_preflight`
 - `guardian_ooc_consult`
 
 The tool calls the sibling RAG MCP before any in-character Scarlett prose:
 
 1. `index_status` for diagnostics.
 2. `retrieve_story_context` for live-scene preflight.
 3. `search_story_memory` for deep corpus continuity.
 4. Optionally calls `expand_context_around_chunk` and `verify_story_fact`.
 5. Optionally calls a mini OpenAI model for structured Guardian synthesis when `GUARDIAN_LLM_ENABLED=true`. The LLM operates as a **silent database auditor** (strictly fact-focused, not prescribing tone or POV, and providing `continuity_facts_for_grok` instead of emotional guidance).
 6. **Dynamic Write-Back Integration:** Automatically appends any retrieved `candidate_memory_update` into the RAG repository's `project_source_files/current-state.md` and triggers the RAG local incremental reindexing script in the background.
 7. Returns a structured Guardian report with confidence, hard flags, precedents, expansions, fact checks, optional LLM assessment, and proceed recommendation.
 
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
GUARDIAN_LLM_ENABLED=false
OPENAI_API_KEY=
GUARDIAN_MODEL=gpt-5.6-terra
GUARDIAN_LLM_REASONING_EFFORT=low
GUARDIAN_LLM_VERBOSITY=medium
GUARDIAN_LLM_MAX_EVIDENCE_CHARS=32000
GUARDIAN_EXPAND_BUDGET_MS=10000
GUARDIAN_VERIFY_BUDGET_MS=10000
GUARDIAN_MEMORY_WRITE_MODE=stage
GUARDIAN_LLM_MAX_EVIDENCE_CHARS=12000
```

For the current no-password setup, leave `GUARDIAN_MCP_BEARER_TOKEN` blank. If it is blank, `POST /mcp` and `POST /preflight` do not require an `Authorization` header. If you later choose to set it, clients must send `Authorization: Bearer <token>`.

Leave `GUARDIAN_LLM_ENABLED=false` to avoid Guardian model calls and extra OpenAI cost. Set it to `true` only when you want the supporting Guardian model to synthesize retrieved evidence into `llm_assessment`.

## Eval harness (L1 hermetic)

Phase 1 safety rails — **zero network**, free, seconds. Master roadmap: `docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md`.

```bash
npm test                 # unit tests including eval schema/cassette/runner
npm run eval:fast        # L1 goldens under evals/golden/** (must stay green on code changes)
npm run eval:baseline -- --tag <name>   # snapshot pass/fail for regression diffs
npm run curate:golden -- docs/guardian-reports/preflight-full-<ts>.json --category continuous-scene
```

- WP-1.1–1.5 **done** (schema, curate, runner, 15 goldens + smoke, mutants, workflow contract in `AGENTS.md`).
- Baseline: `evals/baselines/after-wp-1.4.json`. Inventory: `evals/golden/MANIFEST-wp-1.4.md`.
- Scorecards: `evals/runs/` (gitignored). Next Phase 1 WPs: telemetry 1.6–1.7.

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
cloudflared tunnel --url http://localhost:8790
```

Use the generated `https://...trycloudflare.com` URL. The currently verified URL is:

```text
https://tar-referred-recorded-transition.trycloudflare.com
```

Remote health:

```bash
curl https://tar-referred-recorded-transition.trycloudflare.com/health
```

Remote MCP endpoint:

```text
https://tar-referred-recorded-transition.trycloudflare.com/mcp
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
      "serverUrl": "http://127.0.0.1:8790/mcp"
    }
  }
}
```

This repo includes a workspace example at `.agents/mcp_config.json` and a standalone example at `examples/antigravity-mcp_config.json`.

For the current public route, change `serverUrl` to `https://tar-referred-recorded-transition.trycloudflare.com/mcp`. Do not add an authorization header while `GUARDIAN_MCP_BEARER_TOKEN` is blank.

## Smoke Test Expectations

Before using a Guardian report for prose, confirm:

- The client can initialize the Guardian MCP server and list `guardian_memory_preflight` plus `guardian_ooc_consult`.
- A no-password `POST /mcp` or `POST /preflight` works when `GUARDIAN_MCP_BEARER_TOKEN` is blank.
- A `guardian_memory_preflight` call returns `tool_calls` with successful `index_status`, `retrieve_story_context`, and `search_story_memory` entries. High-risk or exact-fact turns may also include `expand_context_around_chunk` and `verify_story_fact`.
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
 - `expanded_contexts`
 - `fact_checks`
 - `llm_assessment` (present but disabled unless `GUARDIAN_LLM_ENABLED=true`):
   - `continuity_risk_level`: `low`, `medium`, `high`
   - `supported_facts`: string[]
   - `unsupported_or_risky_claims`: string[]
   - `scene_state_delta`: string
   - `continuity_facts_for_grok`: string (neutral continuity details)
   - `needs_more_retrieval`: boolean
   - `should_block_prose`: boolean
   - `candidate_memory_update`: string (appended back to current-state.md)
 - `emotional_tone_guidance` (heuristic fallback)
 - `things_to_avoid`
 - `open_threads`
 - `hard_flags`
 - `retrieval_notes`
 - `retrieval_plan` (includes the exact queries and detected triggers used)
 - `tool_calls` (full trace of calls to the RAG MCP)

## OOC Consult Tool

`guardian_ooc_consult` lets Grok ask Guardian a support question without requesting Scarlett prose.

Input:

```json
{
  "question": "What continuity risks are present in this proposed turn?",
  "latest_user_message": "Optional Benjamin message",
  "recent_context": "Optional compact context",
  "mode": "continuity_review",
  "force_full_retrieval": false
}
```

Modes:

- `continuity_review`
- `fact_check`
- `scene_planning`
- `memory_update_review`

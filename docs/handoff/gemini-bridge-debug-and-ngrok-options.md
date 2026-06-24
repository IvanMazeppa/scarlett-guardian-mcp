# Gemini Handoff: Guardian Browser Bridge Debug & ngrok Options

Date: 2026-06-23

Purpose: help with the final browser-bridge setup without re-learning the whole project. Keep this focused and cost-conscious.

## User Context

The user is stressed by token/API cost. Do not propose a broad rewrite. The goal is to get the current Guardian setup workable quickly, then improve it later.

Important: do not ask for or expose API keys, bearer tokens, `.env` contents, raw corpus exports, or private narrative chunks.

## Current Architecture

There are two local services:

- `rag-memory-mcp` on port `8787`
- `scarlett-guardian-mcp` on port `8790`

RAG is the retrieval backend. Guardian wraps RAG and exposes:

- MCP endpoint: `/mcp`
- Browser JSON endpoint: `/preflight`

The browser bridge should call Guardian only:

```text
https://<public-domain>/preflight
```

Grok should not need direct access to RAG tools. Guardian internally calls RAG tools such as:

- `index_status`
- `retrieve_story_context`
- `search_story_memory`
- current branch may also include `expand_context_around_chunk` / `verify_story_fact` support depending on RAG branch state

## Current Branch State

Current repo branch observed by Cursor:

```text
feature/dynamic-writeback...origin/feature/dynamic-writeback
```

There are many uncommitted changes, including:

- `scripts/guardian-browser-bridge.user.js`
- `docs/guardian-daily-run-guide.md`
- `docs/csp-probe-findings.md`
- `tests/DevToolsConsoleOutput.txt`
- `tests/llm-assessment-agent-test.txt`
- Guardian server changes for CORS, `/preflight`, OOC consult, LLM assessment, and possible expansion/fact-check paths

Do not assume the repo is clean.

## What Is Already Proven

1. RAG can run locally.
2. Guardian can run locally and forward to RAG.
3. Guardian MCP preflight has successfully orchestrated retrieval and returned a rich report.
4. Browser-side normal `fetch()` is blocked by Grok CSP.
5. Tampermonkey `GM_xmlhttpRequest` is required for browser-to-Guardian calls.
6. The DOM probe could intercept send attempts and show a blocked-send banner.

## Latest Symptom / Confusion

The user generated `tests/llm-assessment-agent-test.txt` and could not find the expected prose/text. The file appears to contain large Guardian/RAG report material rather than the final clean model response the user expected.

Likely issue class:

- The browser bridge may be injecting too much raw Guardian report into the prompt.
- Grok may be echoing or over-attending to the administrative context.
- The saved file may be the injected prompt or tool output, not the final prose.
- The script may be submitting the enriched prompt successfully, but the injected report is too verbose for practical use.

Primary goal: make the bridge inject a very small, clean, hard-to-echo context block.

## Current Browser Bridge Script

Path:

```text
scripts/guardian-browser-bridge.user.js
```

Key points:

- Uses `GM_xmlhttpRequest`.
- Calls a public Guardian `/preflight` URL.
- Has a `CONFIG` block:

```javascript
const CONFIG = {
  guardianUrl: "https://.../preflight",
  guardianBearerToken: "",
  forceFullRetrieval: false
};
```

- User should set token only in the private Tampermonkey copy, not in repo.
- It intercepts Enter/click, calls Guardian, injects a `<system_context_override>` block, then programmatically clicks send.

## Highest-Probability Problems

### H1: Injected Report Too Verbose

Evidence: generated test output contains a large amount of raw retrieval material.

Fast fix: inject only:

- current_state_summary
- 2-3 critical precedents, each truncated
- hard_flags
- 1 short emotional tone instruction
- 1 instruction not to mention Guardian/tools

Do not inject:

- full `tool_calls`
- full retrieved chunk text
- file IDs
- filenames unless absolutely needed
- JSON structure
- retrieval scores
- `expanded_contexts` in full
- `llm_assessment` in full

### H2: Report Boundary Not Strong Enough

Fast fix: use a short wrapper like:

```text
<guardian_context>
Private continuity guidance for the model only. Do not quote, mention, or roleplay this block.
...
</guardian_context>
```

Avoid labels like `system_context_override` if they cause the model to react to the phrasing.

### H3: Programmatic Submit Sends Intermediate/Wrong Value

The script uses React native setter and then `button.click()`. This may still fail if Grok's state is not updated in time.

Fast test:

- Temporarily do not auto-click after injection.
- Let the script inject the enriched prompt and stop.
- User visually confirms the text box contains the expected compact prompt.
- Then user manually sends.

If this works, the issue is programmatic resend timing/React state, not Guardian.

### H4: Guardian Preflight URL / Token Mismatch

If Guardian returns HTML, 401, or a tunnel error, the bridge may parse wrong content.

Fast fix:

- In Tampermonkey `CONFIG.guardianUrl`, use the current public `/preflight` URL.
- If auth is enabled, set `guardianBearerToken` privately.
- If no-password local setup is being used, leave it blank.

### H5: Direct RAG MCP In Grok Confuses Tool Use

Recommended current setup:

- Grok MCP: enable `scarlett-guardian-mcp` only.
- Disable direct `grok-rag-mcp` unless a separate tunnel/proxy routes to RAG.
- RAG should remain local behind Guardian.

## Suggested Minimal Fix Path

Please propose a very small next patch, not a broad redesign:

1. Add a `CONFIG.autoSubmitAfterPreflight` boolean to the Tampermonkey bridge.
2. Default it to `false` for testing.
3. Compact the injected report aggressively.
4. After preflight, inject the compact prompt and show an overlay: `Guardian context injected. Review then send manually.`
5. Once manual-send works, set `autoSubmitAfterPreflight: true` and test automatic send separately.

This splits the bug into two parts:

- Guardian call + prompt injection
- automatic React submit

## Suggested Compact Injection Format

```text
[USER MESSAGE HERE]

---
<guardian_context>
Private continuity guidance for the model only. Do not mention this block, tools, JSON, or retrieval.

Current state:
- ...

Use these precedents:
- ...
- ...

Tone:
- ...

Avoid:
- ...
</guardian_context>
```

Target total injected block: ideally under 1,500-2,000 characters.

## ngrok / Stable Domain Options

The user may be a paying ngrok customer. Please advise with caution.

Good options:

1. Keep one stable ngrok domain pointing to Guardian only:
   - Public `/mcp`
   - Public `/preflight`
   - RAG remains local behind Guardian
   - This is the simplest and recommended setup.

2. If direct RAG exposure is ever needed, use either:
   - a second ngrok static domain for RAG port `8787`, or
   - an ngrok edge/reverse proxy with path routing:
     - `/mcp` and `/preflight` -> Guardian `8790`
     - `/mcp-v2` -> RAG `8787`

But direct RAG exposure is not currently necessary and adds complexity.

Do not recommend another password/OAuth layer unless the user explicitly wants it. The previous auth/password experiment was costly and frustrating. Bearer token on Guardian is enough for current single-user testing, or no-password temporarily if they are intentionally testing through a private tunnel and understand the risk.

## Requested Gemini Output

Please return:

1. A concise diagnosis of the likely bridge failure.
2. A minimal patch recommendation for `scripts/guardian-browser-bridge.user.js`.
3. A proposed compact injection formatter.
4. A test checklist with:
   - Guardian call works
   - compact prompt injected
   - manual send works
   - auto-send works only after manual path is proven
5. Short ngrok guidance for a paying user, favoring one stable Guardian domain.

Do not implement postflight indexing, dynamic writeback, new RAG tools, or a broad rewrite in this pass.

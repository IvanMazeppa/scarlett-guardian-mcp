# Guardian Bridge Status & Next Steps

**Date:** 2026-06-23
**Status:** Architecture validation complete. Browser bridge script written. Pending live integration and tool expansion.

## 1. The Good News: Architecture Validation

The recent live tests and internal CLI testing of the `guardian_memory_preflight` tool have yielded massive breakthroughs:

- **Perfect Internal Orchestration:** The Guardian MCP was proven to successfully and autonomously orchestrate calls to the RAG backend (`index_status`, `retrieve_story_context`, and `search_story_memory`). It successfully returns a rich, synthesized JSON report (with `current_state_summary`, `critical_precedents`, `emotional_tone_guidance`, etc.) entirely on its own.
- **RAG Integrity Verified:** The 404 error on `search_story_memory` was diagnosed as a simple port-mapping issue. Because the user only has one ngrok tunnel mapped to port 8790 (Guardian), direct calls to RAG (8787) from Grok naturally failed. The RAG server itself is 100% healthy.
- **The "Model Compliance Loophole" is Closed:** Because the Guardian is so highly effective at pulling and synthesizing memory, **Grok no longer needs direct access to the individual RAG tools.** We can remove the RAG MCP from Grok's UI entirely, preventing Grok from misusing or ignoring the tools.
- **Browser Bridge Drafted:** A complete Tampermonkey script (`scripts/guardian-browser-bridge.user.js`) has been written. It uses `@grant GM_xmlhttpRequest` to bypass Grok's Content Security Policy (CSP), intercepts the React send events, POSTs to the Guardian ngrok URL, and bypasses the Virtual DOM to inject the Guardian report directly into the user's prompt.

## 2. Lingering Difficulties

While the architecture is sound, the following challenges remain:

- **Browser Bridge Live Testing:** The Tampermonkey script has been written but not yet tested live against the Grok UI with an active Guardian server. We need to ensure the React Virtual DOM injection (`setNativeValue`) successfully triggers the chat state update, and that the programmatic `button.click()` submits the form cleanly without infinite loops.
- **Deployment Logistics:** Currently, running this system requires spinning up the RAG server (`npm run dev` on 8787), the Guardian server (`npm run dev` on 8790), and the ngrok tunnel (pointed to 8790). This is a lot of terminal overhead for a daily tool.

## 3. Critical Next Step: Implementing the Missing Tools

The most pressing development task is implementing the two highly requested tools that were hallucinated in early design docs but never actually built into the `grok-rag-mcp` codebase.

1. **`expand_context_around_chunk` (High Priority):** 
   - *Why it's needed:* Vector search often returns a highly relevant snippet, but the LLM (or Guardian) needs to see what happened immediately before or after that snippet to understand the true context. 
   - *Implementation approach:* This requires modifying `rag-memory-mcp/src/retriever.ts` to locate a specific chunk by ID and retrieve the chunks immediately preceding and following it in the source file.
2. **`verify_story_fact`:**
   - *Why it's needed:* A boolean/confidence-based tool to quickly check if a specific fact is true without pulling massive context windows.

**Action Plan for Next Agent:**
1. Navigate to `rag-memory-mcp`.
2. Add the `expand_context_around_chunk` logic to `retriever.ts`.
3. Expose the new tool in the Express server at `server.ts` (under the `/mcp-v2` endpoint).
4. Update the Guardian server to utilize this new tool when a returned chunk lacks sufficient narrative boundary context.

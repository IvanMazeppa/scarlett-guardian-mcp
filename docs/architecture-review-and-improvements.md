# Guardian MCP: Architecture Review and Improvement Proposals

**Date:** 2026-06-22
**Context:** Review of the `scarlett-guardian-mcp` remote flow architecture and its integration with the generative model (Grok 4.3).

---

## 1. The Core Vulnerability: The Model Compliance Loophole

**The Problem:**
The current architecture still relies on Grok to explicitly invoke the `guardian_memory_preflight` tool on every turn. If the model decides it doesn't need to (e.g., it feels confident, or it prioritizes conversational momentum—the exact scenarios where continuity drift occurs), the Guardian is entirely bypassed. A compliance system cannot rely on the honor system of the entity it is meant to govern.

**The Proposed Solution: Out-of-Band (OOB) Preflight Injection**
Instead of asking the model to call a tool, we intercept the user's message at the browser/client level before the model even sees it.
- **Mechanism:** Utilize the planned Tampermonkey script to intercept the "Send" action in the web UI.
- **Flow:** 
  1. User clicks Send.
  2. The script pauses the submission and sends the user's message to the Guardian API.
  3. The Guardian performs its RAG lookups and returns the report to the script.
  4. The script invisibly appends the Guardian report to the user's prompt (e.g., wrapped in `<system_context> Guardian Report: ... </system_context>`).
  5. The script submits the combined prompt to Grok.
- **Benefit:** 100% compliance. Grok *never* has to make a tool call. The required context is guaranteed to be injected into the prompt for every single turn, eliminating the chance of skipped retrievals.

## 2. Architecture Redundancy: The Double Server Hop

**The Problem:**
Currently, `scarlett-guardian-mcp` makes HTTP MCP calls to `rag-memory-mcp`. This introduces network latency, serialization overhead, and multiplies points of failure (handling timeouts, managing dual bearer tokens, dual servers).

**The Proposed Solution: Native Module Integration**
Since both are local Node/TypeScript projects, the Guardian should ideally import the RAG retrieval logic natively as a library module, rather than treating it as an external HTTP server.
- **Flow:** The Guardian MCP server imports the vector store retrieval functions directly from the RAG project's `src`. 
- **Benefit:** Reduces system complexity. You only deploy and manage one server/ngrok tunnel. The Guardian executes RAG functions natively, saving critical milliseconds of latency and removing the need for HTTP timeout handling between the two layers.

## 3. The "Do Not Proceed" Enforcement Flaw

**The Problem:**
The Guardian instructions state: *"If `proceed_recommendation` is `do_not_proceed`, do not write Scarlett prose."* Large Language Models are notoriously bad at following negative constraints. Often, they will output an out-of-character apology and then proceed to write the prose anyway, breaking the immersion.

**The Proposed Solution: Hard Frontend Blocking**
If we move to the Tampermonkey Injection method (Solution #1), the script can parse the Guardian's response before Grok is even invoked. If the Guardian returns `do_not_proceed`, the Tampermonkey script can completely block the message from being sent to Grok. It can pop up a UI alert for you (e.g., *"Guardian blocked this turn: Missing critical RAG context"*), allowing you to manually fix the database or context without wasting a model inference turn.

## 4. State Stagnation: Closing the Memory Loop

**The Problem:**
The Guardian handles *retrieval* preflight excellently, but the system is currently read-only. If the RAG database relies on manual markdown indexing, the Guardian's accuracy degrades as the session progresses without manual updates.

**The Proposed Solution: Post-Flight Auto-Indexing**
Implement a `guardian_memory_postflight` phase. After Grok generates its response, the Tampermonkey script captures the final output and sends it back to the Guardian. The Guardian can then automatically append this new interaction to `event-log.md` and trigger an incremental index on the OpenAI Vector Store. This creates a fully autonomous, self-updating closed-loop memory system.

## 5. Context Window Bloat Optimization

**The Problem:**
The Guardian report schema includes static fields like "things to avoid" or "emotional tone guidance" for *every single turn*. Supplying this repeatedly can quickly bloat the context window and dilute the model's attention away from the immediate conversational nuances.

**The Proposed Solution: Delta Reporting**
The Guardian should be stateful. If the global constraints haven't changed since the last turn, the injected report should omit them or simply state: *"No changes to baseline constraints."* It should only inject *new*, specific RAG context that is highly relevant to the current user message.

## 6. Deployment Options: Ngrok vs. Stable Host

**The Problem:**
Currently, you are using ngrok to expose the Guardian MCP. Ngrok is excellent for short-term testing, but the free tier assigns a random URL every time it restarts, which requires updating the Tampermonkey script or Grok configuration constantly.

**The Solution: Cloudflare Tunnels (Local Stable Host)**
Since this is a single-user private workflow and the server runs locally on your machine, moving to a paid cloud VPS (like Render or Fly.io) is unnecessary and adds deployment overhead.
- **Recommendation:** Use **Cloudflare Tunnels** (`cloudflared`). I noticed you already have the `cloudflared.deb` package downloaded in the `rag-memory-mcp` root directory.
- **Benefits:** It provides a free, persistent, and secure HTTPS URL. It runs as a background daemon on your local machine and connects to your local Express port, completely eliminating the shifting URL problem while keeping all data local.
- **Security:** Ensure the Guardian's Bearer token middleware remains active, as the endpoint will be publicly resolvable.

## 7. Documentation Consistency Audit

**The Problem:**
Several RAG documents and project instructions contain stale references to tools that were planned but never implemented in the current source code.

**Findings:**
A workspace scan revealed that the tools `expand_context_around_chunk` and `verify_story_fact` are heavily referenced as available tools in the following key locations:
- `rag-memory-mcp/dist/docs/instructions/project-instructions-single-agent-v5.1.md`
- `rag-memory-mcp/dist/docs/instructions/Agents/single-scarlett-enforcer-v5.1-4k.md`
- `rag-memory-mcp/dist/docs/skills/scarlett-benjamin-rp-enforcer-autonomy-v1.6.SKILL.md`
- `scarlett-guardian-mcp/docs/prompt_for_gpt55_scarlett_guardian_mcp.md`

**Recommended Action:**
These stale references must be purged. Leaving them in the agent instructions causes the LLM to hallucinate tool calls that do not exist, which breaks the preflight workflow. Update the instructions to rely solely on the implemented `retrieve_story_context` and `search_story_memory` tools.

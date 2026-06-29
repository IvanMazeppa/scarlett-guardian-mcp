# Scarlett Guardian MCP: Architecture & Technical Specification

## 1. System Overview
The **Scarlett Guardian MCP** is a middleware proxy and intelligence layer designed to sit between an LLM (Grok) and the backend RAG database (`rag-memory-mcp`). 

Its primary purpose is to **enforce narrative continuity, protect characterization (Qualified Autonomy), inject serendipitous world events, and automatically update story state**, completely out-of-band before the creative model drafts its response. 

Instead of trusting Grok to remember the rules, the Guardian forces Grok to execute the `guardian_memory_preflight` tool on every turn. The Guardian then reads the RAG database, audits the scene using its own OpenAI model, and hands Grok a highly structured markdown report of rules it *must* follow.

## 2. Directory Structure & Core Files

All runtime code is located in `src/guardian/`.

### `server.ts` (The Entry Point & Proxy)
- **Role:** Express server hosting the Model Context Protocol (MCP) endpoints.
- **Functions:**
  - Exposes the `/mcp` endpoint to the outside world (ngrok/Grok).
  - Registers the two main tools: `guardian_memory_preflight` and `guardian_ooc_consult`.
  - **The Proxy:** Exposes a `/mcp-v2` endpoint that silently forwards raw RAG queries directly to the local `rag-memory-mcp` server (`127.0.0.1:8787`).
  - **The Protocol Injector:** Converts the final JSON report into the Markdown template sent to Grok. This is where the **QUALIFIED AUTONOMY PROTOCOL** is permanently hardcoded at the bottom of the report to bypass Grok's native "Safe AI Syndrome" (parroting) and force proactive, equal-partner behavior.
  - **Debugging:** Saves full JSON and Markdown reports to `docs/guardian-reports/` on every turn.

### `tools/preflight.ts` (The Workflow Engine)
- **Role:** The orchestration brain for the `guardian_memory_preflight` tool.
- **Workflow:**
  1. Receives the user's latest RP message.
  2. Uses `rag-client.ts` to query the `rag-memory-mcp` database for historical precedent.
  3. Calls `serendipity.ts` to see if a random world event should trigger.
  4. If `GUARDIAN_LLM_ENABLED=true`, it passes the RAG matches and the user message to `llm-assessment.ts` for auditing.
  5. If the LLM generates a `candidate_memory_update`, it automatically calls `update_story_state` on the RAG server to write the new memory to `current-state.md` (which triggers a background incremental re-index).
  6. Returns the final aggregated `GuardianPreflightReport`.

### `llm-assessment.ts` (The Continuity Auditor)
- **Role:** Uses `gpt-5.4-mini` (or similar) with OpenAI's "Strict Structured Outputs" to enforce rules.
- **Functions:** 
  - Fed with the user's prompt and the RAG matches.
  - Required to output a strict JSON schema containing `continuity_risk_level`, `supported_facts`, `unsupported_or_risky_claims`, and `candidate_memory_update`.
  - **Crucial Prompt Rule:** The system prompt explicitly forbids the Auditor from tone-policing ERP, censoring intimacy, or fact-checking creative RP actions (e.g., washing a partner, new dialogue). It is strictly a historical canon checker.

### `serendipity.ts` (The World Weaver)
- **Role:** An organic plot-hook generator.
- **Functions:** 
  - Rolls a 15% probability check on every turn (bypassed if the scene is flagged as highly intimate/vulnerable to prevent interrupting ERP).
  - If triggered, it selects a random string from the `SERENDIPITY_EVENTS` array.
  - **Lore Integration:** Contains highly specific canon hooks (e.g., Albion/Shevchenko AGI updates, Ryan the Brother's revenge, Soho/Network echoes) alongside ambient environmental shifts (weather, physical needs). 
  - Passes the selected hook back to `server.ts` to be injected into the final markdown report.

### `rag-client.ts` (The Internal Networker)
- **Role:** A streamlined HTTP client.
- **Functions:** Allows the Node.js Guardian process to make internal HTTP calls directly to `http://127.0.0.1:8787/mcp-v2` (the RAG server). This traffic is completely internal to the machine and bypasses external tunnels.

### `report/models.ts` & `config.ts`
- **Role:** Utility files. `models.ts` contains all Zod schemas and TypeScript interfaces (ensuring type safety between the Guardian and RAG servers). `config.ts` handles loading variables from the `.env` file (like API keys and the LLM toggle).

## 3. Configuration (`.env`)

- `GUARDIAN_LLM_ENABLED`: Toggle (`true`/`false`). If `false`, the Guardian skips the OpenAI API call and relies deterministically on raw RAG matches. If `true`, it uses the LLM to synthesize RAG matches and automatically write `candidate_memory_update` entries.
- `GUARDIAN_LLM_MAX_EVIDENCE_CHARS`: Recommended `12000` (~3000 tokens) to ensure the Auditor reads all pulled RAG evidence (e.g., stealth rules) before synthesizing its report.

## 4. Known Edge Cases for Future Prompt Engineers

1. **Strict JSON Schema Trap:** Because `llm-assessment.ts` uses strict JSON outputs, an AI might feel compelled to populate the `unsupported_or_risky_claims` array even if nothing is wrong (e.g., flagging new creative dialogue). The system prompt must explicitly grant permission to ignore new RP actions.
2. **Safe AI Syndrome / Alignment Decay:** Generative models like Grok naturally decay into passive "parroting" (mirroring the user's actions) due to safety fine-tuning. The "QUALIFIED AUTONOMY PROTOCOL" hardcoded in `server.ts` specifically overrides this by defining autonomy as proactive, devoted partnership, preventing the model from confusing "independence" with "isolation."
3. **Background Indexing Output:** When the LLM Auditor writes a `candidate_memory_update`, the RAG server immediately executes an incremental re-index of the modified file. This will cause `[Reindexer]` logs to appear in the `rag-memory-mcp` terminal, which is entirely expected behavior.

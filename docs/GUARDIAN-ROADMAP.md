# Guardian Architecture - Master Future Roadmap & Work Order

This document tracks planned improvements and architectural shifts to make the Guardian MCP wrapper and the Grok single-agent setup completely bulletproof. It is a unified combination of all past and current roadmap ideas.

### High-Priority / Immediate Quality of Life
- **Full-Duplex Dialogue Auditing:** Currently, the Guardian only reads `user_message` (Benjamin's half of the conversation), meaning it cannot detect if Grok made a continuity error, drifted into a trope, or became too passive. 
  - *Implementation:* The `PreflightInputSchema` has already been updated to accept `scarlett_previous_message`. Next step is to instruct the Guardian's LLM prompt to actively critique Grok's previous turn and inject hard corrections into the next report (e.g., *"CRITICAL CORRECTION: In your last message, you hallucinated a location."*).
- **Standardized Narrative Timestamps & 2-Year Timeline Anchor:** Map out the major chronological anchors of the ~2-year story (e.g., initial meeting, past arcs, current trip). Write a utility script to retroactively prepend strict narrative timestamps (e.g., `[Narrative Date: October 26, 2026 - Evening]`) to the top of every chunk in the `project_source_files`. This massively improves OpenAI's semantic search accuracy.
- [ ] **Dynamic Tool Masking (If Supported):** Modify the MCP server configuration so that the raw RAG tools (`retrieve_story_context`, `search_story_memory`, etc.) are *hidden* from Grok entirely. Grok should only see `guardian_memory_preflight` and `guardian_ooc_consult` to prevent the model from ignoring the Guardian and triggering a tool-loop with raw searches.

### Medium-Priority / System Enhancements
- **Web Search Augmentation (Solving Tool Laziness):** Grok suffers from "Tool Laziness" and will hallucinate obscure facts to save compute instead of using web search. 
  - *Implementation:* Give the Guardian a real-time web search tool (e.g., Tavily, DuckDuckGo API). If the LLM Auditor detects an obscure real-world entity not in the RAG DB, the Guardian searches the web *before* Grok wakes up and appends a `**Real-World Context:**` block to the final Markdown report.
- [ ] **Cost-Efficient Auto-Writeback:** Investigate offloading the Guardian's background summarization engine to a cheaper, dedicated local model (like Llama 3 8B) or a lower-tier API, so the canon auto-updates without eating into the premium token budget.
- [ ] **Preflight Payload Pruning:** Implement a token-trimmer in the Guardian's `expanded_contexts` return logic. If a pulled chunk is 1000 characters but only 200 relate to the matched keyword, trim the excess to ensure the payload given to Grok always stays strictly below the 5kb "sweet spot".

### Long-Term / "Perfect System" Goals
- [ ] **Automated Emotion Tracking:** Implement a lightweight sentiment analyzer in the Guardian that reads Grok's final response and updates a hidden `current_emotional_state` variable in the server memory. This ensures the next preflight instantly knows if the mood shifted without relying on Grok to remember the shift.
- [ ] **Automated Scene Delimiters:** Build logic into the Guardian that automatically detects when a scene has naturally concluded (e.g., "We fall asleep", "The next morning..."), triggering a canonical commit to the vector DB before the next scene starts.
- [ ] **Automated Continuity Auditor:** Implement a system where the Guardian server validates the generated prose for drops in autonomy, unearned trauma loops, or mind-reading. If detected, Guardian could either flag it for the user or automatically trigger a rejection prompt to Grok before the user even sees it.

### Massive Architectural Leaps (Bypassing Grok's Limits)
- **Out-Of-Band Preflight Automation (Tampermonkey):** To solve the "Model Compliance Loophole" where Grok forgets to use tools due to conversational momentum:
  - *Implementation:* Build a Tampermonkey/Greasemonkey userscript for the Grok web interface. The script intercepts the "Send" button, silently calls the local Guardian server, and invisibly injects the Markdown report into the prompt *before* it is sent to Grok.
- **The Guardian Web UI / Control Panel:** Build a lightweight local web dashboard for the Guardian server to toggle `GUARDIAN_LLM_ENABLED` on/off, adjust verbosity, tweak the confidence threshold, and select different modes (e.g., "High Serendipity Mode") on the fly.
- **The Serendipity Engine (Life Weaver Integration):** *(Note: Partially implemented!)* Program the Guardian MCP to randomly generate subtle "Life Events" (weather changes, room-service knocks, notifications) and append them as a `**World Event to Navigate:**` field. Crucially, this triggers per-scene or is suppressed during high-intimacy/ERP states.
- **High-Reasoning Arc Weaver (Serendipity 2.0):** Instead of standard LLM random noise, route the Serendipity Engine through a high-reasoning/Chain-of-Thought model (like OpenAI o1 or GPT-5.5-Pro). Once every 10-20 turns, this model spends 60+ seconds actively *thinking*, analyzing the entire 2-year RAG database, and deducing brilliant, personalized plot twists that seamlessly weave long-forgotten threads into the current scene to dynamically test Scarlett's Qualified Autonomy.

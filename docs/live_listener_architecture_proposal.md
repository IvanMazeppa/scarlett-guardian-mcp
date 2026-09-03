# Architectural Proposal: The "Live Listener" Multi-Agent Subsystem

## 1. System Context & Objective
The Fable-5 roleplay simulation currently operates on a reactive, single-agent paradigm. The primary creative model (Grok) writes the prose, while a Node.js middleware server (`scarlett-guardian-mcp`) intercepts the user's prompt to inject narrative constraints via a secondary Vector Store server (`rag-memory-mcp`). 

**The Objective:** To transition from a reactive proxy to a proactive, **Multi-Agent "Writers' Room"** by introducing a background daemon known as the **Live Listener**. This secondary agent will asynchronously monitor the chat, extract entities (NPCs, locations, deep lore), query the RAG database, and cache summarized dossiers *before* the user even begins their next turn.

## 2. The Core Benefits
* **Zero-Latency Context:** Currently, querying RAG databases during the user's `preflight` submission introduces a 5–15 second blocking delay, risking timeouts. By shifting this workload to an asynchronous background agent, the data is pre-fetched and cached. The user's "Send" action experiences zero added latency.
* **Eradication of Lore Hallucination:** Grok will no longer guess or invent backstories for obscure characters. If an NPC from two years ago is mentioned, their exact historical dossier is seamlessly injected into the prompt.
* **Decoupling Logic from Creativity:** It frees Grok from the burden of trying to remember the database, allowing it to focus 100% of its context window on prose quality and emotional intelligence.

## 3. Logistics of Implementation (The Architecture)

### A. The Event Trigger (`/duplex-cache` Hook)
The Live Listener must operate in the shadow of the user's typing time. The system will hook into the existing `/duplex-cache` endpoint. The exact millisecond Grok finishes generating Scarlett's response and renders it to the screen, the Tampermonkey script pings the Guardian. This ping wakes the Live Listener daemon.

### B. The Background Researcher Agent
The Guardian server will initialize an asynchronous worker utilizing a fast, high-efficiency model (e.g., `gpt-4o-mini`). 
1. **Named Entity Recognition (NER):** The Researcher reads the last 2-3 conversational turns. It is prompted specifically to identify proper nouns, returning a JSON array of entities (e.g., `["Sarah", "St Moritz Chalet", "Vaxholm"]`).
2. **Confidence Scoring:** To prevent hallucinated database hits (e.g., looking up a random waiter named "John"), the Researcher assigns a confidence score to each entity based on narrative relevance.

### C. The RAG Interfacing & Summarization
For high-confidence entities, the Researcher agent triggers the `rag-memory-mcp` tools. It pulls the raw markdown files for those entities. 
**Crucial Step:** It does not dump the raw RAG output into the cache. To prevent context dilution for Grok, the Researcher parses the raw data and compiles a dense, 3-bullet-point summary (e.g., *"Sarah: Benjamin's ex-assistant; left in 2024; amicable relationship"*).

### D. The "Active Roster" Cache
The summarized dossiers are written to a volatile Node.js memory layer (an in-memory `Map` or a lightweight `active_roster.json`). 

### E. The Preflight Injection
When the user finally clicks "Send", the `/preflight` endpoint intercepts the payload. Instead of doing heavy RAG lifting, it simply performs an O(1) lookup on the Active Roster Cache, appends the active dossiers to the system prompt, flushes the cache, and forwards the payload to Grok.

## 4. Multi-Agent Flexibility (Future Scaling)
Building this infrastructure unlocks massive potential for a true Multi-Agent ecosystem:
* **The NPC Actor:** If the Researcher agent detects that a specific NPC is actively participating in the scene, the architecture can easily be expanded to spin up a third, specialized "NPC Agent." This agent could draft the NPC's dialogue and pass it to Grok as a strict constraint, allowing Grok to seamlessly manage scenes with 3 or 4 independent characters acting simultaneously.
* **The Environment Director:** A separate agent could monitor the time-of-day and weather (tracking the rain and fire in Soglio, for example) and inject atmospheric prompts so the main model never hallucinates a sunny afternoon in the middle of a midnight storm.

---
**Directive for the Frontier Model (Fable 5):** 
*Please review this architectural proposal. Acting as the Principal Software Architect, generate a bulletproof, step-by-step implementation plan (including necessary Node.js class structures, async loop concepts, and API integration points) that can be handed to our junior coding agent (Grok) for flawless execution.*

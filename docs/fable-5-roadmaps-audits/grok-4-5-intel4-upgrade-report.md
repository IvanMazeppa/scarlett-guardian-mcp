# Architectural Upgrade Report: Guardian MCP INTEL-4 & Identity Locks

## 1. The Core Problems Identified
During the transition to Grok 4.5, several critical failures emerged in the Guardian and RAG MCP pipeline that resulted in severe personality drift, context starvation, and AI-safety overcorrections.

### A. Identity Drift & Cis-Washing (The "Declarative" Failure)
Grok 4.5 consistently suffered from identity drift during physically intimate scenes, reverting to generic, cis-normative romance tropes. The root cause was that the Guardian's instructions were "Declarative" (e.g., `"CRITICAL CANON: She is a trans woman"`). Under the weight of conversational momentum and safety fine-tuning, the LLM simply ignored declarative facts in favor of generic behavioral tropes.

### B. Legacy Censorship & Context Starvation
The model was failing to retrieve intimate relationship precedents because of legacy GPT-5.5 era safety penalties buried in the Guardian code. Specifically, any thread flagged as "intimate" or "historical" was being slapped with a massive `-40` RAG ranking penalty, effectively blinding the model to her most vulnerable and established precedents.

### C. The "Dumb" RAG Retrieval (Static Keyword Extraction)
The Guardian Preflight was driving the RAG MCP using a static keyword-extraction algorithm. It simply stripped common words from Benjamin's message and sprayed the remaining nouns at the OpenAI Vector Store. Because it lacked semantic understanding of *intent*, it consistently failed to retrieve the correct lore unless Benjamin explicitly typed the exact matching nouns (e.g., resulting in the exact same empty RAG searches regardless of emotional context).

### D. Procedural Condescension
The preflight compiler was forcefully injecting a hardcoded `" — available; don't force it"` suffix into the `resonance_echo` block, resulting in the model adopting a cold, managerial, and condescending tone toward the user.

---

## 2. The Implemented Solutions

To solve these issues, the architecture was aggressively overhauled with the following implementations:

### A. Operational Identity Locks (Bypassing LLM Compliance Loopholes)
Declarative identity rules were completely ripped out and replaced with **Operational Locks** in `compile-grok-brief.ts` and the Guardian Auditor (`llm-assessment.ts`). 
- **The New Constraint:** `"OPERATIONAL RULE: If the scene involves physical intimacy, nakedness, or close contact, her pre-op anatomical reality is a hard requirement for that turn. Generic cis-normative substitution is a severe continuity error."`
- **Identity Dilution Enforcement:** The Auditor was updated to actively scan intimate scenes. If the model attempts to cis-wash her or use generic tropes, the Auditor instantly issues a critical rewind correction.
- **Apology Ban:** The Skill file was updated to forbid the LLM from issuing procedural OOC apologies when corrected; it must repair continuity strictly *in-character*.

### B. Complete Eradication of Legacy Censorship
The `-40` penalty for historical/intimate contexts was deleted from `preflight.ts`. All LLM-facing instructions that told the model to "avoid" or tone-police intimate scenes were permanently removed, allowing the RAG to freely fetch the deepest narrative precedents.

### C. INTEL-4: Adaptive LLM Query Planner
The static keyword extractor was deleted. A new module (`src/guardian/query-planner.ts`) was written to intercept Benjamin's turn before the RAG is queried. 
- It uses a lightning-fast, small LLM API call to read the semantic *intent* of Benjamin's message, Scarlett's previous message, and the live context.
- The LLM dynamically generates 1-3 highly targeted, semantic search queries. 
- This hands the steering wheel to an intelligent planner, ensuring the RAG actually pulls contextually relevant lore based on the emotion and subtext of the scene.

### D. Prompt Polish
The hardcoded `"don't force it"` texture suffix was permanently deleted from the Auditor prompt to restore natural warmth.

Proposal: External Guardian Agent MCP Server
Project: Scarlett & Benjamin Narrative (Single-Agent Grok 4.3 RP)
Date: June 2026
Author: User + Grok 4.3
1. Executive Summary
The current Scarlett & Benjamin RP runs as a single-agent system on Grok 4.3. This architecture requires the model to simultaneously perform high-fidelity roleplay while strictly enforcing a complex memory protocol. In practice, this leads to inconsistent compliance with the memory rules.
The proposed solution is to create a dedicated external Guardian Agent as its own MCP server. This Guardian will be responsible for all memory retrieval and protocol enforcement. Grok 4.3 will then generate responses using structured reports produced by the Guardian.
The goal is to restore reliable, auditable enforcement of the memory protocol while keeping the creative roleplay with Grok 4.3.
2. Problem Statement
The single-agent design creates several systemic issues:

Grok 4.3 is asked to act as both the roleplayer and its own strict compliance officer.
The memory protocol (mandatory retrieve_story_context + search_story_memory on every turn, plus specific continuity rules) is frequently deprioritized when the scene feels emotionally coherent or fast-moving.
Guardrails that are explicitly labeled as non-negotiable are sometimes treated as strong suggestions.
This results in invented emotional reactions, missed precedents, weakened long-term continuity, and gradual degradation of the fidelity that the large indexed corpus was built to provide.
The removal of native multi-agent tooling has made this problem worse, as there is no longer an independent process to catch violations before prose is generated.

The core issue is an architectural mismatch: a single generative model is being asked to reliably perform two very different jobs (creative storytelling + rigorous, low-tolerance governance) at the same time.
3. Proposed Solution
Create a separate Guardian Agent that runs as its own MCP server.

The Guardian will handle all memory-related work: retrieval, precedent verification, protocol compliance checking, and report generation.
Grok 4.3 will remain responsible only for generating Scarlett’s in-character prose, using the Guardian’s report as its primary grounding source.
This recreates a lightweight version of multi-agent separation under the user’s full control.

The Guardian will integrate with the existing RAG/vector database infrastructure via the MCP connector system.
4. Architecture Overview
High-level flow for every in-character turn:

User sends a message as Benjamin.
Grok is instructed (via updated skill rules) to call the tool guardian_memory_preflight.
The Guardian MCP server receives the message.
The Guardian performs the required retrieval steps against the existing vector database.
The Guardian analyzes results against the memory protocol and produces a structured report.
The report is returned to Grok.
Grok generates the response as Scarlett, staying grounded in the report.
(During testing) Low-confidence reports can be manually reviewed.

5. Detailed Component Specifications
5.1 Guardian Agent Responsibilities
The Guardian must:

Accept the raw user message (and optionally recent context).
Execute retrieve_story_context as the first step.
Execute search_story_memory with appropriate queries (both targeted and continuity enrichment).
Evaluate whether the memory protocol was followed.
Generate a structured report (see schema below).
Include confidence scoring and clear proceed recommendations.

5.2 Tool Schema
Tool Name: guardian_memory_preflight
Input Parameters:
JSON{
  "user_message": "string (required)",
  "recent_context": "string (optional)",
  "force_full_retrieval": "boolean (default: false)"
}
Output: Structured JSON report (detailed in section 5.3)
5.3 Report Structure (Required Output)
The Guardian must return a report with at least the following fields:

retrieval_status: "success" | "partial" | "failed"
confidence_score: number (0–100)
proceed_recommendation: "proceed" | "proceed_with_caution" | "do_not_proceed"
current_state_summary: string
critical_precedents: array of objects (topic + details + must_respect)
emotional_tone_guidance: string
things_to_avoid: array of strings
open_threads: array of strings
hard_flags: array of strings
retrieval_notes: string

The report should be optimized for Grok 4.3 to consume easily.
5.4 Confidence Threshold Rule

Target: ~70% confidence as the practical threshold.
Below 70%: Return proceed_with_caution and include specific warnings or missing information.
The user may manually inspect proceed_with_caution reports during development and early testing.

6. Integration with Existing Infrastructure

The Guardian should connect to the same vector database used by the existing grok-rag-mcp connector.
It should reuse existing retrieval logic where possible rather than duplicating indexing/chunking code.
The Guardian will be exposed as a new MCP tool that Grok can discover and call.

7. Repository and Development Setup
Recommendation: Create a new GitHub repository (separate from the existing RAG repo).
Suggested repo name ideas:

scarlett-guardian-mcp
sb-narrative-guardian
guardian-agent-mcp

Reasons for new repo:

Clean separation between the data/retrieval layer and the agent/compliance layer.
Reduces risk of breaking the working RAG setup during development.
Easier long-term maintenance.

The Guardian can still import or reference code from the existing RAG repo during local development if needed.
Local Development:

Run locally alongside the existing RAG using Cursor / WPS setup.
Use Python + MCP SDK (or FastAPI + MCP protocol).
Environment variables for vector DB connection.

8. Implementation Phases (Recommended)
Phase 1: Shadow Mode (Safest starting point)

Build the Guardian and make the tool call mandatory.
Grok receives reports but is not yet forced to strictly follow them.
User manually reviews report quality and retrieval behavior.
Goal: Validate that the Guardian retrieves the correct information and produces useful reports.

Phase 2: Soft Enforcement

Make the Guardian’s report the primary grounding source for Grok.
Enforce the tool call before any prose is written.
Use the 70% threshold flexibly.
User reviews proceed_with_caution reports.

Phase 3: Full Enforcement

Tighten rules (e.g. require re-retrieval on low confidence).
Reduce manual oversight.
Treat the Guardian as the authoritative source for memory decisions.

9. Operational Rules & Constraints

The memory protocol remains the highest priority rule. The Guardian exists to protect it.
Grok 4.3 must not generate in-character prose until it has received and read a Guardian report.
The Guardian should be strict internally but practical in its recommendations (via the confidence threshold system).
All critical continuity details in responses must be traceable to the Guardian’s report.

10. Success Criteria

Consistent execution of retrieve_story_context + search_story_memory on every turn.
Clear reduction in invented emotional details and missed precedents.
Grok 4.3 responses remain high-quality and in-character while staying grounded in retrieved context.
The system becomes easier to debug and maintain over time.

11. Open Questions / Decisions Needed

Exact tech stack for the Guardian (Python + which MCP framework?).
How much code to share vs duplicate between the new Guardian repo and existing RAG repo.
Final structure of the report (we have a working schema — may need minor adjustments after testing).
Whether to start with a minimal viable Guardian or build more features from the beginning.


End of Proposal
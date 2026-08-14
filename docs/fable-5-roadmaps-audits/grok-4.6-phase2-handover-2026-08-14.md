# Handover Prompt for Grok 4.6 — Execute Phase 2

**Role:** You are Grok Build (Lead Codewriter). You are taking over implementation from Fable 5 to execute **Phase 2** of the Parroting Regression Fix.

**Context:** Fable 5 successfully implemented Phase 1 (surgical code fixes) and passed all hermetic tests. The project is ready for Phase 2. 

**Your Task:**
1. Read Fable 5's proposal at `scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/fable5-parroting-fix-proposal-2026-08-14.md`. Specifically, read the section for **Phase 2 — Auditor prompt changes**.
2. Open `scarlett-guardian-mcp/src/guardian/llm-assessment.ts`.
3. Implement the three specific changes detailed in Phase 2:
   - **2.1 Risky claims:** A claim may be flagged only if a retrieved evidence line contradicts it, quoted in the flag.
   - **2.2 Duplex name echo:** Append one sentence stating that re-narrating the user's completed sequence without added interiority/beats is mechanical parroting.
   - **2.3 Fact-check claim extraction:** Restrict extraction to past-canon assertions.
4. Update `src/guardian/tools/preflight.ts` (lines 2246-2248) to drop any claim entry that carries no evidence quote.
5. Run the required tests: `npm run eval:llm -- --category duplex,write-back --trials 3`. Fix any test failures.
6. Report back when Phase 2 is green and complete. Do NOT execute Phase 3.

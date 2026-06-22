# Gemini Delegation Queue

Use this only for supplemental research/review. Coding ownership stays with the main Cursor agent unless explicitly reassigned.

## Rules For Delegated Work

- Do not edit repository files unless explicitly asked.
- Do not handle `.env`, API keys, bearer tokens, raw exports, private corpus chunks, or browser session secrets.
- Return findings as concise Markdown with concrete recommendations and tradeoffs.
- Treat `rag-memory-mcp` as the live RAG service and `scarlett-guardian-mcp` as the Guardian wrapper.
- Prefer implementation notes, selectors, pseudocode, test cases, and risk analysis over direct code changes.

## Good Gemini Tasks

### 1. Browser Bridge Design [COMPLETED]

*Note: Completed by Gemini. See `browser-bridge-design.md` for the full architecture, flow, DOM checklist, and tradeoffs.*

Goal: design the Tampermonkey/browser bridge that captures the latest user-authored message before model submission and calls Guardian `POST /preflight`.

Expected output:

- Proposed browser-side flow.
- DOM/selector discovery checklist.
- Failure modes and fallbacks.
- Whether direct fetch to ngrok is enough or whether a watched-folder bridge is safer.
- How to block send on `proceed_recommendation: "do_not_proceed"`.

### 2. Prompt Injection Format Review [COMPLETED]

*Note: Completed by Gemini. See `prompt-injection-format.md` for the wrapper design and safe wording strategies.*

Goal: evaluate how the Guardian report should be injected if browser-side injection is used.

Expected output:

- Recommended wrapper format.
- Minimal report fields to inject.
- Risks of injecting as user-channel text.
- Safer wording to reduce the chance that the model ignores or roleplays around the report.

### 3. Postflight Capture Risk Review [COMPLETED]

*Note: Completed by Gemini. See `postflight-capture-review.md` for the staging queue design and promotion criteria.*

Goal: review Gemini's proposed `guardian_memory_postflight` idea without implementing auto-indexing yet.

Expected output:

- Safe staged design for capturing generated output.
- Why direct auto-indexing is risky.
- Suggested review queue format such as `pending-event-log.md` or JSONL.
- Criteria for promoting captured text into canonical memory.

### 4. Deployment Options [COMPLETED]

*Note: Completed by Gemini. See Section 6 of `architecture-review-and-improvements.md`.*

Goal: compare continuing with ngrok versus moving Guardian to a stable host.

Expected output:

- Minimal viable deployment options.
- Security requirements for each option.
- Cost/maintenance tradeoffs.
- Recommended next step for a single-user private workflow.

### 5. Documentation Consistency Audit [COMPLETED]

*Note: Completed by Gemini. See Section 7 of `architecture-review-and-improvements.md`.*

Goal: find stale references in Guardian handoff docs and nearby RAG docs.

Expected output:

- File paths with stale or contradictory claims.
- Especially flag references to unavailable RAG tools such as `expand_context_around_chunk` or `verify_story_fact`.
- Suggested wording updates.

## Not Currently Delegated

- Editing `src/guardian/server.ts`, `src/guardian/rag-client.ts`, or preflight scoring logic.
- Changing RAG indexing or source corpus layout.
- Writing the final Tampermonkey script without first confirming target browser UI selectors.
- Implementing postflight auto-indexing.
- Pushing branches or making commits.

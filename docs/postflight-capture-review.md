# Postflight Capture Risk Review

**Task**: Review the proposed `guardian_memory_postflight` architecture, outline the risks of direct auto-indexing, and design a safe staging queue.

## 1. Safe Staged Design for Capturing Generated Output
To close the memory loop without corrupting the canonical database, the capture process must be entirely decoupled from the indexing process.

**The Staged Flow:**
1. **Observation**: The Tampermonkey script uses a `MutationObserver` to watch the chat DOM. It waits until Grok's streaming response is complete (e.g., when the "Stop generating" button disappears).
2. **Capture**: The script extracts Benjamin's prompt and Scarlett's final response.
3. **Postflight Request**: The script sends an asynchronous `POST /postflight` to the Guardian containing the interaction pair.
4. **Staging**: The Guardian does **not** touch `event-log.md` or the OpenAI API. It simply appends the raw exchange (or an auto-generated summary of it) to a staging file.

## 2. Why Direct Auto-Indexing is Risky
Directly indexing Grok's output into the RAG Vector Store is highly dangerous for the integrity of the roleplay:
- **Hallucinations Become Canon**: If Grok hallucinates a detail or ignores the preflight context (e.g., getting Scarlett's timeline wrong), auto-indexing makes that mistake permanent. The RAG will retrieve the hallucinated fact on the *next* turn, creating an irreversible feedback loop of corrupted memory.
- **Context Bloat / Low-Signal Noise**: Not every interaction is a narrative milestone. Auto-indexing casual back-and-forth dialogue fills the vector store with low-signal noise, which crowds out high-priority facts during retrieval.
- **Irreversible Vector Pollution**: Editing a local Markdown file is easy. But removing a corrupted text chunk from an active OpenAI Vector Store requires tracking specific `file_id`s, issuing delete commands via the API, and re-indexing the corrected file. 

## 3. Suggested Review Queue Format
Instead of modifying `event-log.md`, the Guardian should write to a dedicated review file. 
While JSONL is great for machines, a human-readable Markdown file is better since you need to review the prose manually. 

I recommend **`pending-narrative-review.md`**.

**Example Format:**
```markdown
## Interaction: 2026-10-10T14:30:00
**Status**: [PENDING]

**Benjamin**: "Did you look at the new aero package designs I left on the table?"
**Scarlett**: "I did, älskling. The carbon weave is beautiful..."

**Guardian Auto-Summary**: Benjamin showed Scarlett the v4 aero designs; Scarlett approved of the carbon weave.
```
*(The Guardian could optionally use a lightweight, cheap local model call just to generate the `Auto-Summary` field before writing it to the file).*

## 4. Criteria for Promoting Captured Text into Canonical Memory
You (the user/director) should periodically review `pending-narrative-review.md`. Before you cut/paste an interaction or summary into the canonical `event-log.md` and run the indexer, it must pass these checks:
1. **Factually Accurate**: It perfectly aligns with `story-bible.md` and `master-context.md`.
2. **High Narrative Value**: It contains an emotional milestone, a plot development, a lore reveal, or a location change. Casual domestic filler should be deleted from the queue.
3. **Purity**: The text contains zero Out-Of-Character (OOC) bleed, AI apologies, or formatting glitches.

Once the selected summaries are moved to `event-log.md` and the staging file is cleared, you can manually run `npm run index` with confidence.

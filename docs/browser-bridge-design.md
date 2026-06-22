# Browser Bridge Design: Tampermonkey Interceptor

**Task**: Design the Tampermonkey/browser bridge to capture the user-authored message before model submission and call the Guardian.

## 1. Proposed Browser-Side Flow
1. **User Action**: The user types a message to Scarlett and presses "Send" (or hits Enter).
2. **Interception**: The Tampermonkey script intercepts the event (via `addEventListener` on the submit button or Enter key) and calls `preventDefault()`.
3. **Capture**: The script extracts the text from the `textarea`.
4. **Preflight Request**: The script makes an asynchronous `fetch()` POST request to the Guardian endpoint (via ngrok) containing the message payload.
5. **Guardian Processing**: The script displays a non-intrusive loading state (e.g., changing the Send button text to "Preflight...").
6. **Decision**:
   - **If `do_not_proceed`**: The script halts. It displays a UI alert detailing the missing context. The message is NOT sent to Grok.
   - **If `proceed` / `proceed_with_caution`**: The script formats the Guardian report and appends it to the user's message (e.g., wrapped in `<system_context>` tags).
7. **Submission**: The script updates the React `textarea` state with the enriched prompt and programmatically triggers the native send action.
8. **Cleanup**: After submission, the script ensures the injected text is cleared from the UI so the chat history looks clean.

## 2. DOM / Selector Discovery Checklist
Before writing the final Tampermonkey script, we must discover the exact stable DOM elements in the Grok UI:
- [ ] **Text Input Box**: What is the stable CSS selector? (e.g., `textarea[placeholder="Ask Grok..."]`).
- [ ] **Send Button**: How is it structured? (e.g., `button[aria-label="Send"]`).
- [ ] **Event Binding**: Does Grok use a `<form>` element we can hijack via `onsubmit`, or does it rely entirely on React `onKeyDown` (Enter) and `onClick` (Button)?
- [ ] **Chat Container**: Where can we safely inject custom UI (like the Guardian blocked alert)?
- [ ] **React Value Setter**: Directly modifying a `textarea`'s `.value` in React requires dispatching a synthetic `InputEvent` so React's internal state updates before submission.

## 3. Direct Fetch vs. Watched-Folder Bridge
**Direct Fetch to Ngrok (HTTP `fetch`)**:
- *Pros*: Simple, runs entirely in the browser, no extra moving parts.
- *Cons*: Browsers enforce CORS (Cross-Origin Resource Sharing). The Guardian MCP server must have CORS configured to allow requests from `https://grok.com`. Additionally, injecting the Guardian Bearer token in client-side JS is technically a security risk, though acceptable for a single-user private setup.

**Watched-Folder Bridge (File I/O via Local Server)**:
- *Pros*: Bypasses CORS entirely. Keeps Bearer tokens out of the browser.
- *Cons*: Over-engineered. It requires running a separate local watcher script.

**Recommendation**: Use **Direct Fetch to Guardian via Ngrok**, but ensure `scarlett-guardian-mcp/src/guardian/server.ts` is updated with `cors` middleware explicitly allowing the Grok domain.

## 4. How to Block Send on "do_not_proceed"
Because we trigger `e.preventDefault()` at the very beginning of the flow, the native send is already paused. 
To block the send, the script evaluates `response.proceed_recommendation`:
1. If it equals `do_not_proceed`, we simply **do not** trigger the programmatic submission.
2. We inject a styled red banner above the chat box: `Guardian Blocked: Missing critical memory precedent.`
3. The user's original text remains in the `textarea` untouched. They can fix the RAG markdown files, wait for indexing, and press Send again without having to retype their message.

## 5. Failure Modes & Fallbacks
- **Guardian Timeout / Ngrok Offline**: 
  - *Failure*: The `fetch()` request hangs or throws an error.
  - *Fallback*: The script restores the Send button and displays: *"Guardian Unreachable. Send anyway? (Y/N)"*.
- **React State Mismatch (Silent Failure)**:
  - *Failure*: The script modifies `textarea.value` but Grok sends the *old* state because React didn't register the change.
  - *Fallback*: Use the native setter bypass:
    ```javascript
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeInputValueSetter.call(textarea, enrichedText);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    ```

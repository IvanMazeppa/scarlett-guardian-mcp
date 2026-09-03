# Ghostwriter UI Debugging Handoff (For Grok 4.6)

## Objective
We are building a **Tampermonkey Userscript (Ghostwriter Bridge)** that runs on `grok.com`. The goal is to inject a "✨ Polish" button next to the chat input box. When clicked, the script should read the user's typed prompt, send it to the OpenAI API (`gpt-5.6-luna`), and replace the text in the Grok input box with the enhanced prose.

## The Critical Problem
The button successfully renders and successfully calls the OpenAI API. However:
1. It constantly reads `"x"` instead of the actual 200+ character text the user typed.
2. When the OpenAI API returns the polished text, the script fails to update the visible UI in the Grok chat box. 

## What We Have Tried (And Why It Failed)
We attempted several iterations to fix this, all of which failed:

1. **Basic Textarea Selection (`document.querySelector("textarea").value`)**
   - *Result:* It grabbed text from old messages or hidden state buffers (e.g., reading Grok's previous reply).
2. **React Event Bypassing**
   - *Issue:* Grok's React UI was trapping the click event, making the button unclickable.
   - *Fix applied:* We successfully bypassed this using aggressive capture-phase listeners (`mousedown`, `pointerdown`, `click`) and `e.stopImmediatePropagation()`. The button is now fully clickable.
3. **Button Visibility Fixes**
   - *Issue:* Grok's UI hides the Send button when the input is empty, and `overflow: hidden` was clipping our injected button.
   - *Fix applied:* We anchored the button using `position: absolute; right: 160px; bottom: 12px;` relative to the wrapper, making it perfectly visible in the UI.
4. **Heuristic Textarea Search**
   - *Attempt:* We tried to find the active text box by filtering all `textarea` elements and picking the one with the longest `.value.length`.
   - *Result:* It STILL read `"x"`, meaning the actual text the user typed was **not stored in the `value` of any `<textarea>` tag**.

## The Leading Hypothesis (For Grok to Solve)
Grok's UI in 2026 likely no longer relies on a standard HTML `<textarea>`. It is almost certainly using a rich-text editor framework like **ProseMirror, Draft.js, or Lexical**. 

These frameworks use a `<div contenteditable="true">` to render the visible text to the user. They often leave a hidden `<textarea>` in the DOM that contains garbage state data (like the letter `"x"`) for mobile keyboard bridging or React state management.

Because our Tampermonkey script is explicitly querying `textarea.value` and trying to write back using `Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set`, it is reading the garbage "x" state and failing to trigger the rich-text editor's internal state update.

---

## 📋 Copy/Paste Prompt for Grok 4.6

Copy the prompt below and paste it into Grok 4.6 (using the Agent window or Multitask skill):

***

**PROMPT:**
> "I need you to fix a Tampermonkey userscript that interacts with the grok.com chat interface. 
> 
> **The Goal:** A 'Polish' button that reads the user's typed chat input, calls an API, and replaces the chat input with the rewritten text.
> 
> **The Bug:** The script is currently querying `document.querySelector("textarea").value`. However, it keeps reading the letter `"x"` instead of the actual paragraph I typed, and when it tries to write the result back using native value setters on the `textarea`, the visible UI does not update.
> 
> **Context:** We suspect Grok's UI uses a `contenteditable="true"` element (like ProseMirror or Lexical) for the actual text input, and the `textarea` is just a hidden dummy element holding state (which is why it reads "x").
> 
> **Your Task:**
> 1. Analyze how to properly scrape the user's typed text from a modern React/ProseMirror/contenteditable setup in the Grok UI, completely bypassing the broken `textarea.value`. (Look for `<div contenteditable="true">` or `[role="textbox"]` or `[data-lexical-editor]`).
> 2. Analyze how to correctly INJECT the text back into the UI so that React/Grok recognizes it as a valid user input (e.g., dispatching `input` events, `textInput` events, or using `document.execCommand('insertText')` on the contenteditable div).
> 3. Provide the specific JavaScript snippet to reliably **GET** the text and **SET** the text in this environment."

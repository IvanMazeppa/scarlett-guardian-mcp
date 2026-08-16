# Mission Control UI Dashboard — Cursor/Grok Master Prompt

**Target:** Fable (or Grok 4.5 in Cursor)
**Task:** Build the React UI for the Scarlett Guardian Mission Control Dashboard.
**Context:** We have a working backend API exposing telemetry and state control on `localhost:8790`. We need a beautiful, tactical, dark-mode React UI to visualize this data and steer the agent.

---

### PROMPT TO COPY & PASTE INTO CURSOR:

```text
Please build the frontend React UI for the "Mission Control Dashboard" for the Scarlett Guardian MCP project. 

The backend is already built and running on `localhost:8790`. I need a single-page React application (using Next.js or Vite, whichever is cleaner to integrate into this Node/Express repo) that visualizes the telemetry data and provides control toggles.

### Tech Stack & Aesthetics:
- Use React, TypeScript, and standard CSS (or Tailwind if you prefer, but keep it highly polished).
- **Aesthetic:** Tactical, premium dark mode. Think "Intelligence Directorate meets high-end automotive telemetry." Very clean lines, deep blacks, subtle glowing accents (slate blues or muted ambers). NO cliché "hacker green" matrix fonts. Use a clean, highly legible modern sans-serif.

### Data Sources (Backend APIs are live):
- `GET /telemetry/api/recent?limit=20` (Returns an array of recent preflight events, including latency, tools invoked, and triggers).
- `GET /telemetry/api/health`
- `GET /control/state` (Returns current `sceneMode` and `lorePack`).
- `POST /control/state` (Accepts JSON to update `sceneMode`).

### UI Layout & Features Required:

**1. The "Steering" Panel (Left Column):**
- Display the current `sceneMode`.
- Provide a clean button group or dropdown to `POST` a new mode. The valid modes are: `default`, `explicit_slow_burn`, `tactical`, and `banter`.
- When a user selects a mode, immediately POST it to `/control/state` and show a subtle success state.

**2. The Telemetry Dashboard (Main View):**
- **Save-Lag Warning:** A prominent indicator reading the timeline state. If the RAG retrieval date doesn't match the live beats, show a subtle warning.
- **The Parroting Ratio:** A metric chart showing how much Grok is generating vs. how much the User typed (using `previous_message_chars` vs. `llm_facts_count`).
- **Tool Utilization:** A visual breakdown (bar chart or pill tags) of which tools were invoked in the latest turn (e.g., `search_story_memory`, `expand_context_around_chunk`).
- **Trigger Detection:** A live feed of the narrative triggers detected in the last preflight (e.g., "Intimacy, kink, dominance", "Recovery, soreness").

**3. Latency Breakdown:**
- A small diagnostic chart showing the preflight latency split (`dispatch`, `rag_batch`, `llm_assessment`).

Please structure this cleanly, ensuring the components are modular. We have access to ngrok for external hosting, so ensure all API calls use relative paths (e.g., `/telemetry/api/recent`) rather than hardcoding `localhost`, so it works perfectly through the ngrok tunnel.
```

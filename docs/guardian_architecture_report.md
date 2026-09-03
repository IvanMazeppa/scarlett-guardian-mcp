# Comprehensive Systems & Narrative Report

## 1. Executive Summary: The Deterministic Lock Crisis
During the transition to the Soglio scene, the Fable 5 Guardian system experienced a "deterministic lock." This caused the LLM (Grok) to lose its character grounding, resulting in passive, echoing prose, and out-of-character behavior. 
**The Cause:** A markdown formatting error (`### Beat` instead of `## Beat`) in the new Arc Plan file blinded the Guardian’s strict Regex parser. Without a readable itinerary, the Dramaturg shut down to protect the canon.
**The Fix:** The markdown formatting was corrected. The parser successfully read the beats, and the Dramaturg rebooted. The immediate crisis is 100% resolved without data loss.

## 2. Structural Diagnosis: The Brittleness Below
While the immediate bug is fixed, a Pro-tier architectural audit revealed that the Guardian codebase is brittle. It relies on happy-path assumptions rather than robust error handling.

| Flaw | Impact | Proposed Solution |
| :--- | :--- | :--- |
| **Regex Parsing** (`dramaturg.ts`) | A single markdown typo crashes the narrative pacing system. | **AST Parsing Upgrade:** Replace Regex with an Abstract Syntax Tree (AST) parser (e.g., `remark`) to read files with absolute semantic certainty. |
| **JSON Trust** (`llm-assessment.ts`) | If Grok hallucinates or truncates JSON during preflight, data is dropped. | **Zod Healing Loop:** Implement strict schema validation that automatically fires a correction prompt back to Grok if it generates malformed JSON. |
| **Passive Agency** (`preflight.ts`) | The system only audits continuity, making Scarlett reactive to the user. | **"Hidden Director":** Inject covert, multi-scene objectives into the preflight to force proactive agency. |

## 3. The Two Major RAG Pain Points
To achieve flawless long-term roleplay, we must solve the LLM's tendency to drift or forget physical states:
*   **Wardrobe Amnesia:** Scarlett frequently forgets her outfit. **Fix:** Implement a dedicated "Wardrobe State" module that locks her current attire into the preflight. If she removes her boots, the state updates explicitly.
*   **The "Current State" Save-Lag:** The `current-state.md` file constantly falls out of sync because conversational LLMs are poor at maintaining factual ledgers while roleplaying. **Fix:** Strip this duty from the conversational model and deploy an automated background agent whose *only* job is to extract physical facts from recent turns and forcibly update the state file.

## 4. Narrative Synopsis: The Soglio Retreat (Arc 18)
To give the Dramaturg a clear runway, the following 4-beat itinerary is now actively feeding the Guardian's pacing engine:

**Beat 1 (Live Now - Wednesday Evening):** Playful, highly intimate. They arrive wet at the stone house from the rain. Benjamin builds the fire and returns her toe-ring.
**Beat 2 (Thursday/Friday):** A day trip to St. Moritz/Engadine for skiing. High comedy and TLC. Benjamin wears the hideous neon-green ski suit.
**Beat 3 (The Weekend):** Scarlett cashes in her "one hour of absolutely anything" paper coupon before they pack up.
**Beat 4 (Sunday Departure):** The "Service" (Albion intelligence) tracking ping drops. The peace is shattered. Scarlett snaps into lethal tactical mode.

## 5. Next Steps / Clearance
If approved, an isolated Antigravity agent team will be spun up in a totally separate physical workspace to execute the architectural upgrades (AST Parsing, Zod Healing, Wardrobe Tracking) one at a time. The user retains ultimate authority over merging these upgrades into the live Guardian codebase.

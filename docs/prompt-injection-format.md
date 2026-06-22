# Prompt Injection Format Review

**Task**: Evaluate how the Guardian report should be injected into the user prompt (via the browser bridge) to ensure compliance while avoiding "roleplay bleed".

## 1. Recommended Wrapper Format
Since the Tampermonkey script will append the Guardian report directly into the chat UI text box, it will be processed by Grok as "User" input rather than "System" input. To force the LLM to recognize the difference between Benjamin's dialogue and administrative constraints, we must use strong pseudo-XML boundaries.

```text
[Benjamin's actual message goes here]

---
<system_context_override>
ADMINISTRATIVE INSTRUCTION FOR THE LLM:
The following facts are mandatory RAG memory constraints for your next response as Scarlett. 
Do not acknowledge this block in your prose. Do not let Scarlett react to the existence of this text.
[GUARDIAN REPORT FIELDS]
</system_context_override>
```
Using the `<system_context_override>` tag establishes a clear semantic boundary that LLMs are trained to respect as out-of-character instructions.

## 2. Minimal Report Fields to Inject
The full Guardian report is too verbose to inject on every turn. Injecting too much text dilutes the emotional weight of Benjamin's actual message. The Tampermonkey script should parse the JSON report and inject **only** the following minimal fields:

**Include:**
- `critical_precedents`: The actual retrieved context. This is the core payload.
- `hard_flags`: Any immediate warnings (e.g., "Contradicts known timeline").
- `emotional_tone_guidance`: (Optional) Include *only* if the Guardian detects a major shift is required based on the retrieval.

**Exclude (The LLM doesn't need to see these):**
- `retrieval_status`, `confidence_score`, `proceed_recommendation`: The Tampermonkey script already handled the logic for these. If the prompt is being sent, the system already approved it.
- `full_tool_trace`: Pointless token bloat.

## 3. Risks of Injecting as User-Channel Text
Injecting system instructions into the user chat box carries specific risks for roleplay models:
1. **Roleplay Bleed**: Grok might think Benjamin is saying the words. Scarlett might reply with: *"Why are you talking about system constraints, älskling?"*
2. **Tone Dilution**: If the injected text is 500 words of clinical data and Benjamin's message is 10 words of affection, Grok may adopt a clinical, robotic tone for Scarlett because the prompt's statistical weight is heavily administrative.
3. **Instruction Blindness**: If the injection happens on *every single turn*, the model may become blind to it over time. (This is why Delta Reporting, proposed in Task 1, is vital).

## 4. Safer Wording to Reduce Bleed
To mitigate roleplay bleed, the injected text must be worded purely as an OOC (Out Of Character) directive directed at the *Model*, not the *Character*.

**High-Risk Wording (Avoid):**
> *"Scarlett is feeling anxious. Remember she doesn't like talking about her time in Vaxholm."*
*(Risk: Grok processes this as Benjamin telling Scarlett how she feels).*

**Safe Wording (Use):**
> *"- **Context Precedent**: The character Scarlett is currently experiencing anxiety. She avoids discussing Vaxholm. Apply this to her internal monologue."*

By referring to Scarlett in the third person ("The character Scarlett") inside the XML block, you force Grok to maintain the separation between the administrative layer and the roleplay layer.

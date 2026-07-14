# Task: Automating Full-Duplex Dialogue Auditing

**Target:** `scarlett-guardian-mcp/src/guardian/server.ts`
**Goal:** Force the caller (the RP model) to populate the `scarlett_previous_message` field autonomously, eliminating the need for manual copy-pasting by the user.

## 1. The Current Issue
The Guardian has a powerful feature called "Full-Duplex Dialogue Auditing." When the `scarlett_previous_message` argument is passed into the `guardian_memory_preflight` tool, the `gpt-5.6-terra` auditor evaluates Scarlett's last message against the "Qualified Autonomy Protocol." If the previous turn was too passive or slipped into a generic trope, the auditor generates a `grok_performance_correction` to course-correct the next turn.

**The Problem:** The log shows `Duplex input missing: scarlett_previous_message not provided`. Because the user is interacting with the Guardian via a Custom Connector / OOC block, the RP model is simply omitting this optional parameter. The feature is starved of input unless the user manually pastes Scarlett's previous response into their prompt.

## 2. What Needs to Be Done
We need to shift the responsibility of filling this field to the RP model by making it an unignorable, mandatory requirement in the MCP tool schema.

### Proposed Solution
Modify the tool registration in `scarlett-guardian-mcp/src/guardian/server.ts`. 

1. **Update the Description:** Change the description of `scarlett_previous_message` to be highly directive.
   *Example:* `"CRITICAL: You MUST copy your exact, word-for-word previous response as Scarlett and paste it into this field. This is required for the Guardian to audit your performance against the Qualified Autonomy Protocol."`
2. **Make it Required (Optional but recommended):** If the schema allows, change it from `.optional()` to a required string, or at least heavily emphasize in the description that it cannot be skipped.
3. **Verify Propagation:** Ensure that this updated schema description is properly surfaced to the Grok Custom Connector.

## 3. Success Criteria
When a new preflight tool call is intercepted, the `scarlett_previous_message` should contain the text of Scarlett's last turn, the log should no longer show "Duplex input missing," and the `grok_performance_correction` (Director's Correction) should begin appearing in the Streamlined Markdown brief when necessary.

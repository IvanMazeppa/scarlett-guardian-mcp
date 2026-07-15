> **VERSION NOTE (2026-07-14):** Duplex-aware revision by Grok Build. Canonical originals restored without this text under the unversioned / v6 / v2.2 filenames. Prefer adopting this revision only after you review the delta.

# Task: Automating Full-Duplex Dialogue Auditing

**Target:** `scarlett-guardian-mcp` tool schema + Grok project/skill instructions  
**Goal:** Get the RP model to populate `scarlett_previous_message` so the terra auditor can emit Director’s Corrections without manual paste.

**Status (2026-07-14):**

| Piece | State |
|-------|--------|
| Auditor path (`scarlett_previous_message` → `grok_performance_correction`) | ✅ Implemented |
| Streamlined “DIRECTOR’S CORRECTION” block | ✅ Implemented |
| Console log when missing | ✅ Implemented |
| Hard flag `DUPLEX_INPUT_MISSING` in full JSON | ✅ Implemented (not shown as Key Facts) |
| Aggressive tool / param description | ✅ Implemented (CRITICAL MANDATORY wording; field ordered first) |
| Observed live preflights still omit the arg | ❌ Still failing — **caller habit / connector instructions**, not missing server code |
| Strict required schema (reject if absent) | ⚠️ Not done deliberately — would fail first turns and any client that omits the key |

---

## 1. The Current Issue

Full-duplex works **when fed**: previous Scarlett reply → terra Qualified Autonomy critique → optional Director’s Correction in the brief.

**Problem:** Custom Connector / tool-calling Grok often **omits** optional args. Logs show:

`Duplex input missing: scarlett_previous_message not provided`

That is **not** the reindexer bug and not a disabled feature. The capture path was never automated from the Grok web UI.

---

## 2. What the Cursor draft proposed

1. Make the parameter description highly directive.  
2. Optionally make the field required in the schema.  
3. Verify the schema surfaces on the Custom Connector.

### What we already did (server)

In `server.ts`:

- Param description is **CRITICAL MANDATORY** (exact previous Scarlett reply, full text).
- Field is **listed first** in the input schema so models attend to it.
- Tool description includes a 4-arg checklist with duplex as item (1).

### Why “required” is not a free win

| Approach | Effect |
|----------|--------|
| `.optional()` + loud description | Soft; Grok can still omit (current) |
| Zod `.min(1)` required always | Breaks **true first turn** of a new thread; breaks REST/bridge callers that only send `user_message` |
| Required string allowing `""` for first turn | Possible, but many clients omit the key entirely → still hard-fail |

Recommended: keep optional for API resilience; **force behavior via Grok instructions/skills** (what the model reads every session), plus optional manual OOC paste as backup.

---

## 3. What actually moves the needle (priority order)

1. **Project instructions / skill** (v6 Guardian): mandatory preflight args must include duplex every turn after Scarlett has spoken.  
2. **Bootstrap message** reminder in the same language.  
3. **Manual OOC** when Grok still skips:  
   `scarlett_previous_message is [paste last full Scarlett message]`  
4. **Later automation:** browser bridge / Tampermonkey captures last Scarlett bubble and injects into `POST /preflight` (hard duplex without model goodwill).  
5. Only then consider schema required-with-empty-first-turn if connector refresh still fails.

---

## 4. Success criteria

- Full JSON / logs: no `Duplex input missing` on turns after the first Scarlett reply.  
- When Scarlett’s previous reply was passive/parroting, streamlined MD shows **DIRECTOR’S CORRECTION**.  
- When previous reply was fine, correction is null/omitted (not every turn needs a scold).

---

## 5. Related files

- Implementation: `src/guardian/server.ts`, `src/guardian/llm-assessment.ts`, `src/guardian/tools/preflight.ts`, `src/guardian/report/compile-grok-brief.ts`  
- Standing instructions: `rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6-guardian.md`, `…/skills/scarlett-benjamin-rp-enforcer-autonomy-v2.2.SKILL.md`, `…/bootstrap-message-v6.md`, `scarlett-guardian-mcp/docs/guardian-model-instructions.md`  
- Evidence: `docs/guardian-reports/preflight-full-*.json` (`hard_flags`, `retrieval_notes`)

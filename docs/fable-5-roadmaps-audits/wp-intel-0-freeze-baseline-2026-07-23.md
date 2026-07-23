# INTEL-0 — Freeze and verify current state

**Date:** 2026-07-23  
**Status:** Baseline work complete; **Operator ACK still required** before reindex and before activating v6.2/v2.4 instruction stack  
**Plan:** `wp-guardian-rag-intelligence-save-lag-plan-2026-07-23.md`

## Done in this WP

### 1. Saturday-morning `current-state.md` (cleaned, not reindexed)

**Path:** `rag-memory-mcp/project_source_files/current-state.md`  
**Narrative retained:** Saturday morning suite bed; coffee/pastries/gift; couple-only; Affalterbach Monday; Friday-night bed/tea/photo after shower.

**Prompt/policy language removed:**

| Was | Now |
|-----|-----|
| “proving to herself that she doesn't have to be on or performing strength…” | Soft rest/yield as story fact only |
| “operating with Character Balance—she has deep agency…” | Identity + soft private morning; no policy name |
| “Character Balance rules apply (yielding… is valid agency)” | “private couple scene only — no engineers…” |
| “(autonomous plans)” label | “live options, not orders” |

**Git:** cleaned file may remain uncommitted until Operator ACK (safety hold). **Do not reindex** until ACK.

### 2. Instruction candidates inventory (not activated)

Three **candidate** files (untracked / uncommitted at draft time):

| Layer | Candidate path | Version | Status |
|-------|----------------|---------|--------|
| Agent | `rag-memory-mcp/docs/instructions/Agents/single-scarlett-enforcer-v6.2-character-balance.md` | v6.2 CB | Candidate — not live |
| Project | `rag-memory-mcp/docs/instructions/project-instructions-single-agent-v6.2-character-balance.md` | v6.2 CB | Candidate — not live |
| Skill | `rag-memory-mcp/docs/instructions/skills/scarlett-benjamin-rp-enforcer-character-balance-v2.4.SKILL.md` | v2.4 CB | Candidate — not live |

**Last known duplex stack (pre-v6.2 candidates):**

| Layer | File | Version |
|-------|------|---------|
| Agent | `…/single-scarlett-enforcer-v6.1-guardian-duplex.md` | v6.1 duplex note |
| Project | `…/project-instructions-single-agent-v6.1-guardian-duplex.md` | v6.1 |
| Skill | `…/scarlett-benjamin-rp-enforcer-autonomy-v2.3-duplex.SKILL.md` | v2.3 |
| Guardian novelist brief | `compile-grok-brief.ts` CHARACTER BALANCE block | **Active in code** |
| Guardian auditor | `llm-assessment.ts` system prompt (receptive protected) | **Active in code** |
| OOC / model docs | `scarlett-guardian-mcp/docs/guardian-model-instructions-v2-duplex.md` | Reference |

**Dedup rule (recommended, not applied live):** one Character Balance source per layer. Do **not** paste full CB into Agent + Project + Skill + brief + auditor simultaneously. Prefer:

- **Skill or Project** for novelist posture (pick one primary),
- **Guardian brief** for per-turn CB (already code),
- **Auditor** for correction boundaries only (already code),
- Agent file = thin turn-order wrapper, not a second full CB essay.

**Skill v2.4 residual risk:** frontmatter still says “proactive autonomy (Character Balance hotfix applied)” and early sections still emphasize dominance/default energy before §8 CB. Review before activate.

### 3. Scene Cast budget restored (formatter fix)

- Root cause: first NPC was exempt from budget trim → full bible tails blew past 90 (observed ~136, test weakened to 160).
- Fix: `formatSceneCastBlock` budgets **every** NPC; compact fields; soft cap `maxWords + 40` (130 when max=90); ⚠ still mandatory.
- Test restored: `words <= 130` (was 160). Observed after fix: **124**.

### 4. Receptive-agency hermetic case

`tests/character-balance-hotfix.test.ts` → `testReceptiveAgencyNoDirectorCorrection`:

- Auditor prompt still lists receiving / following / yielding / resting as not passivity.
- Null `grok_performance_correction` → no **DIRECTOR'S CORRECTION** in brief.
- Semantic fixture text: Scarlett accepts care / does not “take charge” of the morning.

Existing anti-parroting / ensemble language retained in auditor prompt.

## Validation

```bash
cd scarlett-guardian-mcp
npm run build
npm test
npm run eval:fast
```

## Operator ACK still needed

- [ ] Commit cleaned `current-state.md` (if not committed with this WP)
- [ ] Reindex after ACK
- [ ] Whether to activate Agent v6.2 / Project v6.2 / Skill v2.4 (and which single primary novelist layer)
- [ ] Start INTEL-1 (resolved scene-confidence gate)

## Out of scope (not done)

- INTEL-1+ architecture
- Retrieval volume / token budget changes
- Personality rewrite beyond canon cleanup

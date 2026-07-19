# WP-5.9 — NPC state changes evidence

**Date:** 2026-07-19  
**Branch:** `feature/phase5-dramaturg`  
**Design:** D9 `guardian-npc-state-management-design-2026-07.md` §7–9  
**Scope:** WP-5.9 only

## Implemented

- Added the nullable `npc_state_changes` auditor field with `npc`, `kind`, `change`, and `evidence`; allowed kinds are `disposition`, `wants`, `last_seen`, and `knowledge`.
- Normalized malformed/duplicate auditor deltas before they reach the write path.
- Gated NPC persistence on an auditor-confirmed scene transition, preventing continuous-scene and `last_seen` churn.
- Rewrites only the matched NPC registry field in a staged full-file proposal for `secondary-characters-bible.md`; Guardian never writes canon directly.
- Preserves prior STABLE knowledge by appending newly learned facts instead of replacing the existing `Knows` ledger.
- Forces any batch containing `knowledge` to `held_for_review` and never calls the approval tool, even under graduated auto-approve configuration.
- Allows disposition/wants/last-seen proposals to use the existing transition burn-in graduation.

## Focused proof

- Same-scene NPC deltas do not stage.
- A played Karin disposition change rewrites the registry tail and appears through the existing Scene Cast parsing/rendering path used by the next brief.
- Knowledge batches issue only `stage_story_update`; no `approve_staged_story_update` call occurs.
- Volatile-only batches perform dry-run plus approval only with `GUARDIAN_AUTO_APPROVE=beats_and_valid_transitions`.
- Unknown/no-op registry changes produce no canon proposal.

## Acceptance

Command:

```bash
npm test && npm run build && npm run eval:fast
```

Result: **green**

- `npm test`: all unit, schema, write-back, eval harness, mutant, telemetry, roster, and Scene Cast tests passed.
- `npm run build`: TypeScript compilation passed.
- `npm run eval:fast`: **31/31 passed**, 0 failed; 38 warnings.
- Scorecard: `evals/runs/2026-07-19T22-58-50-449Z-scorecard.md`

## Boundaries and residual risk

- No RAG source, source-priority, narrative corpus, frozen cassette, WP-5.10, Phase 6, Living GM, or duplex code was edited.
- NPC registry updates are staged as full-file overwrite proposals from the local registry snapshot. Sequential execution plus staged diff review and RAG backups mitigate stale-snapshot overwrite risk.
- No live canon approval was performed in this WP; tests exercise the complete staged/approval contract hermetically.
- The master-roadmap ledger remains for Fable/operator update after acceptance.

# OPS-REV-0 evidence — Operator contract and safe-revision runbook

**Date:** 2026-07-22  
**Executor:** Grok Build  
**Plan:** `wp-ops-revision-and-archive-plan-2026-07-22.md`  
**Status:** **done** (docs-only)

## Delivered

| Artifact | Path |
|----------|------|
| Plan-of-record (from Sol Cursor plan) | `docs/fable-5-roadmaps-audits/wp-ops-revision-and-archive-plan-2026-07-22.md` |
| Sol paste prompt (earlier) | `docs/fable-5-roadmaps-audits/prompt-sol-ops-revision-and-archive-plan-2026-07-21.md` |
| OOC prefix v5 | `rag-memory-mcp/docs/single-agent-ooc-prefix-v5.txt` |
| Operator runbook | `docs/operator-how-to-regenerate-safely.md` |
| Master roadmap row | `master-roadmap-2026-07.md` → OPS-REV + ARCH plan ACK |

## Acceptance (plan OPS-REV-0)

- [x] Templates distinguish IC / ic_regen / prose_revision / ooc_consult / assistant regenerate  
- [x] Prose revision cannot be mistaken for scene advance (explicit no-tools + no-transition language)  
- [x] Runbook documents `review:staged` list/show/diff/reject  
- [x] No secrets or raw narrative dumps  
- [x] v4 retained; v5 additive  

## Code

None. OPS-REV-1 is the first code WP (explicit Operator “go” required).

## Operator use now

1. Prefer `single-agent-ooc-prefix-v5.txt` for RP turns involving rewrites.  
2. Open `docs/operator-how-to-regenerate-safely.md` when editing messages / regenerating / OOC nits.  
3. After suspicious regens: `npm run review:staged -- list`.  
4. When ready for code: say **go OPS-REV-1** (Sol or Grok Build).

# WP-3.4 GREEN — Live `bridge_cache` proof — 2026-07-17

**Status:** **done**  
**Operator:** live RP + Tampermonkey shadow bridge  
**Guardian tip at retest:** includes `e05a08c` (newest-wins when MCP omits `thread_key`)

## Acceptance

| Criterion | Result |
|-----------|--------|
| Scarlett reply in duplex-cache without manual OOC paste of prior Scarlett text | Met (bridge post) |
| Preflight merges from cache | Met |
| Report field | **`"duplex_source": "bridge_cache"`** |
| Operator pastes `scarlett_previous_message` | **Not required** |

## Evidence artifact

```text
scarlett-guardian-mcp/docs/guardian-reports/preflight-full-2026-07-17T03-22-10-667Z.json
```

Observed on that report:

- `duplex_source`: `bridge_cache`
- No `DUPLEX_INPUT_MISSING` hard flag for this success path

## Path to green

1. First attempt failed with `absent` when **two** cache entries existed within TTL and MCP sent no `thread_key` (`fresh.length === 1` rule).  
2. Fix: newest-wins for empty `thread_key` + `DELETE /duplex-cache` (commit `e05a08c`).  
3. Retest after Guardian restart + clean post → **GREEN**.

## Architecture note

Shadow sidecar (D6 Mode 1) is **de-risked** for daily single-operator use:

- Bridge POST `/duplex-cache` works  
- Preflight merge works  
- Caller still wins when the model does supply duplex  

Remaining Phase 3 polish (WP-3.3 calibrate UX, WP-3.5 idempotency / multi-thread) is hardening, not a blocker for Phase 4 write-back work.

## Formal rate goal (D6 ≥90% over a full session)

Mini-test acceptance for roadmap **3.4** is met with this green report. Multi-turn ≥90% rate can be observed casually over future RP nights; no further code gate required to mark 3.4 done.

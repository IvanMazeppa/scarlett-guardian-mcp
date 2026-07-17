# WP-4.8 golden inventory

**Date:** 2026-07-17  
**Branch:** `feature/master-roadmap-v1`  
**Count:** **31** cases (was 16 at WP-1.4; target ~50)

## Verify

```text
npm run eval:fast → 31/31 passed (~215–230 ms, zero network)
npm test → includes WP-4.8 eval-l3 hermetic tests
npm run eval:llm -- --category duplex --trials 3  # needs valid OPENAI_API_KEY
```

## Cases

| id | category | role |
|----|----------|------|
| gt-000-hermetic-smoke | other | synthetic smoke |
| gt-001-first-lap-ask | continuous-scene | good |
| gt-002-first-lap-live | continuous-scene | good |
| gt-003-radio-swedish | continuous-scene | good |
| gt-004-villa-petrusse | exact-fact | good |
| gt-005-eifel-b-roads | continuous-scene | good |
| gt-006-mid-stint-continuity | continuous-scene | growth (minimal exp) |
| gt-007-jul16-session | continuous-scene | growth (minimal exp) |
| gt-008-jul9-scene | continuous-scene | growth (minimal exp) |
| gt-010-empty-weave-eifel | other | failure trap |
| gt-011-empty-weave-grass | other | failure trap |
| gt-012-empty-weave-attention | other | failure trap |
| gt-013-changing-room | temporal-mud | failure trap |
| gt-014-thread-start-nordschleife | fresh-thread | failure trap |
| gt-015-jul13-fact-anchor | exact-fact | growth (minimal exp) |
| gt-016-jul12-thread | fresh-thread | growth (minimal exp) |
| gt-017-jul11-temporal | temporal-mud | growth (minimal exp) |
| gt-018-jul8-other | other | growth (minimal exp) |
| gt-019-meta-leak-trap | other | synthetic meta trap |
| gt-020-locked-room-boundary | high-risk-intimacy | synthetic seed |
| gt-030-race-suit-writeback | write-back | write-back + L3 llm |
| gt-031-shower-writeback | write-back | write-back + L3 llm |
| gt-032-intimacy-writeback | write-back | write-back + L3 llm |
| gt-033-eifel-live-append | write-back | write-back + L3 llm |
| gt-034-jul10-writeback | write-back | growth (minimal exp) |
| gt-040-thermal-lap-duplex-stage | duplex | duplex + L3 llm |
| gt-041-passive-prior-correction | duplex | **L3 pair A** correction required |
| gt-042-strong-prior-no-correction | duplex | **L3 pair B** correction none |
| gt-043-bridge-cache-live | duplex | WP-3.4 bridge_cache report |
| gt-050-jul5-serendipity-seed | serendipity | growth seed |
| gt-051-ambient-paddock-nudge | serendipity | synthetic seed |

## Notes

- **L3-ready:** duplex + write-back cases with `expectations.llm` (plus pair A/B).
- **Growth cases** (`expectations-minimal`): meta-pollution + brief bounds only; pad cassettes for hermetic green. Gemini can author full phrase groups without re-curating cassettes.
- Path to ~50: curate ~15–20 more reports from `docs/guardian-reports/` with the same minimal gates, then tighten expectations in batches.

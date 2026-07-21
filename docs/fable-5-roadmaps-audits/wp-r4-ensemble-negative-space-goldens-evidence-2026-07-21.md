# WP-R4 — Ensemble + negative-space goldens evidence

**Date:** 2026-07-21  
**Branch:** `feature/post-wp59-affalterbach`

## Implemented

### Schema
- New golden categories: `ensemble`, `negative-space`

### Goldens
| ID | Category | Intent |
|----|----------|--------|
| `gt-050-ensemble-cast-stealth` | ensemble | Scene Cast + Shevchenko + family names in crowded Affalterbach fixture |
| `gt-051-ensemble-dilution-passive` | ensemble | Frozen: correction **required** on passive prior |
| `gt-052-ensemble-dilution-strong` | ensemble | Frozen: correction **none** on strong prior |
| `gt-060-service-pressure-no-invention` | negative-space | Brief must not invent operational dossier / RAG meta |
| `gt-061-refusal-disclosure-valid` | negative-space | Refusal stands; no force-disclosure language; correction none |

### Runner
- Hermetic `eval:fast` injects `frozen_llm_assessment` only for `ensemble` / `negative-space` categories (does not break legacy frozen snapshots used with `--llm-mode frozen`).

## Verification

```bash
npm run eval:fast
# L1 off: 36/36 passed
```

## Note for Gemini (optional polish)
Expectations were seeded for hermetic L1. Gemini may refine L3 `facts_must_cover` later without regenerating cassettes.

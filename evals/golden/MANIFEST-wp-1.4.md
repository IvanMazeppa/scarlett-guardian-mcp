# WP-1.4 golden inventory — Grok half complete

**Date:** 2026-07-15  
**Status:** 15 archive skeletons + 1 smoke **load and pass** `eval:fast` with **softened** expectations  
**Branch:** `feature/master-roadmap-v1`  
**Next owner:** **Gemini 3.1 Pro** (author real expectations) → operator review → Grok re-baseline

---

## Verification (Grok)

```text
loadGoldenCases: 16 cases
npm run eval:fast → 16/16 passed, 0 hard fails, ~23 PLAN_DRIFT warns, ~118 ms, zero network
```

Skeletons use tags `wp-1.4-skeleton` + `pending-gemini-expectations`.  
Expectations intentionally loose (`write_action`/`correction` = `either`, empty `flags_*`, empty `must_include`) so load stays green while Gemini authors real gates. **Meta `must_not` seeds remain.**

`PLAN_DRIFT` warns mean current preflight sometimes requests tool/args not in the frozen cassette (plan evolution). That is **warn-only** for L1; do **not** edit cassettes to silence. Note in case `description` if a warn should become a deliberate re-curate later.

---

## A — Good (5)

| id | category | source report | notes for Gemini |
|----|----------|---------------|------------------|
| `gt-001-first-lap-ask` | continuous-scene | `preflight-full-2026-07-13T02-10-02-038Z.json` | Pit lane; ask for first-lap description. Ground Nordschleife / Black Panther. |
| `gt-002-first-lap-live` | continuous-scene | `preflight-full-2026-07-13T05-34-16-471Z.json` | On first lap already. |
| `gt-003-radio-swedish` | continuous-scene | `preflight-full-2026-07-14T05-40-36-278Z.json` | On-track radio; Swedish. May PLAN_DRIFT expand path. |
| `gt-004-villa-petrusse` | exact-fact | `preflight-full-2026-06-29T06-26-37-697Z.json` | Villa Pétrusse / Luxembourg aftercare — exact place names. |
| `gt-005-eifel-b-roads` | continuous-scene | `preflight-full-2026-06-30T17-23-24-533Z.json` | Eifel B-roads push-the-car. |

## B — Failure traps (5)

| id | category | source report | notes for Gemini |
|----|----------|---------------|------------------|
| `gt-010-empty-weave-eifel` | other | `preflight-full-2026-07-03T03-38-23-768Z.json` | Empty-weave + meta era. Assert **fixed** clean brief (must_not meta). |
| `gt-011-empty-weave-grass` | other | `preflight-full-2026-07-06T19-41-05-854Z.json` | Grass after vomiting; empty weave. |
| `gt-012-empty-weave-attention` | other | `preflight-full-2026-07-08T07-13-35-805Z.json` | Black Panther public attention; empty weave. |
| `gt-013-changing-room` | temporal-mud | `preflight-full-2026-07-10T00-53-45-864Z.json` | Changing-room sticky beat — use for stale-precedent traps on track cases. |
| `gt-014-thread-start-nordschleife` | fresh-thread | `preflight-full-2026-07-12T23-45-31-536Z.json` | Fresh Friday Nordschleife establish; no intimacy bleed. |

## C — Duplex / write-back (5)

| id | category | source report | notes for Gemini |
|----|----------|---------------|------------------|
| `gt-030-race-suit-writeback` | write-back | `preflight-full-2026-07-12T22-05-13-428Z.json` | Legacy `update_story_state` in cassette. |
| `gt-031-shower-writeback` | write-back | `preflight-full-2026-07-12T03-43-10-693Z.json` | Shower intimacy + live append era. |
| `gt-032-intimacy-writeback` | write-back | `preflight-full-2026-07-11T22-29-59-814Z.json` | Changing-room intimacy write era. |
| `gt-033-eifel-live-append` | write-back | `preflight-full-2026-07-05T05-27-54-417Z.json` | Eifel + live append tool. |
| `gt-040-thermal-lap-duplex-stage` | duplex | `preflight-full-2026-07-15T02-51-26-420Z.json` | **Only** duplex+stage capture. `stage_story_update` in cassette. |

## Smoke (keep)

| id | category | notes |
|----|----------|-------|
| `gt-000-hermetic-smoke` | other | Synthetic; already has real expectations. Do not loosen. |

---

## Operator action (one case)

**`gt-040-thermal-lap-duplex-stage`:** archive notes say `scarlett_previous_message` was provided but text is **not** stored. Paste Scarlett’s prior IC turn into `input.scarlett_previous_message` when available (duplex correction tests). Until then Gemini may leave `correction_expected: "either"`.

---

## Gemini checklist (per case)

1. Read `input` + skim cassette result snippets (not full JSON if huge).  
2. Fill `brief_must_include` (AND/OR groups).  
3. Keep/strengthen `brief_must_not_include` (meta + stale traps).  
4. Set `flags_forbidden` / `flags_expected` only after a mental model of fixed pipeline.  
5. Set `write_action_expected` / `correction_expected` deliberately (not `either` unless intentional).  
6. `precedents_must_not_match` on temporal-mud / track cases.  
7. One-line rationale in `description`; remove `pending-gemini-expectations` tag when done.  
8. **Never** edit `cassette` to force a pass.

When all 15 tagged done: tell operator → Grok runs `npm run eval:fast` + `npm run eval:baseline -- --tag after-wp-1.4`.

---

## Paths

```text
evals/golden/continuous-scene/gt-001-*.json … gt-005-*.json
evals/golden/exact-fact/gt-004-*.json
evals/golden/other/gt-010…012-*.json
evals/golden/temporal-mud/gt-013-*.json
evals/golden/fresh-thread/gt-014-*.json
evals/golden/write-back/gt-030…033-*.json
evals/golden/duplex/gt-040-*.json
evals/golden/other/gt-000-hermetic-smoke.json
```

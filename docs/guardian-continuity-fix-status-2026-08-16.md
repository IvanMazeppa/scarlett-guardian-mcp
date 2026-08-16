# Guardian Continuity Fix — Verification & System Status

**Date:** 2026-08-16  
**Repos:** `scarlett-guardian-mcp` (+ companion `rag-memory-mcp` canon)  
**Verified against:** live terminal + preflight brief + Grok reply (airborne Gulfstream intimacy turn)  
**Related:** [`mission-control-preflight-discrepancy-report-2026-08-16.md`](mission-control-preflight-discrepancy-report-2026-08-16.md)

---

## 1. Confirmation — are the reported bugs gone?

**Yes — the three reported continuity bugs are fixed** for this turn. Evidence from your paste:

| Bug | Before | Your live turn (verified) |
|-----|--------|---------------------------|
| Nürburgring / Nordschleife Beat 1 pressure | `Story momentum [deterministic]: Beat 1 of 4 (Arrival at the Nordschleife paddock) is live…` | `Story momentum [provisional_neutral]: Continue the played scene…` — **no paddock beat** |
| Scene Summary / Key Facts stuck on tarmac | “Private Aviation Terminal… **not** an airborne cabin scene… Nordschleife paddock” | **Airborne Gulfstream… Scarlett fully naked… boxer-briefs… seat back** |
| Memory write-back always `null/empty/no-op` | Every turn skipped with that exact reason | `Memory write-back held (provisional)… decision was **stage_transition**` — write path **engaged**, then held for review under save-lag policy |

Also confirmed healthy:

- Duplex present (`scarlett_previous_message` 2363 chars)
- Mood cues live again (`intimate`, `decompression`…) — **not** falsely superseded
- `SAVE LAG` / provisional confidence correctly flagged `aviation→aviation` (tarmac disk vs airborne play)
- Scene Mode EXPLICIT / SLOW-BURN applied
- **Grok’s reply matched play**, not the stale wardrobe card (naked, anklet, gold bars, cabin heat/lights, seat-back arch, punishment frame)

So: Guardian is no longer *steering the novelist back to Nürburgring or denying the airborne scene*. The remaining contradictions are **disk canon lag**, not the hot-path bugs you reported.

---

## 2. What was done (this fix round)

### 2.1 Root causes addressed

1. **Aviation save-lag blind spot** — no cluster/stages for tarmac → wheels-up Gulfstream; bare `"cabin"` false-matched car scenes.
2. **Completed arc-plan fallback** — with no `Status: active` plan, loader picked alphabetical `arc-09` (Nürburgring) and deterministic diff invented Beat 1 as live.
3. **Unsafe no-match beat-diff** — zero cue overlap still forced a “live” beat.
4. **Mood parser** — unmarked Overall Mood was treated as “earlier” → `intimate` landed in superseded cues.
5. **Write-back** — SAVE LAG never fired → auditor returned null → perpetual skip; `turnHints` were never passed so sleep/day fallback could not run; under SAVE LAG we now synthesize a transition candidate when needed.
6. **Brief priority under SAVE LAG** — Scene Summary / first Key Fact prefer played `recent_context` over stale LIVE BEAT paraphrase.

### 2.2 Files touched (Guardian)

- `src/guardian/save-lag.ts` — `aviation` cluster + `tarmac_boarding` / `cabin_airborne`
- `src/guardian/dramaturg.ts` — active-only plan load; dormant when unmatched
- `src/guardian/recency.ts` — unmarked mood = current
- `src/guardian/tools/preflight.ts` — SAVE LAG brief preference, write-back safety net, `turnHints`
- `src/guardian/llm-assessment.ts` — SAVE LAG scene_state_delta instruction
- Tests: save-lag, dramaturg, recency
- Docs: discrepancy report + this status note

### 2.3 What we intentionally did *not* auto-rewrite

- `rag-memory-mcp/project_source_files/current-state.md` — still **tarmac boarding** on disk  
- `wardrobe/live-outfit.md` — still **Panther armour**  
These remain operator-owned LIVE BEAT / wardrobe authorities. The held `stage_transition` is waiting for approval (or a manual paste + reindex).

---

## 3. Current state of the Guardian system

### 3.1 Hot path (per turn) — working as designed now

```
duplex + user + recent_context
        ↓
LIVE BEAT from disk (current-state.md)
        ↓
save-lag / scene-confidence  →  may mark provisional + hold canon writes
        ↓
dramaturg hot path (active plan only; else empty/neutral)
        ↓
RAG retrieve + wardrobe card + Mission Control modes
        ↓
auditor LLM → brief → Grok
        ↓
(async) dramaturg LLM cache for *next* turn
        ↓
memory write decision (stage / hold / skip)
```

### 3.2 Subsystem scorecard (2026-08-16)

| Subsystem | Status | Notes |
|-----------|--------|-------|
| MCP `/mcp` + RAG forward | Healthy | Listening `:8790`, RAG `:8787` |
| Duplex bridge | Healthy | Caller duplex present this turn |
| LIVE BEAT parse / mood | Fixed | Intimate mood stays live |
| Save-lag (aviation) | Fixed | Detects tarmac vs airborne |
| Scene confidence provisional | Working | Correctly holds writes during lag |
| Dramaturg hot path | Fixed | No completed-plan Beat 1 injection |
| Dramaturg LLM background | Working | Next-turn cache; not this-turn blocking |
| Auditor + Scene Mode | Working | EXPLICIT/SLOW-BURN; airborne summary |
| Memory write-back gate | Working | `stage_transition` then `held_for_review` |
| Wardrobe | **Stale disk** | Still injects full Panther kit while play is naked |
| Mission Control UI | Shipped | React SPA at `/dashboard` |
| Ngrok Hobbyist | Shipped | Path-scoped auth; `/mcp` open |
| Story clock vs wall clock | Policy solid | Story date from LIVE BEAT only |
| Active arc plan | **None** | No `Status: active` plan → neutral momentum (correct) |

### 3.3 Known remaining contradiction (not a regression of the fixed bugs)

The brief still shows:

- **Scene Summary / Key Facts / Emotional Context** → airborne naked (correct for play)  
- **Wardrobe LIVE card** → trousers / camisole / blazer / heels (stale disk)

Grok ignored the wardrobe card this turn (good novelist behavior under EXPLICIT mode + strong duplex). That luck should not be relied on forever — update wardrobe when you lock the undress beat into canon.

Confidence dropped to **78%** because provisional save-lag deliberately softens certainty until disk catches up. That is expected, not a failure.

---

## 4. Recommended next improvements (priority order)

### P0 — Close the save-lag loop (operator + small product)

1. **Approve / apply the held transition** (or manually rewrite `current-state.md` to airborne cabin LIVE BEAT: wheels-up, Munich-bound, naked / boxer-briefs, Monday 2 Nov 2026 story-time).
2. **Update `wardrobe/live-outfit.md`** to a naked / hardware-only LIVE card for this beat (anklet + piercings; no trousers-hiding anklet).
3. **Reindex RAG** so retrieval stops reinforcing tarmac boarding.
4. Optional Mission Control affordance: **“Apply staged LIVE BEAT”** button that surfaces held writes without CLI.

### P1 — Reduce wardrobe vs play fights

5. **Naked / undress detection** — when duplex + recent_context agree she is nude and SAVE LAG / intimacy triggers fire, suppress or rewrite the LIVE wardrobe block to “hardware-only / undressed” instead of injecting armour.
6. **Change-beat already fired** (`register=travel-soft`) — wire undress outcomes into wardrobe write-back the same way location transitions stage to current-state.

### P2 — Arc / dramaturg hygiene

7. **Promote or author an active Monday aviation / Munich arc plan** (or explicitly archive `arc-09` so operators aren’t confused). Neutral momentum is safe; an active plan would restore useful schedule pressure *without* Nürburgring false-live.
8. **Mission Control: Hold / Advance + Director Note** (already on the backlog) so you can steer without waiting for disk edits mid-scene.

### P3 — Write-back UX & observability

9. **Dashboard panel for held writes** — show candidate text, from→to, approve/reject.
10. **Telemetry:** rate of `null/empty` skips vs `stage_transition` vs `held_for_review` (so “always skipped” is measurable, not anecdotal).
11. **Separate log lines** for “intentional continuous-scene null” vs “SAVE LAG safety-net synthesized” vs “held provisional”.

### P4 — Brief quality

12. Soften or gate **open-thread dumps** (cold-dominant / disappearance lore) during sealed intimate cabin scenes unless retrieved as active pressure.
13. Prefer **Thread 16 Gulfstream decompression** precedents over older Eifel / motion-sickness blocks when aviation cluster is live (retrieval ranking tweak).

### P5 — Mission Control roadmap (unchanged backlog)

14. Serendipity throttle UI, SSE live updates, Google OAuth (vs Basic Auth), correction timeline, dramaturg badge, RAG lane mix, wardrobe roulette/lock panel.

---

## 5. Operator checklist (this session)

- [x] Nürburgring false-live gone on hot path  
- [x] Airborne Scene Summary / Key Facts  
- [x] Write path produces `stage_transition` (not perpetual null skip)  
- [x] Mood cues not falsely superseded  
- [ ] Disk `current-state.md` updated to airborne LIVE BEAT  
- [ ] Wardrobe LIVE card updated for naked cabin  
- [ ] RAG reindex after canon update  
- [ ] Approve held transition (or discard and paste manually)  
- [ ] Optional: set an **active** arc plan for Munich / aviation leg  

---

## 6. Bottom line

**The bugs you reported are gone.** Guardian now detects aviation save-lag, stops inventing Nordschleife Beat 1, feeds Grok an airborne scene brief, and *attempts* a durable location write (held for review while lag is provisional).

**What remains is canon hygiene:** disk LIVE BEAT + wardrobe still describe pre-departure armour on the tarmac. Until those are updated (or the held write is applied), the wardrobe block will keep lying even though Scene Summary and Grok’s prose are already correct.

If you want a follow-up pass, the highest-value next step is drafting the exact airborne `current-state.md` + naked wardrobe LIVE card from this turn’s consensus and applying them with a reindex.

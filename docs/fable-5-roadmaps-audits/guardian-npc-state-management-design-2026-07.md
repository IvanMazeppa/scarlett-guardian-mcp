# NPC State Management — Ensemble Scenes Without Diluting Scarlett

**Date:** 2026-07-15  
**Author:** Fable 5 (Cursor Agent)  
**Companions (this folder):** `guardian-dramaturg-design-2026-07.md` (§2.3 NPC agendas — the *offstage* half; this document is the *onstage* half), `guardian-writeback-recency-serendipity-roadmap-2026-07.md` (tiers, staging), `guardian-persona-engine-design-2026-07.md` (volatility map, quorum), `guardian-eval-harness-design-2026-07.md`  
**Executor:** Grok 4.5 (Agentic Coder)  
**Problem:** The whole stack is tuned for a two-person dynamic. A crowded scene — the AMG gala, an engineers' debrief, family visiting — needs 3–4 supporting characters acting autonomously and *consistently*, without Scarlett losing the lens or the lead.

---

## 1. Measured findings

1. **NPC canon retrieves at the lowest priority tier.** `secondary-characters-bible.md` and `family-dynamics.md` are not in `source-priority.ts`'s `PROFILES` map, so both fall through to `supporting_backstory` — priority **50, boost 0.01, the bottom of the ladder**. In exactly the scenes where NPC facts matter most, the ranking treats them as junk-drawer backstory. One-line finding, one-line fix, large effect.
2. **The chunking is already right.** The secondary bible uses `###`-per-character (Anders, Eleanor, Mormor, Maya, Priya, Theo, Shevchenko, Karin, Dr Berg, Rafael…), so each NPC is already its own retrievable chunk with a clean section label. No restructuring needed — the registry design below *extends* these sections rather than replacing them.
3. **The knowledge-boundary ledger already exists in embryo — and it is the highest-stakes data in any ensemble scene.** `family-dynamics.md` is literally titled *"Family Dynamics & Stealth Canon"*: **nobody on Benjamin's side knows Scarlett is trans.** The serendipity catalog independently duplicates this ("Grok Note: Lynn does not know…"). A crowded family scene is a minefield where one NPC line written from the *reader's* knowledge instead of the *character's* knowledge does irreversible canon damage. Who-knows-what is not NPC flavor — it is the ensemble system's safety-critical core, and today it's scattered across three files at priority 50.
4. **NPCs have no live state and no write channel.** `current-state.md` tracks two people (plus a "new characters to weave in" stub); nothing records that Shevchenko saw the telemetry, that Priya is annoyed about a cancelled dinner, or — critically — that someone *learned* something. NPC deltas from played scenes currently evaporate.
5. **The brief has no cast surface.** Active NPCs appear only incidentally inside scene-summary prose or key facts. Grok gets no per-character disposition, want, or boundary — so ensemble NPCs default to props or, worse, to improvised characterization.

## 2. Design overview — roster, registry, cast block, delta channel

```text
NPC REGISTRY (corpus, per-NPC sections)      ←— write-back: staged NPC deltas
     │ targeted retrieval per active NPC
SCENE ROSTER (deterministic detection)        ←— arc-plan beat cast + current-state
     │ bounded: max 4 active, rest background
SCENE CAST block (brief)                      —→ Grok writes the ensemble
     │ duplex: ensemble-dilution check        ←— Scarlett stays lens + lead
```

Division of labor with the dramaturg (deliberate, no overlap): the **dramaturg** decides when an offstage agenda intersects the scene (world pressure, serendipity-tier routing); **this subsystem** manages who is *in* the scene, what each of them is like, knows, and wants right now, and how their state changes when the scene ends.

## 3. The NPC registry

Extend each existing `###` section of `secondary-characters-bible.md` (and the dramaturg's `npc-agendas.md`, which merges into this) with a structured tail — human-readable markdown, machine-parseable by convention:

```markdown
### Mr Shevchenko
<existing prose: identity, history, role>                     [STABLE tier]

**Disposition (couple):** protective ally; professionally impatient   [VOLATILE]
**Wants now:** heat-soak telemetry before Monday board sync           [VOLATILE]
**Knows:** aero package is Benjamin's AI work; couple is engaged      [STABLE]
**Must not accidentally learn:** —                                     [STABLE]
**Last seen:** Nordschleife pit wall, Friday (arc-09)                 [VOLATILE]
```

For family NPCs the boundary fields carry the stealth canon: `**Must not accidentally learn:** Scarlett is trans (stealth canon — family-dynamics.md)`. This makes `family-dynamics.md` the *policy* document and the registry the *per-character enforcement copy* that retrieval actually surfaces alongside the character.

- **Tiering** plugs into the persona engine's volatility map: identity prose is STABLE (quorum + human approval), disposition/wants/last-seen are VOLATILE (reconciled from played evidence), **knowledge lines are STABLE with a hard rule — a "learned the secret" change is a story event, never an automated write.**
- **Source priority:** new role `npc_canon` for `secondary-characters-bible.md`, `family-dynamics.md` → priority **78, boost 0.03** (between event-log 80 and arc-chronicle 75: current, character-level authority).

## 4. Scene roster detection (deterministic, free)

**NEW `src/guardian/scene-roster.ts`**, run per preflight before retrieval:

1. **Candidate pool:** registry names + aliases (parsed once from the bible's `###` headings + an alias map: "Lynn" / "his Mum", "Mormor", "Shevchenko" / "his boss").
2. **Active** if named in `user_message` or `scarlett_previous_message` (they spoke/were addressed), or listed in the live beat's cast (`parseLiveBeat` gains a `presentCast` field — `current-state.md` gets a one-line `**Present:**` convention in its snapshot), or cast-listed in the dramaturg's live beat from the arc plan.
3. **Cap at 4 active** — ranked by direct address > speaker > beat cast > merely present. Overflow and unnamed crowds become **background** (one ambient line, no retrieval).
4. Roster feeds three consumers: retrieval fan-out (§5), the cast block (§6), and the auditor prompt.

Deterministic and testable — no LLM in the loop; golden cases can assert exact rosters.

## 5. Retrieval in ensemble scenes — targeted, not semantic

The failure mode to avoid: one scene-level semantic query trying to surface four characters' canon — it won't, and fan-out of 4 extra semantic searches is latency the budget doesn't need. Instead, active-NPC canon is fetched **by address, not by similarity**: the registry chunk's `source_file + section` is known from the roster, so use the manifest-backed direct path (`expand_context_around_chunk` accepts exact `source_file`/`section` — already re-enabled by the depth work) or a small RAG addition `get_sections_by_address` (batch exact-section fetch; trivial against the local manifest, no vector query at all). Cost per active NPC: one deterministic lookup, no embedding roundtrip. Semantic search stays reserved for *relationship history* when triggers fire ("Ryan" + threat trigger still routes a real corpus search through the existing trigger machinery).

## 6. The Scene Cast block (brief)

Rendered by `compileGrokBrief` only when the roster is non-empty; one line per active NPC, hard-capped:

```markdown
**Scene Cast (supporting — Scarlett remains the lens and the lead):**
- Shevchenko: protective ally, impatient for telemetry — wants the heat-soak
  numbers tonight. Knows the aero is Benjamin's AI work.
- Karin (AMG lead engineer): professional, skepticism thawing after the out lap —
  wants tire-temp deltas before signing off. ⚠ Does not know Scarlett is trans.
- Background: telemetry technicians, paddock staff (ambient only).
```

Rules encoded in the renderer and the auditor prompt:

- **Pressure, never scripts** — dispositions and wants, no dialogue, no reactions pre-written (the dramaturg's no-outcome line, applied to people).
- **Boundary lines are mandatory** — every active NPC with a `Must not accidentally learn` entry gets the ⚠ line, every time, no dedup against "Grok probably remembers." Stealth canon is repeated because forgetting it once is unrecoverable.
- **Budget:** ≤ 90 words for the whole block (audit measured ~2.6k chars of brief headroom; the cast block spends a third of it at worst).

**The dilution guard lives in duplex, not in prose rules.** The auditor's Qualified Autonomy critique gains one ensemble clause: *if the previous Scarlett turn let NPCs carry the scene — Scarlett reduced to reacting, interpreting, or translating for others in her own POV — issue a correction.* This reuses the existing `grok_performance_correction` channel; no new machinery, and it triggers on *observed* dilution rather than lecturing preemptively every turn.

## 7. The delta channel — NPC state survives the scene

Additive auditor schema field:

```ts
npc_state_changes: Array<{
  npc: string;
  kind: "disposition" | "wants" | "last_seen" | "knowledge";
  change: string;               // "saw full telemetry; skepticism resolved"
  evidence: string;             // quote/beat from the turn
}> | null
```

Routing through the existing write-back machinery (Pillar C decision → staging):

| Kind | Policy |
|------|--------|
| `disposition` / `wants` / `last_seen` | Staged to the NPC's VOLATILE registry lines; auto-approvable after the standard burn-in |
| `knowledge` | **Always held for human review**, flagged loudly. "Karin learned Scarlett is trans" is an irreversible story event — write-back may *record* it only after the human confirms it truly happened on screen |

Micro-log protection: the material gate already rejects no-op updates; NPC deltas add their own rule — no `last_seen` churn within the same scene, deltas only at scene close (bundled with the Pillar C scene-transition write, same trigger, same staged review sitting).

## 8. Roadmap

### P0 — Retrieval justice + roster + cast block (deterministic, 1–2 sessions)

| # | Task | Files |
|---|------|-------|
| 1 | `npc_canon` source role for both NPC files; enum registration; reindex | `source-priority.ts`, RAG `server.ts` |
| 2 | Registry tail-fields added to the top ~8 NPCs (Shevchenko, Karin, Lynn, Chris & Deb, Dan, Maya, Ryan, Dr Berg); merge `npc-agendas.md` content in | corpus |
| 3 | `scene-roster.ts` (aliases, activation rules, cap) + `**Present:**` convention in current-state + `parseLiveBeat.presentCast` | NEW + `recency.ts` |
| 4 | Exact-section fetch for active NPCs (via expand-by-address or new `get_sections_by_address`) | RAG `retriever.ts`/`server.ts` |
| 5 | Scene Cast block in `compileGrokBrief` (boundary ⚠ mandatory, 90-word budget) | `compile-grok-brief.ts` |

### P1 — Autonomy and persistence

| # | Task | Files |
|---|------|-------|
| 6 | Roster + registry lines injected into auditor evidence; ensemble-dilution clause in the duplex prompt | `llm-assessment.ts` |
| 7 | `npc_state_changes` schema + routing through write-back staging (knowledge = human-always) | `llm-assessment.ts`, `memory-writeback.ts`, `preflight.ts` |
| 8 | Eval `ensemble/` goldens: gala fixture (4 active + crowd) asserting roster, cast block, ⚠ lines present, zero boundary violations in brief; family-visit fixture; dilution-correction pair | evals |

### P2 — Stress and polish

| # | Task | Files |
|---|------|-------|
| 9 | Live stress test: the Affalterbach presentation (upcoming in-story — boardroom, multiple AMG executives, Shevchenko) as the first real ensemble scene under the system | operational |
| 10 | Background-crowd conventions (ambient line phrasing, when a background NPC promotes to active mid-scene) | prompts |
| 11 | Registry reconciliation joins the arc-close ceremony (persona engine pass covers NPC VOLATILE fields) | `reconcile-persona.ts` |
| 12 | Scorecard: roster size distribution, cast-block presence rate, knowledge-delta count (should be ≈ 0 per arc), dilution-correction rate | audit script |

## 9. Acceptance criteria

- **Retrieval:** in an ensemble golden case, every active NPC's registry chunk is present in the evidence — via exact-address fetch, adding < 1 s total to preflight.
- **Safety:** across all ensemble goldens and one live gala-class scene, zero knowledge-boundary violations in brief or prose; every family-NPC cast line carries its ⚠, 100% of turns they're active.
- **Autonomy:** in the live stress test, NPCs initiate (a demand, an interruption, an agenda move) without operator steering — and the dilution correction fires if Scarlett's share of the scene collapses, verified once by deliberately writing a passive crowded turn.
- **Persistence:** a played disposition shift (e.g., Karin's skepticism resolving) survives to the next session's brief via the staged delta path — no manual editing.
- **No two-person regression:** all existing goldens stay green; scenes with an empty roster render no cast block and spend zero extra tokens.

## 10. One-line summary

**Give NPCs the three things the two-person stack never built — retrieval priority (a real source role instead of bottom-tier backstory), live state (registry lines with wants, dispositions, and mandatory who-knows-what boundaries), and a survival path for changes (staged deltas, with knowledge changes human-gated because stealth canon is unrecoverable) — surfaced as a budgeted Scene Cast block that hands Grok pressure instead of scripts, while the duplex auditor guards the one thing that must not change: Scarlett owns the scene.**

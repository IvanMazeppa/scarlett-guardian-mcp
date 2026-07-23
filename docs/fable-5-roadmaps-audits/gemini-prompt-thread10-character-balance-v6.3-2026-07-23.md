# Prompt for Gemini — Thread 10 Character Balance overcorrection (v6.3 solution pack)

**Date:** 2026-07-23  
**Audience:** Gemini / Sol / operator paste into Grok Project  
**Repo paths:** `rag-memory-mcp/docs/instructions/…` and Guardian brief code  

---

## 0. Plain English — what happened and what we are doing

### The problem (Thread 10)
Scarlett became **hollow / extremely passive / parroting**. Root cause diagnosed: **Character Balance was repeated ~4 times per turn**:

1. Agent instructions (v6.2 had a full CB section)  
2. Project instructions (v6.2 had a full CB section)  
3. Skill (v2.4 full CB)  
4. Guardian preflight brief (5-bullet `**CHARACTER BALANCE:**` block every turn)

The model over-optimized for “don’t be bossy / she may be dependent / receiving is valid” and **lost edge, dominance, humour, proactive desire**.

Separately, a preflight showed **Scene Cast: AMG engineers** in a **private bedroom** — wrong cast bleed from paddock/arc pressure, not a “personality system off” issue.

### What we are NOT doing
- **NOT turning Dramaturg off**  
- **NOT turning Serendipity off**  
- **NOT deleting your story, vector store, or feature systems**  
- **NOT permanently deleting v6.2 / Skill v2.4** — they are **preserved** as historical snapshots  

### What we ARE doing (solutions)
1. **Versioned instruction pack v6.3 / Skill v2.5** — thin Agent + thin Project + **one** full CB essay in Skill v2.5.  
2. **Guardian brief** — replace the long CB essay with a **single pointer line** (keeps anti-hollow signal without 5-bullet hammer).  
3. **Private-venue cast guard** — suite/bed/hotel LIVE BEAT suppresses passive Scene Cast (engineers/Shevchenko unless user addresses them).  
4. **Optional sidecar cache refresh** — delete **stale JSON state files only** so next preflight rebuilds dramaturg/serendipity cleanly. That is **cache reset**, not feature disable. Files **regenerate on next turn**.

---

## 1. Clarification: “rm dramaturg / serendipity” is NOT off

| Item | What it is | Effect of deleting the file |
|------|------------|------------------------------|
| `.guardian/dramaturg-context.json` | Cached story-momentum / beat context from prior turns | Next preflight **rebuilds** from arc plan + LIVE BEAT. Dramaturg feature stays **ON**. |
| `.guardian/serendipity-state.json` | Deferred random/NPC world events queue | Next preflight starts a **fresh** serendipity state. Weaver stays **ON**. |
| Code flags `GUARDIAN_DRAMATURG_ENABLED` / serendipity code paths | Feature switches | **Untouched** — still default on |

**Recommended cache refresh (after pulling code, before serious play):**

```bash
cd /home/maz3ppa/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
# Optional — only clears stale turn state, does not disable systems:
rm -f .guardian/dramaturg-context.json .guardian/serendipity-state.json
# Then restart the Guardian process (npm run dev / systemd / whatever you use)
```

If you prefer **never** to touch those files, skip the `rm`. Just restart Guardian so the **code** fix for private-venue cast and the brief one-liner loads. Sidecars will age out as LIVE BEAT stays on Saturday suite.

---

## 2. File map (nothing overwritten as “the only version”)

### Keep (historical)
| File | Role |
|------|------|
| `docs/instructions/Agents/single-scarlett-enforcer-v6.2-character-balance.md` | **Preserved** full v6.2 Agent (includes CB essay) |
| `docs/instructions/project-instructions-single-agent-v6.2-character-balance.md` | **Preserved** full v6.2 Project (includes CB essay) |
| `docs/instructions/skills/scarlett-benjamin-rp-enforcer-character-balance-v2.4.SKILL.md` | **Preserved** Skill v2.4 |

### Use live now (solution pack)
| File | Role |
|------|------|
| `docs/instructions/Agents/single-scarlett-enforcer-v6.3-character-balance.md` | Thin Agent: identity + tools + **edge-keeping center** — **no CB essay** |
| `docs/instructions/project-instructions-single-agent-v6.3-character-balance.md` | Thin Project: memory protocol + lore — **no CB essay** |
| `docs/instructions/skills/scarlett-benjamin-rp-enforcer-character-balance-v2.5.SKILL.md` | **Sole full Character Balance essay** + full Scarlett voice |

Paths are under:  
`/home/maz3ppa/projects/AMG_GT_Black_Prototype/rag-memory-mcp/`

### Guardian code (already in branch)
| Change | Purpose |
|--------|---------|
| Brief: one-line Character pointer, not 5-bullet CB | Stop 4× overcorrection |
| `isPrivateCoupleVenue` in scene-roster | Stop bedroom AMG engineers cast |
| INTEL-1 scene-confidence (prior) | Provisional/save-lag still **on** |

---

## 3. Operator steps in Grok Project (what Maz should do)

1. **Replace live Agent instructions** with contents of **v6.3** Agent file (not v6.2).  
2. **Replace live Project instructions** with contents of **v6.3** Project file.  
3. **Activate Skill v2.5** (`scarlett-benjamin-rp-enforcer-character-balance-v2-5`). Deactivate or stop stacking v2.4 + full v6.2 CB if both were live.  
4. **Restart Guardian** so brief + cast fixes load.  
5. Optionally run the **cache refresh** commands above.  
6. Prefer a **new thread** (or strong OOC reset) so Thread 10’s passive habit is not in-context memory.

**Do not** paste v6.2 Agent + v6.2 Project + v2.5 Skill + old brief — that recreates the 4× hammer.

---

## 4. Target architecture after fix

| Layer | What it may say about Character Balance |
|-------|----------------------------------------|
| Skill v2.5 | **Full essay** (only place) |
| Agent v6.3 | Living center with **edge**; points to Skill for CB rules |
| Project v6.3 | Lore + tools; **no** CB checklist |
| Guardian brief | **One line:** vivid/capable; receiving OK; hollow passivity not OK |
| Guardian auditor | Short Director rules for real erasure/parroting (not a CB essay) |

---

## 5. “AMG engineers in bedroom” — solution path

Not a personality toggle. Scene Cast is **recomputed each preflight** from:

- LIVE BEAT Present  
- user message / Scarlett previous (addressed NPCs)  
- arc / dramaturg cues (passive)  

**Fix in code:** private suite/bed venue → suppress **passive** cast (engineers/Shevchenko unless Benjamin **names** them).

**Operator check after restart:** preflight for duvet/suite scene should **omit Scene Cast** or show no engineers. If engineers remain, paste that preflight and LIVE BEAT Present line for debug — likely old Guardian binary not restarted, or user_message literally mentions engineers.

---

## 6. Ask for Gemini (if continuing the audit)

Please:
1. Confirm v6.3 + Skill v2.5 is the right live stack.  
2. Review Skill v2.5 §8 for residual over-soft language vs hollow-passivity risk.  
3. Do **not** recommend re-adding full CB to Agent, Project, and brief simultaneously.  
4. Optional: propose a one-turn OOC “reset voice” line for Thread 10 without rewriting bible canon.  
5. Treat dramaturg/serendipity as **on** unless Maz explicitly wants them feature-flagged off (he has not asked for that).

---

## 7. Money / continuity note

This pack is **versioned solutions**, not deletion of paid work:

- Old v6.2 / v2.4 files remain on disk and in git history.  
- Dramaturg + serendipity features remain on.  
- Only **duplicate prompting** and **stale cast bleed** are being fixed.  
- Story state (Saturday suite current-state) is separate; vector reindex may still be pending OpenAI 500s — LIVE BEAT from **disk** still works without reindex.

---

## 8. Copy-paste activation summary for Grok

```
LIVE STACK (Thread-10 fix):
- Agent: single-scarlett-enforcer-v6.3-character-balance.md
- Project: project-instructions-single-agent-v6.3-character-balance.md
- Skill: scarlett-benjamin-rp-enforcer-character-balance-v2-5
- Guardian: restart after pull; optional rm .guardian/dramaturg-context.json and serendipity-state.json (cache only)
- Do NOT also load v6.2 full Character Balance sections
```

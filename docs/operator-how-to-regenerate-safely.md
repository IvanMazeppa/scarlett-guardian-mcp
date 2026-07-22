# How to regenerate safely (Operator runbook)

**Plan:** `docs/fable-5-roadmaps-audits/wp-ops-revision-and-archive-plan-2026-07-22.md`  
**Interim until OPS-REV-1+ code ships.** Disk LIVE BEAT (`current-state.md`) remains ground truth. Staged updates are not live until you approve them.

---

## Three ways Scarlett’s reply gets rewritten

| Path | What you did | Safe habit |
|------|----------------|------------|
| **A. Edit Benjamin** | Edit your user bubble → forces new Scarlett reply | Keep full IC (or IC + short OOC note). Expect a new preflight. Check staged queue after. |
| **B. UI Regenerate** | Regenerate on Scarlett’s bubble only | Same scene. Prefer no new “travel” claims. Bridge should post the **final** substantial reply (WP-R1 floor). |
| **C. Later OOC rewrite** | New short message: “make her softer…” | Use the **prose_revision** template below. Prefer **no tools**. Never use rewrite text alone as `user_message` for a full IC preflight. |

---

## Paste templates

### C1 — Prose revision, no tools (preferred for tiny nits)

```text
OOC ONLY — REWRITE REQUEST (no scene advance)

- Do NOT advance time, location, inventory, or relationships.
- LIVE BEAT stays exactly as current-state / last approved scene.
- Rewrite Scarlett's PREVIOUS IC reply only: [1–3 bullets of what to change].
- Do not call MCP tools. Pure OOC prose edit of the last Scarlett message.

*****
[optional: paste Benjamin's unchanged IC turn if the UI needs a body]
```

### C2 — Prose revision if the model must preflight

```text
OOC ONLY — REWRITE REQUEST (no scene advance)
TURN_KIND: prose_revision

- user_message for preflight = Benjamin's ORIGINAL IC turn (paste below), not this meta text alone.
- scarlett_previous_message = full Scarlett reply being revised.
- recent_context = one line of CURRENT live beat only.
- No scene_transition. No memory write. No multi-scene jump.

Change requests: [bullets]

*****
[paste original Benjamin IC turn]
```

### A — After editing Benjamin (optional OOC top)

```text
OOC: TURN_KIND: ic_regen — Benjamin turn edited; regenerate Scarlett against LIVE BEAT.
If you stage a scene transition, it is for human review only — do not claim current-state updated.

*****
[edited Benjamin IC]
```

### Hard OOC systems (no Scarlett prose)

```text
OOC SYSTEMS ONLY — answer OOC. Prefer guardian_ooc_consult if available.
Do not write IC Scarlett. Do not stage memory.
Question: [...]
```

---

## OOC prefix version

Prefer **`rag-memory-mcp/docs/single-agent-ooc-prefix-v5.txt`** for Thread 9+ (revision contract).  
v4 remains valid for pure IC days; v5 is additive.

---

## Staged-update recovery (after any regen)

From Guardian package root:

```bash
cd ~/projects/AMG_GT_Black_Prototype/scarlett-guardian-mcp
npm run review:staged -- list
npm run review:staged -- diff --id pending-...
# keep
npm run review:staged -- approve --id pending-...
# or drop
npm run review:staged -- reject --id pending-... --reason "regen junk / wrong beat"
```

Doc: `docs/review-staged-cli.md`.

**Rules of thumb**

- **prose_revision / UI regen:** if a stage appears that moves location, **reject** unless you meant a real scene change.
- **ic_regen (edited Benjamin):** a held stage for a real move is OK — read the full diff before approve.
- LIVE BEAT on disk does **not** change until approve (or manual rewrite + reindex).

---

## LIVE BEAT lag (multi-scene play without save)

If Guardian blocks with “return to [old location]” but the thread already moved:

1. Do **not** force the model to invent travel against the block without fixing state.
2. Operator force-sync: rewrite `project_source_files/current-state.md` (+ event-log append) to the true beat; `npm run index:changed` for those files; re-preflight.
3. Full multi-beat catch-up product is **OPS-REV-5** (later) — manual rewrite remains valid emergency path.

---

## Duplex / bridge notes

- Short OOC (“Understood”, tiny rewrite notes) should **not** become Scarlett’s previous message (WP-R1 ≥200 chars + structure).
- After a good regen, the bridge should POST the **final** bubble; if the next preflight critiques the wrong reply, wait for a full IC Scarlett message or clear duplex cache (ops only).
- Cross-thread seed is being removed in OPS-REV-2; until then, prefer one active RP tab.

---

## Archival (until ARCH-1A ships)

Raw Grok threads are **not** fully auto-backed. See `docs/fable-5-roadmaps-audits/ideas-parking-raw-thread-export-2026-07-21.md`.

Interim: export long threads before long gaps; after major set pieces, ensure **event-log + current-state** capture durable beats.

---

## What “ready to build” means

| WP | Status | Who |
|----|--------|-----|
| Plan | ACK | Operator + Sol plan |
| **OPS-REV-0** | docs (this runbook + v5) | Grok Build / any executor |
| **OPS-REV-1+** | code | Only after Operator says **go** and names the WP (Sol or Grok) |
| ARCH-1A+ | later | After revision reliability v1 or when archival is prioritized |

Saying “Accept plan” or “ready to build” does **not** authorize implementing OPS-REV-1–5 or ARCH without a named WP and go.

# Ideas parking — raw Grok thread export / anti-truncation

**Date:** 2026-07-21  
**Status:** collect / backlog — **not** scheduled as R1–R4; open a WP when operator prioritizes  
**Trigger:** Grok platform **truncated Thread 7** before the operator could export it. Typical RP content; likely platform error. Loss of raw transcript before summarisation is a **critical archival risk**.

---

## Current state — are raw threads saved?

| Store | What is kept | What is **not** kept |
|-------|----------------|----------------------|
| **Grok.com platform** | Live UI thread (can truncate/delete without warning) | No operator-owned backup |
| **Guardian preflight reports** | Per-turn `user_message`, brief, assessment, tool timings under `docs/guardian-reports/` | Full multi-turn Scarlett/Benjamin dialogue as continuous narrative |
| **Duplex cache** | Last Scarlett bubble only (TTL, in-memory; WP-R1 last-good GM snapshot is still only the latest good reply) | Full thread history |
| **RAG vector store** | Indexed **summaries / current-state / event-log** after human or write-back processing | Raw platform JSONL of every bubble |
| **project_source_files** | Canon after curation | Not automatic raw export |
| **TM “Enhanced Grok Export” (legacy)** | Manual full-thread download (see `docs/Enhanced Grok Export v2.4-*.txt`) | Not wired into Guardian v2 shadow bridge; not automated |

**Conclusion:** Today there is **no reliable automated offline archive of full Grok RP threads**. Loss on the platform before export/summary is a real failure mode.

---

## Desired outcome

1. **Operator-owned** full-thread export (markdown or JSONL) on a short cadence (per session end, or continuous append).  
2. Survive platform truncation, browser crash, or account UI glitches.  
3. Feed later **summarisation → event-log / current-state** without re-typing.  
4. Optional: index-ready staging of exports under `backups/threads/` (not necessarily the live vector store until reviewed).

---

## Candidate approaches (design only)

| Option | Notes |
|--------|--------|
| **A. Revive/modernize Enhanced Grok Export userscript** | Reuse selectors from legacy export + v2.1 bridge DOM recon; menu “export thread now” + optional auto-save on unload |
| **B. Extend Guardian Bridge v2** | Beside duplex POST, periodically append new bubbles to a local file via download or `GM_download` / File System Access API |
| **C. Server-side capture** | If preflight always receives full duplex + user_message, write an append-only `thread-transcripts/{thread_key}.jsonl` on Guardian (still misses turns without preflight) |
| **D. Hybrid** | Bridge exports full DOM thread; Guardian logs every preflight turn pair as backup spine |

Recommended first product: **A or B (client export)** + optional **C spine** for preflight turns only.

---

## Suggested future WP (D10-sized, when prioritized)

| ID | Title | Acceptance |
|----|-------|------------|
| **ARCH-1** | Thread export userscript or bridge menu: full visible thread → `.md` download | One-click export of Thread N; file opens with all human + assistant bubbles in order |
| **ARCH-2** | Auto last-good: warn if thread bubble count drops vs GM storage | Pill warns “possible truncation” |
| **ARCH-3** | Optional Guardian append-only turn log from preflight | JSONL line per preflight with user_message + duplex text |

Do **not** block R2–R4 / Affalterbach on this; schedule after live duplex stability (R1) or whenever operator hits another near-miss.

---

## Operator interim practice

Until ARCH-1 ships:

1. Export or copy long threads **before** long gaps / platform weirdness.  
2. Prefer running the legacy export script when available for completed arcs.  
3. After major set pieces, ensure **event-log + current-state** capture the durable beats (already the canon path).  
4. Keep Guardian reports as partial recovery (Benjamin turns + some duplex), not full Scarlett prose archive.

---

## One-line summary

**Raw Grok threads are not fully offline-backed today; platform truncation can erase play before summary — park a full-thread export solution (TM export / bridge auto-save / preflight JSONL) as an explicit backlog item.**

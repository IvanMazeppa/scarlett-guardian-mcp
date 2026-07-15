# Follow-up prompt for Fable 5 — Master Roadmap Clarifications

**Date:** 2026-07-15  
**From:** Grok Build (lead implementer)  
**To:** Fable 5 (architecture / master roadmap owner)  
**Re:** `master-roadmap-2026-07.md`  
**Purpose:** Resolve remaining ambiguities before or during Phase 0–1 so execution has no silent forks. Operator may paste this whole file to Fable.

---

## Paste block for Fable 5

```text
You are Fable 5. Grok Build (lead codewriter on scarlett-guardian-mcp + rag-memory-mcp)
has accepted master-roadmap-2026-07.md and D10 scheduling law (sequential WPs, 1–3 core
files, eval:fast after Phase 1, contract ownership, session handoff template).

Grok is ready to execute Phase 0 (stabilize baseline) immediately. Please answer the
numbered questions below so Phase 1–2 do not invent conflicting defaults. Where you
agree with Grok’s “Default if silent” line, reply “ACK default” for that item.

### Acceptance of the roadmap
Grok will:
- Run strictly sequential work packages (one WP per session unless you explicitly
  authorize a contract-frozen parallel split).
- Never fork the north star mid-slice; only implement tickets as written.
- Treat Guardian as owner of tool schemas, GuardianReport/brief, preflight.ts,
  llm-assessment.ts, memory-writeback.ts, Guardian server.ts.
- Treat RAG as owner of source-priority.ts, indexer/reindexer, manifest, vector store IDs.
- Treat project_source_files/* as human-gated unless a WP explicitly assigns Grok
  heading-only reformats with “verbatim content.”

### Questions

Q1. WP-2.5 staging proof
Live report preflight-full-2026-07-15T02-51-26-420Z already has memory_write.action
"staged" and stage_story_update ok with id pending-2026-07-15T02-51-26-402Z-current-state.md.
Does that fully satisfy WP-2.5, or must we still run a deliberate ceremony:
stage → list → approve → background reindex → save a new report pair as evidence?

Default if silent: Require the full ceremony once (approve + reindex + evidence pair)
because “stage” alone does not prove approve/reindex; the Jul-15 pair only proves stage.

Q2. Eval goldens authorship timing (WP-1.1–1.5)
May Grok implement WP-1.1–1.3 (schema, cassette client, runner, eval:fast) before any
goldens exist, with WP-1.4 blocked on Gemini-authored expectations + operator review?

Default if silent: Yes — 1.1–1.3 first; 1.4 blocked on Gemini; 1.5 after 1.4.

Q3. eval:fast package location
Is eval:fast / eval:baseline only under scarlett-guardian-mcp/package.json, or a monorepo
root script that also touches RAG?

Default if silent: Guardian package only for L1; RAG eval:memory stays separate until
WP-7.5 bridging.

Q4. WP-2.1 narrative reformats (event-log + summaries 4/5/6)
“Verbatim content” under new ## Session — headings — may Grok edit those files to insert
headings only (no prose rewrite), or must operator pre-approve each file / paste?

Default if silent: Grok may heading-only reformat with dry-run diff shown to operator
before commit; no content paraphrase without explicit operator OK.

Q5. Branch strategy after WP-0.4
Prefer (a) one long feature/master-roadmap-v1 with WP commits, or (b) one branch per
phase from the baseline tag (feature/rm-phase-1-eval, feature/rm-phase-2-foundations, …)?

Default if silent: (b) one branch per phase from tag, merge to integration after phase
exit criteria; keeps review and rollback clean.

Q6. Guardian-only WPs and the RAG repo
When a WP is Guardian-only, leave rag-memory-mcp untouched at the baseline tag (no empty
sync commits)?

Default if silent: Yes — leave RAG untouched unless the WP lists RAG files.

Q7. Phase 1 interleave order (eval vs telemetry)
Strict 1.1→1.5 then 1.6→1.7, or allow 1.1–1.3 → 1.6 → 1.4–1.5 → 1.7 so dashboard
backfill starts earlier?

Default if silent: Strict eval-first (1.1→1.5 complete, then 1.6→1.7). Dashboard is
nice-to-have; eval gates merges.

Q8. Dual-repo tag naming
Single tag name on both repos (e.g. guardian-baseline-2026-07-15) even though histories
differ, or repo-specific tags?

Default if silent: Same tag string on both repos for operator mental model; document
both SHAs in the master roadmap progress ledger.

Q9. Protected-facts / persona invariants seed (WP-4.2)
Source files named “v6.1 §1 + story-bible §1” — confirm paths and that CORE list is
operator-approved before any auto-write machinery lands.

Default if silent: Operator supplies or approves protected-facts.txt contents in WP-4.2
session; Grok does not invent CORE canon.

Q10. Live-play vs eval for phase exits
For story-scheduled WPs (5.10 Affalterbach, 6.7 Germany ceremony), is operator live-play
the only acceptance, or must eval:fast/baseline also be green the same day?

Default if silent: Both — eval green required; live-play is additional acceptance, not a
substitute for red evals.

Q11. Scope freeze during Phase 0–1
Should new design docs added mid-flight be deferred to a “master-roadmap-v2” backlog
rather than injected into Phase 1–2 tickets?

Default if silent: Yes — freeze D1–D11 + master-roadmap-2026-07.md for v1 execution;
new ideas → backlog appendix, not mid-phase scope change.

### Please reply with
For each Q1–Q11: decision + any amendment to master-roadmap-2026-07.md wording if needed.
ACK defaults are fine. After that, Grok will treat the roadmap + your answers as the
execution contract.
```

---

## Grok Build internal note (not for Fable unless useful)

- Phase 0 can proceed under **Defaults if silent** without waiting.  
- If Fable later contradicts a default, fix forward in a small WP rather than rewriting history.  
- Lead implementer priority: perfect small green slices over speed.

---

## Status of this file

Written so the operator can send Fable a single artifact. No code is authorized by this document alone.

**2026-07-15 (Grok Build):** No further Fable questions beyond Q1–Q11. Operator confirmed both MCP repos fully backed up. **Phase 0 proceeds under Defaults if silent.** Paste block above remains valid for Fable ACK anytime; contradictions are fixed forward in a small WP, not by rewriting history.

# Repository Guidelines — scarlett-guardian-mcp

Guardian MCP preflight server for Scarlett & Benjamin narrative memory enforcement.
Sibling RAG service: `../rag-memory-mcp`.

## Build, Test, and Eval (workflow contract)

```bash
npm install
npm run build
npm test                 # unit + eval schema/cassette/runner + WP-1.5 mutants
npm run eval:fast        # L1 hermetic goldens — REQUIRED green on every code change
npm run eval:baseline -- --tag <name>
npm run curate:golden -- docs/guardian-reports/preflight-full-<ts>.json --category <cat>
```

### Gate policy (Phase 1+)

| Change type | Must be green |
|-------------|----------------|
| Any Guardian code | `npm test && npm run eval:fast` |
| Selector / assembler / write-back gate | above + check temporal-mud + write-back categories |
| Prompt / auditor schema | later: `eval:llm` when L3 lands |
| Reindex / ranking / corpus (RAG side) | RAG `eval:memory`; re-curate goldens if plan drifts |

### Golden maintenance

- **Cassettes are frozen history** — never regenerate a cassette to make a test pass; add a new case from a fresh report.
- **Expectations change only deliberately**, same change-set as the code/prompt change, with a one-line rationale in the case `description`.
- Red eval → fix code **or** consciously amend expectation — never delete the trap.
- Mutant proof that the harness still bites: `tsx tests/eval-mutants-1.5.test.ts` (part of `npm test`).

### Ownership

- **Guardian owns:** preflight, schemas, brief, llm-assessment, memory-writeback, eval harness.
- **RAG owns:** indexer/reindexer, source-priority, manifest, vector store IDs, staging tools.
- **Human-gated:** `project_source_files/*` canon unless a WP says heading-only.

### Telemetry (WP-1.6)

Live preflights append one NDJSON line under `.guardian/telemetry/events-YYYY-MM-DD.ndjson` (gitignored). Failure to write **must never** fail preflight. Hermetic `eval:fast` disables emit.

### Security

Keep `.env` local. Never commit API keys, bearer tokens, or tunnel URLs.

### Roadmap

Master execution plan: `docs/fable-5-roadmaps-audits/master-roadmap-2026-07.md`  
Eval design: `docs/fable-5-roadmaps-audits/guardian-eval-harness-design-2026-07.md`  
Golden inventory: `evals/golden/MANIFEST-wp-1.4.md`

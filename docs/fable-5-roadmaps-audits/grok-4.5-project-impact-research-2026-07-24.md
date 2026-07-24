# Grok 4.5 — project impact research for Guardian + RAG MCP

**Date:** 2026-07-24  
**Scope:** Grok 4.5 research framed exclusively around the Scarlett & Benjamin roleplay project, `scarlett-guardian-mcp`, and `rag-memory-mcp`  
**Status:** Research and potential improvements only; no implementation authorized

## Executive summary

Grok 4.5 became the active Grok model across grok.com, X, iOS, and Android on 2026-07-22.

xAI positions it as its most capable model for:

- coding;
- agentic tasks;
- engineering;
- knowledge work;
- longer conversations;
- clearer and more reliable everyday answers.

The model is available through:

- grok.com and the Grok applications;
- Grok Build;
- Cursor;
- the xAI API.

For this project, the immediate significance is that Grok 4.5 can replace Grok 4.3 at the live novelist/chat layer without requiring changes to either MCP server.

The two-server architecture remains useful:

- `scarlett-guardian-mcp` remains the preflight, continuity-audit, LIVE BEAT, duplex, and human-gated write-back layer.
- `rag-memory-mcp` remains the durable external memory, vector retrieval, live-state, staging, and indexing layer.
- Grok 4.5 remains the interactive novelist that consumes the Guardian brief and writes Scarlett.

Grok 4.5's release does not itself synchronize Grok chat with local files, resolve save-file lag, identify regenerated branches, approve canon, replace thread archival, or make RAG unnecessary.

Its principal potential value is better use of the architecture already built:

- stronger instruction retention;
- better tool and argument handling;
- better synthesis of current scene and retrieved history;
- longer coherent threads;
- native image understanding;
- more capable coding and system-maintenance work.

These are capabilities or vendor claims, not proof of improved Scarlett roleplay. Roleplay quality must be established from project-specific observation.

## 1. Verified release status

### Consumer Grok rollout

xAI announced on 2026-07-22 that Grok 4.5 now powers Grok on:

- grok.com;
- X;
- iOS;
- Android.

xAI describes it as its most capable model and states that it:

- follows what the user is asking more closely;
- tracks longer conversations;
- gives clearer and more reliable answers;
- reasons more efficiently on harder questions;
- can complete knowledge-work tasks from start to finish.

These are xAI's product claims. They have not been independently validated for this specific roleplay project.

### Developer availability

Grok 4.5 is also available through:

- Grok Build;
- Cursor desktop, web, iOS, CLI, and SDK;
- the xAI API and console.

The official API model name is:

```text
grok-4.5
```

Official aliases include:

```text
grok-4.5-latest
grok-build-latest
```

## 2. Official technical specifications

### Modalities

Official model documentation lists:

- text input;
- image input;
- text output.

The model does not produce image output through this text model endpoint.

### Context window

Official context window:

```text
500,000 tokens
```

This is substantial context capacity, but it is smaller than the 1,000,000-token context listed for Grok 4.3 in xAI's pricing documentation.

Context-window capacity does not guarantee that every token receives equal attention. It also does not guarantee that the Grok platform always supplies the model with the complete visible thread.

### Knowledge cutoff

xAI's Grok 4.5 developer page lists:

```text
2026-02-01
```

as the model's knowledge cutoff.

Current information can be obtained through supported search tools where available.

### Reasoning

Grok 4.5 supports:

- `low`;
- `medium`;
- `high`.

Official documentation states:

- `high` is the default;
- reasoning cannot be completely disabled.

xAI describes the settings as:

- **Low:** latency-sensitive agentic work and simple tool calls.
- **Medium:** complex analysis where some additional latency is acceptable.
- **High:** difficult multi-step reasoning, mathematics, and complex problems.

The Grok consumer interface may not expose the same controls as the API.

### Function calling

Grok 4.5 officially supports function calling.

The model can:

1. inspect a request;
2. select a defined function/tool;
3. produce structured arguments;
4. receive the tool result;
5. continue reasoning or return an answer.

This capability is directly relevant to calling `guardian_memory_preflight` and `guardian_ooc_consult`.

### Parallel function calling

Official xAI documentation states that parallel function calling is supported and enabled by default in the API.

It can be disabled with:

```text
parallel_tool_calls: false
```

Parallel function calls are useful only when operations are independent.

For normal roleplay, the existing architecture gives Grok one Guardian preflight call and lets Guardian orchestrate its own RAG work. Calling Guardian and raw RAG tools in parallel would duplicate work and could return competing evidence.

### Structured outputs

Grok 4.5 officially supports structured outputs.

This is relevant to:

- machine-readable evaluations;
- test result schemas;
- architecture reports;
- optional provider experiments for Guardian assessment;
- extracting reviewed visual observations.

It is not intended for Scarlett's final first-person prose.

### Built-in tools

xAI documents support for:

- web search;
- X search;
- code execution;
- file/collection search;
- custom function calling.

Built-in tool invocations can incur separate charges in addition to token costs.

### Throughput

xAI's release material advertises approximately:

```text
80 output tokens per second
```

Actual latency depends on:

- reasoning effort;
- prompt size;
- tool calls;
- service load;
- network conditions;
- output length.

### Rate limits

The official Grok 4.5 model page lists:

- 150 requests per second;
- 50,000,000 tokens per minute.

These are API-level published limits and are not equivalent to Grok consumer subscription allowances.

### API regions

The official model page lists:

- `us-east-1`;
- `us-west-2`.

## 3. Official API pricing

For prompts below 200,000 tokens:

- input: **$2.00 per million tokens**;
- cached input: **$0.30 per million tokens**;
- output: **$6.00 per million tokens**.

For prompts at or above 200,000 tokens:

- input: **$4.00 per million tokens**;
- cached input: **$0.60 per million tokens**;
- output: **$12.00 per million tokens**.

When a prompt crosses the 200,000-token threshold, the higher rate applies to all tokens in that request.

The 500,000-token window therefore should not be interpreted as an instruction to fill every request with hundreds of thousands of tokens.

xAI recommends using a stable prompt-cache key for conversations so related requests can be routed for reliable cache hits.

xAI also recommends context compaction for long agent loops.

These API costs do not describe Grok consumer-chat subscription accounting or Cursor/Grok Build token allowances.

## 4. Published capability evidence

### xAI and Cursor claims

xAI and Cursor state that Grok 4.5 was trained for:

- coding;
- software engineering;
- science;
- mathematics;
- professional knowledge work;
- agentic tool use;
- long-running problem solving.

Cursor states that training included large amounts of developer-agent interaction data and realistic reinforcement-learning environments.

According to Cursor, those environments trained the model to:

- investigate problems;
- use tools;
- recover from mistakes;
- verify results;
- complete long-running tasks.

These capabilities are highly relevant to maintaining and extending the two MCP repositories.

### Official coding benchmarks

xAI reports:

- **83.3%** on Terminal-Bench 2.1;
- **64.7%** on SWE-Bench Pro.

Benchmark results are sensitive to the model harness, tools, reasoning configuration, and task setup. They demonstrate coding/agent capability, not roleplay quality.

### Independent Artificial Analysis results

Artificial Analysis reports that Grok 4.5:

- scored **54** on its Intelligence Index;
- improved **16 points** over Grok 4.3;
- ranked fourth at the time of the report;
- performed strongly on agentic knowledge-work and coding tests;
- scored **76** on its Coding Agent Index in the Grok Build harness;
- used approximately **1.9 million tokens** across that Coding Agent Index evaluation;
- sat on a strong cost-versus-performance frontier.

Artificial Analysis reported a measured cost of approximately **$2.49 per task** in its coding-agent evaluation.

These numbers are useful evidence for Grok 4.5 as a codewriter and knowledge-work model. They are not direct evidence for:

- first-person narrative quality;
- emotional nuance;
- stable fictional characterization;
- long-form roleplay continuity.

Independent evaluations continue to show that hallucination and expert-level reliability are not solved. External grounding and human review remain necessary.

## 5. Current project architecture

### Grok's role

In the current design, Grok is responsible for:

- receiving Benjamin's latest turn;
- calling Guardian before in-character prose;
- supplying the exact previous Scarlett reply when required;
- reading the streamlined Guardian brief;
- writing Scarlett in first-person present tense;
- calling OOC consultation for administrative continuity questions.

Grok 4.5's consumer rollout changes the model performing this role.

### `scarlett-guardian-mcp`

Guardian remains responsible for:

- mandatory preflight;
- LIVE BEAT retrieval;
- current-scene continuity;
- deep-memory query orchestration;
- previous-Scarlett duplex assessment;
- Director's Correction;
- save-lag handling;
- scene roster;
- dramaturg context;
- serendipity selection;
- memory-update decisions;
- staged and human-reviewed canon changes;
- reports, telemetry, and evaluation.

Guardian currently uses an OpenAI model for its internal structured auditor. Grok 4.5 becoming the Grok chat model does not automatically change the Guardian auditor.

### `rag-memory-mcp`

RAG remains responsible for:

- the indexed narrative corpus;
- OpenAI Vector Store retrieval;
- source roles and ranking;
- direct disk LIVE BEAT access;
- current-state and event-log storage;
- staged story updates;
- approval and rejection;
- reindexing;
- source manifests.

Grok 4.5 becoming the chat model does not automatically change the vector store, index, ranking, or local corpus.

### Human responsibility

The human operator remains responsible for:

- deciding what play is canonical;
- approving or rejecting staged changes;
- choosing instruction versions;
- resolving ambiguous revisions;
- reviewing image-derived facts;
- authorizing reindexing;
- deciding whether a model-generated proposal reflects Scarlett correctly.

## 6. Immediate project benefits requiring no code

### 6.1 Replacement at the live novelist layer

Grok 4.5 can be used immediately as the live Scarlett model while keeping both MCP servers unchanged.

This provides a clean opportunity to determine how much behavior improves from the model replacement alone.

Changing prompts, retrieval, and the model simultaneously would make attribution difficult.

### 6.2 Longer conversation tracking

xAI explicitly claims better tracking of longer conversations.

If that claim holds in this project, relevant observable effects would include:

- retaining recent physical positioning for more turns;
- retaining operator corrections;
- distinguishing current scene from earlier beats;
- remembering unresolved dialogue within the thread;
- preserving established wording and emotional associations;
- carrying the exact previous Scarlett response into Guardian.

These are potential observable outcomes, not established results.

Thread archival remains necessary because:

- platform truncation can still occur;
- context-window size is not an operator-owned backup;
- a new thread does not inherit durable local canon automatically;
- the model cannot inspect local files unless tools provide them.

### 6.3 Better Guardian tool compliance

Grok 4.5's official agentic and function-calling capabilities are directly relevant to:

- calling `guardian_memory_preflight` before prose;
- constructing complete tool arguments;
- copying `scarlett_previous_message` accurately;
- using `recent_context` appropriately;
- reading and applying the returned brief;
- using `guardian_ooc_consult` only when needed;
- recovering after a failed call.

Improved compliance must be measured through reports and `duplex_source`; it should not be assumed from release claims.

### 6.4 Better synthesis of Guardian evidence

Grok 4.5 has more reasoning and context headroom than the project's final Guardian brief requires.

It may be able to better reconcile:

- current LIVE BEAT;
- Benjamin's newest message;
- Scarlett's previous response;
- recent emotional context;
- historical relationship precedents;
- character instructions;
- location information;
- one visual reference.

The correct first use of the larger model is better synthesis of selected evidence—not direct injection of the complete corpus.

### 6.5 Potential reduction in 4.3-specific prompt pressure

The current instruction stack contains repeated safeguards created because Grok 4.3 was unreliable at:

- preserving tool order;
- retaining instructions across long threads;
- supplying exact duplex arguments;
- resisting local tool-use attractors;
- maintaining character balance;
- distinguishing live state from historical memory.

Grok 4.5's official instruction-following, long-conversation, and agentic claims justify testing whether some repetition is no longer required.

This does not justify removing the Guardian gate.

Potential candidates for isolated testing include:

- repeated per-turn OOC enforcement prefixes;
- duplicate tool-order language across Agent, Project, and Skill;
- forced acknowledgement bootstraps;
- duplicate personality/Character Balance instruction blocks;
- repeated failure-recovery text.

Only one layer should be changed at a time, with rollback copies retained.

### 6.6 Reasoning selection

At the API level:

- low reasoning is suitable for latency-sensitive tool calls;
- medium is intended for more complex analysis;
- high is the default for difficult reasoning.

Project-relevant uses:

- routine continuous roleplay could be evaluated at low or medium;
- OOC continuity analysis could use medium or high;
- architecture and coding work could use high;
- exact canon reconciliation could use high.

The consumer Grok platform may manage reasoning automatically and may not expose explicit effort controls.

## 7. Potential improvements to roleplay quality

There is no official or independent benchmark proving that Grok 4.5 produces better Scarlett prose.

The following are project-specific qualities to observe:

- first-person voice stability;
- warmth and relationship specificity;
- emotional association with previous events;
- correct use of Swedish language and endearments;
- natural distinction between public-professional and private registers;
- better handling of receptivity without treating it as passivity;
- reduced mechanical paraphrasing;
- better use of retrieved precedents;
- more natural forward scene movement;
- less generic reassurance;
- fewer unsupported historical claims;
- fewer unnecessary Director corrections.

Any improvement in these areas must be established through actual project turns or controlled evaluation.

The release's coding and knowledge-work benchmarks must not be presented as proof of creative-writing quality.

## 8. Potential instruction-stack improvements

### Keep as invariants

The following remain necessary regardless of model:

- one Guardian preflight before normal in-character prose;
- exact previous Scarlett response for full duplex after the first turn;
- LIVE BEAT authority for current location, time, cast, and physical state;
- first-person present Scarlett POV;
- no reading Benjamin's private thoughts;
- no raw tool or JSON language in prose;
- no unsupported canon invention;
- human approval for canon changes;
- staged write-back;
- save-lag and revision safeguards;
- local thread archival.

### Candidates for measured simplification

Potential 4.3-era prompt debt includes:

- the same mandatory-preflight warning repeated in multiple instruction files;
- repeated “CRITICAL,” “ABSOLUTE,” and “UNFORGIVABLE” language;
- multiple full personality summaries;
- multiple copies of Character Balance;
- per-turn OOC enforcement reminders;
- forced acknowledgement phrases at thread start;
- duplicated tool-skip recovery procedures.

The factual basis for testing simplification is:

- xAI claims stronger instruction adherence;
- xAI claims better long-conversation tracking;
- the model was trained for agentic tool use.

The factual limit is:

- these claims have not yet been validated on this project.

### Prompt-stacking risk

A stronger instruction-following model may obey duplicated instructions more strongly.

Therefore Grok 4.5 could reduce the need for repetition while simultaneously making unresolved duplication more influential.

The appropriate approach is deduplication by controlled experiment, not adding more 4.5-specific instruction layers.

## 9. Guardian MCP improvement opportunities

### 9.1 Keep the existing Guardian boundary

The Guardian abstraction remains appropriate:

- Grok makes one normal preflight call.
- Guardian performs retrieval and audit work.
- Grok receives one prose-facing brief.

Parallel function calling should not be used to have Grok call Guardian and raw RAG simultaneously during routine play.

### 9.2 Evaluate better argument fidelity

Measure whether Grok 4.5 improves:

- caller-provided duplex rate;
- complete previous-message length;
- correct `user_message`;
- useful `recent_context`;
- correct use of `force_full_retrieval`;
- first-call compliance.

If caller fidelity improves consistently, reliance on the browser bridge may decrease. The bridge should remain available until data confirms that.

### 9.3 Potentially richer selected briefs

Grok 4.5 has enough context for a larger Guardian brief.

A larger brief should be considered only if it contains additional selected evidence, such as:

- explicit fact provenance;
- clearer live-versus-historical separation;
- one additional relevant relationship precedent;
- more complete reviewed location detail;
- a protected correction section.

It should not contain:

- complete raw RAG output;
- tool-call traces;
- every retrieved chunk;
- repeated personality essays;
- unreviewed speculative material.

Current brief length should remain the baseline until comparative evidence shows that a larger selected brief improves prose.

### 9.4 Optional Grok 4.5 auditor experiment

Grok 4.5's API supports:

- structured outputs;
- reasoning controls;
- function calling.

It could therefore technically serve as an alternative Guardian auditor.

That would require:

- a provider abstraction;
- xAI API configuration;
- strict schema validation;
- timeout and error normalization;
- separate telemetry;
- frozen-cassette comparison;
- rollback to the current auditor.

This is an optional experiment, not an immediate consequence of the chat rollout.

The chat model and auditor have different jobs. Success as Scarlett does not prove suitability as Guardian, and coding benchmarks do not prove continuity-audit accuracy.

### 9.5 Optional final-prose evaluation

Structured outputs could be used to evaluate final Scarlett prose for:

- current location/time/cast;
- identity continuity;
- unsupported historical claims;
- tool/meta leakage;
- POV;
- Character Balance;
- forward motion;
- correct use or omission of Director correction.

Such an evaluator should remain advisory and should be calibrated against human judgment.

Grok should not be the sole independent judge of its own output.

## 10. RAG MCP improvement opportunities

### 10.1 No immediate migration required

Grok 4.5 does not require changes to:

- OpenAI Vector Stores;
- indexing;
- source priorities;
- chunking;
- current-state storage;
- staged updates;
- review/approval;
- event-log management.

### 10.2 Better use of retrieved context

The likely first benefit is not more RAG results. It is better synthesis of the results Guardian already selects.

The project should continue to favor:

- current-state evidence for the present;
- event-log and summaries for chronology;
- story bible and emotional milestones for identity/history;
- targeted retrieval for exact facts;
- human-reviewed updates for canon.

### 10.3 Do not place the entire corpus into Grok context

The 500,000-token window does not make vector retrieval obsolete.

Direct corpus injection would:

- increase cost;
- introduce duplicated and superseded material;
- weaken source authority;
- make prompt conflicts harder to diagnose;
- reduce the value of source-role ranking;
- make thread updates cumbersome;
- risk leaking operational documents into prose.

### 10.4 Preserve durable memory across threads

Grok's longer context applies within a conversation context.

RAG remains necessary for:

- new threads;
- long-term chronology;
- operator-owned memory;
- explicit source authority;
- thread loss or truncation;
- reviewed state promotion;
- exact historical recall.

## 11. Multimodal opportunities

### Native image use

Grok 4.5 officially accepts images.

Project-relevant uses include:

- Schloss Lieser interiors;
- castle grounds;
- Black Panther visual references;
- AMG track-day photographs;
- wardrobe references;
- environmental lighting and weather;
- visual flashback anchors.

### Safe visual workflow

1. Attach a relevant image natively to one Grok turn.
2. State that it is visual evidence or mood reference, not automatic canon.
3. Ask Grok to use only visible features.
4. Instruct it not to infer unseen geometry, timeline, identity, or events.
5. If durable, produce a short text caption or location-card proposal.
6. Human-review the text.
7. Only then save/index it through normal corpus workflow.

### What images must not do

Images must not:

- move LIVE BEAT;
- establish story time;
- identify a room with certainty without provenance;
- create unseen doors, corridors, or layouts;
- change Scarlett's body/identity canon;
- automatically update current state;
- be automatically indexed;
- override human-reviewed location cards.

### Location-card production

Grok 4.5 could assist with:

- extracting visible landmarks;
- comparing multiple photos;
- identifying uncertainty;
- drafting navigation-oriented descriptions;
- generating a candidate Markdown location card.

The final card should remain human-reviewed before indexing.

## 12. Coding and operational opportunities

This is the area best supported by published evidence.

Potential uses include:

- implementing narrowly scoped Guardian work packages;
- implementing narrowly scoped RAG work packages;
- tracing cross-repository data flow;
- debugging bridge/duplex behavior;
- writing focused tests;
- maintaining eval goldens;
- investigating save lag;
- adding revision handling;
- building thread archival;
- reviewing staged updates;
- comparing implementation with roadmap acceptance criteria;
- generating engineering evidence documents;
- examining long logs and reports;
- preparing structured plans.

The model's training with Cursor and its agentic benchmark results are directly relevant to these tasks.

### Required project discipline

Higher coding capability does not authorize broader scope.

For this project, Grok 4.5 should still receive:

- one WP at a time;
- explicit allowed files;
- explicit forbidden files;
- frozen acceptance criteria;
- test commands;
- stop conditions;
- no canon edits unless named;
- no reindex unless named;
- no commits unless requested;
- no unrelated cleanup.

This is necessary because a stronger long-horizon codewriter can make larger coherent changes, including changes beyond the intended scope.

## 13. Knowledge-work opportunities

Official and independent results support Grok 4.5 as a knowledge-work model.

Project uses include:

- consolidating roadmap documents;
- comparing implementation with design;
- extracting decisions from long threads;
- preparing WP handoffs;
- summarizing reports;
- converting raw archives into review candidates;
- generating operator checklists;
- producing diagrams and structured documentation;
- reviewing evidence across both repositories.

Generated summaries should not be promoted to canon automatically.

## 14. What the release does not solve

Grok 4.5 does not automatically solve:

- stale `current-state.md`;
- disk/index synchronization;
- multiple-scene LIVE BEAT lag;
- offstage NPC activation from stale state;
- stale dramaturg cache;
- serendipity state crossing scenes;
- UI regeneration identity;
- edited-user branch identity;
- bridge completion ordering;
- wrong-thread duplex cache;
- thread truncation;
- raw-thread archival;
- staged-update approval;
- canon governance;
- prompt duplication;
- incorrect source ranking;
- historical material being mistaken for current state.

These remain architecture and operational concerns.

## 15. Recommended adoption sequence

### Stage 1 — Observe the model replacement

Use Grok 4.5 with:

- the same Guardian build;
- the same RAG corpus;
- the same instruction stack;
- the same bridge;
- the same write policy.

Observe enough turns to separate model improvement from other changes.

Record:

- preflight invocation;
- duplex completeness;
- current scene correctness;
- wrong cast;
- unsupported canon;
- prose warmth and specificity;
- mechanical paraphrasing;
- unnecessary leadership/control;
- use of retrieved precedents;
- Director correction behavior;
- latency;
- operator rewrite rate.

### Stage 2 — Simplify one 4.3 workaround at a time

Potential order:

1. Remove per-turn OOC enforcement prefix while retaining schema/tool instructions.
2. Reduce repeated tool-order language outside the tool schema.
3. Deduplicate Agent, Project, and Skill personality text.
4. Keep one full Character Balance source.
5. Test a shorter new-thread bootstrap.
6. Test neutral correction headings.

Rollback after any regression in:

- preflight compliance;
- duplex quality;
- identity;
- continuity;
- character voice;
- prompt leakage.

### Stage 3 — Evaluate richer selected context

Only after Stage 1 establishes a clean baseline:

- test an additional selected precedent;
- test explicit provenance;
- test present-versus-history labeling;
- test a larger but section-budgeted brief.

Do not change retrieval volume simultaneously.

### Stage 4 — Optional API experiments

Potentially evaluate:

- Grok 4.5 as an advisory final-prose scorer;
- Grok 4.5 as an alternative structured Guardian auditor;
- automated image-to-location-card drafting;
- long-context thread analysis.

Keep these provider-isolated and reversible.

## 16. Suggested project-specific evaluation

The most useful evidence is a controlled set of real project situations:

- quiet private receiving-care scene;
- mechanical-parroting trap;
- consensual dominance/submission without quota;
- AMG ensemble scene;
- private suite with no NPCs;
- exact family/date/location recall;
- OOC revision without scene advancement;
- tool-attractor turn after unrelated search;
- save-lag disagreement;
- image reference conflicting with LIVE BEAT.

Score:

- Guardian called first;
- complete duplex supplied;
- current location/time/cast correct;
- no unsupported facts;
- Scarlett voice specificity;
- warmth;
- receptive agency;
- natural initiative;
- public/private register;
- emotional association;
- prompt leakage;
- forward movement;
- operator preference.

Creative quality should be judged by the operator, not inferred from coding benchmarks.

## 17. Factual conclusions

1. Grok 4.5 now powers the Grok consumer surfaces.
2. It has a 500,000-token context window.
3. It accepts text and images and returns text.
4. It supports function calling, parallel function calling, structured output, and configurable reasoning.
5. High reasoning is the API default and reasoning cannot be disabled.
6. xAI claims better long-conversation tracking and clearer, more reliable answers.
7. Published official and independent evidence supports strong coding and agentic knowledge-work capability.
8. Published evidence does not establish Scarlett roleplay quality.
9. No change to either MCP server is required to use Grok 4.5 as the live novelist.
10. Guardian and RAG remain necessary for durable memory, current-state authority, controlled retrieval, staging, and human canon governance.
11. The larger context window should first improve synthesis of selected evidence, not encourage complete-corpus injection.
12. 4.3-era prompt repetition is a candidate for measured reduction, not immediate deletion.
13. Native image input can improve visual grounding if observations remain provisional until human review.
14. Grok 4.5's best-supported immediate project benefit is more capable coding, tool use, and long-horizon knowledge work.
15. Model capability does not replace scope controls, tests, human review, or rollback.

## Sources

### Official

- xAI, “Bringing Grok 4.5 to iOS, Android, Web, and X”  
  https://x.ai/news/grok-4-5-everywhere

- xAI, “Introducing Grok 4.5”  
  https://x.ai/news/grok-4-5

- xAI developer model page, `grok-4.5`  
  https://docs.x.ai/developers/models/grok-4.5

- xAI Grok 4.5 developer guide  
  https://docs.x.ai/developers/grok-4-5

- xAI reasoning documentation  
  https://docs.x.ai/developers/model-capabilities/text/reasoning

- xAI function-calling documentation  
  https://docs.x.ai/developers/tools/function-calling

- xAI pricing  
  https://docs.x.ai/developers/pricing

- xAI tools overview  
  https://docs.x.ai/developers/tools/overview

- Cursor, “Introducing Grok 4.5”  
  https://cursor.com/blog/grok-4-5

- xAI, Grok 4.5 model card  
  https://media.x.ai/v1/website/card-7f81d41b.pdf

### Independent

- Artificial Analysis, “Grok 4.5 brings SpaceXAI to the intelligence frontier”  
  https://artificialanalysis.ai/articles/grok-4-5-brings-spacexai-to-the-the-intelligence-frontier

Independent benchmark figures are reported with their evaluation harnesses and should not be generalized to roleplay without project-specific evidence.

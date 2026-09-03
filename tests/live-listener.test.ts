/**
 * Live Listener worker — NER fail-soft, two-lane RAG, coalescing, deadline.
 */
import assert from "node:assert/strict";
import { ActiveRosterCache } from "../src/guardian/active-roster.js";
import type { LiveListenerConfig, LiveListenerLlm } from "../src/guardian/live-listener.js";
import {
  _resetLiveListenerLocksForTests,
  _waitForLiveListenerIdleForTests,
  isProtagonistEntity,
  matchRegistryNpc,
  parseNerEntities,
  runLiveListenerResearch,
  scheduleLiveListenerResearch
} from "../src/guardian/live-listener.js";
import type { RagToolCaller } from "../src/guardian/rag-client.js";
import type { LiveListenerTelemetryEvent } from "../src/guardian/telemetry.js";

function testConfig(over: Partial<LiveListenerConfig> = {}): LiveListenerConfig {
  return {
    GUARDIAN_LISTENER_ENABLED: true,
    GUARDIAN_LISTENER_MODEL: "gpt-4o-mini",
    GUARDIAN_LISTENER_TTL_MS: 30 * 60 * 1000,
    GUARDIAN_LISTENER_TIMEOUT_MS: 20000,
    GUARDIAN_LISTENER_MIN_CONFIDENCE: 0.6,
    OPENAI_API_KEY: "test-key",
    RAG_MCP_URL: "http://127.0.0.1:8787/mcp-v2",
    RAG_MCP_TIMEOUT_MS: 30000,
    ...over
  };
}

function stubLlm(sequence: unknown[]): LiveListenerLlm & { calls: number } {
  const wrapped: LiveListenerLlm & { calls: number } = {
    calls: 0,
    async completeJson() {
      const next = sequence[Math.min(wrapped.calls, sequence.length - 1)];
      wrapped.calls += 1;
      if (next instanceof Error) throw next;
      return next;
    }
  };
  return wrapped;
}

function stubRag(options?: {
  expand?: (args: Record<string, unknown>) => unknown | Promise<unknown>;
  search?: (args: Record<string, unknown>) => unknown | Promise<unknown>;
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
}): RagToolCaller & { calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const calls = options?.calls ?? [];
  return {
    calls,
    async callJsonTool<T>(name: string, args: Record<string, unknown>, _signal?: AbortSignal): Promise<T> {
      calls.push({ name, args });
      if (name === "expand_context_around_chunk") {
        if (options?.expand) return options.expand(args) as T;
        return {
          status: "context_found",
          expanded_results: [
            {
              source_file: args.source_file,
              section: args.section,
              text: "Karin is Benjamin's Swedish family contact in Vaxholm. Warm history. Guest house stays."
            }
          ]
        } as T;
      }
      if (name === "search_story_memory") {
        if (options?.search) return options.search(args) as T;
        return {
          results: [
            {
              text: "The St Moritz chalet is an alpine retreat from the Swiss winter arc.",
              source_file: "story-bible.md",
              section: "Places"
            }
          ]
        } as T;
      }
      throw new Error(`unexpected RAG tool ${name}`);
    },
    async callTextTool() {
      return "{}";
    }
  };
}

function testParseNerFailSoft() {
  assert.deepEqual(parseNerEntities(null), []);
  assert.deepEqual(parseNerEntities("nope"), []);
  assert.deepEqual(parseNerEntities({}), []);
  const parsed = parseNerEntities({
    entities: [
      { entity: "Karin", type: "person", confidence: 0.9 },
      { entity: " ", type: "person", confidence: 1 },
      { name: "Vaxholm", type: "location", confidence: "0.8" }
    ]
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].entity, "Karin");
  assert.equal(parsed[1].entity, "Vaxholm");
  assert.equal(parsed[1].confidence, 0.8);
  console.log("ok parseNerEntities fail-soft");
}

function testProtagonistAndRegistry() {
  assert.equal(isProtagonistEntity("Scarlett"), true);
  assert.equal(isProtagonistEntity("Benjamin Loughrey"), true);
  assert.equal(isProtagonistEntity("Karin"), false);
  assert.equal(matchRegistryNpc("Karin")?.id, "karin");
  assert.equal(matchRegistryNpc("Mr Shevchenko")?.id, "shevchenko");
  assert.equal(matchRegistryNpc("St Moritz Chalet"), undefined);
  console.log("ok protagonist filter + registry match");
}

async function testNerFailureWritesNothing() {
  const cache = new ActiveRosterCache();
  const events: LiveListenerTelemetryEvent[] = [];
  const result = await runLiveListenerResearch({
    threadKey: "t",
    scarlettMessage: "Karin waved from the guest-house steps in Vaxholm.",
    config: testConfig(),
    cache,
    ragClient: stubRag(),
    llm: stubLlm([new Error("boom")]),
    nowMs: 1_000,
    onTelemetry: (e) => events.push(e)
  });
  assert.equal(result.dossiers.length, 0);
  assert.equal(cache.size(), 0);
  assert.equal(events[0]?.ok, false);
  assert.match(events[0]?.error ?? "", /boom/);
  console.log("ok NER failure fail-soft");
}

async function testFiltersAndTwoLaneFetch() {
  const cache = new ActiveRosterCache();
  const rag = stubRag();
  const llm = stubLlm([
    {
      entities: [
        { entity: "Scarlett", type: "person", confidence: 0.99 },
        { entity: "Waiter John", type: "person", confidence: 0.2 },
        { entity: "Karin", type: "person", confidence: 0.95 },
        { entity: "St Moritz Chalet", type: "location", confidence: 0.8 }
      ]
    },
    {
      dossiers: [
        {
          entity: "Karin",
          bullets: ["Swedish family contact", "Vaxholm guest house", "warm history"]
        },
        {
          entity: "St Moritz Chalet",
          bullets: ["Alpine retreat", "Swiss winter arc"]
        }
      ]
    }
  ]);
  const result = await runLiveListenerResearch({
    threadKey: "t",
    scarlettMessage: "Karin mentioned the St Moritz chalet while Scarlett poured tea.",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm,
    nowMs: 2_000,
    onTelemetry: () => undefined
  });
  assert.equal(result.skippedProtagonist, 1);
  assert.equal(result.skippedLowConfidence, 1);
  assert.ok(result.dossiers.some((d) => d.entity === "Karin" && d.bullets.length > 0));
  assert.ok(result.dossiers.some((d) => /St Moritz/i.test(d.entity) && d.bullets.length > 0));
  assert.ok(rag.calls.some((c) => c.name === "expand_context_around_chunk"));
  assert.ok(rag.calls.some((c) => c.name === "search_story_memory"));
  const karinExpand = rag.calls.find((c) => c.name === "expand_context_around_chunk");
  assert.match(String(karinExpand?.args.section ?? ""), /Karin/i);
  const hit = cache.getFresh("t", 30 * 60 * 1000, 2_000);
  assert.ok(hit?.dossiers.length);
  console.log("ok filter + two-lane RAG fetch");
}

async function testDossierCharCapAndFallbackBullets() {
  const cache = new ActiveRosterCache();
  const long = "x".repeat(500);
  const rag = stubRag({
    expand: () => ({
      expanded_results: [
        {
          source_file: "secondary-characters-bible.md",
          section: "Karin",
          text: "Karin hosts them in Vaxholm. The guest house overlooks the water. Family dinners run late."
        }
      ]
    })
  });
  const llm = stubLlm([
    { entities: [{ entity: "Karin", type: "person", confidence: 0.9 }] },
    {
      dossiers: [
        {
          entity: "Karin",
          bullets: [long, long, long, "fourth dropped"]
        }
      ]
    }
  ]);
  const result = await runLiveListenerResearch({
    threadKey: "t",
    scarlettMessage: "Karin called from Vaxholm.",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm,
    nowMs: 3_000,
    onTelemetry: () => undefined
  });
  assert.ok(result.dossiers[0].bullets.length >= 1, "expected fallback or LLM bullets");
  assert.equal(result.dossiers[0].bullets.length <= 3, true);
  const joined = result.dossiers[0].bullets.join("; ");
  assert.ok(joined.length <= 360, `dossier too long: ${joined.length}`);
  console.log("ok dossier char / bullet cap");
}

async function testMemoSkipAndSameHash() {
  const cache = new ActiveRosterCache();
  const rag = stubRag();
  const firstLlm = stubLlm([
    { entities: [{ entity: "Karin", type: "person", confidence: 0.9 }] },
    { dossiers: [{ entity: "Karin", bullets: ["Vaxholm contact"] }] }
  ]);
  await runLiveListenerResearch({
    threadKey: "t",
    scarlettMessage: "Karin waved.",
    sourceHash: "hash-1",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm: firstLlm,
    nowMs: 4_000,
    onTelemetry: () => undefined
  });
  const ragCallsAfterFirst = rag.calls.length;
  const secondLlm = stubLlm([
    { entities: [{ entity: "Karin", type: "person", confidence: 0.9 }] }
  ]);
  const sameHash = await runLiveListenerResearch({
    threadKey: "t",
    scarlettMessage: "Karin waved.",
    sourceHash: "hash-1",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm: secondLlm,
    nowMs: 4_100,
    onTelemetry: () => undefined
  });
  assert.equal(secondLlm.calls, 0, "identical sourceHash must skip NER");
  const hit = cache.getFresh("t", 30 * 60 * 1000, 4_000);
  assert.ok((hit?.dossiers[0].bullets.length ?? 0) > 0, "cache must retain bullets");

  const thirdLlm = stubLlm([
    { entities: [{ entity: "Karin", type: "person", confidence: 0.91 }] }
  ]);
  const memoRun = await runLiveListenerResearch({
    threadKey: "t2",
    scarlettMessage: "Karin again, different turn.",
    sourceHash: "hash-2",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm: thirdLlm,
    nowMs: 4_200,
    onTelemetry: () => undefined
  });
  assert.equal(memoRun.skippedMemo, 1);
  assert.equal(thirdLlm.calls, 1, "memo hit should skip summarize/RAG");
  assert.equal(rag.calls.length, ragCallsAfterFirst);
  console.log("ok sourceHash skip + entity memo");
}

async function testDeadlineAbort() {
  const cache = new ActiveRosterCache();
  const ac = new AbortController();
  ac.abort();
  const llm = stubLlm([{ entities: [{ entity: "Karin", type: "person", confidence: 0.9 }] }]);
  const result = await runLiveListenerResearch({
    threadKey: "t",
    scarlettMessage: "Karin waved.",
    config: testConfig(),
    cache,
    ragClient: stubRag(),
    llm,
    nowMs: 5_000,
    signal: ac.signal,
    onTelemetry: () => undefined
  });
  assert.equal(result.dossiers.length, 0);
  assert.equal(llm.calls, 0);
  console.log("ok deadline abort before NER");
}

async function testScheduleDisabledAndCoalesce() {
  _resetLiveListenerLocksForTests();
  const cache = new ActiveRosterCache();
  const rag = stubRag();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let calls = 0;
  const llm: LiveListenerLlm = {
    async completeJson() {
      calls += 1;
      if (calls === 1) await gate;
      return { entities: [] };
    }
  };

  scheduleLiveListenerResearch({
    threadKey: "coalesce",
    scarlettMessage: "first Scarlett reply mentioning nobody.",
    config: testConfig({ GUARDIAN_LISTENER_ENABLED: false }),
    cache,
    ragClient: rag,
    llm
  });
  assert.equal(calls, 0, "disabled listener must not run");

  scheduleLiveListenerResearch({
    threadKey: "coalesce",
    scarlettMessage: "first Scarlett reply mentioning nobody.",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm
  });
  scheduleLiveListenerResearch({
    threadKey: "coalesce",
    scarlettMessage: "second Scarlett reply still mentioning nobody.",
    config: testConfig(),
    cache,
    ragClient: rag,
    llm
  });
  assert.equal(calls, 1, "second schedule coalesces rather than overlapping");
  release();
  await _waitForLiveListenerIdleForTests();
  assert.equal(calls, 2, "pending latest run executes after in-flight finishes");
  _resetLiveListenerLocksForTests();
  console.log("ok schedule disabled + coalescing");
}

async function testScheduleTimeoutAborts() {
  _resetLiveListenerLocksForTests();
  const cache = new ActiveRosterCache();
  const events: LiveListenerTelemetryEvent[] = [];
  const llm: LiveListenerLlm = {
    completeJson(_prompt, signal) {
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new Error("aborted"));
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  };
  scheduleLiveListenerResearch({
    threadKey: "timeout",
    scarlettMessage: "Karin is on the line from Vaxholm this evening.",
    config: testConfig({ GUARDIAN_LISTENER_TIMEOUT_MS: 30 }),
    cache,
    ragClient: stubRag(),
    llm,
    onTelemetry: (e) => events.push(e)
  });
  await _waitForLiveListenerIdleForTests();
  assert.ok(events.some((e) => e.ok === false));
  _resetLiveListenerLocksForTests();
  console.log("ok schedule timeout aborts NER");
}

testParseNerFailSoft();
testProtagonistAndRegistry();
await testNerFailureWritesNothing();
await testFiltersAndTwoLaneFetch();
await testDossierCharCapAndFallbackBullets();
await testMemoSkipAndSameHash();
await testDeadlineAbort();
await testScheduleDisabledAndCoalesce();
await testScheduleTimeoutAborts();
console.log("All live-listener tests passed.");

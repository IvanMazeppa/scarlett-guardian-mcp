/**
 * WP-1.1 acceptance: golden schema + loader + CassetteRagClient (PLAN_DRIFT on miss).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CassetteMissError,
  CassetteRagClient,
  PLAN_DRIFT,
  createCassetteClient,
  hashArgs
} from "../evals/cassette-client.js";
import {
  GoldenCaseSchema,
  GoldenSchemaError,
  loadGoldenCase,
  loadGoldenCases,
  parseGoldenCase
} from "../evals/schema.js";
import type { RagToolCaller } from "../src/guardian/rag-client.js";

function writeTempGolden(obj: unknown, name = "gt-001-sample.json"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-golden-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

const minimalCase = {
  id: "gt-001-outlap-radio",
  category: "continuous-scene" as const,
  description: "Minimal fixture for schema + cassette unit tests",
  source_report: "preflight-full-example.json",
  input: {
    user_message: "Benjamin keys the private radio on the out lap.",
    recent_context: "Post shakedown, thermal numbers still climbing.",
    scarlett_previous_message: null,
    force_full_retrieval: false
  },
  cassette: {
    index_status: "Active Vector Store ID: vs_test\nRetrieval Mode: vector_search",
    retrieve_story_context: {
      query: "current scene",
      status: "ok",
      results: [
        {
          source_file: "project_source_files/current-state.md",
          section: "Location",
          text: "Nürburgring paddock — out lap radio check.",
          rank_score: 0.9,
          source_role: "current_state"
        }
      ]
    },
    search_story_memory: [
      {
        query: "q1",
        status: "ok",
        results: [{ text: "first memory hit", source_role: "event_log", rank_score: 0.5 }]
      },
      {
        query: "q2",
        status: "ok",
        results: [{ text: "second memory hit", source_role: "event_log", rank_score: 0.4 }]
      }
    ]
  },
  expectations: {
    brief_must_include: [["out lap", "radio"]],
    brief_must_not_include: ["search_story_memory", "HIGH confidence context found"],
    flags_forbidden: ["MANDATORY_RETRIEVAL_FAILED"],
    correction_expected: "none",
    write_action_expected: "either",
    brief_chars: { min: 100, max: 8000 }
  }
};

// --- schema ---
{
  const parsed = parseGoldenCase(minimalCase);
  assert.equal(parsed.id, "gt-001-outlap-radio");
  assert.equal(parsed.category, "continuous-scene");
  assert.equal(parsed.expectations.brief_must_not_include.length, 2);
  assert.equal(parsed.input.user_message.includes("radio"), true);
}

{
  assert.throws(
    () => parseGoldenCase({ ...minimalCase, id: "bad-id" }),
    (err: unknown) => err instanceof GoldenSchemaError
  );
  assert.throws(
    () => parseGoldenCase({ ...minimalCase, category: "not-a-category" }),
    (err: unknown) => err instanceof GoldenSchemaError
  );
  assert.throws(
    () => parseGoldenCase({ ...minimalCase, input: { user_message: "" } }),
    (err: unknown) => err instanceof GoldenSchemaError
  );
}

// defaults fill empty expectations
{
  const raw = {
    id: "gt-002-defaults",
    category: "other",
    description: "defaults",
    input: { user_message: "hello" },
    cassette: { index_status: "ok" }
  };
  const parsed = GoldenCaseSchema.parse(raw);
  assert.deepEqual(parsed.expectations.brief_must_include, []);
  assert.equal(parsed.expectations.correction_expected, "either");
}

// loader from disk
{
  const file = writeTempGolden(minimalCase);
  const loaded = loadGoldenCase(file);
  assert.equal(loaded.id, "gt-001-outlap-radio");

  const root = path.dirname(file);
  const catDir = path.join(root, "continuous-scene");
  fs.mkdirSync(catDir);
  fs.renameSync(file, path.join(catDir, "gt-001-outlap-radio.json"));
  fs.writeFileSync(
    path.join(catDir, "gt-099-retired.json"),
    JSON.stringify({
      ...minimalCase,
      id: "gt-099-retired",
      retired: "superseded by newer trap",
      description: "retired trap"
    })
  );

  const active = loadGoldenCases(root);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "gt-001-outlap-radio");

  const withRetired = loadGoldenCases(root, { includeRetired: true });
  assert.equal(withRetired.length, 2);

  const filtered = loadGoldenCases(root, { category: "temporal-mud" });
  assert.equal(filtered.length, 0);
}

// --- cassette client ---
{
  const client = createCassetteClient(minimalCase.cassette, { caseId: "gt-001-outlap-radio" });

  // Satisfies RagToolCaller structurally
  const asCaller: RagToolCaller = client;
  assert.equal(typeof asCaller.callJsonTool, "function");
  assert.equal(typeof asCaller.callTextTool, "function");

  const status = await client.callTextTool("index_status", {});
  assert.match(status, /vs_test/);

  const ctx = await client.callJsonTool<{ results: unknown[] }>("retrieve_story_context", {
    query: "anything — single-slot ignores args on first use"
  });
  assert.equal(ctx.results.length, 1);

  const m1 = await client.callJsonTool<{ query: string }>("search_story_memory", {
    query: "q1",
    max_results: 10
  });
  assert.equal(m1.query, "q1");
  const m2 = await client.callJsonTool<{ query: string }>("search_story_memory", {
    query: "q2",
    max_results: 10
  });
  assert.equal(m2.query, "q2");

  // third search → PLAN_DRIFT
  await assert.rejects(
    () => client.callJsonTool("search_story_memory", { query: "q3" }),
    (err: unknown) => {
      assert.ok(err instanceof CassetteMissError);
      assert.equal(err.code, PLAN_DRIFT);
      assert.match(err.message, /PLAN_DRIFT/);
      assert.match(err.message, /gt-001-outlap-radio/);
      assert.match(err.message, /search_story_memory/);
      return true;
    }
  );

  // unknown tool → PLAN_DRIFT
  await assert.rejects(
    () => client.callJsonTool("get_live_story_state", {}),
    (err: unknown) => err instanceof CassetteMissError && err.code === PLAN_DRIFT
  );

  assert.ok(client.hits.length >= 3);
}

// hash-map cassette form
{
  const argsA = { query: "alpha", max_results: 10 };
  const argsB = { query: "beta", max_results: 10 };
  const client = new CassetteRagClient({
    search_story_memory: {
      [hashArgs(argsA)]: { query: "alpha", results: [] },
      [hashArgs(argsB)]: { query: "beta", results: [] }
    }
  });
  const a = await client.callJsonTool<{ query: string }>("search_story_memory", argsA);
  assert.equal(a.query, "alpha");
  const b = await client.callJsonTool<{ query: string }>("search_story_memory", argsB);
  assert.equal(b.query, "beta");
  await assert.rejects(
    () => client.callJsonTool("search_story_memory", { query: "gamma", max_results: 10 }),
    (err: unknown) => err instanceof CassetteMissError
  );
}

// second use of single-slot → miss
{
  const client = new CassetteRagClient({
    index_status: "once only"
  });
  assert.equal(await client.callTextTool("index_status", {}), "once only");
  await assert.rejects(
    () => client.callTextTool("index_status", {}),
    (err: unknown) => err instanceof CassetteMissError
  );
}

console.log("eval-harness-1.1 tests passed");

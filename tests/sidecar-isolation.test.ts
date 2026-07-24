/**
 * WP-R3 — hermetic/eval must not mutate live .guardian sidecars.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CassetteRagClient } from "../evals/cassette-client.js";
import { runGuardianPreflight } from "../src/guardian/tools/preflight.js";
import type { GuardianConfig } from "../src/guardian/config.js";

const hermeticConfig = {
  GUARDIAN_CONFIDENCE_THRESHOLD: 70,
  GUARDIAN_LLM_ENABLED: false,
  GUARDIAN_MODEL: "eval-hermetic",
  GUARDIAN_MEMORY_WRITE_MODE: "off",
  GUARDIAN_AUTO_APPROVE: "none",
  GUARDIAN_DRAMATURG_ENABLED: true,
  GUARDIAN_BUDGET_INITIAL_RETRIEVAL_MS: 14000,
  GUARDIAN_BUDGET_OPTIONAL_DEPTH_MS: 200,
  GUARDIAN_BUDGET_TOTAL_PREFLIGHT_MS: 30000,
  GUARDIAN_BUDGET_AUDITOR_MS: 200,
  GUARDIAN_MCP_INITIAL_CONCURRENCY: 3,
  GUARDIAN_MCP_OPTIONAL_CONCURRENCY: 2,
  OPENAI_API_KEY: undefined
} as unknown as GuardianConfig;

function snapshotGuardianDir(root: string): Map<string, string> {
  const dir = path.join(root, ".guardian");
  const out = new Map<string, string>();
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".json") || name.endsWith(".ndjson")) {
        out.set(path.relative(root, p), fs.readFileSync(p, "utf8"));
      }
    }
  };
  walk(dir);
  return out;
}

async function main() {
  const root = process.cwd();
  const before = snapshotGuardianDir(root);

  const cassette = {
    index_status: "Active Vector Store ID: vs_r3\nRetrieval Mode: vector_search",
    get_live_story_state:
      "### Live Current State\n\n# Current Story State\n\n**Last Updated:** Friday\n\n## Where We Are\n\n- **Location / Setting:** Nürburgring pit box. **Present:** Scarlett, Benjamin, Mr. Shevchenko\n",
    retrieve_story_context: {
      query: "test",
      status: "ok",
      confidence: "high",
      result_count: 1,
      total_results: 1,
      results: [
        {
          result_id: "r1",
          source_file: "project_source_files/current-state.md",
          section: "Where We Are",
          text: "Pit box with Shevchenko present. Track day winding down.",
          rank_score: 0.9,
          source_role: "current_state",
          confidence: "high"
        }
      ]
    },
    search_story_memory: {
      query: "test",
      status: "ok",
      confidence: "high",
      result_count: 0,
      total_results: 0,
      results: []
    }
  };

  const client = new CassetteRagClient(cassette, { caseId: "r3-isolation" });
  for (let i = 0; i < 3; i++) {
    await runGuardianPreflight(
      {
        user_message: `Turn ${i}: Shevchenko glances at the telemetry and waits. Benjamin says we wrap the track day.`,
        recent_context: "Nordschleife pit box, Shevchenko present",
        force_full_retrieval: false
      },
      client,
      hermeticConfig,
      { disableTelemetry: true, isolateSidecars: true }
    );
  }

  const after = snapshotGuardianDir(root);
  // Serendipity + dramaturg files under .guardian should be unchanged (or only pre-existing keys same content).
  for (const [rel, content] of after) {
    if (rel.includes("telemetry")) continue; // disableTelemetry should not write, but ignore if any
    const prev = before.get(rel);
    if (prev !== undefined) {
      assert.equal(
        content,
        prev,
        `sidecar mutated under hermetic eval: ${rel}`
      );
    }
  }
  // If new files appeared in .guardian that are serendipity/dramaturg — fail
  for (const rel of after.keys()) {
    if (before.has(rel)) continue;
    if (/serendipity|dramaturg/i.test(rel)) {
      assert.fail(`new sidecar written during hermetic eval: ${rel}`);
    }
  }

  console.log("ok hermetic eval does not mutate live serendipity/dramaturg sidecars");
  console.log("sidecar-isolation tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

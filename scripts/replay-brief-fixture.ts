/**
 * Replay a saved full preflight JSON through the new content helpers + compileGrokBrief.
 * Usage: npx tsx scripts/replay-brief-fixture.ts [path-to-full.json]
 */
import fs from "node:fs";
import path from "node:path";
import { compileGrokBrief } from "../src/guardian/report/compile-grok-brief.js";
import type { GuardianReport, RagRetrieveResponse } from "../src/guardian/report/models.js";
import {
  buildKeyFacts,
  buildToneGuidance,
  collectOpenThreads,
  detectHighRiskTriggers,
  selectPrecedents,
  summarizeCurrentState
} from "../src/guardian/tools/preflight.js";

const defaultFixture = path.join(
  process.cwd(),
  "docs/guardian-reports/preflight-full-2026-07-12T22-05-13-428Z.json"
);
const fixturePath = process.argv[2] ?? defaultFixture;
const full = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as GuardianReport & {
  tool_calls: Array<{ tool: string; response?: RagRetrieveResponse }>;
};

const preflight = full.tool_calls.find((t) => t.tool === "retrieve_story_context")?.response;
const memories = full.tool_calls
  .filter((t) => t.tool === "search_story_memory")
  .map((t) => t.response)
  .filter(Boolean) as RagRetrieveResponse[];

const planQuery = full.retrieval_plan.preflight_query;
const userMsg =
  planQuery.split("Benjamin turn:").pop()?.trim() ??
  full.retrieval_plan.memory_queries[0] ??
  "";
const recentMatch = planQuery.match(/recent context:\s*(.+?);\s*Benjamin turn:/i);
const recentContext = recentMatch?.[1]?.trim();
const input = { user_message: userMsg, recent_context: recentContext };
const triggers = detectHighRiskTriggers(userMsg);
const allResults = [...(preflight?.results ?? []), ...memories.flatMap((m) => m.results ?? [])];

const scene = summarizeCurrentState(preflight, memories, full.llm_assessment, input);
const tone = buildToneGuidance(preflight, memories, full.llm_assessment, input);
const threads = collectOpenThreads(preflight, memories, full.llm_assessment);
const keyFacts = buildKeyFacts(allResults, full.llm_assessment, full.hard_flags, triggers, input);
const precedents = selectPrecedents(allResults, triggers, userMsg, 2);

const rebuilt: GuardianReport = {
  ...full,
  current_state_summary: scene,
  emotional_tone_guidance: tone,
  open_threads: threads,
  critical_precedents: precedents,
  grok_scene_summary: scene,
  grok_emotional_context: tone,
  grok_key_facts: keyFacts,
  grok_precedents: precedents,
  retrieval_plan: {
    ...full.retrieval_plan,
    high_risk_triggers: triggers
  }
};

const brief = compileGrokBrief(rebuilt);

console.log("=== DETECTED TRIGGERS (fixture had []) ===");
console.log(triggers.length ? triggers : "(none)");
console.log("\n=== AFTER compileGrokBrief (replayed from live full JSON) ===\n");
console.log(brief);
console.log("=== META CHECKS ===");
for (const bad of [
  "search_story_memory",
  "HIGH confidence context found",
  "Do not draft from this preflight",
  "Call search_story_memory",
  "rank_score",
  "vector_store"
]) {
  console.log(`${bad}: ${brief.includes(bad) ? "FAIL" : "ok"}`);
}
console.log(`brief chars: ${brief.length}`);

/**
 * WP-4.4 — Human review loop for RAG staged story updates.
 *
 * Usage (Guardian repo; RAG server on :8787):
 *   npm run review:staged -- list
 *   npm run review:staged -- list --content
 *   npm run review:staged -- show --id <staged_update_id>
 *   npm run review:staged -- diff --id <staged_update_id>
 *   npm run review:staged -- dry-run --id <staged_update_id>
 *   npm run review:staged -- approve --id <staged_update_id>
 *   npm run review:staged -- reject --id <staged_update_id> --reason "stale"
 *
 * Env:
 *   RAG_MCP_URL          default http://127.0.0.1:8787/mcp-v2
 *   RAG_MCP_BEARER_TOKEN optional
 *   RAG_MEMORY_DIR       path to rag-memory-mcp root (for live file diffs)
 *                        default: ../rag-memory-mcp relative to this package
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const RAG_URL = process.env.RAG_MCP_URL ?? "http://127.0.0.1:8787/mcp-v2";
const RAG_BEARER = process.env.RAG_MCP_BEARER_TOKEN ?? process.env.RAG_MCP_BEARER ?? "";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RAG_ROOT = path.resolve(__dirname, "../../rag-memory-mcp");
const RAG_MEMORY_DIR = process.env.RAG_MEMORY_DIR
  ? path.resolve(process.env.RAG_MEMORY_DIR)
  : DEFAULT_RAG_ROOT;

type StagedUpdate = {
  id: string;
  created_at?: string;
  target_source_file?: string;
  mode?: string;
  rationale?: string;
  citations_count?: number;
  content_chars?: number;
  proposed_content?: string;
  citations?: string[];
  safety_note?: string;
};

function textOf(result: unknown): string {
  const r = result as { content?: Array<{ text?: string }>; isError?: boolean };
  return r.content?.[0]?.text ?? JSON.stringify(result, null, 2);
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Sometimes MCP wraps or adds prefix
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`Not JSON: ${text.slice(0, 200)}`);
  }
}

function parseArgs(argv: string[]) {
  const cmd = argv[2] ?? "list";
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    cmd,
    id: get("--id"),
    reason: get("--reason"),
    content: argv.includes("--content") || argv.includes("--include-content"),
    context: Number(get("--context") ?? "3") || 3
  };
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "review-staged", version: "1.0.0" });
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream"
  };
  if (RAG_BEARER) headers.Authorization = `Bearer ${RAG_BEARER}`;

  const transport = new StreamableHTTPClientTransport(new URL(RAG_URL), {
    requestInit: { headers }
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function callToolJson(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const res = await client.callTool({ name, arguments: args });
  const text = textOf(res);
  if ((res as { isError?: boolean }).isError) {
    throw new Error(text);
  }
  return parseJsonText(text);
}

async function listUpdates(client: Client, includeContent: boolean): Promise<StagedUpdate[]> {
  const data = (await callToolJson(client, "list_staged_story_updates", {
    include_content: includeContent
  })) as { success?: boolean; updates?: StagedUpdate[] };
  return data.updates ?? [];
}

async function loadLiveFile(relativeSource: string): Promise<string | null> {
  const abs = path.resolve(RAG_MEMORY_DIR, relativeSource);
  try {
    return await fs.readFile(abs, "utf8");
  } catch {
    return null;
  }
}

/** Simple line diff: show -/+ around first differences (no external deps). */
function simpleDiff(oldText: string, newText: string, contextLines: number): string {
  const a = oldText.replace(/\r\n/g, "\n").split("\n");
  const b = newText.replace(/\r\n/g, "\n").split("\n");
  const max = Math.max(a.length, b.length);
  let first = -1;
  for (let i = 0; i < max; i++) {
    if ((a[i] ?? "") !== (b[i] ?? "")) {
      first = i;
      break;
    }
  }
  if (first < 0) {
    return "(no line differences — files identical)\n";
  }
  let last = first;
  for (let i = max - 1; i >= first; i--) {
    if ((a[i] ?? "") !== (b[i] ?? "")) {
      last = i;
      break;
    }
  }
  const start = Math.max(0, first - contextLines);
  const end = Math.min(max - 1, last + contextLines);
  const lines: string[] = [
    `@@ lines ${start + 1}-${end + 1} (first change @ ${first + 1}) @@`
  ];
  for (let i = start; i <= end; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      lines.push(`  ${left ?? ""}`);
    } else {
      if (left !== undefined) lines.push(`- ${left}`);
      if (right !== undefined) lines.push(`+ ${right}`);
    }
  }
  return lines.join("\n") + "\n";
}

function printList(updates: StagedUpdate[], withContent: boolean) {
  if (!updates.length) {
    console.log("No pending staged updates.");
    return;
  }
  console.log(`Pending: ${updates.length}\n`);
  for (const u of updates) {
    console.log(`── ${u.id}`);
    console.log(`   target: ${u.target_source_file ?? "?"}  mode: ${u.mode ?? "?"}`);
    console.log(`   created: ${u.created_at ?? "?"}`);
    console.log(`   chars: ${u.content_chars ?? u.proposed_content?.length ?? "?"}`);
    if (u.rationale) console.log(`   rationale: ${u.rationale.slice(0, 200)}`);
    if (withContent && u.proposed_content) {
      console.log("   --- proposed_content (first 800 chars) ---");
      console.log(
        u.proposed_content.slice(0, 800) + (u.proposed_content.length > 800 ? "\n   …" : "")
      );
    }
    console.log("");
  }
}

async function main() {
  const { cmd, id, reason, content, context } = parseArgs(process.argv);
  console.log(`RAG MCP: ${RAG_URL}`);
  console.log(`RAG files: ${RAG_MEMORY_DIR}`);
  console.log(`cmd: ${cmd}${id ? ` id=${id}` : ""}\n`);

  await withClient(async (client) => {
    if (cmd === "list") {
      const updates = await listUpdates(client, content);
      printList(updates, content);
      console.log("Next: show|diff|dry-run|approve|reject --id <id>");
      return;
    }

    if (cmd === "show" || cmd === "diff" || cmd === "dry-run" || cmd === "approve" || cmd === "reject") {
      if (!id) throw new Error(`${cmd} requires --id <staged_update_id>`);
    }

    if (cmd === "show") {
      const updates = await listUpdates(client, true);
      const u = updates.find((x) => x.id === id || x.id.includes(id!));
      if (!u) throw new Error(`Staged update not found: ${id}`);
      console.log(JSON.stringify(u, null, 2));
      return;
    }

    if (cmd === "diff") {
      const updates = await listUpdates(client, true);
      const u = updates.find((x) => x.id === id || x.id.includes(id!));
      if (!u) throw new Error(`Staged update not found: ${id}`);
      const target = u.target_source_file ?? "project_source_files/current-state.md";
      const live = await loadLiveFile(target);
      const proposed = u.proposed_content ?? "";
      console.log(`target: ${target}`);
      console.log(`mode: ${u.mode ?? "?"}`);
      if (live == null) {
        console.log(`(could not read live file under ${RAG_MEMORY_DIR})`);
        console.log("--- proposed only ---\n");
        console.log(proposed.slice(0, 4000));
        return;
      }
      if ((u.mode ?? "append") === "overwrite") {
        console.log("--- overwrite diff (live vs proposed) ---\n");
        console.log(simpleDiff(live, proposed, context));
      } else {
        console.log("--- append: last 40 lines of live file ---\n");
        const tail = live.split("\n").slice(-40).join("\n");
        console.log(tail);
        console.log("\n--- proposed append ---\n");
        console.log(proposed);
      }
      return;
    }

    if (cmd === "dry-run") {
      const data = await callToolJson(client, "approve_staged_story_update", {
        staged_update_id: id,
        dry_run: true
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (cmd === "approve") {
      const data = await callToolJson(client, "approve_staged_story_update", {
        staged_update_id: id,
        dry_run: false,
        delete_after_approval: true
      });
      console.log(JSON.stringify(data, null, 2));
      console.log("\nApproved (if success). Watch RAG terminal for background reindex.");
      return;
    }

    if (cmd === "reject") {
      if (!reason) throw new Error('reject requires --reason "why"');
      const data = await callToolJson(client, "reject_staged_story_update", {
        staged_update_id: id,
        reason
      });
      console.log(JSON.stringify(data, null, 2));
      console.log("\nRejected (if success). Archive under staged-updates/rejected/.");
      return;
    }

    if (cmd === "help" || cmd === "--help" || cmd === "-h") {
      console.log(`review-staged commands:
  list [--content]
  show --id <id>
  diff --id <id> [--context N]
  dry-run --id <id>
  approve --id <id>
  reject --id <id> --reason "..."`);
      return;
    }

    throw new Error(
      `Unknown cmd: ${cmd}. Use list | show | diff | dry-run | approve | reject | help`
    );
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

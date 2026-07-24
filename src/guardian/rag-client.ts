import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { performance } from "node:perf_hooks";
import type { GuardianConfig } from "./config.js";
import { getActiveTelemetryCollector } from "./telemetry.js";

type TextContent = {
  type: "text";
  text: string;
};

type ToolResult = {
  content?: Array<TextContent | Record<string, unknown>>;
};

export interface RagToolCaller {
  connect?(signal?: AbortSignal): Promise<void>;
  close?(): Promise<void>;
  callJsonTool<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
  callTextTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

export class RagMcpClient implements RagToolCaller {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(private readonly config: Pick<GuardianConfig, "RAG_MCP_URL" | "RAG_MCP_BEARER_TOKEN" | "RAG_MCP_TIMEOUT_MS">) {}

  async connect(signal?: AbortSignal) {
    if (this.client) return;
    this.client = new Client({
      name: "scarlett-guardian-mcp",
      version: "0.1.0"
    });

    const headers: Record<string, string> = {};
    if (this.config.RAG_MCP_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${this.config.RAG_MCP_BEARER_TOKEN}`;
    }

    this.transport = new StreamableHTTPClientTransport(new URL(this.config.RAG_MCP_URL), {
      requestInit: {
        headers,
        signal
      }
    });

    await this.client.connect(this.transport);
  }

  async close() {
    if (this.client) {
      await this.client.close().catch(() => undefined);
      this.client = null;
      this.transport = null;
    }
  }

  async callJsonTool<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const text = await this.callTextTool(name, args, signal);
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(`RAG tool ${name} returned non-JSON text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTextTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const t0 = performance.now();
    let ok = false;
    try {
      const isManaged = Boolean(this.client);
      
      if (!isManaged) {
          await this.connect(signal);
      }
      
      const abortController = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      
      const abortListener = () => abortController.abort();
      if (signal) {
        signal.addEventListener("abort", abortListener);
      } else {
        timeout = setTimeout(() => abortController.abort(), this.config.RAG_MCP_TIMEOUT_MS);
      }

      try {
        const result = await this.client!.callTool({ name, arguments: args }) as ToolResult;
        
        if (signal?.aborted || abortController.signal.aborted) {
            throw new Error("Operation aborted");
        }

        const text = result.content?.find((item): item is TextContent => item.type === "text")?.text;
        if (!text) {
          throw new Error(`RAG tool ${name} returned no text content.`);
        }
        ok = true;
        return text;
      } finally {
        if (timeout) clearTimeout(timeout);
        if (signal) signal.removeEventListener("abort", abortListener);
        if (!isManaged) {
            await this.close();
        }
      }
    } finally {
      try {
        getActiveTelemetryCollector()?.recordTool(name, performance.now() - t0, ok);
      } catch {
        /* telemetry must never affect RAG calls */
      }
    }
  }
}

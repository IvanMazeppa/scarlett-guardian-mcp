import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { GuardianConfig } from "./config.js";

type TextContent = {
  type: "text";
  text: string;
};

type ToolResult = {
  content?: Array<TextContent | Record<string, unknown>>;
};

export class RagMcpClient {
  constructor(private readonly config: Pick<GuardianConfig, "RAG_MCP_URL" | "RAG_MCP_BEARER_TOKEN" | "RAG_MCP_TIMEOUT_MS">) {}

  async callJsonTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const text = await this.callTextTool(name, args);
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(`RAG tool ${name} returned non-JSON text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTextTool(name: string, args: Record<string, unknown>): Promise<string> {
    const client = new Client({
      name: "scarlett-guardian-mcp",
      version: "0.1.0"
    });

    const headers: Record<string, string> = {};
    if (this.config.RAG_MCP_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${this.config.RAG_MCP_BEARER_TOKEN}`;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.config.RAG_MCP_TIMEOUT_MS);

    const transport = new StreamableHTTPClientTransport(new URL(this.config.RAG_MCP_URL), {
      requestInit: {
        headers,
        signal: abortController.signal
      }
    });

    try {
      await client.connect(transport);
      const result = await client.callTool({ name, arguments: args }) as ToolResult;
      const text = result.content?.find((item): item is TextContent => item.type === "text")?.text;
      if (!text) {
        throw new Error(`RAG tool ${name} returned no text content.`);
      }
      return text;
    } finally {
      clearTimeout(timeout);
      await client.close().catch(() => undefined);
    }
  }
}

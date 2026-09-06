import OpenAI from "openai";
import type { GuardianConfig } from "./config.js";
import type { GuardianPreflightInput } from "./tools/preflight.js";

type PlannerConfig = Pick<
  GuardianConfig,
  | "GUARDIAN_LLM_ENABLED"
  | "OPENAI_API_KEY"
  | "GUARDIAN_MODEL"
  | "GUARDIAN_LLM_REASONING_EFFORT"
>;

const queryPlannerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      items: { type: "string" },
      description: "1-3 highly targeted semantic queries to run against the story memory vector store.",
    },
  },
  required: ["queries"],
} as const;

/** Fixed warm-lane query — recent europe-arm / arc_chronicle continuity (~last 48h). */
export function warmRecentMemoryQuery(input: GuardianPreflightInput): string {
  const snippet = input.user_message.replace(/\s+/g, " ").trim().slice(0, 160);
  return `recent europe-arm warm continuity Stuttgart Lieser Nordschleife anklet last sessions ${snippet}`;
}

export async function planMemoryQueries(
  input: GuardianPreflightInput,
  config: PlannerConfig,
  signal?: AbortSignal
): Promise<string[]> {
  if (!config.GUARDIAN_LLM_ENABLED || !config.OPENAI_API_KEY) {
    // Fallback if no LLM configured
    return fallbackQueries(input);
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const userMessage = input.user_message;
  const scarlettMessage = input.scarlett_previous_message || "";
  const recentContext = input.recent_context || "";

  const prompt = `You are an Intent / Query Planner for the Scarlett & Benjamin Guardian RAG system.
Based on the current turn, you need to generate 1-3 targeted semantic queries to retrieve relevant story memory.
The queries will search a vector store of narrative canon, character sheets, and recent events.

Context:
User message (Benjamin): ${userMessage}
Scarlett previous message: ${scarlettMessage}
Recent context: ${recentContext}

Output a JSON object with key "queries" containing an array of 1-3 strings.
Queries should cover:
1. Current scene continuity and emotional tone (live beat) — facts of the room only.
2. An EMOTIONAL ANALOGUE, not a noun restatement. Map the gesture to a psychological job (e.g. too-small sofa → "closeness that does not fit and she makes room"; a pushed boundary → "last time play was how she stayed in control"). Search emotional-milestones and relationship history for that job. Do not search current-state.md.
3. When the turn depends on the last ~48 hours of travel/intimacy (Germany trip, Luxembourg, Nordschleife, Schloss Lieser, Stuttgart, Soglio), include one query aimed at recent europe-arm / warm chronicle continuity — not deep UK archive threads.`;

  try {
    const response = await client.chat.completions.create({
      model: config.GUARDIAN_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: {
        type: "json_object"
      }
    }, { signal } as never);

    const outputText = response.choices[0]?.message?.content;
    
    if (!outputText) {
      return fallbackQueries(input);
    }

    const parsed = JSON.parse(outputText) as { queries: string[] };
    return parsed.queries.slice(0, 3);
  } catch (error) {
    console.warn(`Query planner failed or timed out: ${error instanceof Error ? error.message : String(error)}`);
    return fallbackQueries(input);
  }
}

function extractOutputText(response: unknown): string | undefined {
  const output = (response as { output?: Array<{ content?: Array<{ text?: string; type?: string }> }> }).output ?? [];
  for (const item of output) {
    const textPart = item.content?.find((content) => typeof content.text === "string");
    if (textPart?.text) return textPart.text;
  }
  return undefined;
}

function fallbackQueries(input: GuardianPreflightInput): string[] {
  const message = input.user_message.replace(/\s+/g, " ").trim();
  const messageSnippet = message.slice(0, 220);
  return [
    `current scene continuity relationship precedent ${messageSnippet}`
  ];
}

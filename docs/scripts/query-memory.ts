import "dotenv/config";
import { getConfig } from "../src/config.js";
import { StoryMemoryRetriever } from "../src/retriever.js";

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.error("Usage: npm run query -- \"What does Benjamin remember about Scarlett?\"");
  process.exit(1);
}

const retriever = new StoryMemoryRetriever(getConfig());
const response = await retriever.retrieve(query, {
  maxResults: 6,
  rewriteQuery: true,
  maxCharsPerResult: 1800
});

console.log(JSON.stringify(response, null, 2));

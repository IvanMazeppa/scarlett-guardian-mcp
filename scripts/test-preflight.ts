import { getConfig } from "../src/guardian/config.js";
import { RagMcpClient } from "../src/guardian/rag-client.js";
import { runGuardianPreflight } from "../src/guardian/tools/preflight.js";

async function main() {
  console.log("Starting Guardian Preflight test...");
  const config = getConfig();
  const ragClient = new RagMcpClient(config);

  const startTime = Date.now();
  try {
    const preflightInput = {
      user_message: "Benjamin tells Scarlett to push the car hard on the twisty B-roads through the Eifel mountains",
      force_full_retrieval: true
    };
    console.log("Calling runGuardianPreflight...");
    const report = await runGuardianPreflight(preflightInput, ragClient, config);

    const elapsed = Date.now() - startTime;
    console.log(`Success! Preflight took ${elapsed}ms`);
    console.log(`Proceed Recommendation: ${report.proceed_recommendation}`);
    console.log(`Tool calls made: ${report.tool_calls.length}`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`Failed after ${elapsed}ms`);
    console.error(error);
  }
}

main().catch(console.error);

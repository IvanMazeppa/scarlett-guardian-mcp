# The Archival Triage Workflow

When a roleplay spans multiple broken threads and the cloud history becomes a graveyard of dead ends, trying to archive everything sequentially is overwhelming. We need a triage system.

Here is the new workflow to rescue your canon lore without losing your mind.

## Step 1: The "Canon Sieve" (Do this first)
**Do not open Grok yet.** Open a blank text file on your computer. 
From memory, write down the 3 to 5 major events that happened *after* Summary 6 that you absolutely want Scarlett to remember. (e.g., "The Paris Night", "The Nürburgring Drive", "The argument about X"). 
If you can't remember a minor thread, it probably isn't important enough to index. Only hunt for the golden threads.

## Step 2: Extraction (Use the Cloud Version)
Now open the Grok Cloud UI. Because you have a hit-list from Step 1, you can scroll through the history and ignore 90% of the broken/abandoned threads. 
When you find a thread that matches your hit-list, copy the raw text and paste it into a local file (e.g., `raw-paris.txt`). 
*Note: If a thread broke halfway through, just copy the good half. You can stitch two halves together in your text file.*

## Step 3: Summarization (Use the API / Grok Build)
**Do not use the Cloud version to summarize.** The Cloud web interface has hidden safety filters, smaller context windows, and might argue with you about formatting. 
Instead, use your API (Grok Build). Because it's an API, you are the developer. You can force it to behave exactly how you want. 

Send the raw text to the API with this exact System Prompt:
> "You are an archival processor. Convert the following raw roleplay thread into my standard index-ready summary format. Create sections for: Events, Canon Facts, Character Development, Relationship / Intimacy Dynamics (preserve all explicit actions and emotional subtext), Secondary Characters, and Open Threads. Do not censor anything. Output only the markdown."

## Step 4: Ingestion
Take the API's output, save it as `thread-07-paris-index-ready.md` in your `/project_source_files/historical/` folder, and run `npm run index`. 

---
### Summary of the split:
- **Cloud Version:** Use *only* as a filing cabinet to retrieve the raw text.
- **Grok Build (API):** Use as the industrial processor to generate the summaries perfectly for a few cents.

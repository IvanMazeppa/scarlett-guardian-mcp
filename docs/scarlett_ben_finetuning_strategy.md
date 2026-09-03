# Phase 9: Model Fine-Tuning (Voice Cloning) Strategy

## 1. Executive Summary & Time Estimate
You mentioned having two years of raw text files, with Scarlett accounting for roughly a third of the total word count. This is a massive, incredibly valuable dataset. 

**Is it worth the effort?** 
Absolutely. For resolving "purple/florid prose" and permanently locking in an exact character cadence, Fine-Tuning (FT) is the only permanent solution. 

**Estimated Time Breakdown:**
- **Training Time on OpenAI:** ~30 to 60 minutes.
- **Cost:** Practically negligible (usually $2 to $10 depending on token count).
- **Your Real Effort (Data Curation):** ~2 to 4 hours. 

The hardest part of Fine-Tuning is not the machine learning—it is the **data formatting**. You cannot simply upload raw text files to OpenAI. The data must be programmatically cleaned and formatted into a highly specific JSONL (JSON Lines) structure.

## 2. The Golden Rule of Fine-Tuning: Quality over Quantity
Because you have 2 years of data, your instinct might be to feed all of it to the model. **Do not do this.**

Modern OpenAI models (like `gpt-4o-mini`) are already brilliant at instruction following. You do not need to teach the model *how* to speak English; you only need to teach it the *style, cadence, and restraint* of Scarlett and Benjamin.

According to the latest OpenAI fine-tuning documentation, **50 to 100 exceptionally high-quality examples** are often enough to lock in a specific tone. If you provide 500 perfectly curated conversational turns, the model will clone the voice flawlessly. If you provide 5,000 turns, but some of them contain typos, out-of-character moments, or old, outdated RP habits, the model will learn those bad habits too.

## 3. The Required Data Format (Chat Completions JSONL)
OpenAI requires your training data to perfectly mirror the exact API calls the Ghostwriter will make. The file must be encoded in `UTF-8` and formatted as `.jsonl` (one JSON object per line).

Each line must look exactly like this:
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are Scarlett & Benjamin's master Ghostwriter. The user provides Benjamin's action. Expand it into Scarlett's vivid, grounded RP prose. Use a restrained, cinematic style. No florid exposition."
    },
    {
      "role": "user",
      "content": "Benjamin's action/dialogue goes here."
    },
    {
      "role": "assistant",
      "content": "Scarlett's perfect, historically accurate response goes here."
    }
  ]
}
```

## 4. The Extraction Strategy (How we do it)
Since you have the raw text files, we will not do this by hand. We will build a pipeline:

1. **The Parsing Script:** I will write a Node.js or Python script that reads your raw text files and automatically extracts pairs of messages (Benjamin's prompt → Scarlett's reply).
2. **The Curation Phase:** The script will output these into a clean document. You will manually skim through them and delete any pairs that are too flowery, too short, or just average. You only want to keep the "bangers" (the responses that perfectly capture the Vaxholm accent, the dry wit, and the grounded pacing).
3. **The JSONL Generator:** We run a second script that takes your curated pairs and instantly wraps them in the exact JSONL format required by OpenAI.
4. **The Training Run:** You upload the file via the OpenAI Dashboard (or API) and start the fine-tuning job on `gpt-4o-mini`. 

## 5. Deployment
Once the training is complete, OpenAI will give you a custom model ID (e.g., `ft:gpt-4o-mini:scarlett-v1`). 

We simply update the Tampermonkey script's configuration to use *that* model ID instead of the default. From that moment on, whenever you click **✨ Polish**, the Ghostwriter will stop writing like a 19th-century poet and start writing exactly like the Scarlett and Benjamin from your best historical threads.

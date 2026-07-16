# WP-3.4 mini live test — step-by-step (shadow duplex)

**Goal:** One clean turn cycle that produces `"duplex_source": "bridge_cache"` in a saved preflight report **without** manually pasting Scarlett’s previous message into OOC.

**Who:** Operator (browser + Grok thread). Grok Build can verify reports/curl after. Gemini can help draft Benjamin’s IC line only.

---

## A. Preconditions (5 minutes)

Checklist:

- [ ] Guardian running: `cd scarlett-guardian-mcp && npm run dev` → `:8790`  
- [ ] RAG running: `cd rag-memory-mcp && npm run dev` → `:8787` (if preflight needs retrieval)  
- [ ] Tampermonkey: **Scarlett Guardian Bridge v2** **Enabled**, mode **shadow**, page **refreshed** after any mode change  
- [ ] Older Guardian bridge / DOM probe scripts **removed or disabled**  
- [ ] Same Grok **conversation** you care about (thread id appears in URL)  
- [ ] Optional: clear confusion — do **not** switch to interceptor for this test  

Verify:

```bash
curl -sS http://127.0.0.1:8790/health
curl -sS http://127.0.0.1:8790/duplex-cache
```

Note current `chars` / `hash_prefix` so you can see when a **new** post lands.

---

## B. Capture Scarlett (bridge)

### Path B1 — automatic (preferred)

1. Ensure shadow pill armed earlier (or reload Grok tab once).  
2. In the Grok thread, let **Scarlett finish a full new IC reply** (wait until streaming fully stops; stop button gone; ~2s quiet).  
3. Watch bottom-right for something like `🛡 duplex ✓ … chars` (may be brief).  
4. Confirm cache updated:

```bash
curl -sS http://127.0.0.1:8790/duplex-cache
```

Expect: new or larger `chars`, new `hash_prefix`, `age_ms` near zero.

### Path B2 — manual force (if auto quiet detection fails)

1. Tampermonkey menu → **Guardian: scrape now (debug)** (pill OK).  
2. **Guardian: post scrape → duplex-cache** (pill may be easy to miss — trust curl).  
3. Re-run `curl` as above.

**Do not proceed to Benjamin’s turn until cache shows a fresh Scarlett-sized entry** (typically hundreds–thousands of chars).

---

## C. Send Benjamin (Grok thread) — no duplex paste

### Rules for this test

1. **Do not** paste Scarlett’s previous message into an OOC block for duplex.  
2. **Do** let the model call `guardian_memory_preflight` as usual (MCP connector).  
3. Prefer a **normal IC** Benjamin message (plus optional short recent_context in tool args if the model fills them — you need not OOC the whole checklist).  
4. If your project skill still *requires* duplex in OOC and the model refuses to call the tool without it, use the **minimal OOC** template in §D that **omits** scarlett_previous_message and explicitly says cache will supply it.

### What success looks like in Guardian logs / reports

- Full JSON: `"duplex_source": "bridge_cache"`  
- Retrieval notes mention bridge_cache or duplex provided  
- **No** `DUPLEX_INPUT_MISSING` (or only if cache was empty — then fail the test setup, not the story)

### Acceptable alternate

`"duplex_source": "caller"` means the **model** still sent duplex itself. Story can be fine; for WP-3.4 we prefer `bridge_cache` once. Retry with stronger “do not paste previous Scarlett text” if needed.

---

## D. Message templates

### D1 — Preferred: pure IC (if MCP + skill already preflight without OOC)

Send only Benjamin’s in-character line in the Grok chat box, e.g. grounded in current Nordschleife / paddock beat. No OOC block.

*(Gemini may help write this prose; keep continuity: post-stint / harness / private channel / team nearby as appropriate to latest scene.)*

### D2 — Minimal OOC if the model needs a nudge to call Guardian

Paste **one** user message shaped like:

```text
[OOC — duplex live test WP-3.4]
Call guardian_memory_preflight before IC prose.
- user_message = the Benjamin IC block below (verbatim)
- recent_context = short live where/when/who/mood from the latest scene
- Do NOT set scarlett_previous_message (leave empty/omit). Shadow bridge already POSTed Scarlett's last reply to Guardian /duplex-cache; server must merge duplex_source=bridge_cache.
- force_full_retrieval = false unless this turn is arc-critical
After preflight, write Scarlett IC only. No tools/JSON/meta in prose.

[IC — Benjamin]
<<PASTE OR WRITE BENJAMIN'S IC REPLY HERE>>
```

### D3 — Optional one-liner for Gemini when asking for IC help

```text
Write one Benjamin IC message (first person or second person as this thread uses) continuing the current Nordschleife/paddock beat after Scarlett's last reply. Keep it 1–3 short paragraphs, in-voice, no OOC, no tool talk. I will send it under a duplex live-test OOC that omits scarlett_previous_message.
```

---

## E. After the turn — verify (operator or Grok Build)

1. Newest files:

```bash
ls -lt scarlett-guardian-mcp/docs/guardian-reports/preflight-full-*.json | head -3
```

2. Inspect:

```bash
# example — use the newest path
rg -n "duplex_source|DUPLEX_INPUT_MISSING|scarlett_previous" \
  scarlett-guardian-mcp/docs/guardian-reports/preflight-full-NEWEST.json
```

3. Pass / fail:

| Result | Meaning |
|--------|---------|
| `duplex_source": "bridge_cache"` | **Pass** — mini WP-3.4 goal met |
| `caller` | Partial — duplex present but not from bridge |
| `absent` + `DUPLEX_INPUT_MISSING` | Fail — cache miss, wrong thread, Guardian down, or bridge didn’t post |

4. Optional: streamlined markdown should still read as novelist brief (no RAG dialect).

---

## F. If it fails — quick triage

| Symptom | Action |
|---------|--------|
| Cache never updates after Scarlett | scrape now → post scrape; or calibrate selector; check TM `@connect` / base URL |
| Cache updates but preflight `absent` | Different machine/URL Guardian; bearer mismatch; preflight hit other host; TTL (unlikely in one session) |
| Always `caller` | Model still pasting duplex — strengthen OOC “omit scarlett_previous_message” |
| Pill offline | `npm run dev` Guardian; menu set base URL `http://127.0.0.1:8790` |

---

## G. After a pass

- Tell Grok Build: “bridge_cache confirmed” (or paste the `duplex_source` line).  
- Roadmap can mark WP-3.4 mini evidence; full multi-turn ≥90% rate can be a longer session later.  
- Resume optional: staged queue reject, WP-3.3 polish, or Phase 4.

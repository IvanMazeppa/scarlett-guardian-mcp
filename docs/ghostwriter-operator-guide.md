# Ghostwriter operator guide (Bridge v2.5.0)

Ghostwriter is the pre-send **✨ Polish** control in the Guardian Browser Bridge userscript. It rewrites Benjamin’s draft in the visible Grok composer via OpenAI, then leaves Send to you.

v2.5.0 adds a compact **style dropdown** next to the button. Default is **Spoken IC**: a light copy-edit that keeps first-person speech and does not pad the scene. **Literary** is the old expand-into-prose behaviour, kept for A/B tests. New ideas are added as entries in `GHOSTWRITER_PRESETS` in the userscript.

It ships in the same Tampermonkey file as shadow duplex. It does **not** call Guardian, does **not** fill `/duplex-cache`, and does **not** auto-send. For duplex install, smoke, and modes, use [browser-bridge-v2-install.md](./browser-bridge-v2-install.md).

**Script:** `scarlett-guardian-mcp/scripts/guardian-browser-bridge.user.js` (v2.5.0)  
**Tampermonkey name:** `Scarlett Guardian Bridge v2.5.0 (Shadow Duplex)`  
**Matches:** `https://grok.com/*` and `https://*.x.ai/*`

---

## 1. Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Violentmonkey also works).
2. Open the Tampermonkey dashboard → **Create a new script** (or open the existing Guardian Bridge script).
3. Replace the template with the full contents of `scarlett-guardian-mcp/scripts/guardian-browser-bridge.user.js` (v2.5.0). Save.
4. Open `https://grok.com` (or your Grok host). Confirm the script is enabled for this origin. First run may prompt for GM `@connect` permissions:
   - `127.0.0.1` and `localhost` — Guardian duplex (`POST /duplex-cache`).
   - `*` — OpenAI (`https://api.openai.com/v1/chat/completions`). Allow both.
5. On a grok.com tab, open Tampermonkey → **Scarlett Guardian Bridge v2.5.0 (Shadow Duplex)** and run **Ghostwriter: set OpenAI API Key…**. Paste a key (`sk-...`). Leave the prompt empty to disable Ghostwriter. The corner pill should read `✨ Ghostwriter key saved (reload)`.
6. Reload the tab. The style dropdown and **✨ Polish** are injected only after a non-empty key is stored (`guardian_openai_api_key`). Until then neither control is created.
7. Optional: **Ghostwriter: set model…**. Default is `gpt-5.6-luna` (storage key `guardian_ghostwriter_model`). Pill: `✨ Ghostwriter model saved (reload)`. Reload after changing it.

The key lives only in Tampermonkey GM storage. Do not paste it into the userscript, `.env`, git, or chat logs.

---

## 2. Styles

The dropdown sits to the left of **✨ Polish**. The choice is stored as `guardian_ghostwriter_preset` and survives reloads.

| Style | When to use |
|-------|-------------|
| **Spoken IC** (default) | Daily play. Fixes grammar and rhythm. Keeps *I / we* speech. Does not invent bells, mountains, hand-holding, or a narrator. Caps length at about 1.3× the draft. |
| **Literary** | The old expander. Turns a beat into third-person RP prose with extra sensory padding. Use only when you actually want that, or to compare against Spoken IC. |

Success pill: `✨ Ghostwriter success (Spoken IC)` or `✨ Ghostwriter success (Literary)`. Changing the dropdown shows `✨ style: …`.

To add another idea later: append `{ id, label, system }` to `GHOSTWRITER_PRESETS` in the userscript, re-paste, reload. The dropdown picks it up automatically.

---

## 3. Testing

Grok’s composer is a TipTap / ProseMirror `contenteditable` editor. A hidden dummy `<textarea>` often still exists with `value === "x"`. v2.4.0+ never uses dummy `textarea.value` for GET or SET.

### A. Dump the composer before Polish

1. Click into the Grok composer and type a **real draft of 200+ characters**.
2. Open DevTools → Console.
3. Tampermonkey menu → **Ghostwriter: dump composer (debug)**.
4. Confirm:
   - Pill like `✨ composer DIV 247c`.
   - Console dump shows `isContentEditable: true`, `getComposerTextLen` matching the typed length, and `preset` (`spoken-ic` or `literary-expand`).
   - `textareas` may still list a dummy with `value: "x"`. Expected.

### B. Spoken IC is not a scene rewrite

1. Leave the dropdown on **Spoken IC**.
2. Paste a first-person draft (the Soglio / Friday / St Moritz itinerary is a good fixture).
3. Click **✨ Polish**.
4. Confirm the result:
   - Still first person (`I` / `we` / “how does it sound”), not “Benjamin let his gaze drift…”.
   - Same facts (Soglio, Friday, rental car, noon, St Moritz, London, fire downstairs).
   - Length close to the draft, not 3–4× with bells, knuckles, and amber light.
5. Switch the dropdown to **Literary**, Polish the **same** original draft (undo first if needed). You should see the old florid expand. That contrast is the point of the dropdown.

### C. Send submits the new text

1. Click Grok **Send** (Polish never submits).
2. Confirm the posted user bubble is the polished turn.
3. Clear the composer and click **✨ Polish**. Pill: `✨ Please type something first!`. No OpenAI call.

### D. Shadow duplex still works

After Scarlett finishes a new reply, the 🛡 pill should still post as in [browser-bridge-v2-install.md](./browser-bridge-v2-install.md). Guardian must be running for this check; Polish does not need Guardian.

---

## 4. General use advice

1. **Polish is a pre-send rewrite.** Type a Benjamin turn, pick a style, click **✨ Polish**, read it, edit if needed, then Send yourself.
2. **Spoken IC wants a real spoken draft**, not a one-line stub it is meant to invent a scene from. If you want invention, use **Literary**.
3. **Stay on shadow mode for daily play.** See [browser-bridge-v2-install.md](./browser-bridge-v2-install.md).
4. **Ghostwriter is independent of Guardian duplex.** No key → no controls. Duplex can be offline and Polish still works.
5. **Re-paste the userscript after upgrades.** Tampermonkey does not pick up repo file changes until you replace the script body and save.
6. **Do not commit API keys.** Storage keys: `guardian_openai_api_key`, `guardian_ghostwriter_model`, `guardian_ghostwriter_preset`.
7. **Placement.** The style + Polish cluster is `position: absolute; right: 160px; bottom: 16px` on the composer wrapper. The 🛡 pill stays at `bottom: 16px; right: 16px`.

### If Polish reads empty, stays florid, or write fails

| Symptom | What to check |
|---------|----------------|
| `✨ Please type something first!` with a visible draft | Run **Ghostwriter: dump composer (debug)**. Want `isContentEditable: true` and `getComposerTextLen` matching the draft. |
| Still third-person / padded mountains | Dropdown is **Literary**, or Tampermonkey still has **v2.4.0**. Confirm `@version 2.5.0`, re-paste, set **Spoken IC**. |
| `✨ composer write failed` | Dump, reload, click the editor, Polish again. |
| `✨ Ghostwriter API err: …` / network err | Allow `@connect *` for `api.openai.com`. Check key and model. |
| No dropdown / no **✨ Polish** | No saved key, or wrapper not found yet (retry every 1s). Save the key, reload, click the composer. |
| Dropdown does not open | Grok may still trap the click. Reload. If it persists, the style is still stored from the last successful change (`guardian_ghostwriter_preset`). |

### Ghostwriter menu (Tampermonkey → script menu on grok.com)

| Command | Purpose |
|---------|---------|
| **Ghostwriter: set OpenAI API Key…** | Persist `guardian_openai_api_key`. Empty disables. Reload after save. |
| **Ghostwriter: set model…** | Persist `guardian_ghostwriter_model` (default `gpt-5.6-luna`). Reload after save. |
| **Ghostwriter: dump composer (debug)** | Log editor tag, `contenteditable`, lengths, current preset, and all `textarea` values. |

Guardian duplex commands are documented in the install guide, not here.

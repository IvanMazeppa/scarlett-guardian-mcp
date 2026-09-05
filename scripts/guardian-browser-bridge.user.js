// ==UserScript==
// @name         Scarlett Guardian Bridge v2.5.1 (Shadow Duplex)
// @namespace    http://tampermonkey.net/
// @version      2.5.1
// @description  Shadow sidecar: scrape Scarlett's last IC reply → POST Guardian /duplex-cache. WP-R1 + Mission Control static domain menu.
// @author       Grok Build (WP-3.2 / WP-R1)
// @match        *://grok.com/*
// @match        *://*.x.ai/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/**
 * WP-3.2 / WP-R1 / Mission Control — Userscript v2.2
 *
 * Modes (Tampermonkey menu or GM storage key guardian_mode):
 *   shadow      (default) — watch DOM, POST /duplex-cache; never touches composer/send
 *   interceptor — legacy: intercept send → POST /preflight → inject context (fail-open)
 *   calibrate   — stub: click-to-pin selector (full UX lands in WP-3.3)
 *
 * WP-R1: ignore short non-narrative bubbles; select last substantial RP block;
 *        GM-storage last-good snapshot seeds new threads after URL change.
 *
 * Secrets / tunnel URL: set via Tampermonkey menu or GM_setValue — do not hardcode tokens.
 * Menu "use Mission Control domain…" sets https://YOUR_DOMAIN (origin only, no /mcp).
 * Edge Basic Auth covers /dashboard only — leave /duplex-cache unauthenticated at ngrok.
 *
 * Install: Tampermonkey → Create new script → paste this file → save.
 * Local Guardian: guardian_base_url = http://127.0.0.1:8790
 * Remote: guardian_base_url = https://your-name.ngrok.app  (no trailing path)
 * After upgrade: re-paste this file into Tampermonkey (or update the existing script).
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Config (defaults + GM storage)
  // ---------------------------------------------------------------------------
  function gmGet(key, fallback) {
    try {
      const v = GM_getValue(key, fallback);
      return v === undefined || v === null || v === "" ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      GM_setValue(key, value);
    } catch (e) {
      console.warn("[Guardian Bridge] GM_setValue failed", e);
    }
  }

  const CONFIG = {
    /** @type {"shadow"|"interceptor"|"calibrate"} */
    mode: String(gmGet("guardian_mode", "shadow")),
    /** Base URL only — no /preflight or /duplex-cache suffix */
    guardianBaseUrl: String(gmGet("guardian_base_url", "http://127.0.0.1:8790")).replace(/\/+$/, ""),
    bearerToken: String(gmGet("guardian_bearer_token", "")),
    threadKeyFromUrl: gmGet("guardian_thread_key_from_url", true) !== false,
    quietMs: Number(gmGet("guardian_quiet_ms", 1500)) || 1500,
    maxChars: Number(gmGet("guardian_max_chars", 12000)) || 12000,
    /** WP-R1: match server DEFAULT_DUPLEX_MIN_CHARS */
    minChars: Number(gmGet("guardian_duplex_min_chars", 200)) || 200,
    forceFullRetrieval: gmGet("guardian_force_full_retrieval", false) === true,
    autoSubmitAfterPreflight: gmGet("guardian_auto_submit", false) === true,
    failClosed: gmGet("guardian_fail_closed", false) === true,
    openaiApiKey: String(gmGet("guardian_openai_api_key", "")),
    ghostwriterModel: String(gmGet("guardian_ghostwriter_model", "gpt-5.6-luna")),
    ghostwriterPreset: String(gmGet("guardian_ghostwriter_preset", "spoken-ic"))
  };

  /**
   * WP-R1: substantial narrative only (aligned with server isSubstantialDuplexMessage).
   * @param {string} text
   */
  function isSubstantialNarrative(text) {
    const t = normalizeText(text || "");
    if (t.length < CONFIG.minChars) return false;
    if (/^(understood|got it|ok(?:ay)?|thanks?|acknowledged|noted|will do|sure|yes|no)[.!]?$/i.test(t)) {
      return false;
    }
    const hasSentenceEnd = /[.!?]["']?(\s|$)/.test(t);
    const multiLine = t.includes("\n");
    const hasDialogue = /["“”]/.test(t) || /\b(I|I'm|I've|my|me)\b/i.test(t);
    return hasSentenceEnd || multiLine || hasDialogue;
  }

  // ---------------------------------------------------------------------------
  // Status pill
  // ---------------------------------------------------------------------------
  let pillEl = null;
  let pillTimer = null;

  function ensurePill() {
    if (pillEl) return pillEl;
    pillEl = document.createElement("div");
    pillEl.id = "guardian-bridge-pill";
    pillEl.setAttribute("data-guardian-ui", "1");
    Object.assign(pillEl.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "2147483646",
      padding: "8px 12px",
      borderRadius: "999px",
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: "12px",
      fontWeight: "600",
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      transition: "opacity 0.25s ease",
      opacity: "0",
      pointerEvents: "none",
      maxWidth: "min(360px, 90vw)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    });
    document.documentElement.appendChild(pillEl);
    return pillEl;
  }

  function showPill(message, kind) {
    const el = ensurePill();
    const colors = {
      ok: { bg: "#e8f5e9", fg: "#1b5e20", border: "#a5d6a7" },
      warn: { bg: "#fff8e1", fg: "#e65100", border: "#ffe082" },
      err: { bg: "#ffebee", fg: "#b71c1c", border: "#ef9a9a" },
      info: { bg: "#e3f2fd", fg: "#0d47a1", border: "#90caf9" }
    };
    const c = colors[kind] || colors.info;
    el.style.background = c.bg;
    el.style.color = c.fg;
    el.style.border = `1px solid ${c.border}`;
    el.textContent = message;
    el.style.opacity = "1";
    if (pillTimer) clearTimeout(pillTimer);
    pillTimer = setTimeout(() => {
      el.style.opacity = "0";
    }, 4500);
  }

  // ---------------------------------------------------------------------------
  // Hash + normalize (aligned with server duplex-cache intent)
  // ---------------------------------------------------------------------------
  function normalizeText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function extractThreadKey() {
    if (!CONFIG.threadKeyFromUrl) return "default";
    try {
      const path = location.pathname || "";
      // Common patterns: /chat/<id>, /c/<id>, /share/<id>
      const m =
        path.match(/\/(?:chat|c|conversation|share)\/([a-zA-Z0-9_-]{6,})/) ||
        path.match(/\/([a-f0-9-]{16,})\/?$/i);
      if (m && m[1]) return m[1];
    } catch {
      /* ignore */
    }
    return "default";
  }

  // ---------------------------------------------------------------------------
  // Layered bubble scraper
  // ---------------------------------------------------------------------------
  const CHROME_STRIP_SELECTORS = [
    "button",
    "[role='button']",
    "nav",
    "time",
    "[data-testid*='copy']",
    "[data-testid*='regenerate']",
    "[aria-label*='Copy']",
    "[aria-label*='Regenerate']",
    "[aria-label*='Share']",
    "[aria-label*='Good response']",
    "[aria-label*='Bad response']"
  ].join(",");

  function looksLikeUserBubble(el) {
    if (!el || !el.getAttribute) return false;
    const testid = (el.getAttribute("data-testid") || "").toLowerCase();
    const cls = (el.className && String(el.className)) || "";
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    if (/user|human|prompt/.test(testid)) return true;
    if (/user|human|prompt/.test(cls) && !/assistant|response|model|bot/.test(cls)) return true;
    if (/you said|your message/.test(aria)) return true;
    // Avatar / edit affordances often mark user rows
    if (el.querySelector && el.querySelector('[data-testid*="user"], [class*="user-avatar"]')) return true;
    return false;
  }

  function extractCleanText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    try {
      clone.querySelectorAll(CHROME_STRIP_SELECTORS).forEach((n) => n.remove());
    } catch {
      /* ignore */
    }
    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function queryLayers() {
    const override = gmGet("guardian_selector_override", null);
    const layers = [];
    if (override && typeof override === "string") layers.push(override);
    layers.push(
      '[data-testid*="message"]:not([data-testid*="user"])',
      '[data-testid*="assistant"]',
      '[class*="message-row"], [class*="response"], [class*="assistant"]',
      'article, [role="article"], [role="listitem"]'
    );
    return layers;
  }

  /**
   * Find the last *substantial* assistant-authored bubble (WP-R1).
   * Walks from end; skips user bubbles, UI chrome, and short OOC acks.
   * @returns {{ text: string, el: Element|null, layer: string }}
   */
  function scrapeLastAssistant() {
    for (const sel of queryLayers()) {
      let nodes;
      try {
        nodes = Array.from(document.querySelectorAll(sel));
      } catch {
        continue;
      }
      if (!nodes.length) continue;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const el = nodes[i];
        if (el.closest && el.closest("[data-guardian-ui]")) continue;
        if (looksLikeUserBubble(el)) continue;
        const text = extractCleanText(el).slice(0, CONFIG.maxChars);
        if (isSubstantialNarrative(text)) {
          return { text, el, layer: sel };
        }
      }
    }

    // Structural fallback: prefer longest substantial block near end of main
    const main = document.querySelector("main") || document.body;
    const candidates = Array.from(main.querySelectorAll("div, article, section")).filter((el) => {
      if (el.closest("[data-guardian-ui]")) return false;
      if (el.querySelector("textarea")) return false;
      if (looksLikeUserBubble(el)) return false;
      const t = extractCleanText(el);
      return isSubstantialNarrative(t) && t.length < 50000;
    });
    if (candidates.length) {
      const el = candidates[candidates.length - 1];
      const text = extractCleanText(el).slice(0, CONFIG.maxChars);
      if (isSubstantialNarrative(text)) return { text, el, layer: "structural-heuristic" };
    }
    return { text: "", el: null, layer: "none" };
  }

  // ---------------------------------------------------------------------------
  // Completion detector
  // ---------------------------------------------------------------------------
  function isProbablyStreaming() {
    // Stop / cancel generation affordances
    const stop =
      document.querySelector('button[aria-label*="Stop" i]') ||
      document.querySelector('button[aria-label*="Cancel" i]') ||
      document.querySelector('[data-testid*="stop"]');
    if (stop && isVisible(stop)) return true;
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const st = window.getComputedStyle(el);
    return st && st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  function createCompletionDetector(onComplete) {
    let quietTimer = null;
    let lastSnapshot = "";
    let lastUrl = location.href;
    let armed = true;

    function snapshot() {
      const { text } = scrapeLastAssistant();
      return text;
    }

    function scheduleQuietCheck() {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        if (!armed) return;
        if (isProbablyStreaming()) {
          scheduleQuietCheck();
          return;
        }
        const text = snapshot();
        if (!text || !isSubstantialNarrative(text)) return;
        if (text === lastSnapshot) return;
        // Require stability: re-check once more after quietMs
        const frozen = text;
        setTimeout(() => {
          if (!armed) return;
          if (isProbablyStreaming()) return;
          const again = snapshot();
          if (again === frozen && isSubstantialNarrative(frozen)) {
            lastSnapshot = frozen;
            onComplete(frozen);
          }
        }, 200);
      }, CONFIG.quietMs);
    }

    const observer = new MutationObserver((mutations) => {
      // Ignore our own UI mutations
      let relevant = false;
      for (const m of mutations) {
        const t = m.target;
        if (t && t.closest && t.closest("[data-guardian-ui]")) continue;
        relevant = true;
        break;
      }
      if (!relevant) return;
      scheduleQuietCheck();
    });

    function start() {
      const root = document.querySelector("main") || document.body;
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });
      // SPA URL changes — WP-R1: seed duplex from last-good GM snapshot
      setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          lastSnapshot = "";
          armed = true;
          showPill("🛡 thread changed — re-armed", "info");
          seedFromLastGoodSnapshot();
        }
      }, 1000);
    }

    function resetBaseline() {
      lastSnapshot = snapshot();
    }

    return { start, resetBaseline, scheduleQuietCheck };
  }

  // ---------------------------------------------------------------------------
  // Transport — GM_xmlhttpRequest → /duplex-cache
  // ---------------------------------------------------------------------------
  let lastPostedHash = gmGet("guardian_last_duplex_hash", "");

  function authHeaders() {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "ngrok-skip-browser-warning": "1"
    };
    if (CONFIG.bearerToken) {
      h.Authorization = `Bearer ${CONFIG.bearerToken}`;
    }
    return h;
  }

  function postDuplexCache(text, hash) {
    const url = `${CONFIG.guardianBaseUrl}/duplex-cache`;
    const body = {
      scarlett_message: text,
      thread_key: extractThreadKey(),
      content_hash: hash,
      captured_at: Date.now()
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url,
        headers: authHeaders(),
        data: JSON.stringify(body),
        onload(res) {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText || "{}"));
            } catch {
              resolve({ ok: true, raw: res.responseText });
            }
          } else {
            reject(new Error(`HTTP ${res.status}: ${(res.responseText || "").slice(0, 200)}`));
          }
        },
        onerror(err) {
          reject(err || new Error("network error"));
        },
        ontimeout() {
          reject(new Error("timeout"));
        },
        timeout: 15000
      });
    });
  }

  async function onScarlettComplete(text) {
    const normalized = normalizeText(text).slice(0, CONFIG.maxChars);
    if (!isSubstantialNarrative(normalized)) {
      console.log("[Guardian Bridge] skip non-substantial scrape", {
        chars: normalized.length,
        preview: normalized.slice(0, 80)
      });
      return;
    }

    let hash;
    try {
      hash = await sha256Hex(normalized);
    } catch {
      hash = `fallback-${normalized.length}-${normalized.slice(0, 32)}`;
    }

    if (hash === lastPostedHash) {
      // Identical regeneration / re-fire — skip
      return;
    }

    showPill("🛡 duplex… posting", "info");
    try {
      const res = await postDuplexCache(normalized, hash);
      lastPostedHash = hash;
      gmSet("guardian_last_duplex_hash", hash);
      // WP-R1: durable last-good snapshot for new-thread seed
      gmSet("guardian_last_good_scarlett", normalized);
      gmSet("guardian_last_good_thread", extractThreadKey());
      gmSet("guardian_last_good_at", Date.now());
      const chars = res.chars || normalized.length;
      const k = chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : String(chars);
      showPill(`🛡 duplex ✓ ${k} chars`, "ok");
      console.log("[Guardian Bridge] duplex-cache ok", {
        thread: extractThreadKey(),
        chars,
        hash: String(hash).slice(0, 12)
      });
    } catch (e) {
      showPill("🛡 offline / duplex fail", "err");
      console.warn("[Guardian Bridge] duplex-cache failed", e);
    }
  }

  /**
   * WP-R1: after SPA thread change, POST last known-good RP block so preflight
   * is not stuck on absent until the first new Scarlett turn completes.
   */
  async function seedFromLastGoodSnapshot() {
    const snap = String(gmGet("guardian_last_good_scarlett", "") || "");
    if (!isSubstantialNarrative(snap)) return;
    let hash;
    try {
      hash = await sha256Hex(snap);
    } catch {
      hash = `seed-${snap.length}`;
    }
    if (hash === lastPostedHash) return;
    showPill("🛡 seeding duplex from last-good…", "info");
    try {
      await postDuplexCache(snap, hash);
      lastPostedHash = hash;
      gmSet("guardian_last_duplex_hash", hash);
      showPill(`🛡 seed ✓ ${snap.length}c`, "ok");
      console.log("[Guardian Bridge] seeded duplex from last-good snapshot", {
        thread: extractThreadKey(),
        chars: snap.length
      });
    } catch (e) {
      console.warn("[Guardian Bridge] seed failed", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Shadow mode
  // ---------------------------------------------------------------------------
  function startShadowMode() {
    console.log(
      `[Guardian Bridge v2.1] shadow mode → ${CONFIG.guardianBaseUrl}/duplex-cache minChars=${CONFIG.minChars} (thread=${extractThreadKey()})`
    );
    showPill("🛡 shadow duplex armed", "info");
    const detector = createCompletionDetector((text) => {
      onScarlettComplete(text);
    });
    detector.start();
    // Warm baseline so we don't re-post an already-visible old message immediately
    setTimeout(() => detector.resetBaseline(), 800);
    // If this is a fresh tab with empty DOM, still try last-good seed once
    setTimeout(() => {
      const { text } = scrapeLastAssistant();
      if (!text) seedFromLastGoodSnapshot();
    }, 1200);
  }

  // ---------------------------------------------------------------------------
  // Interceptor mode (legacy v1, fail-open by default) — WP later hardens
  // ---------------------------------------------------------------------------
  function setNativeValue(element, value) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (desc && desc.set) desc.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function startInterceptorMode() {
    console.warn(
      "[Guardian Bridge v2] interceptor mode is legacy/fallback — prefer shadow + MCP duplex. failClosed=",
      CONFIG.failClosed
    );
    showPill("🛡 interceptor (legacy)", "warn");

    let isPreflighting = false;
    let allowProgrammaticSubmit = false;

    function handleSendAttempt(e, attachedEditor, button) {
      if (allowProgrammaticSubmit) {
        allowProgrammaticSubmit = false;
        return;
      }
      if (isPreflighting) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const editor = findComposerEditor() || attachedEditor;
      const userText = getComposerText(editor);
      if (!userText) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      isPreflighting = true;
      showPill("🛡 preflight…", "info");

      // Prefer scraped duplex for this preflight
      const scraped = scrapeLastAssistant().text;

      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.guardianBaseUrl}/preflight`,
        headers: authHeaders(),
        data: JSON.stringify({
          user_message: userText,
          scarlett_previous_message: scraped || undefined,
          thread_key: extractThreadKey(),
          force_full_retrieval: CONFIG.forceFullRetrieval
        }),
        onload(response) {
          isPreflighting = false;
          try {
            if (response.status < 200 || response.status >= 300) {
              showPill(`🛡 preflight HTTP ${response.status}`, "err");
              if (!CONFIG.failClosed) {
                allowProgrammaticSubmit = true;
                button.click();
              }
              return;
            }
            const data = JSON.parse(response.responseText);
            if (data.proceed_recommendation === "do_not_proceed" && CONFIG.failClosed) {
              showPill("🛡 blocked by Guardian", "err");
              return;
            }
            // Prefer server brief fields if present; else minimal inject
            const brief =
              data.brief_markdown ||
              data.grok_scene_summary ||
              data.current_state_summary ||
              "";
            if (brief && CONFIG.autoSubmitAfterPreflight) {
              const enriched = `${userText}\n\n<guardian_context>\n${String(brief).slice(0, 4000)}\n</guardian_context>`;
              setComposerText(editor, enriched);
            }
            showPill("🛡 preflight ok — send manually if needed", "ok");
            if (CONFIG.autoSubmitAfterPreflight) {
              allowProgrammaticSubmit = true;
              button.click();
            } else {
              // Leave original text; operator sends (fail-open path already didn't inject hard flags)
              if (!CONFIG.autoSubmitAfterPreflight && !brief) {
                allowProgrammaticSubmit = true;
                button.click();
              }
            }
          } catch (err) {
            showPill("🛡 preflight parse error", "err");
            if (!CONFIG.failClosed) {
              allowProgrammaticSubmit = true;
              button.click();
            }
          }
        },
        onerror() {
          isPreflighting = false;
          showPill("🛡 offline — sending raw", "err");
          if (!CONFIG.failClosed) {
            allowProgrammaticSubmit = true;
            button.click();
          }
        }
      });
    }

    function attach() {
      const editor = findComposerEditor();
      if (!editor || editor.dataset.guardianAttached) return;
      const form = editor.closest("form") || editor.parentElement;
      const button =
        document.querySelector('button[aria-label="Send"]') ||
        document.querySelector('button[aria-label="Submit"]') ||
        (form &&
          Array.from(form.querySelectorAll("button")).find(
            (b) => !b.closest("[data-guardian-ui]") && !/polish/i.test(b.textContent || "")
          ));
      if (!button) return;
      editor.dataset.guardianAttached = "true";
      editor.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter" && !e.shiftKey) handleSendAttempt(e, editor, button);
        },
        { capture: true }
      );
      button.addEventListener(
        "click",
        (e) => {
          if (e.isTrusted) handleSendAttempt(e, editor, button);
        },
        { capture: true }
      );
    }
    setInterval(attach, 1000);
  }

  // ---------------------------------------------------------------------------
  // Calibrate stub (WP-3.3 expands)
  // ---------------------------------------------------------------------------
  function startCalibrateMode() {
    showPill("🛡 calibrate: click Scarlett bubble", "warn");
    console.log(
      "[Guardian Bridge] Calibrate mode (WP-3.2 stub / WP-3.3 full). Click the last Scarlett message bubble."
    );

    function onClick(e) {
      const el = e.target && e.target.closest ? e.target.closest("div, article, section") : null;
      if (!el || el.closest("[data-guardian-ui]")) return;
      e.preventDefault();
      e.stopPropagation();
      // Prefer data-* attributes for a stable selector
      let sel = null;
      if (el.getAttribute("data-testid")) {
        sel = `[data-testid="${el.getAttribute("data-testid")}"]`;
      } else if (el.id) {
        sel = `#${CSS.escape(el.id)}`;
      } else {
        const cls = Array.from(el.classList || [])
          .filter((c) => c.length > 2 && !/^[a-f0-9]{6,}$/i.test(c))
          .slice(0, 2);
        if (cls.length) sel = cls.map((c) => `.${CSS.escape(c)}`).join("");
      }
      if (sel) {
        gmSet("guardian_selector_override", sel);
        const sample = extractCleanText(el).slice(0, 120);
        showPill(`🛡 selector saved`, "ok");
        console.log("[Guardian Bridge] selector override:", sel, "sample:", sample);
      } else {
        showPill("🛡 could not derive selector", "err");
      }
      document.removeEventListener("click", onClick, true);
    }
    document.addEventListener("click", onClick, true);
  }

  // ---------------------------------------------------------------------------
  // Menu + boot
  // ---------------------------------------------------------------------------
  try {
    GM_registerMenuCommand("Guardian: mode → shadow", () => {
      gmSet("guardian_mode", "shadow");
      showPill("🛡 mode=shadow (reload page)", "info");
    });
    GM_registerMenuCommand("Guardian: mode → interceptor", () => {
      gmSet("guardian_mode", "interceptor");
      showPill("🛡 mode=interceptor (reload page)", "warn");
    });
    GM_registerMenuCommand("Guardian: mode → calibrate", () => {
      gmSet("guardian_mode", "calibrate");
      showPill("🛡 mode=calibrate (reload page)", "warn");
    });
    GM_registerMenuCommand("Guardian: set base URL…", () => {
      const next = prompt("Guardian base URL (no path)", CONFIG.guardianBaseUrl);
      if (next) {
        gmSet("guardian_base_url", next.replace(/\/+$/, ""));
        showPill("🛡 base URL saved (reload)", "info");
      }
    });
    GM_registerMenuCommand("Guardian: use Mission Control domain…", () => {
      const hint =
        CONFIG.guardianBaseUrl.startsWith("https://") && !/127\.0\.0\.1|localhost/.test(CONFIG.guardianBaseUrl)
          ? CONFIG.guardianBaseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
          : "your-name.ngrok.app";
      const host = prompt(
        "Mission Control hostname only (no https://, no /mcp)\nExample: scarlett-guardian.ngrok.app",
        hint
      );
      if (!host) return;
      const cleaned = String(host)
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/+$/, "")
        .replace(/\/(mcp|dashboard|preflight).*$/i, "");
      if (!cleaned) {
        showPill("🛡 empty domain", "err");
        return;
      }
      gmSet("guardian_base_url", `https://${cleaned}`);
      showPill("🛡 Mission Control URL saved (reload)", "info");
    });
    GM_registerMenuCommand("Guardian: use local 8790", () => {
      gmSet("guardian_base_url", "http://127.0.0.1:8790");
      showPill("🛡 local URL saved (reload)", "info");
    });
    GM_registerMenuCommand("Guardian: set bearer token…", () => {
      const next = prompt("Bearer token (empty to clear)", CONFIG.bearerToken || "");
      if (next !== null) {
        gmSet("guardian_bearer_token", next);
        showPill("🛡 token saved (reload)", "info");
      }
    });

    GM_registerMenuCommand("Ghostwriter: set OpenAI API Key…", () => {
      const next = prompt("OpenAI API Key for Ghostwriter (sk-...) (empty to disable)", CONFIG.openaiApiKey || "");
      if (next !== null) {
        gmSet("guardian_openai_api_key", next);
        showPill("✨ Ghostwriter key saved (reload)", "info");
      }
    });
    
    GM_registerMenuCommand("Ghostwriter: set model…", () => {
      const next = prompt("OpenAI model (default: gpt-5.6-luna)", CONFIG.ghostwriterModel);
      if (next !== null) {
        gmSet("guardian_ghostwriter_model", next);
        showPill("✨ Ghostwriter model saved (reload)", "info");
      }
    });
    GM_registerMenuCommand("Ghostwriter: dump composer (debug)", () => {
      const editor = findComposerEditor();
      const textareas = Array.from(document.querySelectorAll("textarea")).map((ta) => ({
        visible: isVisible(ta),
        len: (ta.value || "").length,
        value: ta.value,
        placeholder: ta.placeholder || ""
      }));
      if (!editor) {
        console.log("[Guardian Bridge] composer dump: no editor found", { textareas });
        showPill("✨ no composer found", "warn");
        return;
      }
      const info = {
        tag: editor.tagName,
        classes: String(editor.className || ""),
        isContentEditable: !!editor.isContentEditable,
        innerTextLen: String(editor.innerText || "").replace(/\u200B/g, "").length,
        getComposerTextLen: getComposerText(editor).length,
        role: editor.getAttribute("role") || "",
        preset: getGhostwriterPreset().id,
        textareas
      };
      console.log("[Guardian Bridge] composer dump", info);
      showPill(`✨ composer ${editor.tagName} ${info.innerTextLen}c`, "info");
    });
    GM_registerMenuCommand("Guardian: scrape now (debug)", async () => {
      const { text, layer } = scrapeLastAssistant();
      console.log("[Guardian Bridge] scrape", { layer, chars: text.length, preview: text.slice(0, 200) });
      if (text) {
        const h = await sha256Hex(normalizeText(text));
        showPill(`🛡 scraped ${text.length}c @ ${layer}`, "info");
        console.log("[Guardian Bridge] hash", h.slice(0, 16));
      } else {
        showPill("🛡 scrape empty", "err");
      }
    });
    GM_registerMenuCommand("Guardian: post scrape → duplex-cache", async () => {
      const { text } = scrapeLastAssistant();
      if (!text) {
        showPill("🛡 nothing to post", "err");
        return;
      }
      await onScarlettComplete(text);
    });
    GM_registerMenuCommand("Guardian: clear duplex-cache (server)", () => {
      GM_xmlhttpRequest({
        method: "DELETE",
        url: `${CONFIG.guardianBaseUrl}/duplex-cache`,
        headers: authHeaders(),
        onload(res) {
          if (res.status >= 200 && res.status < 300) {
            lastPostedHash = "";
            gmSet("guardian_last_duplex_hash", "");
            showPill("🛡 cache cleared", "ok");
            console.log("[Guardian Bridge] duplex-cache cleared", res.responseText);
          } else {
            showPill(`🛡 clear failed HTTP ${res.status}`, "err");
          }
        },
        onerror() {
          showPill("🛡 clear offline", "err");
        }
      });
    });
  } catch {
    /* menu optional */
  }

  const mode = (CONFIG.mode || "shadow").toLowerCase();
  if (mode === "interceptor") startInterceptorMode();
  else if (mode === "calibrate") startCalibrateMode();
  else startShadowMode();
  
  startGhostwriterMode(); // Boot the ghostwriter button loop

  // ---------------------------------------------------------------------------
  // Composer I/O — TipTap / ProseMirror contenteditable (Ghostwriter + interceptor)
  // Dummy <textarea value="x"> nodes are never used for GET/SET.
  // innerHTML is intentionally not a write path (silent-empty-send failure mode).
  // ---------------------------------------------------------------------------
  function isContentEditableNode(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const ce = el.getAttribute && el.getAttribute("contenteditable");
    return ce === "true" || ce === "plaintext-only";
  }

  function isPlainTextControl(el) {
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
  }

  function composerRectOk(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 16) return false;
    const vh = window.innerHeight || 0;
    const vw = window.innerWidth || 0;
    if (r.bottom < 0 || r.right < 0) return false;
    if (vh && r.top > vh) return false;
    if (vw && r.left > vw) return false;
    return true;
  }

  function isComposerInsideMessageBubble(el) {
    if (el.closest && el.closest("form")) return false;
    const bubble = el.closest(
      '[data-testid*="message"], [data-testid*="assistant"], [class*="message-row"], [role="article"], [role="listitem"]'
    );
    return !!bubble;
  }

  function isViableComposer(el) {
    if (!el) return false;
    if (el.closest && el.closest("[data-guardian-ui]")) return false;
    if (!isVisible(el)) return false;
    if (!composerRectOk(el)) return false;
    if (isComposerInsideMessageBubble(el)) return false;
    return true;
  }

  function scoreComposer(el) {
    let score = 0;
    if (document.activeElement === el) score += 100;
    const cls = String(el.className || "");
    if (/\btiptap\b/i.test(cls) || /\bProseMirror\b/.test(cls)) score += 50;
    if ((el.getAttribute && el.getAttribute("role")) === "textbox") score += 40;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    if (vh && r.top > vh / 2) score += 30;
    if (el.closest && el.closest("form")) score += 20;
    score += Math.min(20, (r.width || 0) / 100);
    return score;
  }

  function findVisibleTextareaFallback() {
    let best = null;
    let bestLen = -1;
    const nodes = document.querySelectorAll("textarea");
    for (let i = 0; i < nodes.length; i++) {
      const ta = nodes[i];
      if (!isViableComposer(ta)) continue;
      const val = String(ta.value || "").trim();
      if (val === "x") continue;
      if (val.length > bestLen) {
        best = ta;
        bestLen = val.length;
      }
    }
    return best;
  }

  function findComposerEditor() {
    const seen = new Set();
    const candidates = [];

    function add(el) {
      if (!el || el.nodeType !== 1 || seen.has(el)) return;
      seen.add(el);
      candidates.push(el);
    }

    const active = document.activeElement;
    if (isContentEditableNode(active)) add(active);

    const selectors = [
      ".tiptap.ProseMirror",
      '.ProseMirror[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[data-lexical-editor="true"]',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]'
    ];
    for (let i = 0; i < selectors.length; i++) {
      let nodes;
      try {
        nodes = document.querySelectorAll(selectors[i]);
      } catch {
        continue;
      }
      for (let j = 0; j < nodes.length; j++) add(nodes[j]);
    }

    const viable = candidates.filter(isViableComposer);
    if (viable.length) {
      viable.sort((a, b) => scoreComposer(b) - scoreComposer(a));
      return viable[0];
    }

    return findVisibleTextareaFallback();
  }

  function getComposerText(el) {
    if (!el) return "";
    if (isPlainTextControl(el)) {
      const v = String(el.value || "").trim();
      if (v === "x") return "";
      return v;
    }
    if (!isContentEditableNode(el)) return "";
    const cls = String(el.className || "");
    if (/\bis-empty\b/.test(cls) || /\bProseMirror-placeholder\b/.test(cls)) return "";
    if (el.querySelector && el.querySelector(".ProseMirror-placeholder")) {
      const placeholderRaw = String(el.innerText || "").replace(/\u200B/g, "").trim();
      if (!placeholderRaw) return "";
    }
    const raw = String(el.innerText || "").replace(/\u200B/g, "").trim();
    const ariaPh = ((el.getAttribute && el.getAttribute("aria-placeholder")) || "").trim();
    if (ariaPh && raw === ariaPh) return "";
    const dataPh = ((el.getAttribute && el.getAttribute("data-placeholder")) || "").trim();
    if (dataPh && raw === dataPh) return "";
    return raw;
  }

  function selectComposerContents(el) {
    if (!el) return;
    if (isPlainTextControl(el)) {
      try {
        el.focus();
        el.select();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* ignore */
    }
  }

  function composerWriteVerified(el, wanted) {
    const got = normalizeText(getComposerText(el));
    const need = normalizeText(wanted);
    if (got === need) return true;
    if (!need) return !got;
    if (Math.abs(got.length - need.length) <= 2 && (got.includes(need) || need.includes(got))) return true;
    return false;
  }

  function tryComposerPaste(el, text) {
    try {
      el.focus();
      selectComposerContents(el);
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true
      });
      Object.defineProperty(pasteEvent, "clipboardData", {
        configurable: true,
        value: dt
      });
      el.dispatchEvent(pasteEvent);
      return true;
    } catch (e) {
      console.warn("[Guardian Bridge] composer paste fallback failed", e);
      return false;
    }
  }

  function tryComposerInputEvents(el, text) {
    try {
      el.focus();
      selectComposerContents(el);
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertFromPaste",
          data: text
        })
      );
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertText",
          data: text
        })
      );
    } catch (e) {
      console.warn("[Guardian Bridge] composer input events failed", e);
    }
  }

  /**
   * Replace composer contents via the editor input pipeline, then verify.
   * Never writes innerHTML — ProseMirror/React will not commit that as the send payload.
   * @returns {boolean}
   */
  function setComposerText(el, text) {
    if (!el) {
      showPill("✨ composer write failed", "err");
      console.warn("[Guardian Bridge] composer write failed", { reason: "no element" });
      return false;
    }
    const wanted = String(text ?? "");

    try {
      el.focus();
    } catch {
      /* ignore */
    }
    selectComposerContents(el);

    try {
      document.execCommand("insertText", false, wanted);
    } catch (e) {
      console.warn("[Guardian Bridge] execCommand insertText failed", e);
    }
    if (composerWriteVerified(el, wanted)) return true;

    tryComposerPaste(el, wanted);
    if (composerWriteVerified(el, wanted)) return true;

    tryComposerInputEvents(el, wanted);
    if (composerWriteVerified(el, wanted)) return true;

    if (isPlainTextControl(el)) {
      setNativeValue(el, wanted);
      if (composerWriteVerified(el, wanted)) return true;
    }

    showPill("✨ composer write failed", "err");
    console.warn("[Guardian Bridge] composer write failed", {
      tagName: el.tagName,
      classes: String(el.className || "")
    });
    return false;
  }

  // ---------------------------------------------------------------------------
  // Ghostwriter presets — add a new { id, label, system } here to test another idea
  // ---------------------------------------------------------------------------
  const GHOSTWRITER_PRESETS = [
    {
      id: "spoken-ic",
      label: "Spoken IC",
      system:
        "You are Fable-5 Ghostwriter for Benjamin speaking to Scarlett in a continuous roleplay.\n" +
        "The user pasted a draft of THEIR next turn. Do a LIGHT copy-edit, not a scene rewrite.\n" +
        "Rules:\n" +
        "1. Keep the same point of view. If they wrote first-person speech (I, we, how does it sound if we), stay in that voice. Do NOT convert it into third-person narration (Benjamin let his gaze drift…).\n" +
        "2. Do not invent setting, weather, bells, wine, body language, or physical contact that is not already in the draft.\n" +
        "3. Preserve every concrete fact: places, days, times, travel plans, names, and the emotional ask.\n" +
        "4. Fix grammar, typos, and rhythm only. One spoken turn, not a short story. No quotation-wrapped dialogue around a narrator. No scene headings.\n" +
        "5. Length: stay within about 1.3× the draft word count. Never pad to raise the character count. Never add mountains/light/bells/knuckles filler.\n" +
        "6. Output ONLY the polished turn. No preamble."
    },
    {
      id: "literary-expand",
      label: "Literary",
      system:
        "You are Fable-5's master Ghostwriter. The user provides a brief action/dialogue for Benjamin. " +
        "Expand it into vivid, beautifully written RP prose. Add sensory details, emotional depth, and " +
        "environment context (e.g. the fire, the rain, the wine). Output ONLY the final polished prose. " +
        "No conversational filler."
    },
    {
      id: "draft-expander",
      label: "Draft Expander (Brain-Dump)",
      system:
        "You are a literary assistant for a high-quality roleplay. The user will provide a rough 'brain-dump' of bullet points and fragments. " +
        "Expand this into a cohesive, flowing, well-structured multi-paragraph response written in the third-person limited perspective of 'Benjamin' (he/him) acting towards his female partner, Scarlett (she/her). " +
        "CRITICAL RULE: You MUST use 'she/her' pronouns for Scarlett. Never use gender-neutral 'they/them' pronouns. " +
        "Do not invent new actions; simply take the raw ideas and weave them into high-quality literary prose with descriptive sensory details. " +
        "Output ONLY the final polished prose. No conversational filler."
    }
  ];

  function getGhostwriterPreset(id) {
    const wanted = String(id || gmGet("guardian_ghostwriter_preset", "spoken-ic") || "spoken-ic");
    for (let i = 0; i < GHOSTWRITER_PRESETS.length; i++) {
      if (GHOSTWRITER_PRESETS[i].id === wanted) return GHOSTWRITER_PRESETS[i];
    }
    return GHOSTWRITER_PRESETS[0];
  }

  function countWords(text) {
    const parts = String(text || "").trim().split(/\s+/);
    if (!parts[0]) return 0;
    return parts.length;
  }

  function findDummyTextareaForm() {
    const nodes = document.querySelectorAll("textarea");
    let fallback = null;
    for (let i = 0; i < nodes.length; i++) {
      const ta = nodes[i];
      if (ta.closest && ta.closest("[data-guardian-ui]")) continue;
      const form = ta.closest && ta.closest("form");
      if (!form) continue;
      if (isVisible(form)) return form;
      if (!fallback) fallback = form;
    }
    return fallback;
  }

  function startGhostwriterMode() {
    function attachButton() {
      const apiKey = gmGet("guardian_openai_api_key", "");
      if (!apiKey) return;

      const editor = findComposerEditor();
      let wrapper = (editor && editor.closest && editor.closest("form")) || (editor && editor.parentElement);
      if (!wrapper) wrapper = findDummyTextareaForm();
      if (!wrapper) return;
      if (wrapper.dataset.gwAttached) return;

      wrapper.dataset.gwAttached = "true";

      const bar = document.createElement("div");
      bar.setAttribute("data-guardian-ui", "1");
      bar.style.cssText =
        "position: absolute; right: 160px; bottom: 16px; display: flex; align-items: center; gap: 6px; z-index: 2147483647; pointer-events: auto;";

      const select = document.createElement("select");
      select.setAttribute("data-guardian-ui", "1");
      select.title = "Ghostwriter style";
      select.style.cssText =
        "background: #2c2c2c; color: #fff; border: 1px solid #555; border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 600; cursor: pointer; max-width: 132px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);";
      const savedPresetId = gmGet("guardian_ghostwriter_preset", "spoken-ic");
      for (let i = 0; i < GHOSTWRITER_PRESETS.length; i++) {
        const opt = document.createElement("option");
        opt.value = GHOSTWRITER_PRESETS[i].id;
        opt.textContent = GHOSTWRITER_PRESETS[i].label;
        if (GHOSTWRITER_PRESETS[i].id === savedPresetId) opt.selected = true;
        select.appendChild(opt);
      }

      const btn = document.createElement("button");
      btn.setAttribute("data-guardian-ui", "1");
      btn.type = "button";
      btn.innerHTML = "✨ Polish";
      btn.style.cssText =
        "background: #2c2c2c; color: #fff; border: 1px solid #555; border-radius: 8px; padding: 6px 16px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5);";

      function trapChrome(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }

      select.addEventListener("mousedown", trapChrome, true);
      select.addEventListener("pointerdown", trapChrome, true);
      select.addEventListener("click", trapChrome, true);
      select.addEventListener(
        "change",
        (e) => {
          trapChrome(e);
          gmSet("guardian_ghostwriter_preset", select.value);
          const preset = getGhostwriterPreset(select.value);
          showPill(`✨ style: ${preset.label}`, "info");
        },
        true
      );

      if (window.getComputedStyle(wrapper).position === "static") {
        wrapper.style.position = "relative";
      }
      bar.appendChild(select);
      bar.appendChild(btn);
      wrapper.appendChild(bar);

      const handlePolish = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (btn.disabled) return;

        const activeEditor = findComposerEditor() || editor;
        const text = getComposerText(activeEditor);
        if (!text) {
          showPill("✨ Please type something first!", "warn");
          return;
        }

        const preset = getGhostwriterPreset(select.value);
        const words = countWords(text);
        const maxWords = Math.max(words + 8, Math.ceil(words * 1.3));

        btn.innerHTML = "⏳ Polishing...";
        btn.disabled = true;

        const model = gmGet("guardian_ghostwriter_model", "gpt-5.6-luna");

        GM_xmlhttpRequest({
          method: "POST",
          url: "https://api.openai.com/v1/chat/completions",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          data: JSON.stringify({
            model: model,
            messages: [
              {
                role: "system",
                content: preset.system
              },
              {
                role: "user",
                content: `Draft (${words} words). Stay within ${maxWords} words.\n\n${text}`
              }
            ]
          }),
          onload(res) {
            btn.innerHTML = "✨ Polish";
            btn.disabled = false;
            if (res.status === 200) {
              try {
                const data = JSON.parse(res.responseText);
                const polished = data.choices[0].message.content.trim();
                const target = findComposerEditor() || activeEditor;
                if (setComposerText(target, polished)) {
                  showPill(`✨ Ghostwriter success (${preset.label})`, "ok");
                }
              } catch {
                showPill("✨ Ghostwriter parse err", "err");
              }
            } else {
              showPill("✨ Ghostwriter API err: " + res.status, "err");
              console.error(res.responseText);
            }
          },
          onerror() {
            btn.innerHTML = "✨ Polish";
            btn.disabled = false;
            showPill("✨ Ghostwriter network err", "err");
          }
        });
      };

      btn.addEventListener("mousedown", handlePolish, { capture: true });
      btn.addEventListener("pointerdown", handlePolish, { capture: true });
      btn.addEventListener("click", handlePolish, { capture: true });
    }

    setInterval(attachButton, 1000);
  }

})();
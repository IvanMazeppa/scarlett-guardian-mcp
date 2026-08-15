// ==UserScript==
// @name         Scarlett Guardian Bridge v2 (Shadow Duplex)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  STALE COPY — use scripts/guardian-browser-bridge.user.js (v2.2+). Do not install this file.
// @author       Grok Build (WP-3.2)
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
 * STALE — canonical bridge is scripts/guardian-browser-bridge.user.js (v2.2 Mission Control).
 * This tests/ copy is kept only for historical reference; do not paste into Tampermonkey.
 *
 * WP-3.2 — Userscript v2
 *
 * Modes (Tampermonkey menu or GM storage key guardian_mode):
 *   shadow      (default) — watch DOM, POST /duplex-cache; never touches composer/send
 *   interceptor — legacy: intercept send → POST /preflight → inject context (fail-open)
 *   calibrate   — stub: click-to-pin selector (full UX lands in WP-3.3)
 *
 * Secrets / tunnel URL: set via Tampermonkey menu or GM_setValue — do not hardcode tokens.
 *
 * Install: Tampermonkey → Create new script → paste this file → save.
 * Local Guardian: guardian_base_url = http://127.0.0.1:8790
 * Remote: guardian_base_url = https://your-tunnel.example  (no trailing path)
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
    forceFullRetrieval: gmGet("guardian_force_full_retrieval", false) === true,
    autoSubmitAfterPreflight: gmGet("guardian_auto_submit", false) === true,
    failClosed: gmGet("guardian_fail_closed", false) === true
  };

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
   * Find the last assistant-authored bubble text.
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
      // Walk from end; skip user bubbles and our UI
      for (let i = nodes.length - 1; i >= 0; i--) {
        const el = nodes[i];
        if (el.closest && el.closest("[data-guardian-ui]")) continue;
        if (looksLikeUserBubble(el)) continue;
        const text = extractCleanText(el);
        if (text.length >= 20) {
          return { text: text.slice(0, CONFIG.maxChars), el, layer: sel };
        }
      }
    }

    // Structural fallback: large text blocks in main, last non-textarea block
    const main = document.querySelector("main") || document.body;
    const candidates = Array.from(main.querySelectorAll("div, article, section")).filter((el) => {
      if (el.closest("[data-guardian-ui]")) return false;
      if (el.querySelector("textarea")) return false;
      const t = (el.innerText || "").trim();
      return t.length >= 40 && t.length < 50000;
    });
    if (candidates.length) {
      const el = candidates[candidates.length - 1];
      if (!looksLikeUserBubble(el)) {
        const text = extractCleanText(el).slice(0, CONFIG.maxChars);
        if (text.length >= 20) return { text, el, layer: "structural-heuristic" };
      }
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
        if (!text || text.length < 20) return;
        if (text === lastSnapshot) return;
        // Require stability: re-check once more after quietMs
        const frozen = text;
        setTimeout(() => {
          if (!armed) return;
          if (isProbablyStreaming()) return;
          const again = snapshot();
          if (again === frozen && frozen.length >= 20) {
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
      // SPA URL changes
      setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          lastSnapshot = "";
          armed = true;
          showPill("🛡 thread changed — re-armed", "info");
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
    if (normalized.length < 20) return;

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

  // ---------------------------------------------------------------------------
  // Shadow mode
  // ---------------------------------------------------------------------------
  function startShadowMode() {
    console.log(
      `[Guardian Bridge v2] shadow mode → ${CONFIG.guardianBaseUrl}/duplex-cache (thread=${extractThreadKey()})`
    );
    showPill("🛡 shadow duplex armed", "info");
    const detector = createCompletionDetector((text) => {
      onScarlettComplete(text);
    });
    detector.start();
    // Warm baseline so we don't re-post an already-visible old message immediately
    setTimeout(() => detector.resetBaseline(), 800);
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

    function handleSendAttempt(e, textarea, button) {
      if (allowProgrammaticSubmit) {
        allowProgrammaticSubmit = false;
        return;
      }
      if (isPreflighting) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const userText = textarea.value.trim();
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
              setNativeValue(textarea, enriched);
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
      const textarea = document.querySelector("textarea");
      if (!textarea || textarea.dataset.guardianAttached) return;
      const button =
        document.querySelector('button[aria-label="Send"]') ||
        document.querySelector('button[aria-label="Submit"]') ||
        (textarea.parentElement && textarea.parentElement.querySelector("button"));
      if (!button) return;
      textarea.dataset.guardianAttached = "true";
      textarea.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter" && !e.shiftKey) handleSendAttempt(e, textarea, button);
        },
        { capture: true }
      );
      button.addEventListener(
        "click",
        (e) => {
          if (e.isTrusted) handleSendAttempt(e, textarea, button);
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
    GM_registerMenuCommand("Guardian: set bearer token…", () => {
      const next = prompt("Bearer token (empty to clear)", CONFIG.bearerToken || "");
      if (next !== null) {
        gmSet("guardian_bearer_token", next);
        showPill("🛡 token saved (reload)", "info");
      }
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
})();

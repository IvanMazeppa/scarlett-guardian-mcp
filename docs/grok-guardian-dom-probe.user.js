// ==UserScript==
// @name         Grok Guardian DOM Probe
// @description  Temporary selector/interception probe for the Scarlett Guardian browser bridge.
// @version      0.1.0
// @match        *://grok.com/*
// @match        *://x.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  const DEBUG_RUN_ID = "dom-probe-initial";
  const CONFIG = {
    blockSendForProbe: true,
    scanIntervalMs: 3000
  };

  let scanTimer;
  let lastSignature = "";

  function agentLog(hypothesisId, location, message, data = {}) {
    const payload = {
      sessionId: "1401cf",
      runId: DEBUG_RUN_ID,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    };

    // #region agent log
    fetch("http://127.0.0.1:7425/ingest/1cc1a0a4-8681-4395-8d17-6b8a4efbeb53", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "1401cf"
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "POST",
        url: "http://127.0.0.1:7425/ingest/1cc1a0a4-8681-4395-8d17-6b8a4efbeb53",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "1401cf"
        },
        data: JSON.stringify(payload),
        onerror: () => {}
      });
    }
    // #endregion

    console.debug("[Guardian DOM Probe]", payload);
  }

  function textLength(element) {
    return element?.textContent?.trim().length ?? 0;
  }

  function isUserMessage(element) {
    return Boolean(
      element?.className?.includes?.("bg-surface-l1") ||
      element?.querySelector?.("[class*='bg-surface-l1']")
    );
  }

  function isGrokMessage(element) {
    return Boolean(
      (element?.className?.includes?.("max-w-none") ||
        element?.querySelector?.("[class*='max-w-none']")) &&
      !isUserMessage(element)
    );
  }

  function getTextareaCandidates() {
    const selectors = [
      "textarea",
      "textarea[placeholder]",
      "[contenteditable='true']",
      "[role='textbox']",
      "[data-testid*='input']",
      "[data-testid*='composer']"
    ];

    return selectors.map((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      return {
        selector,
        count: elements.length,
        active: elements.some((element) => element === document.activeElement),
        placeholders: elements
          .map((element) => element.getAttribute("placeholder"))
          .filter(Boolean)
          .slice(0, 3),
        ariaLabels: elements
          .map((element) => element.getAttribute("aria-label"))
          .filter(Boolean)
          .slice(0, 3)
      };
    });
  }

  function getSendButtonCandidates() {
    const selectors = [
      "button[aria-label*='Send' i]",
      "button[type='submit']",
      "form button",
      "button:has(svg)",
      "[data-testid*='send']",
      "[aria-label*='submit' i]"
    ];

    return selectors.map((selector) => {
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch {
        elements = [];
      }

      return {
        selector,
        count: elements.length,
        disabledCount: elements.filter((element) => element.disabled || element.getAttribute("aria-disabled") === "true").length,
        ariaLabels: elements
          .map((element) => element.getAttribute("aria-label"))
          .filter(Boolean)
          .slice(0, 3)
      };
    });
  }

  function findLikelyTextarea() {
    return document.querySelector("textarea") ||
      document.querySelector("[role='textbox']") ||
      document.querySelector("[contenteditable='true']");
  }

  function findLikelySendButton(target) {
    const targetButton = target?.closest?.("button");
    if (targetButton) return targetButton;
    return document.querySelector("button[aria-label*='Send' i]") ||
      document.querySelector("button[type='submit']");
  }

  function scanDom() {
    const messageBubbles = Array.from(document.querySelectorAll(".message-bubble"));
    const responseMarkdown = Array.from(document.querySelectorAll(".response-content-markdown"));
    const legacyCss = Array.from(document.querySelectorAll("div[class*='css-146c3p1']"));
    const ltrDivs = Array.from(document.querySelectorAll("div[dir='ltr']"));
    const humanMessages = messageBubbles.filter(isUserMessage);
    const grokMessages = messageBubbles.filter(isGrokMessage);
    const latestHuman = humanMessages.at(-1);
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    const textareaCandidates = getTextareaCandidates();
    const sendButtonCandidates = getSendButtonCandidates();

    const signature = JSON.stringify({
      messageBubbleCount: messageBubbles.length,
      responseMarkdownCount: responseMarkdown.length,
      legacyCssCount: legacyCss.length,
      ltrDivCount: ltrDivs.length,
      humanMessageCount: humanMessages.length,
      grokMessageCount: grokMessages.length,
      latestHumanLength: textLength(latestHuman),
      textareaCounts: textareaCandidates.map((candidate) => [candidate.selector, candidate.count]),
      sendCounts: sendButtonCandidates.map((candidate) => [candidate.selector, candidate.count])
    });

    if (signature === lastSignature) return;
    lastSignature = signature;

    agentLog("H1,H2,H3,H5", "docs/grok-guardian-dom-probe.user.js:scanDom", "DOM selector scan", {
      messageBubbleCount: messageBubbles.length,
      responseMarkdownCount: responseMarkdown.length,
      legacyCssCount: legacyCss.length,
      ltrDivCount: ltrDivs.length,
      humanMessageCount: humanMessages.length,
      grokMessageCount: grokMessages.length,
      latestHumanLength: textLength(latestHuman),
      textareaCandidates,
      sendButtonCandidates,
      hasNativeTextareaSetter: Boolean(nativeSetter)
    });
  }

  function showProbeBanner(text) {
    const existing = document.getElementById("guardian-dom-probe-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "guardian-dom-probe-banner";
    banner.textContent = text;
    banner.style.cssText = [
      "position: fixed",
      "right: 16px",
      "bottom: 16px",
      "z-index: 100000",
      "padding: 10px 12px",
      "border-radius: 8px",
      "background: #111827",
      "color: white",
      "font: 13px/1.4 system-ui, sans-serif",
      "box-shadow: 0 8px 24px rgba(0,0,0,0.25)"
    ].join(";");
    document.body.appendChild(banner);
  }

  function handlePotentialSend(event) {
    const textarea = findLikelyTextarea();
    const sendButton = findLikelySendButton(event.target);
    const isEnterSend = event.type === "keydown" && event.key === "Enter" && !event.shiftKey;
    const isButtonSend = (event.type === "click" || event.type === "mousedown") && Boolean(sendButton);
    const shouldProbeBlock = CONFIG.blockSendForProbe && (isEnterSend || isButtonSend);

    if (!isEnterSend && !isButtonSend) return;

    agentLog("H3,H4", "docs/grok-guardian-dom-probe.user.js:handlePotentialSend", "Potential send intercepted", {
      eventType: event.type,
      key: event.key ?? null,
      shiftKey: Boolean(event.shiftKey),
      targetTag: event.target?.tagName ?? null,
      textareaFound: Boolean(textarea),
      textareaValueLength: textarea?.value?.length ?? textarea?.textContent?.length ?? 0,
      sendButtonFound: Boolean(sendButton),
      sendButtonAriaLabel: sendButton?.getAttribute?.("aria-label") ?? null,
      blockedByProbe: shouldProbeBlock
    });

    if (shouldProbeBlock) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      showProbeBanner("Guardian DOM probe blocked send and logged selector data.");
      scanDom();
    }
  }

  function startProbe() {
    agentLog("H1,H2,H3,H4,H5", "docs/grok-guardian-dom-probe.user.js:startProbe", "Probe installed", {
      href: window.location.href,
      readyState: document.readyState,
      blockSendForProbe: CONFIG.blockSendForProbe
    });

    window.addEventListener("keydown", handlePotentialSend, true);
    window.addEventListener("mousedown", handlePotentialSend, true);
    window.addEventListener("click", handlePotentialSend, true);

    scanDom();
    scanTimer = window.setInterval(scanDom, CONFIG.scanIntervalMs);
  }

  window.addEventListener("beforeunload", () => {
    if (scanTimer) window.clearInterval(scanTimer);
  });

  startProbe();
})();

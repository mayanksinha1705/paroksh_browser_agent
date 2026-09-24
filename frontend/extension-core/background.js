// ---------------------------------------------------------------------------
// Model access
//
// The Gemma action model and the chat model used to be imported straight into
// this service worker from ../ollama/. They now live in the Node backend
// (backend/server.js), because a service worker can only import files from
// inside the extension folder — and because the model layer has no business
// running in the browser at all.
//
// These two wrappers keep the exact same signatures the rest of this file
// already expects, so nothing below had to change.
// ---------------------------------------------------------------------------

const BACKEND_URL = "http://localhost:3000";

async function getActionFromGemma(instruction, imageBase64, history = [], elements = [], signal, visualContext = "") {
  const response = await fetch(`${BACKEND_URL}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // visualContext is Qwen's LOCAL, already-sanitized description of the
    // sanitized screenshot's layout/UI (see analyzeScreenshotInPage below).
    // It is plain text only — never the image itself.
    body: JSON.stringify({ instruction, imageBase64, history, elements, visualContext }),
    signal,
  });

  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body; the status code is all we have
    }
    throw new Error(`PAROKSH backend error: ${detail}`);
  }

  const payload = await response.json();
  if (!payload?.action) throw new Error("PAROKSH backend returned no action.");
  return payload.action;
}

/**
 * Mirrors the old ollama2.js contract: never throws, so the user is never
 * shown nothing at all. If the backend is down we still produce a readable
 * sentence rather than dropping the reply.
 */
async function getHumanReply(instruction, rawLog, success = true) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, rawLog, success }),
    });
    if (!response.ok) throw new Error(`Backend reply error: ${response.status}`);
    const payload = await response.json();
    if (!payload?.reply) throw new Error("Empty reply from backend");
    return payload.reply;
  } catch (err) {
    console.warn("PAROKSH: backend chat reply failed, using fallback:", err.message);
    if (success) {
      const lastStep = String(rawLog || "").split("→").pop().trim();
      return `Done — ${lastStep || "that's finished"}. Anything else you'd like me to do?`;
    }
    return `I ran into a problem: ${rawLog || "something went wrong"}. Want me to try a different approach?`;
  }
}

const ALLOWED_ACTIONS = ["CLICK", "TYPE", "SCROLL", "NAVIGATE", "HOVER", "KEY", "DONE", "ERROR"];
const MAX_SCREENSHOT_DIMENSION = 640;
const JPEG_QUALITY = 0.5;
const MAX_STEPS = 30;

// Purely a display label for the live pipeline status feed below — the
// actual model name lives in backend/ollama/ollama.js's MODEL constant.
// Keep these in sync if that ever changes.
const GEMMA_MODEL_LABEL = "gemma4:31b-cloud";

// ---------------------------------------------------------------------------
// Live pipeline status broadcast
//
// Fire-and-forget: chrome.runtime.sendMessage() with no target reaches every
// currently-open extension page, which includes the floating panel's iframe
// (frontend/popup.html — see content.js) since that's a real
// chrome-extension:// page with its own chrome.runtime.onMessage listener.
// If the panel is closed there's simply no listener; we swallow that
// (reading chrome.runtime.lastError) rather than let it become console
// noise, and this never affects the actual agent loop either way.
// ---------------------------------------------------------------------------
function broadcastStatus(tabId, stage, label, meta = {}) {
  const runId = currentTask?.tabId === tabId ? currentTask.runId : undefined;
  const event = { type: "PAROKSH_PIPELINE_STATUS", tabId, stage, label, timestamp: Date.now(), runId, ...meta };
  if (currentTask && currentTask.tabId === tabId) {
    currentTask.events.push(event);
    if (currentTask.events.length > TASK_EVENT_HISTORY_LIMIT) currentTask.events.shift();
  }
  try {
    chrome.runtime.sendMessage(event, () => {
      void chrome.runtime.lastError; // no receiver (panel closed) — ignore
    });
  } catch (_err) {
    // Best-effort only; never let a broadcast failure affect the agent loop.
  }
}

// ---------------------------------------------------------------------------
// Panel open/closed state, per tab
//
// A full page navigation (the user clicking a link, or the agent itself
// issuing a NAVIGATE action) tears down and re-injects the content script,
// which wipes out whatever the old content script had put in the DOM —
// including our floating panel. To make the panel survive navigation, we
// remember whether it was open per-tab in chrome.storage.session, and the
// freshly-loaded content script checks that on startup and re-opens itself
// if it should still be open. Explicitly closing the panel (the ✕ button)
// clears the flag so it stays closed on subsequent navigations.
// ---------------------------------------------------------------------------

const PANEL_TABS_KEY = "paroksh_panel_open_tabs";

// ---------------------------------------------------------------------------
// Task state — survives the popup panel being torn down and recreated by a
// page navigation mid-task.
//
// The floating panel is an <iframe> injected by the content script (see
// content.js); a full page navigation (the agent's own NAVIGATE action, or
// just clicking a link) destroys that iframe's whole JS realm and content.js
// re-injects a brand new one. That fresh React app mounts with isBusy=false
// by default — it has no way to know a task is still running in THIS
// service worker (which never navigates) unless it asks. currentTask makes
// that possible: it's the source of truth a freshly-mounted panel queries
// via GET_TASK_STATUS, and its `events` array lets that panel replay the
// pipeline trace instead of showing a blank one.
//
// lastResultByTab covers the narrow race where the task finishes in the
// gap between the old panel being destroyed and the new one's listener
// registering — without it, that PAROKSH_TASK_RESULT broadcast would fire
// into an empty page and the final chat reply would simply be lost.
// ---------------------------------------------------------------------------
let currentTask = null; // { runId, tabId, instruction, events: [] }
const lastResultByTab = new Map(); // tabId -> { runId, result, timestamp }
const TASK_EVENT_HISTORY_LIMIT = 60;
const LAST_RESULT_TTL_MS = 15000;

function startTask(runId, tabId, instruction) {
  currentTask = { runId, tabId, instruction, events: [] };
}

function endTask(runId) {
  if (currentTask?.runId === runId) currentTask = null;
}

function broadcastTaskResult(tabId, runId, result) {
  if (tabId != null) {
    lastResultByTab.set(tabId, { runId, result, timestamp: Date.now() });
  }
  try {
    chrome.runtime.sendMessage(
      { type: "PAROKSH_TASK_RESULT", tabId, runId, ...result },
      () => { void chrome.runtime.lastError; } // no listener yet — fine, see lastResultByTab
    );
  } catch (_err) {
    // Best-effort only.
  }
}

// The extension only ever runs one instruction at a time (single popup),
// so a single module-level controller is enough to let a STOP_INSTRUCTION
// message cancel whatever EXECUTE_INSTRUCTION run is currently in flight.
let currentAbortController = null;

async function getOpenPanelTabs() {
  const res = await chrome.storage.session.get(PANEL_TABS_KEY);
  return res[PANEL_TABS_KEY] || {};
}

async function setPanelOpen(tabId, open) {
  const tabs = await getOpenPanelTabs();
  if (open) tabs[tabId] = true;
  else delete tabs[tabId];
  await chrome.storage.session.set({ [PANEL_TABS_KEY]: tabs });
}

async function isPanelOpen(tabId) {
  const tabs = await getOpenPanelTabs();
  return !!tabs[tabId];
}

chrome.tabs.onRemoved.addListener((tabId) => {
  setPanelOpen(tabId, false);
  chrome.storage.session.remove(`paroksh_chat_${tabId}`);
});

// Clicking the toolbar icon opens/closes the floating, draggable in-page
// panel (injected by the content script) instead of a classic popup.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const nextOpen = !(await isPanelOpen(tab.id));
  await setPanelOpen(tab.id, nextOpen);
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: nextOpen ? "OPEN_PANEL" : "CLOSE_PANEL",
      tabId: tab.id,
    });
  } catch (err) {
    // Content script isn't present on this page (e.g. chrome:// or the
    // Chrome Web Store) — nothing we can inject into.
    console.warn("PAROKSH: could not reach content script on this tab:", err.message);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_PANEL_STATE") {
    const tabId = sender.tab?.id;
    isPanelOpen(tabId).then((open) => sendResponse({ open, tabId }));
    return true;
  }
  if (message?.type === "PANEL_CLOSED") {
    if (sender.tab?.id != null) setPanelOpen(sender.tab.id, false);
    return false;
  }
  if (message?.type === "EXPORT_REDACTED_IMAGES") {
    exportRedactedImages()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }
  if (message?.type === "STOP_INSTRUCTION") {
    if (currentAbortController) currentAbortController.abort();
    sendResponse({ stopped: true });
    return false;
  }
  if (message?.type === "GET_TASK_STATUS") {
    // Lets a freshly-mounted panel (recreated by a mid-task page
    // navigation — see the comment above currentTask) figure out whether a
    // task is still running and, if so, replay its pipeline trace so far.
    const tabId = sender.tab?.id;
    if (currentTask && (tabId == null || currentTask.tabId === tabId)) {
      sendResponse({ busy: true, runId: currentTask.runId, events: currentTask.events });
      return false;
    }
    // Not busy — but did the task finish in the gap between the old panel
    // being torn down and this one asking? Hand back that result once.
    const cached = tabId != null ? lastResultByTab.get(tabId) : null;
    if (cached && Date.now() - cached.timestamp < LAST_RESULT_TTL_MS) {
      lastResultByTab.delete(tabId);
      sendResponse({ busy: false, finishedResult: { runId: cached.runId, ...cached.result } });
      return false;
    }
    sendResponse({ busy: false });
    return false;
  }
  if (message?.type === "EXECUTE_INSTRUCTION") {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initiatingTabId = sender.tab?.id ?? null;
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;
    handleInstruction(message.instruction, signal, runId)
      .then(async (res) => {
        currentAbortController = null;
        // res.message is the raw, mechanical step log (used for the
        // activity log). reply is a separate, human-sounding chat message
        // generated by ollama2.js, so the two never get mixed up.
        const reply = res.stopped
          ? "Okay, I stopped there."
          : await getHumanReply(message.instruction, res.message, res.success);
        const finalTabId = currentTask?.tabId ?? initiatingTabId;
        endTask(runId);
        // Broadcast in ADDITION to sendResponse: if a page navigation
        // destroyed the panel that made this call, sendResponse below
        // silently goes nowhere — the broadcast (plus lastResultByTab) is
        // what lets a freshly-mounted panel still learn the outcome.
        broadcastTaskResult(finalTabId, runId, { ...res, reply });
        sendResponse({ ...res, reply });
      })
      .catch(async (err) => {
        currentAbortController = null;
        const finalTabId = currentTask?.tabId ?? initiatingTabId;
        if (err.name === "AbortError") {
          const result = {
            success: false,
            stopped: true,
            message: "Stopped by user.",
            reply: "Okay, I stopped there.",
          };
          endTask(runId);
          broadcastTaskResult(finalTabId, runId, result);
          sendResponse(result);
          return;
        }
        const reply = await getHumanReply(message.instruction, err.message, false);
        const result = { success: false, message: err.message, reply };
        endTask(runId);
        broadcastTaskResult(finalTabId, runId, result);
        sendResponse(result);
      });
    return true;
  }
  return false;
});

function stoppedResult(results) {
  return {
    success: false,
    stopped: true,
    message: results.join(" → ") + (results.length ? " → " : "") + "Stopped by user.",
  };
}

async function handleInstruction(instruction, signal, runId) {
  const tab = await getActiveTab();
  if (!tab) throw new Error("No active browser tab found.");
  if (runId) startTask(runId, tab.id, instruction);
  const history = [], results = [];
  let lastActionId = null;

  // Trusted input (see executeViaDebugger above) needs the debugger
  // attached for the whole task rather than per action — reattaching on
  // every single CLICK/TYPE/HOVER/KEY would flicker Chrome's "being
  // debugged" banner and adds needless round-trips. The session stays
  // attached across in-tab navigations (CDP sessions are tab-scoped, not
  // page-scoped) and is always detached in the finally below, however the
  // task ends. If attaching fails outright (e.g. real DevTools is already
  // open on this tab), the whole task falls back to DOM-level execution
  // instead of failing immediately.
  let trustedInputAvailable = true;
  try {
    await chrome.debugger.attach({ tabId: tab.id }, "1.3");
  } catch (err) {
    console.warn("PAROKSH: could not attach trusted input (debugger) for this tab — falling back to DOM-level actions:", err.message);
    trustedInputAvailable = false;
  }

  try {
    return await runAgentLoop(tab, instruction, signal, history, results, lastActionId, trustedInputAvailable);
  } finally {
    if (trustedInputAvailable) {
      try {
        await chrome.debugger.detach({ tabId: tab.id });
      } catch (_err) {
        // Already detached (e.g. the tab closed, or DevTools took over) — fine.
      }
    }
  }
}

async function runAgentLoop(tab, instruction, signal, history, results, lastActionId, trustedInputAvailable) {

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) return stoppedResult(results);
    broadcastStatus(tab.id, "start", `Step ${step + 1}: reading the page…`, { step: step + 1 });
    const rectData = await getElementRects(tab.id);
    const currentTab = await chrome.tabs.get(tab.id);

    // SECURITY BOUNDARY:
    // 1) Capture the raw screenshot.
    // 2) Send it to PrivacyShield in the content-script world.
    // 3) If redaction succeeds, the sanitized screenshot goes to the LLM.
    //    If redaction fails for this page (blocked OCR worker, no text,
    //    whatever) PrivacyShield fails OPEN and hands back the raw
    //    screenshot instead — we still send *something* rather than
    //    aborting the step, matching what most sites do anyway (no
    //    redaction at all). protectedShot.sanitized tells you which case
    //    happened for this step.
    // 4) The raw + "after" pair is persisted locally in the extension's
    //    IndexedDB vault for audit/debugging either way.
    broadcastStatus(tab.id, "capture", `Step ${step + 1}: capturing screenshot…`, { step: step + 1 });
    const rawShot = await captureRawScreenshot(currentTab.windowId);
    if (signal?.aborted) return stoppedResult(results);

    // LOCAL VISION (Qwen3.5-0.8B): runs entirely inside the page's content
    // script, on-device, on the raw screenshot, BEFORE PrivacyShield. It
    // never transmits anything anywhere — analyzeScreenshotInPage only ever
    // returns a short text description (never the image), and it is purely
    // supplementary: if it fails or Qwen isn't installed yet, we fall back
    // to an empty string and PrivacyShield + the agent loop continue exactly
    // as before. Only PrivacyShield failing is allowed to block a step.
    broadcastStatus(tab.id, "qwen", `Step ${step + 1}: sending screenshot to Qwen3.5-0.8B (local, on-device)…`, { step: step + 1 });
    const visualContext = await analyzeScreenshotInPage(tab.id, rawShot.dataUrl, instruction);
    if (signal?.aborted) return stoppedResult(results);
    broadcastStatus(
      tab.id,
      "qwen",
      visualContext
        ? `Step ${step + 1}: Qwen3.5-0.8B visual analysis complete`
        : `Step ${step + 1}: Qwen3.5-0.8B unavailable — continuing without local visual context`,
      { step: step + 1 }
    );

    broadcastStatus(tab.id, "privacy", `Step ${step + 1}: redacting screenshot (PrivacyShield — OCR + PII detection)…`, { step: step + 1 });
    const protectedShot = await sanitizeScreenshotInPage(tab.id, rawShot.dataUrl);
    if (signal?.aborted) return stoppedResult(results);
    broadcastStatus(
      tab.id,
      "privacy",
      protectedShot.sanitized
        ? `Step ${step + 1}: screenshot sanitized (${protectedShot.summary || "redaction complete"})`
        : `Step ${step + 1}: redaction unavailable for this page — continuing with raw screenshot`,
      { step: step + 1 }
    );

    await storePrivacyCapture({
      tabId: tab.id,
      beforeDataUrl: rawShot.dataUrl,
      afterDataUrl: protectedShot.sanitizedDataUrl,
      detections: protectedShot.detections,
      summary: protectedShot.summary,
      runtime: protectedShot.runtime,
      processingTimeMs: protectedShot.processingTimeMs,
      sanitized: protectedShot.sanitized,
    });

    // Add numbered element boxes AFTER redaction so coordinates remain useful
    // to the agent without ever putting raw PII back into the image.
    const shot = await annotateSanitizedScreenshot(
      protectedShot.sanitizedDataUrl,
      rectData
    );

    if (signal?.aborted) return stoppedResult(results);
    broadcastStatus(tab.id, "gemma", `Step ${step + 1}: sending redacted screenshot to ${GEMMA_MODEL_LABEL}…`, { step: step + 1 });
    const action = await getActionFromGemma(
      instruction,
      shot.base64,
      history,
      rectData.elements,
      signal,
      visualContext
    );
    broadcastStatus(
      tab.id,
      "gemma",
      `Step ${step + 1}: ${GEMMA_MODEL_LABEL} returned ${action.action}${action.element_id != null ? ` #${action.element_id}` : ""}`,
      { step: step + 1 }
    );

    if (action.action === "DONE") {
      const check = await verifyCompletion(tab.id);
      if (check.isGoogleForm && !check.confirmed) {
        // Model declared victory but the "response has been recorded"
        // confirmation screen isn't showing — this was the exact bug
        // where the agent stopped mid-form. Reject the DONE, tell the
        // model exactly why via history, and keep the loop going instead
        // of reporting a false success.
        history.push({ action: "ERROR", reason: "DONE rejected: form confirmation screen not detected. The form is NOT submitted yet — scroll through the remaining questions, fill anything still empty, then click Submit." });
        results.push("Checked for submission confirmation — not found yet, continuing");
        broadcastStatus(tab.id, "verify", `Step ${step + 1}: DONE rejected — submission not confirmed yet, continuing`, { step: step + 1 });
        continue;
      }
      if (check.hasUnfilledRequired) {
        history.push({ action: "ERROR", reason: "DONE rejected: one or more required fields on the page are still empty or invalid. Fill them before submitting." });
        results.push("Checked required fields — some still empty, continuing");
        broadcastStatus(tab.id, "verify", `Step ${step + 1}: DONE rejected — required fields still empty, continuing`, { step: step + 1 });
        continue;
      }
      broadcastStatus(tab.id, "done", `Task complete: ${action.summary}`, { step: step + 1 });
      return { success: true, message: results.join(" → ") + " → " + action.summary };
    }
    if (action.action === "ERROR") {
      broadcastStatus(tab.id, "error", `Step ${step + 1}: model reported an error — ${action.reason}`, { step: step + 1 });
      throw new Error(action.reason);
    }

    // Repetition Guard: Block clicking the same ID twice in a row
    if (action.action === "CLICK" && action.element_id !== undefined && action.element_id === lastActionId) {
      history.push({ action: "ERROR", reason: "Already clicked this element. Look for new window." });
      continue;
    }

    let result;
    broadcastStatus(
      tab.id,
      "action",
      `Step ${step + 1}: executing ${action.action}${action.element_id != null ? ` on #${action.element_id}` : ""} via Action Executor…`,
      { step: step + 1 }
    );
    if (action.action === "NAVIGATE") {
      result = await executeNavigate(tab.id, action);
      await waitForPageLoad(tab.id);
    } else if (trustedInputAvailable && TRUSTED_ACTIONS.has(action.action)) {
      // Default path for CLICK/TYPE/HOVER/KEY: a real, trusted CDP input
      // event, targeting the center of the element's own manifest
      // rectangle (or the model's explicit x/y for canvas-rendered UIs
      // like Google Docs) — see executeViaDebugger's comment for why this
      // matters on JS-heavy sites that ignore or don't track synthetic
      // DOM events.
      //
      // POINT SELECTION (fixed): element_id is the source of truth.
      //
      // The model's schema lists x/y on every CLICK/TYPE/HOVER, so it often
      // fills them in even when it also gave a perfectly good element_id —
      // and those numbers are guesses (downscaled-screenshot space, or the
      // manifest's top-left corner), not the element's real center. Letting
      // them win over element_id is what made clicks like Gmail's Compose
      // land on the wrong spot and silently do nothing. So:
      //   - element_id present            -> ALWAYS re-resolve that live
      //                                      element's fresh center (and
      //                                      hit-test it), ignoring model x/y
      //   - no element_id (or canvas UI,
      //     e.g. Google Docs/Sheets/Forms) -> use the model's x/y as before
      const onCanvasSite = /^https?:\/\/docs\.google\.com\//i.test(currentTab?.url || "");
      const useElementId = action.element_id != null && !onCanvasSite;

      let point = resolveActionPoint(action, rectData, onCanvasSite);
      let hitOk = true; // false => something else is on top of the target
      if (useElementId) {
        const fresh = await resolveFreshPoint(tab.id, action.element_id);
        if (fresh) {
          point = { x: fresh.x, y: fresh.y };
          hitOk = fresh.hit !== false;
        }
      }

      if (action.action === "CLICK" && useElementId && !hitOk) {
        // A real mouse click would hit the overlay/covering element, not the
        // target (a DOM click ignores occlusion, which is why the old build
        // worked here). Use the DOM click instead of a click that can't land.
        console.warn("PAROKSH: target is covered at its click point — using DOM click instead of trusted click.");
        result = await executeViaContentScript(tab.id, action);
      } else {
        try {
          result = await executeViaDebugger(tab.id, action, point);
        } catch (e) {
          console.warn(`PAROKSH: trusted ${action.action} failed (${e.message}) — falling back to DOM-level execution.`);
          result = await executeViaContentScript(tab.id, action);
        }
      }
    } else {
      // SCROLL and anything else that doesn't need real input trust, plus
      // the whole-task fallback when the debugger couldn't be attached at
      // all.
      result = await executeViaContentScript(tab.id, action);
    }
    broadcastStatus(tab.id, "action", `Step ${step + 1}: ${result.message}`, { step: step + 1 });

    results.push(result.message);
    history.push(action);
    lastActionId = (action.action === "CLICK") ? action.element_id : null;
    if (signal?.aborted) return stoppedResult(results);
    await new Promise(r => setTimeout(r, action.action === "CLICK" ? 1500 : 500));
  }
  throw new Error("Max steps reached.");
}

// Minimal CDP key-code table covering every key PAROKSH's system prompt
// actually asks the model to send (backend/ollama/ollama.js: mainly Enter,
// occasionally Tab/Escape/arrows). Input.dispatchKeyEvent needs a matching
// key/code/windowsVirtualKeyCode triple — and, for character-producing
// keys, `text` — to be treated as a real keypress by the page. See
// https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchKeyEvent
const TRUSTED_KEY_CODES = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  " ": { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
};

// CDP's Input.dispatchKeyEvent modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.
function dispatchTrustedKeyCombo(tabId, key, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
  const spec = TRUSTED_KEY_CODES[key] || {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    text: key.length === 1 ? key : undefined,
  };
  let modifiers = 0;
  if (alt) modifiers |= 1;
  if (ctrl) modifiers |= 2;
  if (meta) modifiers |= 4;
  if (shift) modifiers |= 8;
  const base = {
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.windowsVirtualKeyCode,
    nativeVirtualKeyCode: spec.windowsVirtualKeyCode,
    modifiers,
  };
  // A modified combo (Ctrl+A, etc.) must NOT also carry `text`, or Chrome
  // tries to insert the character on top of the shortcut.
  const text = modifiers === 0 ? spec.text : undefined;
  return (async () => {
    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { type: "keyDown", ...base, text });
    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
  })();
}

function dispatchTrustedKey(tabId, key) {
  return dispatchTrustedKeyCombo(tabId, key);
}

// ---------------------------------------------------------------------------
// Trusted input (Chrome DevTools Protocol)
//
// WHY THIS EXISTS: a synthetic DOM event (el.click(), a plain
// `new KeyboardEvent(...)`, or setting `el.value` directly) is never
// isTrusted — and a great many sites (Google Search, YouTube, anything
// React/Polymer/Lit-based) either explicitly check isTrusted, or manage
// their own internal state separately from the raw DOM value/attribute, so
// the synthetic version silently does nothing or gets out of sync. CDP's
// Input domain dispatches REAL, trusted OS-level input events — exactly
// what a real mouse/keyboard would produce — so this is what makes CLICK,
// TYPE, HOVER, and KEY reliable on modern, JS-heavy sites.
//
// This is now the DEFAULT path for those four actions (not a Google-Docs-
// only fallback): background.js resolves a target point from the manifest
// rectangle for action.element_id, or from action.x/action.y when the
// model provided them directly (Google Docs/Forms, where there's no real
// DOM element to look up). executeViaContentScript remains the path for
// SCROLL, and is also the automatic fallback if attaching or
// dispatching via CDP fails for any reason (e.g. real DevTools is already
// attached to this tab).
// ---------------------------------------------------------------------------

const TRUSTED_ACTIONS = new Set(["CLICK", "TYPE", "HOVER", "KEY"]);

// Resolves the viewport point an action should target: the model's own
// x/y when given (Google Docs/Forms render to canvas, so there's no DOM
// element to measure), otherwise the center of the manifest rectangle for
// action.element_id — the same rectangle already computed for every
// visible interactive element on every step, so this works for ordinary
// CLICK/TYPE/HOVER without the model needing to output coordinates itself.
function resolveActionPoint(action, rectData, preferModelXY = false) {
  const hasXY = action.x != null && action.y != null;
  const fromElement = () => {
    if (action.element_id == null) return null;
    const el = rectData?.elements?.find((e) => e.id === action.element_id);
    return el ? { x: el.x + el.width / 2, y: el.y + el.height / 2 } : null;
  };
  // Canvas-rendered UIs (Google Docs/Sheets/Forms): model x/y first.
  if (preferModelXY && hasXY) return { x: action.x, y: action.y };
  // Everywhere else: the manifest rectangle for element_id is far more
  // trustworthy than model-guessed coordinates. x/y is only the fallback.
  return fromElement() || (hasXY ? { x: action.x, y: action.y } : null);
}

async function executeViaDebugger(tabId, action, point) {
  switch (action.action) {
    case "HOVER": {
      if (!point) throw new Error("No coordinates available for HOVER (no matching element_id and no x/y).");
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      return { message: `Hovered ${action.target || "element"} (trusted)` };
    }
    case "CLICK": {
      if (!point) throw new Error("No coordinates available for CLICK (no matching element_id and no x/y).");
      // Move first — plenty of sites only reveal/enable a click target once
      // it's genuinely hovered (menus, custom dropdowns, YouTube controls).
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      await new Promise((r) => setTimeout(r, 60));
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
      return { message: `Clicked ${action.target || "element"} (trusted)` };
    }
    case "TYPE": {
      if (!point) throw new Error("No coordinates available for TYPE (no matching element_id and no x/y).");
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      // A real single -> double -> triple click sequence AT THE SAME POINT:
      // this both focuses the field and selects its existing contents (a
      // triple-click selects a text field's entire value), so insertText()
      // below replaces rather than appends — scoped to this one field only.
      // No global keyboard shortcut (Ctrl+A) is involved, so there's no way
      // for this to accidentally select/clear something else on the page if
      // focus timing is slightly off. Chrome's click-count tracking needs
      // genuinely separate press/release pairs with an incrementing
      // clickCount — passing clickCount:3 on a single pair does not by
      // itself synthesize a triple-click.
      for (let count = 1; count <= 3; count++) {
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: count });
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: count });
        await new Promise((r) => setTimeout(r, 40));
      }
      await new Promise((r) => setTimeout(r, 100));
      await chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text: action.text || "" });
      return { message: `Typed "${action.text || ""}" (trusted)` };
    }
    case "KEY": {
      const key = action.key || "Enter";
      await dispatchTrustedKey(tabId, key);
      return { message: `Pressed ${key} (trusted)` };
    }
    default:
      throw new Error(`executeViaDebugger: unsupported action ${action.action}`);
  }
}

async function getElementRects(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_ELEMENT_RECTS" }, (res) => {
      resolve(res?.success ? res : { elements: [], viewportWidth: 0, viewportHeight: 0 });
    });
  });
}

// See the big comment where this is called from runAgentLoop: re-resolves
// a single element's current on-screen center, via action-executor.js's
// cached DOM reference for that element_id, right before a trusted CDP
// click/hover/type actually fires — instead of trusting a coordinate
// snapshotted a full OCR+LLM round-trip ago. Returns null (caller falls
// back to the original point) if the content script can't be reached or
// the element is gone/no longer visible, rather than blocking the action.
async function resolveFreshPoint(tabId, elementId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "RESOLVE_ELEMENT_POINT", elementId }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        resolve(null);
        return;
      }
      resolve(res.point || null); // { x, y, hit }
    });
  });
}

async function verifyCompletion(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "VERIFY_COMPLETION" }, (res) => {
      // If we can't reach the content script for some reason, fail open
      // (trust the model) rather than looping forever.
      resolve(res?.success ? res : { isGoogleForm: false, confirmed: true, hasUnfilledRequired: false });
    });
  });
}

async function waitForPageLoad(tabId) {
  await new Promise(resolve => {
    const interval = setInterval(async () => {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") { clearInterval(interval); resolve(); }
    }, 200);
  });
  await new Promise(r => setTimeout(r, 2000));
}

async function captureRawScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve({ dataUrl });
    });
  });
}

// Asks the content-script-side LocalVisionManager (frontend/local-vision) to
// run the local Qwen3.5-0.8B VLM on the RAW screenshot and describe what it
// sees. This is intentionally fail-open: Qwen is a visual-understanding aid
// for the backend model, not part of the privacy boundary, so if it's not
// ready yet (model files not copied in, WebGPU/worker unavailable, timed
// out, etc.) we just continue the step with an empty visual context instead
// of failing the whole run.
async function analyzeScreenshotInPage(tabId, dataUrl, instruction) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "LOCAL_VISION_ANALYZE_SCREENSHOT", dataUrl, instruction },
      (res) => {
        if (chrome.runtime.lastError) {
          console.warn("PAROKSH: Local Vision unavailable:", chrome.runtime.lastError.message);
          resolve("");
          return;
        }
        if (!res?.success) {
          console.warn("PAROKSH: Local Vision analysis skipped:", res?.error || "unknown error");
          resolve("");
          return;
        }
        resolve(res.context || "");
      }
    );
  });
}

// PrivacyShield is fail-open internally: PrivacyPipeline always tries
// redaction, but if OCR/detection/redaction fails for a given page it
// returns the raw, unmodified screenshot with sanitized:false instead of
// throwing — see PrivacyPipeline.processImage's catch block. So this only
// rejects when something more fundamental is wrong (content script not
// injected on this page, bundle failed to load/execute) and there's no
// screenshot of any kind to fall back to. Everything else — including
// "redaction didn't work on this page" — resolves normally and the caller
// checks res.sanitized to know which case happened.
async function sanitizeScreenshotInPage(tabId, dataUrl) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "PRIVACY_SANITIZE_SCREENSHOT", dataUrl },
      (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(
            `PrivacyShield unavailable: ${chrome.runtime.lastError.message}`
          ));
          return;
        }
        if (!res?.success) {
          reject(new Error(res?.error || "PrivacyShield bundle failed to run."));
          return;
        }
        if (!res.sanitizedDataUrl) {
          reject(new Error("PrivacyShield returned no screenshot at all."));
          return;
        }
        resolve(res);
      }
    );
  });
}

async function annotateSanitizedScreenshot(dataUrl, rectData) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const scale = Math.min(
    1,
    MAX_SCREENSHOT_DIMENSION / Math.max(bitmap.width, bitmap.height)
  );
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale)
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create screenshot canvas.");

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  drawMarks(ctx, rectData, canvas.width, canvas.height);

  const jpegBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  });
  const buf = await jpegBlob.arrayBuffer();

  return {
    base64: btoa(String.fromCharCode(...new Uint8Array(buf))),
  };
}

function drawMarks(ctx, rectData, canvasWidth, canvasHeight) {
  const { elements, viewportWidth, viewportHeight } = rectData;
  if (!elements?.length) return;
  const scaleX = canvasWidth / viewportWidth, scaleY = canvasHeight / viewportHeight;
  ctx.strokeStyle = "#ff3b30"; ctx.lineWidth = 2; ctx.font = "bold 11px Arial";
  elements.forEach(el => {
    const x = el.x * scaleX, y = el.y * scaleY;
    ctx.strokeRect(x, y, el.width * scaleX, el.height * scaleY);
    ctx.fillStyle = "#ff3b30"; ctx.fillRect(x, y - 13, 15, 13);
    ctx.fillStyle = "#fff"; ctx.fillText(el.id, x + 3, y - 4);
  });
}

const PRIVACY_DB_NAME = "paroksh_privacy_shield";
const PRIVACY_DB_VERSION = 1;
const PRIVACY_STORE = "redaction_pairs";

function openPrivacyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRIVACY_DB_NAME, PRIVACY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRIVACY_STORE)) {
        const store = db.createObjectStore(PRIVACY_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("tabId", "tabId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed."));
  });
}

async function storePrivacyCapture(capture) {
  const beforeResponse = await fetch(capture.beforeDataUrl);
  const afterResponse = await fetch(capture.afterDataUrl);
  const beforeBlob = await beforeResponse.blob();
  const afterBlob = await afterResponse.blob();

  const db = await openPrivacyDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PRIVACY_STORE, "readwrite");
    tx.objectStore(PRIVACY_STORE).add({
      createdAt: new Date().toISOString(),
      tabId: capture.tabId,
      beforeImage: beforeBlob,
      afterImage: afterBlob,
      detections: capture.detections,
      summary: capture.summary,
      runtime: capture.runtime,
      processingTimeMs: capture.processingTimeMs,
      sanitized: capture.sanitized !== false,
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Privacy capture storage failed."));
  });

  // Keep the local vault bounded. The latest 100 capture pairs are enough
  // for debugging/auditing without letting screenshots grow forever.
  await prunePrivacyVault(100);
  db.close();
}

async function prunePrivacyVault(maxEntries) {
  const db = await openPrivacyDb();
  const entries = await new Promise((resolve, reject) => {
    const tx = db.transaction(PRIVACY_STORE, "readonly");
    const request = tx.objectStore(PRIVACY_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Privacy vault read failed."));
  });

  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const stale = entries.slice(maxEntries);

  if (stale.length) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PRIVACY_STORE, "readwrite");
      const store = tx.objectStore(PRIVACY_STORE);
      for (const item of stale) store.delete(item.id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Privacy vault cleanup failed."));
    });
  }
  db.close();
}

// Service workers (unlike window/page contexts) don't implement
// URL.createObjectURL, so a blob has to be turned into a base64 data: URL
// instead before handing it to chrome.downloads.download.
async function blobToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000; // avoid call-stack limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return `data:${blob.type || "image/jpeg"};base64,${base64}`;
}

// Pulls every sanitized ("after") screenshot — i.e. exactly what was sent
// to the LLM — out of the local IndexedDB vault and saves each one as a
// real file on disk via chrome.downloads, under Downloads/paroksh_redacted.
// The raw "before" images are intentionally NOT exported here: this is
// specifically for inspecting what left the browser toward the model.
async function exportRedactedImages() {
  const db = await openPrivacyDb();
  const entries = await new Promise((resolve, reject) => {
    const tx = db.transaction(PRIVACY_STORE, "readonly");
    const request = tx.objectStore(PRIVACY_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Privacy vault read failed."));
  });
  db.close();

  if (!entries.length) {
    return {
      success: false,
      message: "No captured screenshots yet — run a task first, then try exporting again.",
    };
  }

  entries.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  let saved = 0;
  for (const entry of entries) {
    if (!entry.afterImage) continue;
    const stamp = String(entry.createdAt || Date.now()).replace(/[:.]/g, "-");
    let dataUrl;
    try {
      dataUrl = await blobToDataUrl(entry.afterImage);
    } catch (err) {
      console.warn("PAROKSH: failed to encode capture", entry.id, err.message);
      continue;
    }
    try {
      await new Promise((resolve, reject) => {
        chrome.downloads.download(
          {
            url: dataUrl,
            filename: `paroksh_redacted/redacted_${stamp}_${entry.id}.jpg`,
            conflictAction: "uniquify",
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError || downloadId == null) {
              reject(new Error(chrome.runtime.lastError?.message || "Download failed."));
              return;
            }
            resolve(downloadId);
          }
        );
      });
      saved++;
    } catch (err) {
      console.warn("PAROKSH: failed to export capture", entry.id, err.message);
    }
  }

  return {
    success: saved > 0,
    count: saved,
    message:
      saved > 0
        ? `Saved ${saved} redacted screenshot${saved === 1 ? "" : "s"} to Downloads/paroksh_redacted — these are exactly what was sent to the model.`
        : "Nothing could be saved. Check that PAROKSH has downloads permission (chrome://extensions).",
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function executeNavigate(tabId, action) {
  await chrome.tabs.update(tabId, { url: action.url });
  return { message: `Navigated to ${action.url}` };
}

async function executeViaContentScript(tabId, action) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "EXECUTE_ACTION", action }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      // Previously this discarded res.message and always rejected with a
      // generic "Failed" here, which meant the TRUSTED_INPUT_REQUIRED
      // signal from action-executor.js could never actually reach the
      // catch block below that's supposed to act on it.
      if (!res?.success) {
        reject(new Error(res?.message || "Failed"));
        return;
      }
      resolve({ message: res.message });
    });
  });
}

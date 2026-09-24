// local-vision-manager.js
//
// Main interface the rest of PAROKSH uses for local vision. Loaded as a
// plain classic content script (see manifest.json) alongside
// privacy-shield.bundle.js and action-executor.js — it does not use ESM
// import/export itself, so no bundling step is required for this file.
// The actual model code (@huggingface/transformers, qwen-loader.js,
// qwen-processor.js, qwen-inference.js) is bundled separately into
// qwen-worker.bundle.js and only ever runs inside a Web Worker.
//
//   background.js
//     -> chrome.tabs.sendMessage("LOCAL_VISION_ANALYZE_SCREENSHOT")
//   content.js
//     -> window.PAROKSH_LOCAL_VISION.analyzeScreenshot(dataUrl, instruction)
//   local-vision-manager.js (this file)
//     -> Worker (qwen-worker.bundle.js)
//     -> Qwen3.5-0.8B (ONNX + WebGPU/WASM)
//
// Qwen only ever returns short text. It never receives or produces DOM
// actions, and analyzeScreenshot() never sends anything over the network —
// the Worker loads model files from inside the extension package only
// (env.allowRemoteModels is forced off in qwen-loader.js).
(function () {
  const WORKER_PATH = "local-vision/qwen-worker.bundle.js";
  const MODEL_DIR_PATH = "local-vision/model/";
  const REQUEST_TIMEOUT_MS = 60000;

  let worker = null;
  let ready = false;
  let initPromise = null;
  let nextId = 1;
  const pending = new Map();

  function getModelBaseUrl() {
    return chrome.runtime.getURL(MODEL_DIR_PATH);
  }

  function failAllPending(reason) {
    for (const [id, entry] of pending) {
      entry.reject(new Error(reason));
      pending.delete(id);
    }
  }

  function handleWorkerMessage(event) {
    const msg = event.data || {};

    if (msg.type === "worker-error") {
      // Not tied to a specific request id — the worker itself is in a bad
      // state, so fail everything currently in flight.
      console.error("PAROKSH Local Vision worker error:", msg.error);
      ready = false;
      failAllPending(msg.error || "Local Vision worker crashed.");
      return;
    }

    const entry = pending.get(msg.id);
    if (msg.type === "progress") {
      entry?.onProgress?.(msg.progress);
      return;
    }
    if (!entry) return;

    pending.delete(msg.id);
    if (msg.type === "error" || msg.success === false) {
      entry.reject(new Error(msg.error || "Local Vision request failed."));
      return;
    }
    entry.resolve(msg);
  }

  function ensureWorker() {
    if (worker) return worker;
    if (typeof Worker === "undefined") {
      throw new Error("Local Vision: Web Workers are not supported in this runtime.");
    }
    const workerUrl = chrome.runtime.getURL(WORKER_PATH);
    worker = new Worker(workerUrl, { type: "module" });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (event) => {
      console.error("PAROKSH Local Vision worker failed to run:", event?.message || event);
      ready = false;
      failAllPending(event?.message || "Local Vision worker failed to run.");
    };
    return worker;
  }

  function send(type, payload = {}, onProgress) {
    ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Local Vision request timed out."));
      }, REQUEST_TIMEOUT_MS);

      pending.set(id, {
        onProgress,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      worker.postMessage({ id, type, modelBaseUrl: getModelBaseUrl(), ...payload });
    });
  }

  /**
   * Loads Qwen (idempotent — safe to call many times or not at all;
   * analyzeScreenshot() calls this itself on first use).
   */
  async function initialize(onProgress) {
    if (ready) return true;
    if (initPromise) return initPromise;

    initPromise = send("init", {}, onProgress)
      .then((msg) => {
        ready = !!msg.ready;
        return ready;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });

    return initPromise;
  }

  // Very small, defense-in-depth text redaction applied to Qwen's own
  // free-text description before it ever leaves this content script.
  // PrivacyShield (privacy-shield.bundle.js) remains the actual, deterministic
  // redaction engine for the *image itself* — this only masks obvious PII
  // patterns in case Qwen's description happens to echo visible text
  // verbatim (e.g. an email address it read off the screen).
  function sanitizeVisualContextText(text) {
    if (!text) return text;
    return text
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL>")
      .replace(/\b(?:\+?\d[\d\s-]{8,}\d)\b/g, "<NUMBER>");
  }

  /**
   * @param {string} imageDataUrl - the RAW screenshot, as a data: URL. Stays
   *   local to this Worker; never sent anywhere.
   * @param {string} [instruction] - what to ask Qwen to look for
   * @returns {Promise<{text:string}>}
   */
  async function analyzeScreenshot(imageDataUrl, instruction) {
    await initialize();
    const msg = await send("analyze", { imageDataUrl, instruction });
    return { text: sanitizeVisualContextText(msg.text || "") };
  }

  function isReady() {
    return ready;
  }

  async function dispose() {
    if (!worker) return;
    try {
      await send("dispose");
    } catch (_err) {
      // best effort — terminate regardless
    }
    worker.terminate();
    worker = null;
    ready = false;
    initPromise = null;
    failAllPending("Local Vision disposed.");
  }

  window.PAROKSH_LOCAL_VISION = { initialize, analyzeScreenshot, isReady, dispose };
})();

// qwen-worker.js
//
// Runs entirely inside a dedicated Web Worker so that loading/running
// Qwen3.5-0.8B (WebGPU + ONNX Runtime Web) never blocks the popup, the
// content script, or page interaction. Bundled (together with
// @huggingface/transformers and the other qwen-*.js modules) into
// local-vision/qwen-worker.bundle.js by `npm run build:worker` — see
// ../vite.worker.config.ts. This file is the *source*; do not load it
// directly, load the bundle.
//
// Message protocol (all messages carry the same `id` the caller sent so
// LocalVisionManager can correlate responses):
//   -> { id, type: "init",    modelBaseUrl }
//   -> { id, type: "analyze", modelBaseUrl, imageDataUrl, instruction }
//   -> { id, type: "dispose" }
//   <- { id, type: "progress",      progress }
//   <- { id, type: "init-result",   success, ready }
//   <- { id, type: "analyze-result", success, text }
//   <- { id, type: "dispose-result", success }
//   <- { id, type: "error",         error }

import { loadQwen, isQwenReady, disposeQwen } from "./qwen-loader.js";
import { runQwenInference } from "./qwen-inference.js";

let modelBaseUrl = null;

self.onmessage = async (event) => {
  const msg = event.data || {};
  const { id, type } = msg;

  try {
    switch (type) {
      case "init": {
        modelBaseUrl = msg.modelBaseUrl || modelBaseUrl;
        await loadQwen(modelBaseUrl, (progress) => {
          self.postMessage({ type: "progress", id, progress });
        });
        self.postMessage({ type: "init-result", id, success: true, ready: isQwenReady() });
        break;
      }

      case "analyze": {
        modelBaseUrl = msg.modelBaseUrl || modelBaseUrl;
        const result = await runQwenInference(modelBaseUrl, msg.imageDataUrl, msg.instruction, (progress) =>
          self.postMessage({ type: "progress", id, progress })
        );
        self.postMessage({ type: "analyze-result", id, success: true, text: result.text });
        break;
      }

      case "dispose": {
        disposeQwen();
        self.postMessage({ type: "dispose-result", id, success: true });
        break;
      }

      default:
        self.postMessage({ type: "error", id, error: `Local Vision worker: unknown message type "${type}"` });
    }
  } catch (err) {
    self.postMessage({ type: "error", id, error: err?.message || String(err) });
  }
};

self.onerror = (event) => {
  // Surfaces unhandled worker-level errors (e.g. a bad import) as a
  // catch-all message so LocalVisionManager can fail the request instead of
  // hanging forever.
  self.postMessage({ type: "worker-error", error: event?.message || "Unknown Local Vision worker error" });
};

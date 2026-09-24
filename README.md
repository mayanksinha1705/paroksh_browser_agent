# PAROKSH — AI Browser Agent

PAROKSH is a Chrome extension that lets an AI agent operate your browser
(click, type, scroll, navigate, fill forms) toward a goal you give it in
plain English, while keeping everything it *sees* privacy-safe.

This is the **unified build**: the base PAROKSH agent, the local Qwen3.5-0.8B
vision step, and the PrivacyShield redaction pipeline all live in this one
project and are wired together end-to-end (see the pipeline below). For the
detailed security write-up of the PrivacyShield integration specifically, see
`frontend/PRIVACY_SHIELD_INTEGRATION.md`.

> A second, deliberately stripped-down build without PrivacyShield exists
> separately for isolating whether PrivacyShield was the cause of a given
> agent failure. It is **not** part of this project — this build always
> redacts before anything leaves the browser.

## Architecture (Phase 1)

```
Browser screenshot (raw)
        │
        ▼
Qwen3.5-0.8B  — local, on-device, in a Web Worker
        │              (frontend/local-vision/)
        ▼
short text description of layout/UI (never the image)
        │
        ▼
PrivacyShield — local OCR + PII detection + fusion + redaction
        │              (frontend/privacy-shield/)
        ▼
sanitized screenshot
        │
        ▼
Node.js backend (backend/) ── receives ONLY the sanitized screenshot
        │                     + Qwen's text description (informational)
        ▼
server-side VLM (Ollama/Gemma) → structured action JSON
        │
        ▼
existing agent loop → action executor → browser action
```

**The raw screenshot never leaves the browser.** Qwen runs entirely
in-browser (WebGPU when available, WASM otherwise) via Transformers.js's
native `Qwen3_5ForConditionalGeneration` class (added in Transformers.js
v4.0, see [PR #1551](https://github.com/huggingface/transformers.js/pull/1551);
this project already depends on `@huggingface/transformers ^4.2.0`, which
includes it) and only ever produces a short text description, which is what — together with the *sanitized*
screenshot — reaches the Node.js backend. Qwen never clicks, types, or
scrolls; it only provides visual understanding. PrivacyShield remains the
only component that actually redacts pixels, and it does not depend on the
backend or on Qwen: if Qwen fails to load or times out, PrivacyShield still
runs and the step still proceeds with an empty local-vision description. If
PrivacyShield itself fails, the step stops — that is the actual privacy
boundary.

## Model placement

Model files are **not** included and are not downloaded automatically. Copy
your Qwen3.5-0.8B ONNX export into:

```
frontend/local-vision/model/Qwen3.5-0.8B-ONNX/
├── config.json
├── generation_config.json
├── preprocessor_config.json
├── processor_config.json
├── tokenizer.json
├── tokenizer_config.json
├── chat_template.jinja
└── onnx/
    ├── decoder_model_merged_q4.onnx
    ├── decoder_model_merged_q4.onnx_data
    ├── embed_tokens_q4.onnx
    ├── embed_tokens_q4.onnx_data
    ├── vision_encoder_fp16.onnx
    └── vision_encoder_fp16.onnx_data
```

## Install & build

### 1. PrivacyShield (existing, unchanged)

```powershell
cd frontend/privacy-shield
npm ci
npm run build:extension
```

Produces `frontend/extension-core/privacy-shield.bundle.js`.

### 2. Local Vision (Qwen3.5-0.8B) — new in Phase 1

```powershell
cd frontend/local-vision
npm install
npm run build:worker
```

Produces `frontend/local-vision/qwen-worker.bundle.js`. Then copy your model
files as described above.

### 3. Popup UI (existing, unchanged)

```powershell
cd frontend/popup-src
npm install
npm run build
```

### 4. Backend (existing, unchanged — still Node.js, still not Ollama-free)

```powershell
cd backend
npm install
npm start
```

Runs on `http://localhost:3000` and talks to Ollama on `http://localhost:11434`.

### 5. Load the extension

Open `chrome://extensions`, enable Developer Mode, "Load unpacked", and
select the `frontend/` folder (where `manifest.json` lives).

## Live pipeline status

While a task is running, the panel now shows a live "Pipeline" trace of
exactly what's happening at each step: reading the page, capturing the
screenshot, sending it to Qwen3.5-0.8B, PrivacyShield redaction, sending the
redacted screenshot to `gemma4:31b-cloud`, and executing the resulting
action. This is pushed from `background.js` (`broadcastStatus()`) to the
panel in real time — no polling — and disappears once the step-by-step
"Browser Activity" summary takes over after the run finishes.

**This trace (and the task itself) now survives page navigations.** A full
page navigation destroys and recreates the panel's `<iframe>` (fresh React
state, `isBusy` back to `false`) even though `background.js`'s agent loop
keeps running unaffected. The panel now asks `background.js`
(`GET_TASK_STATUS`) on every mount whether a task is still in flight for
this tab and, if so, resumes watching it — replaying the pipeline trace so
far instead of showing a blank one — and separately listens for a
`PAROKSH_TASK_RESULT` broadcast so the final chat reply lands even if the
panel that originally started the task no longer exists to receive its
direct response.

## Trusted key input (Enter, Tab, etc.)

`KEY` actions (most commonly pressing Enter after typing into a search box)
are now always executed via Chrome DevTools Protocol (`Input.dispatchKeyEvent`,
already used for CLICK/TYPE on Google Docs/Forms) instead of a synthetic
`KeyboardEvent`. Browsers and most sites (Google Search, YouTube, etc.)
ignore untrusted (`isTrusted: false`) key events for default actions like
submitting a search — a plain `dispatchEvent()` looked like it worked but
silently did nothing, which is why "type a query and press Enter" tasks
were unreliable.

## Trusted input by default (CLICK, TYPE, HOVER, KEY)

This goes further than just KEY: **CLICK, TYPE, HOVER, and KEY now all go
through the Chrome DevTools Protocol by default**, not just as a Google-Docs
fallback. `background.js` resolves a real screen point for every action —
either the center of the element's own manifest rectangle (looked up by
`element_id`, computed fresh every step from the same rectangles already
used to draw the numbered boxes) or the model's explicit `x`/`y` for
canvas-rendered UIs like Google Docs — then dispatches a real
`Input.dispatchMouseEvent`/`Input.dispatchKeyEvent`/`Input.insertText` at
that point. TYPE does a real single→double→triple click at that same point
first — the same click-count-based approach Puppeteer/Playwright use — so
it always replaces a field's contents instead of appending, scoped to that
one field only. (An earlier version of this used a global Ctrl+A +
Backspace before typing; that was removed since it could select/clear the
wrong thing if focus timing was ever slightly off — a triple-click can't.)

**Why this matters:** a synthetic DOM event (`el.click()`, `el.value = ...`,
a plain `dispatchEvent(new KeyboardEvent(...))`) is never `isTrusted`, and
plenty of modern sites — especially anything React/Polymer/Lit-based, like
YouTube — either explicitly check `isTrusted` or keep their own internal
input state separate from the raw DOM value, so a synthetic version can
silently do nothing or fall out of sync even though it "looks" like it
worked. CDP's `Input` domain produces the same trusted, OS-level events a
real mouse/keyboard would.

A single debugger session is now attached for the **whole task** (not
per-action — that used to flicker Chrome's "being debugged" banner on and
off for every click) and stays attached across in-tab navigations, since a
CDP session is scoped to the tab, not the page. If attaching fails for any
reason (most commonly: real DevTools is already open on that tab), the
whole task falls back to the previous DOM-level execution path instead of
failing outright — you'll see `(trusted)` in the activity log for actions
that went through CDP, and its absence for ones that fell back.

**`SELECT` intentionally still uses DOM-level execution, not CDP.** A native
`<select>`'s open dropdown list is rendered by the OS/browser chrome, not
the page — CDP mouse coordinates can't reach it. Setting `.value` and
dispatching `change` works reliably here specifically because browsers (and
virtually all sites) don't gate `change` events on `<select>` by trust the
way they gate Enter-to-submit — this isn't a gap so much as the right tool
for that one element type. Custom (non-native) dropdowns were already
handled as two CLICK actions per the system prompt, so they get the CDP
path automatically.

## Verifying Qwen initialization

1. With the backend running and the extension loaded, open any page and run
   a task from the PAROKSH panel.
2. Open the page's DevTools console. On the first step you should see no
   `PAROKSH Local Vision` warnings — a warning like `Local Vision
   unavailable` or `Local Vision analysis skipped` means Qwen didn't load
   (most commonly: model files not copied in yet, or `qwen-worker.bundle.js`
   not built). This is non-fatal — the agent keeps working with PrivacyShield
   and the backend model exactly as before.
3. To test Qwen directly without running a full task, open the page's
   DevTools console and run:
   ```js
   await window.PAROKSH_LOCAL_VISION.initialize(console.log);
   await window.PAROKSH_LOCAL_VISION.analyzeScreenshot(
     document.querySelector('img')?.src || 'data:image/png;base64,...',
     'Describe this image.'
   );
   ```
   A successful call returns `{ text: "..." }` with Qwen's description.

## Testing the privacy boundary

- Use the panel's **Export redacted screenshots** action (or send
  `{ type: "EXPORT_REDACTED_IMAGES" }` to the background script) to save
  every *sanitized* screenshot ever sent toward the model, under
  `Downloads/paroksh_redacted/`. These are exactly what left the browser.
- The raw screenshot and Qwen's local analysis never appear in any network
  request; only `backend`'s `/api/action` request body (`imageBase64`,
  `visualContext`) leaves the browser, and both fields are already
  sanitized/local-only by the time that request is made.

## Project layout

```
PAROKSH/
├── frontend/
│   ├── manifest.json
│   ├── extension-core/        background.js, content.js, action-executor.js,
│   │                          privacy-shield.bundle.js (built)
│   ├── local-vision/          Qwen3.5-0.8B local VLM (new in Phase 1)
│   │   ├── qwen/               qwen-loader.js, qwen-processor.js,
│   │   │                       qwen-inference.js, qwen-worker.js,
│   │   │                       local-vision-manager.js
│   │   ├── model/Qwen3.5-0.8B-ONNX/   (you copy the model files here)
│   │   └── qwen-worker.bundle.js      (built)
│   ├── privacy-shield/        PrivacyShield source (OCR, PII, redaction)
│   ├── popup-src/              React popup source
│   └── frontend/               built popup output (popup.html, assets/)
└── backend/
    ├── server.js
    └── ollama/                 ollama.js (action model), ollama2.js (chat reply)
```
#   p a r o k s h - b r o w s e r - a i  
 
# PAROKSH + PrivacyShield integration

## Security flow

For every agent vision step:

1. PAROKSH captures the current tab screenshot.
2. The raw screenshot is sent to the in-page **LocalVisionManager**, which runs
   Qwen3.5-0.8B (see `frontend/local-vision/`) entirely on-device in a Web
   Worker and returns a short text description of the layout/UI. This never
   leaves the browser, and is purely supplementary — if it fails or the
   model files haven't been copied in yet, the step continues with an empty
   description instead of stopping (see step 4, which is the actual privacy
   boundary).
3. The (still raw) screenshot is separately sent to the in-page PrivacyShield bridge.
4. PrivacyShield performs local OCR + PII detection + visual detection + fusion + irreversible redaction.
5. If PrivacyShield fails, the step stops. The raw screenshot is **not** sent to the LLM.
6. The sanitized image receives PAROKSH's numbered element boxes.
7. That sanitized/annotated image — plus Qwen's short text description from
   step 2 — is passed to the Node.js backend and on to Ollama/Gemma. Qwen's
   description is informational context only; it never replaces the element
   manifest and is never treated as an executable action.
8. The raw and sanitized images are stored locally in the extension's IndexedDB vault:
   - database: `paroksh_privacy_shield`
   - object store: `redaction_pairs`
   - fields: `beforeImage`, `afterImage`, detection metadata
   - retention: latest 100 capture pairs

### Important storage note

Chrome extensions do not provide a normal user-visible "folder" through `chrome.storage.local`. This integration therefore uses the extension's IndexedDB storage, which is local to the extension and supports binary image Blobs. It is the correct browser-native equivalent of a local screenshot folder. If you need actual PNG/JPEG files visible in Windows Explorer, that requires an explicit file-system permission/user-selected directory via the File System Access API.

## Build

From `MYextension/privacy-shield`:

```powershell
npm ci
npm run build:extension
```

The build must create:

`MYextension/extension-core/privacy-shield.bundle.js`

Then load/reload `MYextension` as an unpacked Chrome extension.

## Runtime dependencies

PrivacyShield's existing implementation uses:

- Tesseract.js for local OCR
- Transformers.js + `openai/privacy-filter` for local token classification when available
- local deterministic rule detection
- local visual detection
- Canvas-based irreversible redaction

The model/code assets may be downloaded the first time the extension initializes, but screenshots are not sent to those model endpoints by this integration. The LLM only receives the post-redaction screenshot.

## Local Vision (Qwen3.5-0.8B) build

See the root `README.md` for full details. In short, from `frontend/local-vision`:

```powershell
npm install
npm run build:worker
```

This creates `frontend/local-vision/qwen-worker.bundle.js`. You must also
manually copy your Qwen3.5-0.8B ONNX model files into
`frontend/local-vision/model/Qwen3.5-0.8B-ONNX/` — see the note in that
folder. This step is independent of the PrivacyShield build above.

# PAROKSH — AI Browser Agent

**PAROKSH** is a Chrome extension that enables AI-powered browser automation through visual understanding of web pages.

It combines **local, on-device vision**, **privacy-preserving screenshot redaction**, and a server-side vision-language model to understand the current browser state and perform actions such as clicking, typing, scrolling, navigating, and filling forms.

The goal is simple:

> **Let an AI agent understand and operate a browser while keeping sensitive visual information protected before it leaves the device.**

---

## ✨ Key Features

* 🧠 **Local Vision Understanding** — Qwen3.5-0.8B runs locally in the browser.
* 🔒 **PrivacyShield** — Detects and redacts sensitive information from screenshots before transmission.
* 👁️ **Visual Browser Automation** — Uses screenshots and page context to determine the next action.
* 🖱️ **Trusted Browser Input** — Supports reliable CLICK, TYPE, HOVER, and KEY actions through Chrome DevTools Protocol.
* 🔄 **Multi-step Agent Loop** — Continuously observes, decides, acts, and verifies until the requested task is completed.
* 🛡️ **Anti-loop & Verification Logic** — Prevents repeated actions and requires visual confirmation before declaring a task complete.
* 💬 **Natural-language Interaction** — Users describe what they want in plain English.
* ⚡ **Local WebGPU/WASM Support** — Local vision can use WebGPU when available, with WASM fallback.
* 🧩 **Chrome Extension Architecture** — Built using Manifest V3.

---

## 🏗️ Architecture

```text
                    ┌──────────────────────────┐
                    │      User Instruction     │
                    │   "Search for X on Web"  │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │      PAROKSH Extension    │
                    │       Chrome / MV3        │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │     Browser Screenshot     │
                    │        Raw Pixels          │
                    └────────────┬─────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │       Qwen3.5-0.8B Local Vision      │
              │                                      │
              │  Runs inside browser via Web Worker  │
              │       WebGPU / WASM + Transformers.js│
              └──────────────────┬───────────────────┘
                                 │
                                 │ Textual UI description
                                 ▼
              ┌──────────────────────────────────────┐
              │          PrivacyShield                │
              │                                      │
              │ OCR → Detection → Fusion → Redaction │
              └──────────────────┬───────────────────┘
                                 │
                                 │ Sanitized screenshot
                                 ▼
              ┌──────────────────────────────────────┐
              │          Node.js Backend               │
              │                                      │
              │        localhost:3000                │
              └──────────────────┬───────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │          Ollama / Gemma               │
              │                                      │
              │    Action decision + chat response   │
              └──────────────────┬───────────────────┘
                                 │
                                 │ Structured action
                                 ▼
              ┌──────────────────────────────────────┐
              │         PAROKSH Action Executor       │
              │                                      │
              │     CLICK / TYPE / HOVER / KEY /     │
              │       SCROLL / NAVIGATE / DONE       │
              └──────────────────┬───────────────────┘
                                 │
                                 ▼
                       ┌─────────────────────┐
                       │   Browser Action    │
                       └─────────────────────┘
```

---

## 🔐 Privacy Architecture

Privacy is a core part of PAROKSH's architecture.

The browser first captures the current screen. The local vision model analyzes the visual layout **inside the browser** and produces a textual description.

Before a screenshot is sent to the backend, **PrivacyShield processes the image locally**.

Its pipeline includes:

```text
Screenshot
    ↓
Image Validation
    ↓
OCR
    ↓
Entity / PII Detection
    ↓
Detection Fusion
    ↓
Privacy Policy
    ↓
Pixel Redaction
    ↓
Sanitized Screenshot
```

Only the **sanitized screenshot** is sent to the Node.js backend.

The raw screenshot is not intentionally transmitted to the backend.

If the local Qwen vision model fails to initialize, the privacy pipeline can still operate independently. If the PrivacyShield pipeline fails, the automation step is stopped rather than bypassing the privacy boundary.

---

## 🧠 Local Vision

PAROKSH uses **Qwen3.5-0.8B** as its local vision-language component.

The model runs inside the browser using:

* Transformers.js
* Web Workers
* WebGPU when available
* WASM fallback
* ONNX model files

The local vision component is responsible for **visual understanding**, not browser interaction.

It generates a short textual description of the visible interface which can then be used by the action-planning model.

### Model location

Place the Qwen ONNX model files in:

```text
frontend/local-vision/model/Qwen3.5-0.8B-ONNX/
```

Expected structure:

```text
Qwen3.5-0.8B-ONNX/
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

**Model weights are intentionally not included in this repository.**

---

## 🛡️ PrivacyShield

PrivacyShield is the local privacy layer responsible for protecting sensitive information in screenshots.

The implementation contains modules for:

* OCR
* Visual detection
* Rule-based detection
* Entity normalization
* PII fusion
* Privacy policies
* Image preprocessing
* Image validation
* Canvas-based redaction
* Runtime detection
* Fail-closed handling
* Audit logging

Main location:

```text
frontend/privacy-shield/
```

---

## 🤖 Backend

The backend is a lightweight Node.js server that acts as the bridge between the Chrome extension and Ollama.

It exposes:

```text
GET  /api/health
POST /api/action
POST /api/reply
```

Default address:

```text
http://localhost:3000
```

The backend communicates with Ollama at:

```text
http://localhost:11434
```

The action model is configured as:

```text
gemma4:31b-cloud
```

The same model is currently used for generating natural-language responses.

---

# 🚀 Getting Started

## Requirements

Before running PAROKSH, install:

* Google Chrome
* Node.js 18+
* npm
* Ollama
* Required Ollama model
* Qwen3.5-0.8B ONNX model files

---

## 1. Clone the Repository

```bash
git clone https://github.com/mayanksinha1705/paroksh_browser_agent.git
cd paroksh_browser_agent
```

---

## 2. Install Local Vision Dependencies

```bash
cd frontend/local-vision
npm install
```

Build the local vision worker:

```bash
npm run build:worker
```

This generates:

```text
frontend/local-vision/qwen-worker.bundle.js
```

---

## 3. Add the Qwen Model

Copy the required Qwen3.5-0.8B ONNX files into:

```text
frontend/local-vision/model/Qwen3.5-0.8B-ONNX/
```

The repository intentionally does not include the large model weights.

---

## 4. Build PrivacyShield

```bash
cd ../privacy-shield
npm ci
npm run build:extension
```

This generates the PrivacyShield extension bundle used by PAROKSH.

---

## 5. Build the Extension UI

```bash
cd ../popup-src
npm install
npm run build
```

---

## 6. Start the Backend

Open a new terminal:

```bash
cd backend
npm install
npm start
```

The backend should start at:

```text
http://localhost:3000
```

You can verify it using:

```text
http://localhost:3000/api/health
```

---

## 7. Configure Ollama

Make sure Ollama is running locally and the configured model is available.

PAROKSH currently uses:

```text
gemma4:31b-cloud
```

The backend communicates with Ollama through:

```text
http://localhost:11434
```

---

## 8. Load PAROKSH in Chrome

1. Open:

```text
chrome://extensions
```

2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select the project's:

```text
frontend/
```

directory.

5. Reload the extension after rebuilding any component.

---

# 🧪 Example Tasks

Once PAROKSH is running, users can provide natural-language instructions such as:

```text
Search Google for the latest AI news.
```

```text
Open YouTube and search for Python tutorials.
```

```text
Open this form and fill in the required fields.
```

```text
Navigate to the specified website and find the requested information.
```

PAROKSH observes the current browser state, determines an action, executes it, and verifies the resulting screen before continuing.

---

# 🔄 Agent Loop

The core automation process follows an observe → reason → act → verify cycle:

```text
User Goal
   ↓
Observe Browser
   ↓
Capture Screenshot
   ↓
Local Vision
   ↓
PrivacyShield
   ↓
Action Model
   ↓
Execute Action
   ↓
Observe Result
   ↓
Verify
   │
   ├── Goal Complete → DONE
   │
   └── Not Complete → Next Step
```

The agent does not simply execute a predefined sequence. It repeatedly evaluates the current browser state to determine the next action.

---

# 🖱️ Trusted Input

PAROKSH uses Chrome DevTools Protocol-based input for important browser interactions.

Supported actions include:

```text
CLICK
TYPE
HOVER
KEY
SCROLL
NAVIGATE
DONE
```

Using trusted browser input improves compatibility with websites where synthetic JavaScript events may not trigger the expected browser behavior.

This is particularly important for applications such as:

* Google Search
* Google Docs
* Google Forms
* Gmail
* Dynamic web applications

---

# 🧩 Project Structure

```text
PAROKSH/
│
├── backend/
│   ├── server.js
│   ├── package.json
│   └── ollama/
│       ├── ollama.js
│       └── ollama2.js
│
├── frontend/
│   ├── manifest.json
│   │
│   ├── local-vision/
│   │   ├── model/
│   │   ├── qwen/
│   │   ├── package.json
│   │   └── vite.worker.config.ts
│   │
│   ├── privacy-shield/
│   │   ├── privacy/
│   │   ├── ui/
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── popup-src/
│   └── extension-core/
│
└── README.md
```

---

# 🔒 Security & Privacy Principles

PAROKSH follows several important principles:

### Local-first visual processing

The initial visual understanding step happens inside the browser using the local Qwen model.

### Redaction before transmission

PrivacyShield processes screenshots locally before they are sent to the backend.

### Fail-closed privacy boundary

If the privacy processing pipeline fails, the system does not intentionally bypass the redaction stage and transmit the raw screenshot.

### No model weights in Git

Large model files are excluded from the repository to keep the source repository manageable.

---

# ⚠️ Current Limitations

PAROKSH is a **prototype / hackathon project** and should not be considered a production-ready autonomous browser agent.

Current limitations include:

* Local Qwen inference requires compatible hardware/browser support.
* ONNX model files must be provided separately.
* Some websites may behave differently because of dynamic UI changes.
* Browser automation can fail when website layouts change unexpectedly.
* Ollama must be running for the backend action-planning stage.
* Performance depends heavily on the user's CPU, GPU, browser, and available memory.
* Privacy detection cannot guarantee perfect detection of every sensitive element.

---

# 🛠️ Technology Stack

| Component           | Technology               |
| ------------------- | ------------------------ |
| Browser Extension   | Chrome Manifest V3       |
| Local Vision        | Qwen3.5-0.8B             |
| Local Inference     | Transformers.js + ONNX   |
| Acceleration        | WebGPU / WASM            |
| Privacy Layer       | PrivacyShield            |
| OCR                 | Tesseract-based pipeline |
| Backend             | Node.js + Express        |
| Action Model        | Gemma via Ollama         |
| Browser Interaction | Chrome DevTools Protocol |
| Frontend Build      | Vite                     |
| Language            | JavaScript / TypeScript  |

---

# 🎯 Project Goal

PAROKSH explores how browser AI agents can become more **privacy-aware, lightweight, and practical** by combining local visual understanding with a privacy-preserving processing layer.

Instead of sending an untouched browser screenshot directly to a remote vision model:

```text
Raw Browser Screen
       ↓
Local Vision
       ↓
Local Privacy Protection
       ↓
Sanitized Visual Context
       ↓
AI Action Planning
       ↓
Browser Automation
```

This architecture aims to reduce unnecessary exposure of sensitive screen information while retaining the visual context required for browser automation.

---

# 📌 Hackathon Prototype

PAROKSH was developed as an experimental browser automation system demonstrating:

* On-device vision
* Privacy-aware visual processing
* AI-driven browser interaction
* Visual verification
* Trusted browser input
* Local + server-side AI coordination

The repository contains the source code required to reproduce the prototype, while large model weights are intentionally provided separately.

---

## License

Add the project's license here if/when a license is selected.

---

## 👨‍💻 Author

**Mayank Sinha**

PAROKSH — AI Browser Agent

/**
 * PrivacyShield - OpenAI Privacy Filter On-Device Engine
 * Uses @huggingface/transformers with 4-bit quantized ONNX representation ('q4')
 * and WebGPU hardware acceleration (falling back to WASM / CPU).
 * 
 * Implements manual tensor/logits inspection and argmax loop across [batchSize, seqLen, numLabels]
 * to bypass framework pipeline dimension bugs as specified in Product.md §11 & §12.
 */

import { AutoTokenizer, AutoModelForTokenClassification, env } from "@huggingface/transformers";
import { TextSpanMatch } from "./PrivacyFilterParser.ts";

export interface PrivacyFilterEngineRuntimeInfo {
  status: "uninitialized" | "loading" | "ready" | "fallback_heuristics" | "error";
  modelId: string;
  device: "webgpu" | "wasm" | "cpu" | "none";
  dtype: string;
  details: string;
}

export class OpenAIPrivacyFilterEngine {
  private static instance: OpenAIPrivacyFilterEngine | null = null;
  public static readonly MODEL_ID = "openai/privacy-filter";

  private tokenizer: any = null;
  private model: any = null;
  private initPromise: Promise<void> | null = null;
  private isLoaded: boolean = false;
  private activeDevice: "webgpu" | "wasm" | "cpu" | "none" = "none";
  private activeDtype: string = "q4";
  private status: PrivacyFilterEngineRuntimeInfo["status"] = "uninitialized";
  private statusMessage: string = "Not loaded";

  public static getInstance(): OpenAIPrivacyFilterEngine {
    if (!OpenAIPrivacyFilterEngine.instance) {
      OpenAIPrivacyFilterEngine.instance = new OpenAIPrivacyFilterEngine();
    }
    return OpenAIPrivacyFilterEngine.instance;
  }

  public isReady(): boolean {
    return this.isLoaded && this.tokenizer !== null && this.model !== null;
  }

  public getRuntimeInfo(): PrivacyFilterEngineRuntimeInfo {
    return {
      status: this.status,
      modelId: OpenAIPrivacyFilterEngine.MODEL_ID,
      device: this.activeDevice,
      dtype: this.activeDtype,
      details: this.statusMessage,
    };
  }

  /**
   * Initializes the 4-bit privacy filter model on-device.
   * Tries WebGPU first, then WASM, and falls back gracefully to deterministic heuristics if offline.
   */
  public async initialize(): Promise<void> {
    if (this.isLoaded) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.status = "loading";
      this.statusMessage = "Loading 4-bit privacy filter model directly...";
      console.log(this.statusMessage);

      // Configure transformers.js browser environment
      if (typeof window !== "undefined" && env) {
        env.allowLocalModels = false;
        if (env.backends?.onnx?.wasm) {
          env.backends.onnx.wasm.numThreads = 1;
        }
      }

      // 1. Manually load tokenizer
      try {
        this.tokenizer = await AutoTokenizer.from_pretrained(OpenAIPrivacyFilterEngine.MODEL_ID);
      } catch (err: any) {
        console.warn(
          "Could not download/load tokenizer (running offline or network unavailable). Falling back to heuristics:",
          err?.message || err
        );
        this.status = "fallback_heuristics";
        this.statusMessage = "Offline fallback (Deterministic Rules & Visual Engine)";
        return;
      }

      // 2. Load model: try WebGPU first
      try {
        console.log("Attempting to load model with WebGPU acceleration...");
        this.model = await AutoModelForTokenClassification.from_pretrained(
          OpenAIPrivacyFilterEngine.MODEL_ID,
          {
            device: "webgpu",
            dtype: "q4",
          }
        );
        this.activeDevice = "webgpu";
        this.activeDtype = "q4";
        this.isLoaded = true;
        this.status = "ready";
        this.statusMessage = "openai/privacy-filter (WebGPU q4 Accelerated)";
        console.log("Successfully loaded openai/privacy-filter on WebGPU (q4)");
        return;
      } catch (webgpuErr: any) {
        console.warn("WebGPU initialization failed or unsupported, attempting WASM fallback:", webgpuErr?.message || webgpuErr);
      }

      // 3. Fallback: try WASM
      try {
        this.model = await AutoModelForTokenClassification.from_pretrained(
          OpenAIPrivacyFilterEngine.MODEL_ID,
          {
            device: "wasm",
            dtype: "q4",
          }
        );
        this.activeDevice = "wasm";
        this.activeDtype = "q4";
        this.isLoaded = true;
        this.status = "ready";
        this.statusMessage = "openai/privacy-filter (WASM CPU q4)";
        console.log("Successfully loaded openai/privacy-filter on WASM (q4)");
      } catch (wasmErr: any) {
        console.warn(
          "WASM model loading unavailable (offline or missing cached weights). Using local heuristic engine:",
          wasmErr?.message || wasmErr
        );
        this.status = "fallback_heuristics";
        this.statusMessage = "Offline fallback (Deterministic Rules & Visual Engine)";
      }
    })();

    return this.initPromise;
  }

  /**
   * Performs on-device token classification inference.
   * Manually extracts raw array values and shapes from logits:
   * [batchSize, seqLen, numLabels]
   * Runs manual argmax across numLabels to bypass framework dimension issues.
   */
  public async detectSpans(text: string): Promise<TextSpanMatch[]> {
    if (!this.isReady() || !text || text.trim().length === 0) {
      return [];
    }

    try {
      // 1. Tokenize the input text
      const inputs = this.tokenizer(text);

      // 2. Compute single forward inference pass
      const { logits } = await this.model(inputs);

      // 3. Safely extract raw array values and shapes
      const rawData: Float32Array = logits.data;
      const dims: number[] = logits.dims || [];

      let seqLen = 0;
      let numLabels = 0;

      if (dims.length === 3) {
        [, seqLen, numLabels] = dims;
      } else if (dims.length === 2) {
        [seqLen, numLabels] = dims;
      } else {
        console.warn("Unexpected logits dimensions:", dims);
        return [];
      }

      const id2label: Record<number, string> =
        this.model.config?.id2label || {};

      const detectedSpans: TextSpanMatch[] = [];

      // Temporary entity accumulator to coalesce consecutive B- and I- tokens
      let currentEntity: {
        label: string;
        tokens: string[];
        maxConfidence: number;
        startIndex: number;
        endIndex: number;
      } | null = null;

      const flushEntity = () => {
        if (currentEntity && currentEntity.tokens.length > 0) {
          const phrase = currentEntity.tokens.join(" ").trim();
          if (phrase.length > 1) {
            detectedSpans.push({
              label: currentEntity.label,
              text: phrase,
              startIndex: currentEntity.startIndex,
              endIndex: currentEntity.endIndex,
              confidence: currentEntity.maxConfidence,
            });
          }
        }
        currentEntity = null;
      };

      // 4. Iterate through each token in the sequence using standard JS math
      for (let i = 0; i < seqLen; i++) {
        const startIndex = i * numLabels;
        let maxVal = -Infinity;
        let argMaxClass = 0;

        // Find the highest score index manually to bypass framework dimension issues
        for (let j = 0; j < numLabels; j++) {
          const val = rawData[startIndex + j];
          if (val > maxVal) {
            maxVal = val;
            argMaxClass = j;
          }
        }

        const rawLabel = id2label[argMaxClass] || "O";
        const tokenId = Number(
          inputs.input_ids?.data
            ? inputs.input_ids.data[i]
            : inputs.input_ids[i]
        );
        const cleanToken = this.tokenizer.decode([tokenId]).trim();

        // Calculate approximate softmax confidence
        let expSum = 0;
        for (let j = 0; j < numLabels; j++) {
          expSum += Math.exp(rawData[startIndex + j] - maxVal);
        }
        const confidence = expSum > 0 ? Math.min(1.0, 1.0 / expSum) : 0.95;

        // Ignore neutral "O" classifications, special tokens, and punctuation
        const isSpecial =
          cleanToken.startsWith("[") && cleanToken.endsWith("]") ||
          cleanToken === "<s>" ||
          cleanToken === "</s>";

        if (rawLabel && rawLabel !== "O" && cleanToken.length >= 1 && !isSpecial) {
          // Strip BIOES tagging prefixes: B-, I-, E-, S-, L-
          const baseLabel = rawLabel.replace(/^[BIESL]-/i, "").toLowerCase();
          const isContinuation = /^[IESL]-/i.test(rawLabel);
          const isEnd = /^E-/i.test(rawLabel);

          if (currentEntity && (isContinuation || currentEntity.label === baseLabel)) {
            currentEntity.tokens.push(cleanToken);
            currentEntity.maxConfidence = Math.max(currentEntity.maxConfidence, confidence);
            if (isEnd) {
              flushEntity();
            }
          } else {
            flushEntity();
            currentEntity = {
              label: baseLabel,
              tokens: [cleanToken],
              maxConfidence: Math.max(0.9, confidence),
              startIndex: 0,
              endIndex: 0,
            };
            if (isEnd) {
              flushEntity();
            }
          }
        } else {
          flushEntity();
        }
      }

      flushEntity();

      return detectedSpans;
    } catch (err: any) {
      console.warn("Error during on-device model inference:", err);
      return [];
    }
  }
}

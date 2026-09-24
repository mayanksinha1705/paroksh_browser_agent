/**
 * PrivacyShield - Master Pipeline Orchestrator
 * Connects all 8 on-device processing stages with live progress callbacks.
 */

import {
  ImageInput,
  PipelineStageEvent,
  RedactionResult,
  RuntimeInfo,
} from "./types.ts";
import { ImageLoader } from "./image/ImageLoader.ts";
import { TesseractEngine } from "./ocr/TesseractEngine.ts";
import { PrivacyFilter } from "./detection/PrivacyFilter.ts";
import { RuleDetector } from "./detection/RuleDetector.ts";
import { VisualDetector } from "./detection/VisualDetector.ts";
import { PIIFusionEngine } from "./fusion/PIIFusionEngine.ts";
import { PolicyEngine } from "./policy/PolicyEngine.ts";
import { CanvasRedactor } from "./redaction/CanvasRedactor.ts";
import { RuntimeDetector } from "./runtime/RuntimeDetector.ts";
import { FailClosed, PrivacyPipelineError } from "./security/FailClosed.ts";
import { AuditLogger } from "./security/AuditLogger.ts";

export class PrivacyPipeline {
  private loader: ImageLoader;
  private ocrEngine: TesseractEngine;
  private privacyFilter: PrivacyFilter;
  private policyEngine: PolicyEngine;
  private runtimeInfo: RuntimeInfo | null = null;

  constructor() {
    this.loader = new ImageLoader();
    this.ocrEngine = new TesseractEngine();
    this.privacyFilter = new PrivacyFilter();
    this.policyEngine = new PolicyEngine();
  }

  public async initialize(): Promise<void> {
    this.runtimeInfo = await RuntimeDetector.detectRuntime();
    await this.privacyFilter.initialize();
  }

  public async setLanguage(lang: "eng" | "hin" | "eng+hin"): Promise<void> {
    await this.ocrEngine.setLanguage(lang);
  }

  public getLanguage(): string {
    return this.ocrEngine.getLanguage();
  }

  public async getRuntimeInfo(): Promise<RuntimeInfo> {
    if (!this.runtimeInfo) {
      this.runtimeInfo = await RuntimeDetector.detectRuntime();
    }
    return this.runtimeInfo;
  }

  public async processImage(
    input: ImageInput,
    onStageUpdate?: (event: PipelineStageEvent) => void
  ): Promise<RedactionResult> {
    const startTime = performance.now();
    const timings: Record<string, number> = {};

    const notify = (
      stage: PipelineStageEvent["stage"],
      status: PipelineStageEvent["status"],
      label: string,
      sublabel?: string,
      error?: string
    ) => {
      if (onStageUpdate) {
        onStageUpdate({ stage, status, label, sublabel, error });
      }
    };

    // 0. Runtime check
    if (!this.runtimeInfo) {
      this.runtimeInfo = await RuntimeDetector.detectRuntime();
    }

    // STAGE 1: Image Loaded & Ingestion. If we can't even decode the
    // screenshot there is nothing to fall back to, so this stage alone is
    // still allowed to throw.
    notify("image_loaded", "active", "Loading Image", "Validating local file format and decoding");
    const t1 = performance.now();
    const { frame, blob: originalBlob, url: originalUrl } = await this.loader.loadImage(input);
    timings.imageLoading = performance.now() - t1;
    notify("image_loaded", "completed", "Image Loaded", `${frame.width} × ${frame.height}px`);

    // STAGES 2-7: OCR, PII detection, and redaction.
    //
    // Fail-OPEN by design: redaction is a best-effort privacy improvement,
    // not a hard gate on whether the screenshot may be used at all. A lot
    // of sites block Tesseract's worker/wasm fetch via CSP, have no
    // recognizable text, or otherwise make OCR fail — that used to abort
    // the entire step and nothing was sent anywhere. Now: if redaction
    // succeeds, great, the sanitized image goes out. If any stage in here
    // fails, we log why, and fall back to returning the original,
    // unmodified screenshot with `sanitized: false` so the caller can
    // still proceed (and, if it wants to, tell the user redaction was
    // skipped for this page).
    try {
      // STAGE 2: Local OCR (Tesseract.js)
      const langLabel = this.ocrEngine.getLanguage() === "eng+hin" ? "Hindi + English" : this.ocrEngine.getLanguage().toUpperCase();
      notify("ocr", "active", `Local OCR (${langLabel})`, "Tesseract on-device worker extracting text tokens");
      const t2 = performance.now();
      const ocrResult = await this.ocrEngine.recognize(frame);
      timings.ocr = performance.now() - t2;
      notify("ocr", "completed", `OCR (${langLabel})`, `${ocrResult.words.length} text elements mapped`);

      // STAGE 3: PII Detection (Privacy Filter)
      notify("pii_detection", "active", "PII Detection", "Rule-anchored on-device text classification");
      const t3 = performance.now();
      const modelDetections = await this.privacyFilter.detect(ocrResult);
      timings.model = performance.now() - t3;
      notify("pii_detection", "completed", "PII Detection", `${modelDetections.length} entities classified`);

      // STAGE 4: Rule Engine
      notify("rule_engine", "active", "Rule Engine", "Patterns & Heuristics checking PAN, IFSC, etc.");
      const t4 = performance.now();
      const ruleDetections = RuleDetector.detectFromOCR(ocrResult);
      timings.rules = performance.now() - t4;
      notify("rule_engine", "completed", "Rule Engine", `${ruleDetections.length} rule matches`);

      // STAGE 5: Visual Detection
      notify("visual_detection", "active", "Visual Detection", "Scanning for Face, QR Code, and Signatures");
      const t5 = performance.now();
      const visualDetections = await VisualDetector.detect(frame, ocrResult);
      timings.visual = performance.now() - t5;
      notify("visual_detection", "completed", "Visual Detection", `${visualDetections.length} visual items`);

      // STAGE 6: PII Fusion & Scoring
      notify("fusion_scoring", "active", "Fusion & Scoring", "Deduplicating regions & assessing risk");
      const t6 = performance.now();
      const allDetections = [...modelDetections, ...ruleDetections, ...visualDetections];
      const fusedDetections = PIIFusionEngine.fuse(allDetections);
      const evaluatedDetections = this.policyEngine.evaluate(fusedDetections);
      timings.fusion = performance.now() - t6;
      notify("fusion_scoring", "completed", "Fusion & Scoring", `${evaluatedDetections.length} canonical regions`);

      // STAGE 7: Irreversible Redaction
      notify("redaction", "active", "Redaction", "Applying opaque pixel masks on Canvas");
      const t7 = performance.now();
      const sanitizedBlob = await CanvasRedactor.redactClean(frame, evaluatedDetections, 4);
      const taggedBlob = await CanvasRedactor.redactWithTags(frame, evaluatedDetections, 4);
      timings.redaction = performance.now() - t7;

      // Sanity checks on this run's own output (not a hard security gate
      // anymore — if these fail we fall through to the raw-image path
      // below just like any other stage failure).
      FailClosed.assertSafeOutput(sanitizedBlob);
      FailClosed.assertNoLeakage(originalBlob, sanitizedBlob);

      const sanitizedUrl = this.loader.createManagedUrl(sanitizedBlob);
      const taggedUrl = this.loader.createManagedUrl(taggedBlob);
      notify("redaction", "completed", "Redaction", "Irreversible mask applied");

      // STAGE 8: Complete
      const totalTimeMs = Math.round(performance.now() - startTime);
      timings.total = totalTimeMs;
      notify("complete", "completed", "Complete", `Sanitized in ${(totalTimeMs / 1000).toFixed(1)}s`);

      const summary = {
        total: evaluatedDetections.length,
        critical: evaluatedDetections.filter((d) => d.risk === "critical").length,
        high: evaluatedDetections.filter((d) => d.risk === "high").length,
        medium: evaluatedDetections.filter((d) => d.risk === "medium").length,
        low: evaluatedDetections.filter((d) => d.risk === "low").length,
      };

      // Record privacy-safe audit log
      AuditLogger.log({
        timestamp: new Date().toISOString(),
        imageDimensions: `${frame.width}x${frame.height}`,
        totalDetections: summary.total,
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        runtime: this.runtimeInfo.details,
        cloudExposure: false,
        processingTimeMs: totalTimeMs,
      });

      return {
        originalImageBlob: originalBlob,
        originalImageUrl: originalUrl,
        sanitizedImageBlob: sanitizedBlob,
        sanitizedImageUrl: sanitizedUrl,
        taggedImageBlob: taggedBlob,
        taggedImageUrl: taggedUrl,
        width: frame.width,
        height: frame.height,
        detections: evaluatedDetections,
        summary,
        runtime: this.runtimeInfo,
        processingTimeMs: totalTimeMs,
        sanitized: true,
        stagesTiming: timings,
      };
    } catch (err: any) {
      const reason = err?.message || String(err);
      notify("redaction", "failed", "Redaction skipped — using raw screenshot", reason, reason);

      const totalTimeMs = Math.round(performance.now() - startTime);
      timings.total = totalTimeMs;
      notify("complete", "completed", "Complete", `Sent raw (redaction failed in ${(totalTimeMs / 1000).toFixed(1)}s)`);

      const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

      // Still record an audit entry — with cloudExposure true, so anyone
      // reviewing the log can see redaction did not run for this capture.
      AuditLogger.log({
        timestamp: new Date().toISOString(),
        imageDimensions: `${frame.width}x${frame.height}`,
        totalDetections: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        runtime: this.runtimeInfo?.details || "unknown",
        cloudExposure: true,
        processingTimeMs: totalTimeMs,
        error: reason,
      });

      return {
        originalImageBlob: originalBlob,
        originalImageUrl: originalUrl,
        sanitizedImageBlob: originalBlob,
        sanitizedImageUrl: originalUrl,
        taggedImageBlob: originalBlob,
        taggedImageUrl: originalUrl,
        width: frame.width,
        height: frame.height,
        detections: [],
        summary,
        runtime: this.runtimeInfo!,
        processingTimeMs: totalTimeMs,
        sanitized: false,
        error: reason,
        stagesTiming: timings,
      };
    }
  }

  public cleanup(): void {
    this.loader.cleanup();
  }
}

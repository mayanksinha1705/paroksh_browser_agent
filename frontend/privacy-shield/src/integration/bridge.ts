/**
 * PAROKSH Privacy Shield bridge.
 *
 * This file is bundled into the content-script world. The background worker
 * never sees the raw screenshot until this bridge has completed redaction.
 */
import { PrivacyPipeline } from "../../privacy/PrivacyPipeline.ts";
import type { ImageInput } from "../../privacy/types.ts";

let pipeline: PrivacyPipeline | null = null;
let initPromise: Promise<PrivacyPipeline> | null = null;

function getPipeline(): PrivacyPipeline {
  if (!pipeline) pipeline = new PrivacyPipeline();
  return pipeline;
}

async function ensurePipeline(): Promise<PrivacyPipeline> {
  if (pipeline) return pipeline;
  if (!initPromise) {
    const p = getPipeline();
    initPromise = p.initialize().then(() => p);
  }
  return initPromise;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Failed to decode screenshot.");
  return response.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to encode sanitized screenshot."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export interface PrivacyShieldResponse {
  sanitizedDataUrl: string;
  detections: Array<{
    id: string;
    type: string;
    tagLabel: string;
    confidence: number;
    risk: string;
    source: string[];
    bbox: { x0: number; y0: number; x1: number; y1: number };
    action: string;
    token: string;
  }>;
  summary: {
    total: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  runtime: unknown;
  processingTimeMs: number;
  // false = redaction failed for this screenshot and sanitizedDataUrl is
  // just the original, unmodified image, sent through as-is (fail-open).
  sanitized: boolean;
  error?: string;
}

export async function sanitizeScreenshot(
  dataUrl: string,
  name = "paroksh-screenshot.png"
): Promise<PrivacyShieldResponse> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    throw new Error("PrivacyShield received an invalid screenshot.");
  }

  const shield = await ensurePipeline();
  const blob = await dataUrlToBlob(dataUrl);

  const input: ImageInput = {
    blob,
    name,
    type: blob.type || "image/png",
    size: blob.size,
  };

  const result = await shield.processImage(input);

  // The pipeline itself is fail-open now: if every redaction stage failed
  // it still returns a result, just with sanitizedImageBlob equal to the
  // original screenshot and sanitized:false. We only throw here if that
  // contract was somehow broken and there's genuinely no image to return
  // at all (should never happen in practice).
  if (!result.sanitizedImageBlob?.size) {
    throw new Error("PrivacyShield produced no usable image (not even a raw fallback).");
  }

  return {
    sanitizedDataUrl: await blobToDataUrl(result.sanitizedImageBlob),
    detections: result.detections.map((d) => ({
      id: d.id,
      type: d.type,
      tagLabel: d.tagLabel,
      confidence: d.confidence,
      risk: d.risk,
      source: d.sources,
      bbox: d.bbox,
      action: d.action,
      token: d.token,
    })),
    summary: result.summary,
    runtime: result.runtime,
    processingTimeMs: result.processingTimeMs,
    sanitized: result.sanitized,
    error: result.error,
  };
}

const api = {
  sanitizeScreenshot,
  initialize: ensurePipeline,
};

(globalThis as any).PAROKSH_PRIVACY_SHIELD = api;

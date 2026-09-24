/**
 * PrivacyShield - OCR Normalizer
 * Cleans and normalizes OCR tokens while preserving identifiers.
 */

import { BoundingBox } from "../types.ts";

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  lineIndex?: number;
}

export interface OCRResult {
  fullText: string;
  words: OCRWord[];
}

export class OCRNormalizer {
  public static normalizeWord(raw: string): string {
    if (!raw) return "";
    return raw.trim();
  }

  public static clampBbox(
    bbox: BoundingBox,
    imageWidth: number,
    imageHeight: number
  ): BoundingBox {
    return {
      x0: Math.max(0, Math.min(Math.round(bbox.x0), imageWidth)),
      y0: Math.max(0, Math.min(Math.round(bbox.y0), imageHeight)),
      x1: Math.max(0, Math.min(Math.round(bbox.x1), imageWidth)),
      y1: Math.max(0, Math.min(Math.round(bbox.y1), imageHeight)),
    };
  }

  public static scaleBbox(
    bbox: BoundingBox,
    scaleX: number,
    scaleY: number
  ): BoundingBox {
    return {
      x0: Math.round(bbox.x0 * scaleX),
      y0: Math.round(bbox.y0 * scaleY),
      x1: Math.round(bbox.x1 * scaleX),
      y1: Math.round(bbox.y1 * scaleY),
    };
  }
}

/**
 * PrivacyShield - On-Device Tesseract.js OCR Engine
 * Runs completely locally in browser via Web Worker.
 */

import Tesseract from "tesseract.js";
import { ImageFrame } from "../types.ts";
import { OCRNormalizer, OCRResult, OCRWord } from "./OCRNormalizer.ts";
import { ImagePreprocessor } from "../image/ImagePreprocessor.ts";

const createWorker = (Tesseract as any).createWorker || (Tesseract as any).default?.createWorker || Tesseract;

export class TesseractEngine {
  private worker: any = null;
  private isInitializing: boolean = false;
  private isReady: boolean = false;
  private currentLang: string = "eng+hin";

  public async setLanguage(lang: "eng" | "hin" | "eng+hin"): Promise<void> {
    if (this.currentLang === lang && this.isReady) return;
    this.currentLang = lang;
    if (this.worker) {
      await this.terminate();
    }
  }

  public getLanguage(): string {
    return this.currentLang;
  }

  public async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isReady && this.worker) return;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }

    this.isInitializing = true;
    try {
      // 1. Attempt primary language (default: bilingual "eng+hin")
      this.worker = await createWorker(this.currentLang, 1, {
        logger: (m: any) => {
          if (m.status === "recognizing text" && onProgress) {
            onProgress(m.progress || 0);
          }
        },
      });
      this.isReady = true;
    } catch (err) {
      console.warn(`Local OCR worker for ${this.currentLang} failed or was interrupted, attempting fallback:`, err);
      try {
        // Fallback to English if bilingual package failed (e.g. offline cache missing Hindi model)
        if (this.currentLang !== "eng") {
          this.worker = await createWorker("eng", 1, {
            logger: (m: any) => {
              if (m.status === "recognizing text" && onProgress) {
                onProgress(m.progress || 0);
              }
            },
          });
          this.currentLang = "eng";
          this.isReady = true;
        } else {
          throw err;
        }
      } catch (fallbackErr) {
        console.warn("OCR worker fallback initialization failed:", fallbackErr);
        throw new Error(
          "Local OCR initialization failed. PrivacyShield enforces fail-closed operation."
        );
      }
    } finally {
      this.isInitializing = false;
    }
  }

  public async recognize(
    frame: ImageFrame,
    onProgress?: (p: number) => void
  ): Promise<OCRResult> {
    if (!this.isReady || !this.worker) {
      await this.initialize(onProgress);
    }

    try {
      // 1. Preprocess image: invert if dark mode, enhance contrast, and scale
      const prep = ImagePreprocessor.preprocessForOCR(
        frame.element,
        frame.width,
        frame.height
      );

      // 2. Recognize text using optimized preprocessed canvas
      const result = await this.worker.recognize(prep.canvas);
      const data = result.data;
      const words: OCRWord[] = [];

      if (data && data.words) {
        for (const w of data.words) {
          const text = OCRNormalizer.normalizeWord(w.text);
          if (!text) continue;

          // Map scaled coordinates back to original image dimensions
          const origBox = {
            x0: Math.round(w.bbox.x0 * prep.scaleX),
            y0: Math.round(w.bbox.y0 * prep.scaleY),
            x1: Math.round(w.bbox.x1 * prep.scaleX),
            y1: Math.round(w.bbox.y1 * prep.scaleY),
          };

          const clampedBox = OCRNormalizer.clampBbox(
            origBox,
            frame.width,
            frame.height
          );

          words.push({
            text,
            confidence: (w.confidence || 80) / 100,
            bbox: clampedBox,
            lineIndex: w.line ? w.line.line_id : undefined,
          });
        }
      }

      return {
        fullText: data.text || "",
        words,
      };
    } catch (err: any) {
      throw new Error(`OCR processing error: ${err.message || String(err)}`);
    }
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
      this.isReady = false;
    }
  }
}

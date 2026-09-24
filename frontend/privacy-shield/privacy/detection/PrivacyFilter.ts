/**
 * PrivacyShield - On-Device Privacy Filter Text Adapter
 *
 * Deliberately dependency-free: this used to also run a neural token-
 * classification model (@huggingface/transformers + onnxruntime-web) on
 * every OCR pass. That model pulled ~60MB of ONNX/WASM binaries straight
 * into the content-script bundle (privacy-shield.bundle.js), which Chrome
 * had to parse on every single page load, and it also hit the network
 * (Hugging Face Hub) during initialize(). Both were unnecessary weight for
 * what is, in the offline path, just a heuristic fallback anyway — so the
 * neural engine has been removed. Detection now runs entirely on the
 * anchored regex rules below plus RuleDetector/VisualDetector in the
 * pipeline, with no model download and no extra bundle size.
 */

import { PIIDetection } from "../types.ts";
import { OCRResult } from "../ocr/OCRNormalizer.ts";
import { PrivacyFilterParser, TextSpanMatch } from "./PrivacyFilterParser.ts";

export class PrivacyFilter {
  private isReady: boolean = false;

  public async initialize(): Promise<void> {
    this.isReady = true;
  }

  public isInitialized(): boolean {
    return this.isReady;
  }

  /**
   * Performs on-device anchored-text PII detection on OCR extracted text,
   * and maps matches to exact Tesseract word positions.
   */
  public async detect(ocr: OCRResult): Promise<PIIDetection[]> {
    if (!this.isReady) {
      await this.initialize();
    }

    const text = ocr.fullText;
    if (!text || !ocr.words || ocr.words.length === 0) return [];

    const spans: TextSpanMatch[] = [];

    // Educational / Certificate Anchors (Strictly anchored, non-generic)
    this.detectCertificateAnchoredNames(text, spans);

    // Map detected spans to the exact word positions returned by Tesseract
    return PrivacyFilterParser.alignSpansWithOCR(spans, ocr.words, text);
  }

  /**
   * Only strictly-anchored certificate field names (e.g. "SHRI/SMT./KUM. <NAME>", "is hereby presented to <NAME>")
   * Does NOT use generic dictionaries or guess on arbitrary text.
   */
  private detectCertificateAnchoredNames(text: string, spans: TextSpanMatch[]): void {
    // Recipient name anchored by certificate presentation phrases
    const candidatePatterns = [
      /(?:(?:SHRI\s*\/?\s*SMT\.?\s*\/?\s*KUM\.?|श्री\s*\/?\s*श्रीमती\s*\/?\s*कुमारी|श्रीमती|कुमारी|श्री)\s*[:.\s\-]+)\s*([A-Za-z\u0900-\u097F]{2,}(?:\s+[A-Za-z\u0900-\u097F]{2,}){1,3})/gi,
      /(?:CERTIFIED\s+THAT|प्रमाणित\s+किया\s+जाता\s+है\s+कि)\s+([A-Za-z\u0900-\u097F]{2,}(?:\s+[A-Za-z\u0900-\u097F]{2,}){1,3})/gi,
      /(?:CANDIDATE(?:'S)?\s+NAME|STUDENT(?:'S)?\s+NAME|परीक्षार्थी\s+का\s+नाम)\s*[:.\s\-]+\s*([A-Za-z\u0900-\u097F]{2,}(?:\s+[A-Za-z\u0900-\u097F]{2,}){1,3})/gi,
      /(?:(?:is\s+hereby\s+|is\s+)?(?:presented|awarded|conferred\s+upon|given)\s+to|(?:this\s+is\s+to\s+)?certif(?:y|ied)\s+that)\s*[:.\s\-]*\s*([A-Za-z\u0900-\u097F]{2,}(?:\s+[A-Za-z\u0900-\u097F]{2,}){1,3})/gi,
    ];

    for (const pattern of candidatePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const candidate = this.cleanExtractedName(match[1]);
        if (candidate && candidate.length > 2 && !spans.some((s) => s.text.toLowerCase() === candidate.toLowerCase())) {
          spans.push({
            label: "private_person",
            text: candidate,
            startIndex: match.index + match[0].indexOf(candidate),
            endIndex: match.index + match[0].indexOf(candidate) + candidate.length,
            confidence: 0.99,
          });
        }
      }
    }

    // Mother's Name
    const motherPattern = /(?:MOTHER(?:'S)?\s+NAME(?:\s+IS\s+SMT\.?)?|माता\s+का\s+नाम(?:\s+श्रीमती)?)\s*[:.\s\-]+\s*([A-Za-z\u0900-\u097F]{2,}(?:\s+[A-Za-z\u0900-\u097F]{2,}){1,3})/gi;
    let mMatch;
    while ((mMatch = motherPattern.exec(text)) !== null) {
      const candidate = this.cleanExtractedName(mMatch[1]);
      if (candidate && candidate.length > 2 && !spans.some((s) => s.text.toLowerCase() === candidate.toLowerCase())) {
        spans.push({
          label: "private_person",
          text: candidate,
          startIndex: mMatch.index + mMatch[0].indexOf(candidate),
          endIndex: mMatch.index + mMatch[0].indexOf(candidate) + candidate.length,
          confidence: 0.98,
        });
      }
    }

    // Father's / Husband's Name
    const fatherPattern = /(?:FATHER(?:'S)?(?:\s*\/\s*HUSBAND(?:'S)?)?\s+NAME(?:\s+IS\s+SHRI\.?)?|पिता\s*(?:\/\s*पति)?\s*का\s+नाम(?:\s+श्री)?)\s*[:.\s\-]+\s*([A-Za-z\u0900-\u097F]{2,}(?:\s+[A-Za-z\u0900-\u097F]{2,}){1,3})/gi;
    let fMatch;
    while ((fMatch = fatherPattern.exec(text)) !== null) {
      const candidate = this.cleanExtractedName(fMatch[1]);
      if (candidate && candidate.length > 2 && !spans.some((s) => s.text.toLowerCase() === candidate.toLowerCase())) {
        spans.push({
          label: "private_person",
          text: candidate,
          startIndex: fMatch.index + fMatch[0].indexOf(candidate),
          endIndex: fMatch.index + fMatch[0].indexOf(candidate) + candidate.length,
          confidence: 0.98,
        });
      }
    }
  }

  private cleanExtractedName(raw: string): string {
    if (!raw) return "";
    return raw
      .replace(/\b(?:FOR|IN|DURING|ON|WHO|WITH|DATED|AT|FROM|OF|HAS|APPEARED|SUCCESSFULLY|WHOSE|FATHER|MOTHER|DATE|ROLL|REGISTRATION|NO|IS)\b.*$/i, "")
      .replace(/[0-9:;.,()/*\-]/g, " ")
      .trim();
  }
}

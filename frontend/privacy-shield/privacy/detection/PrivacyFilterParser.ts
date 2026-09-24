/**
 * PrivacyShield - Precise Privacy Filter Parser & OCR Bounding Box Aligner
 * Maps model spans to OCR words with strict spatial contiguity and zero multi-line bleeding.
 */

import { BoundingBox, PIIDetection } from "../types.ts";
import { OCRWord } from "../ocr/OCRNormalizer.ts";
import { EntityNormalizer } from "./EntityNormalizer.ts";

export interface TextSpanMatch {
  label: string;
  text: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export class PrivacyFilterParser {
  private static cleanToken(str: string): string {
    return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").trim();
  }

  /**
   * Manually parses raw ONNX model logits tensor [batchSize, seqLen, numLabels] or [seqLen, numLabels].
   * Bypasses framework dimension/argmax pipeline bugs by computing argmax with standard JS loops.
   */
  public static parseLogitsTensor(
    logits: { data: Float32Array | number[]; dims: number[] },
    inputIds: number[],
    decodeFn: (id: number) => string,
    id2label: Record<number | string, string>
  ): TextSpanMatch[] {
    const rawData = logits.data;
    const dims = logits.dims || [];

    let seqLen = 0;
    let numLabels = 0;

    if (dims.length === 3) {
      // [batchSize, seqLen, numLabels]
      seqLen = dims[1];
      numLabels = dims[2];
    } else if (dims.length === 2) {
      // [seqLen, numLabels]
      seqLen = dims[0];
      numLabels = dims[1];
    } else {
      return [];
    }

    const detectedSpans: TextSpanMatch[] = [];
    let currentEntity: {
      label: string;
      tokens: string[];
      confidence: number;
    } | null = null;

    const flush = () => {
      if (currentEntity && currentEntity.tokens.length > 0) {
        const text = currentEntity.tokens.join(" ").trim();
        if (text.length > 1) {
          detectedSpans.push({
            label: currentEntity.label,
            text,
            startIndex: 0,
            endIndex: 0,
            confidence: currentEntity.confidence,
          });
        }
      }
      currentEntity = null;
    };

    for (let i = 0; i < seqLen; i++) {
      const startIndex = i * numLabels;
      let maxVal = -Infinity;
      let argMaxClass = 0;

      for (let j = 0; j < numLabels; j++) {
        const val = rawData[startIndex + j];
        if (val > maxVal) {
          maxVal = val;
          argMaxClass = j;
        }
      }

      const rawLabel = id2label[argMaxClass] || "O";
      const tokenId = inputIds[i] ?? 0;
      const cleanToken = decodeFn(tokenId).trim();

      const isSpecial =
        (cleanToken.startsWith("[") && cleanToken.endsWith("]")) ||
        cleanToken === "<s>" ||
        cleanToken === "</s>";

      if (rawLabel && rawLabel !== "O" && cleanToken.length >= 1 && !isSpecial) {
        const baseLabel = rawLabel.replace(/^[BIESL]-/i, "").toLowerCase();
        const isContinuation = /^[IESL]-/i.test(rawLabel);
        const isEnd = /^E-/i.test(rawLabel);

        if (currentEntity && (isContinuation || currentEntity.label === baseLabel)) {
          currentEntity.tokens.push(cleanToken);
          if (isEnd) {
            flush();
          }
        } else {
          flush();
          currentEntity = {
            label: baseLabel,
            tokens: [cleanToken],
            confidence: 0.95,
          };
          if (isEnd) {
            flush();
          }
        }
      } else {
        flush();
      }
    }

    flush();
    return detectedSpans;
  }

  /**
   * Aligns identified text spans with OCR words to compute exact image bounding boxes.
   * Guarantees that bounding boxes are tightly bound to the exact matched tokens.
   */
  public static alignSpansWithOCR(
    spans: TextSpanMatch[],
    words: OCRWord[],
    _fullText: string
  ): PIIDetection[] {
    const detections: PIIDetection[] = [];

    for (let sIdx = 0; sIdx < spans.length; sIdx++) {
      const span = spans[sIdx];
      const spanWords = span.text.trim().split(/\s+/).filter(Boolean);
      if (spanWords.length === 0) continue;

      const cleanSpanWords = spanWords.map((sw) => this.cleanToken(sw)).filter((sw) => sw.length > 0);
      if (cleanSpanWords.length === 0) continue;

      // 1. First attempt: Look for contiguous sequence of OCR words on the same line
      let matchedWordSequences: OCRWord[][] = [];

      for (let i = 0; i <= words.length - cleanSpanWords.length; i++) {
        let matches = true;
        for (let j = 0; j < cleanSpanWords.length; j++) {
          const wClean = this.cleanToken(words[i + j].text);
          const sClean = cleanSpanWords[j];

          if (!wClean || !sClean) {
            matches = false;
            break;
          }

          // Exact match or prefix match for words >= 3 chars
          const isExact = wClean === sClean;
          const isPrefix = (wClean.length >= 3 && sClean.length >= 3) &&
            (wClean.startsWith(sClean) || sClean.startsWith(wClean));

          if (!isExact && !isPrefix) {
            matches = false;
            break;
          }
        }

        if (matches) {
          const seq = words.slice(i, i + cleanSpanWords.length);
          const isSameLine = seq.every(
            (w) => Math.abs(w.bbox.y0 - seq[0].bbox.y0) < 22
          );
          if (isSameLine) {
            matchedWordSequences.push(seq);
          } else {
            // Sequence spans across multiple lines (e.g. multi-line address):
            // Group by line so each line gets its own tight bounding box
            const lineGroups: OCRWord[][] = [];
            for (const w of seq) {
              const lastGroup = lineGroups[lineGroups.length - 1];
              if (lastGroup && Math.abs(w.bbox.y0 - lastGroup[0].bbox.y0) < 22) {
                lastGroup.push(w);
              } else {
                lineGroups.push([w]);
              }
            }
            for (const lg of lineGroups) {
              matchedWordSequences.push(lg);
            }
          }
        }
      }

      // 2. Second attempt: For joined subwords or single-word spans
      if (matchedWordSequences.length === 0) {
        // A. Check if joined subwords match an OCR word (e.g. "172" + "462" + "216" -> "172462216")
        const fullJoined = cleanSpanWords.join("");
        if (fullJoined.length >= 4) {
          for (const w of words) {
            const wClean = this.cleanToken(w.text);
            if (wClean === fullJoined || (wClean.length >= 6 && wClean.includes(fullJoined))) {
              matchedWordSequences.push([w]);
            }
          }
        }

        // B. Single-word span matches an OCR word or subword matches word
        if (matchedWordSequences.length === 0 && cleanSpanWords.length === 1) {
          const target = cleanSpanWords[0];
          if (target.length >= 3) {
            for (const w of words) {
              const wClean = this.cleanToken(w.text);
              if (wClean === target || (target.length >= 4 && wClean.includes(target))) {
                matchedWordSequences.push([w]);
              }
            }
          }
        }
      }

      // 3. For each valid sequence, create a tight bounding box
      for (const seq of matchedWordSequences) {
        const bbox: BoundingBox = {
          x0: Math.min(...seq.map((w) => w.bbox.x0)),
          y0: Math.min(...seq.map((w) => w.bbox.y0)),
          x1: Math.max(...seq.map((w) => w.bbox.x1)),
          y1: Math.max(...seq.map((w) => w.bbox.y1)),
        };

        const type = EntityNormalizer.normalizeType(span.label);
        const tagLabel = EntityNormalizer.getTagLabel(type);
        const risk = EntityNormalizer.getRiskLevel(type);

        const isDuplicate = detections.some(
          (d) =>
            d.type === type &&
            Math.abs(d.bbox.x0 - bbox.x0) < 5 &&
            Math.abs(d.bbox.y0 - bbox.y0) < 5 &&
            Math.abs(d.bbox.x1 - bbox.x1) < 5 &&
            Math.abs(d.bbox.y1 - bbox.y1) < 5
        );
        if (isDuplicate) continue;

        detections.push({
          id: `model-span-${detections.length + 1}`,
          type,
          source: "privacy_filter",
          confidence: span.confidence,
          bbox,
          risk,
          action: "mask",
          tagLabel,
          token: `<${tagLabel}_0${detections.length + 1}>`,
        });
      }
    }

    return detections;
  }
}

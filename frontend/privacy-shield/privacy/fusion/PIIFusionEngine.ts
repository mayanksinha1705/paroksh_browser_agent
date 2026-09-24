/**
 * PrivacyShield - PII Fusion Engine
 * Multi-source deduplication, IoU matching, confidence scoring, and provenance aggregation.
 */

import { DetectionSource, FusedDetection, PIIDetection, PolicyAction } from "../types.ts";
import { BoundingBoxUtil } from "./BoundingBox.ts";
import { EntityNormalizer } from "../detection/EntityNormalizer.ts";

export class PIIFusionEngine {
  /**
   * Fuses detections from multiple independent detectors.
   */
  public static fuse(detections: PIIDetection[]): FusedDetection[] {
    if (!detections || detections.length === 0) return [];

    const fused: FusedDetection[] = [];
    const usedIndices = new Set<number>();

    // Sort descending by confidence so strongest detection is base
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);

    for (let i = 0; i < sorted.length; i++) {
      if (usedIndices.has(i)) continue;
      const base = sorted[i];
      usedIndices.add(i);

      let mergedBbox = { ...base.bbox };
      const sources = new Set<DetectionSource>([base.source]);
      let maxConfidence = base.confidence;
      let finalType = base.type;

      for (let j = i + 1; j < sorted.length; j++) {
        if (usedIndices.has(j)) continue;
        const candidate = sorted[j];

        // Check if boxes overlap significantly, contain one another, or are adjacent tokens on the same line
        const iou = BoundingBoxUtil.iou(mergedBbox, candidate.bbox);
        const contains =
          BoundingBoxUtil.contains(mergedBbox, candidate.bbox) ||
          BoundingBoxUtil.contains(candidate.bbox, mergedBbox);

        const isSameLine = Math.abs(mergedBbox.y0 - candidate.bbox.y0) < 18 &&
          Math.abs(mergedBbox.y1 - candidate.bbox.y1) < 18;
        const isHorizontallyAdjacent = isSameLine && (
          (candidate.bbox.x0 >= mergedBbox.x1 - 6 && candidate.bbox.x0 <= mergedBbox.x1 + 40) ||
          (mergedBbox.x0 >= candidate.bbox.x1 - 6 && mergedBbox.x0 <= candidate.bbox.x1 + 40)
        );

        const isCompatible =
          base.type === candidate.type ||
          (base.type === "secret" && candidate.type === "token") ||
          (base.type === "token" && candidate.type === "secret") ||
          (base.source === "visual" && candidate.source === "visual");

        if ((iou > 0.20 || contains || (isHorizontallyAdjacent && (base.type === "private_person" || base.type === "private_address"))) && isCompatible) {
          usedIndices.add(j);
          mergedBbox = BoundingBoxUtil.merge(mergedBbox, candidate.bbox);
          sources.add(candidate.source);
          maxConfidence = Math.max(maxConfidence, candidate.confidence);

          // If one is specific (like pan/secret) over generic, prefer specific
          if (finalType === "unknown" && candidate.type !== "unknown") {
            finalType = candidate.type;
          }
        }
      }

      // Compute boosted confidence if corroborated by multiple sources
      let finalConfidence = maxConfidence;
      if (sources.size > 1) {
        finalConfidence = Math.min(0.99, maxConfidence + 0.02);
      }

      const sourcesArr = Array.from(sources);
      const sourceDetails = this.formatSourceDetails(finalType, sourcesArr);
      const tagLabel = EntityNormalizer.getTagLabel(finalType);
      const risk = EntityNormalizer.getRiskLevel(finalType);
      const action: PolicyAction = risk === "critical" ? "mask" : "mask";

      fused.push({
        id: `fused-${fused.length + 1}`,
        type: finalType,
        tagLabel,
        bbox: mergedBbox,
        confidence: Number(finalConfidence.toFixed(2)),
        risk,
        sources: sourcesArr,
        sourceDetails,
        action,
        token: `<${tagLabel}_0${fused.length + 1}>`,
      });
    }

    // Sort detections: Face/Person first or by position / severity
    return fused.sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (riskOrder[a.risk] !== riskOrder[b.risk]) {
        return riskOrder[a.risk] - riskOrder[b.risk];
      }
      return a.bbox.y0 - b.bbox.y0;
    });
  }

  private static formatSourceDetails(
    type: string,
    sources: DetectionSource[]
  ): string {
    if (sources.includes("visual")) {
      if (type === "face") return "Face (Visual)";
      if (type === "qr_code") return "Visual";
      if (type === "signature") return "Signature (Visual)";
      return "Visual";
    }

    const hasRule = sources.includes("rule");
    const hasModel = sources.includes("privacy_filter");

    if (hasRule && hasModel) return "Text (OCR + Model + Rule)";
    if (hasModel) return "Text (OCR + Model)";
    if (hasRule) return "Text (OCR + Rule)";
    return "Text (OCR)";
  }
}

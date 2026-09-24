/**
 * PrivacyShield - Tagging & Manifest Manager
 * Handles entity tagging, token serialization, and export of privacy-safe manifests.
 */

import { FusedDetection, RedactionManifest, RuntimeInfo } from "../types.ts";

export class TagManager {
  /**
   * Builds an immutable, privacy-safe manifest containing all tagged regions.
   * STRICT GUARANTEE: Never includes raw PII strings.
   */
  public static createManifest(
    filename: string,
    width: number,
    height: number,
    detections: FusedDetection[],
    runtime: RuntimeInfo,
    processingTimeMs: number
  ): RedactionManifest {
    const summary = {
      totalRegions: detections.length,
      critical: detections.filter((d) => d.risk === "critical").length,
      high: detections.filter((d) => d.risk === "high").length,
      medium: detections.filter((d) => d.risk === "medium").length,
      low: detections.filter((d) => d.risk === "low").length,
    };

    return {
      manifestVersion: "1.0",
      timestamp: new Date().toISOString(),
      filename,
      imageDimensions: { width, height },
      privacyStatus: "PROTECTED",
      cloudExposure: "NONE",
      runtime,
      processingTimeMs,
      summary,
      detections: detections.map((d) => ({
        id: d.id,
        tag: d.tagLabel,
        type: d.type,
        risk: d.risk,
        confidence: d.confidence,
        token: d.token,
        source: d.sourceDetails || d.sources.join(" + "),
        bbox: { ...d.bbox },
        action: d.action,
      })),
    };
  }

  /**
   * Triggers a browser download for the JSON manifest.
   */
  public static downloadManifest(manifest: RedactionManifest, baseName: string): void {
    const jsonStr = JSON.stringify(manifest, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_privacy_report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Triggers a browser download for an image blob.
   */
  public static downloadImage(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

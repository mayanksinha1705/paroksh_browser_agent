/**
 * PrivacyShield - Irreversible Canvas Redactor
 * Destructively masks sensitive pixels with solid opaque rectangles on an offscreen canvas.
 * Also supports generating tagged images with callout badges matching productimage.png.
 */

import { FusedDetection, ImageFrame } from "../types.ts";
import { BoundingBoxUtil } from "../fusion/BoundingBox.ts";

export class CanvasRedactor {
  /**
   * Generates a clean, irreversibly sanitized image with opaque black masks.
   */
  public static async redactClean(
    frame: ImageFrame,
    detections: FusedDetection[],
    padding: number = 4
  ): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire 2D context for redaction.");

    // Draw original image onto new canvas
    ctx.drawImage(frame.element as CanvasImageSource, 0, 0);

    // Apply destructive opaque masking
    ctx.fillStyle = "#0f172a"; // Deep navy opaque black

    for (const d of detections) {
      if (d.action === "allow") continue;

      const box = BoundingBoxUtil.expand(d.bbox, padding, frame.width, frame.height);
      const w = Math.max(1, box.x1 - box.x0);
      const h = Math.max(1, box.y1 - box.y0);

      // Irreversible solid fill
      ctx.fillRect(box.x0, box.y0, w, h);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export sanitized image canvas to Blob."));
      }, "image/png");
    });
  }

  /**
   * Generates a tagged sanitized image with styled callout badges matching the product design.
   */
  public static async redactWithTags(
    frame: ImageFrame,
    detections: FusedDetection[],
    padding: number = 4
  ): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire 2D context for redaction.");

    // 1. Draw original image
    ctx.drawImage(frame.element as CanvasImageSource, 0, 0);

    // 2. Destructively mask sensitive regions
    ctx.fillStyle = "#0f172a";
    for (const d of detections) {
      if (d.action === "allow") continue;
      const box = BoundingBoxUtil.expand(d.bbox, padding, frame.width, frame.height);
      const w = Math.max(1, box.x1 - box.x0);
      const h = Math.max(1, box.y1 - box.y0);
      ctx.fillRect(box.x0, box.y0, w, h);
    }

    // 3. Render callout badges and connectors
    const tagColors: Record<string, string> = {
      PRIVATE_PERSON: "#3b82f6",
      PRIVATE_EMAIL: "#10b981",
      PRIVATE_PHONE: "#f97316",
      ACCOUNT_NUMBER: "#a855f7",
      PAN: "#06b6d4",
      IFSC: "#0ea5e9",
      SECRET: "#ef4444",
      FACE: "#f43f5e",
      QR_CODE: "#8b5cf6",
      SIGNATURE: "#f59e0b",
      ROLL_NUMBER: "#6366f1",
      ID_NUMBER: "#0284c7",
      DEFAULT: "#64748b",
    };

    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";

    for (const d of detections) {
      if (d.action === "allow") continue;
      const color = tagColors[d.tagLabel] || tagColors.DEFAULT;
      const text = `${d.tagLabel} ${d.confidence.toFixed(2)}`;
      const textWidth = ctx.measureText(text).width;
      const badgeW = textWidth + 16;
      const badgeH = 22;

      // Position callout badge to the right of the masked box if room permits, else above
      let badgeX = d.bbox.x1 + 12;
      let badgeY = (d.bbox.y0 + d.bbox.y1) / 2 - badgeH / 2;

      if (badgeX + badgeW > frame.width - 10) {
        badgeX = Math.max(10, d.bbox.x0);
        badgeY = Math.max(10, d.bbox.y0 - badgeH - 6);
      }

      // Draw connector line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(d.bbox.x1, (d.bbox.y0 + d.bbox.y1) / 2);
      ctx.lineTo(badgeX, badgeY + badgeH / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw pin dot on the masked region edge
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(d.bbox.x1, (d.bbox.y0 + d.bbox.y1) / 2, 3, 0, Math.PI * 2);
      ctx.fill();

      // Draw rounded badge rectangle
      this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4, color);

      // Draw badge text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, badgeX + 8, badgeY + badgeH / 2);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export tagged image canvas to Blob."));
      }, "image/png");
    });
  }

  private static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fillStyle: string
  ): void {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}

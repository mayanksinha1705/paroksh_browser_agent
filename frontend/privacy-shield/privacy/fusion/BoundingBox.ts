/**
 * PrivacyShield - Bounding Box Utilities
 * Geometric operations: IoU, containment, merging, and expansion.
 */

import { BoundingBox } from "../types.ts";

export class BoundingBoxUtil {
  public static area(box: BoundingBox): number {
    const w = Math.max(0, box.x1 - box.x0);
    const h = Math.max(0, box.y1 - box.y0);
    return w * h;
  }

  public static intersection(a: BoundingBox, b: BoundingBox): number {
    const x0 = Math.max(a.x0, b.x0);
    const y0 = Math.max(a.y0, b.y0);
    const x1 = Math.min(a.x1, b.x1);
    const y1 = Math.min(a.y1, b.y1);

    if (x1 <= x0 || y1 <= y0) return 0;
    return (x1 - x0) * (y1 - y0);
  }

  public static iou(a: BoundingBox, b: BoundingBox): number {
    const inter = this.intersection(a, b);
    if (inter === 0) return 0;
    const union = this.area(a) + this.area(b) - inter;
    return union > 0 ? inter / union : 0;
  }

  public static contains(parent: BoundingBox, child: BoundingBox, tolerance: number = 5): boolean {
    return (
      child.x0 >= parent.x0 - tolerance &&
      child.y0 >= parent.y0 - tolerance &&
      child.x1 <= parent.x1 + tolerance &&
      child.y1 <= parent.y1 + tolerance
    );
  }

  public static merge(a: BoundingBox, b: BoundingBox): BoundingBox {
    return {
      x0: Math.min(a.x0, b.x0),
      y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1),
      y1: Math.max(a.y1, b.y1),
    };
  }

  public static expand(
    box: BoundingBox,
    padding: number,
    maxWidth: number,
    maxHeight: number
  ): BoundingBox {
    return {
      x0: Math.max(0, box.x0 - padding),
      y0: Math.max(0, box.y0 - padding),
      x1: Math.min(maxWidth, box.x1 + padding),
      y1: Math.min(maxHeight, box.y1 + padding),
    };
  }
}

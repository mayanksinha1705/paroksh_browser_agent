/**
 * PrivacyShield - Demo Image Generator
 * Generates the synthetic customer profile document matching DemoImage.md and productimage.png.
 */

import { ImageInput } from "../privacy/types.ts";

export class DemoImageGenerator {
  /**
   * Loads or creates the AcmeFin Customer Profile demo document.
   */
  public static async getDemoImage(): Promise<ImageInput> {
    try {
      // Try cropping directly from the source product infographic for 100% pixel fidelity
      const croppedBlob = await this.cropFromProductImage();
      if (croppedBlob) {
        return {
          name: "customer-profile.png",
          type: "image/png",
          size: croppedBlob.size,
          blob: croppedBlob,
        };
      }
    } catch {
      // fallback to programmatic canvas generation
    }

    const syntheticBlob = await this.generateSyntheticDocument();
    return {
      name: "customer-profile.png",
      type: "image/png",
      size: syntheticBlob.size,
      blob: syntheticBlob,
    };
  }

  private static async cropFromProductImage(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          // Dimensions of customer document card inside productimage.png (1672x941)
          const sx = Math.round(img.naturalWidth * (42 / 1672));
          const sy = Math.round(img.naturalHeight * (195 / 941));
          const sw = Math.round(img.naturalWidth * (510 / 1672));
          const sh = Math.round(img.naturalHeight * (530 / 941));

          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);

          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          canvas.toBlob((b) => resolve(b), "image/png");
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/productimage.png";
    });
  }

  public static async generateSyntheticDocument(): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 700;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire canvas context for demo image.");

    // White card background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Document header: AcmeFin Technologies
    ctx.fillStyle = "#1e40af";
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.fillText("▲ AcmeFin Technologies", 30, 48);

    // Customer ID and Reg date on right
    ctx.fillStyle = "#475569";
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Customer ID: CUS001782", 610, 40);
    ctx.fillText("Registered: 12 Jan 2024", 610, 58);
    ctx.textAlign = "left";

    // Divider line
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 75);
    ctx.lineTo(610, 75);
    ctx.stroke();

    // CUSTOMER PROFILE Title
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
    ctx.fillText("CUSTOMER PROFILE", 30, 108);

    // Active Customer badge
    ctx.fillStyle = "#dcfce7";
    this.roundRect(ctx, 230, 92, 120, 24, 12);
    ctx.fill();
    ctx.fillStyle = "#15803d";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.fillText("● Active Customer", 242, 108);

    // Profile photo placeholder / portrait area (x: 30, y: 135, w: 130, h: 160)
    ctx.fillStyle = "#f1f5f9";
    this.roundRect(ctx, 30, 135, 130, 160, 8);
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.stroke();

    // Draw stylized avatar
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(95, 195, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(95, 270, 50, Math.PI, 0);
    ctx.fill();

    // QR Code Area (x: 30, y: 325, w: 130, h: 130)
    this.drawMockQR(ctx, 30, 325, 130);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.fillText("Scan for Verification", 35, 475);

    // Signature Area (x: 30, y: 505, w: 160, h: 60)
    ctx.fillStyle = "#f8fafc";
    this.roundRect(ctx, 30, 505, 160, 60, 6);
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.stroke();

    // Cursive signature
    ctx.fillStyle = "#0f172a";
    ctx.font = "italic bold 22px 'Brush Script MT', 'Dancing Script', cursive, serif";
    ctx.fillText("Rahul Sharma", 45, 545);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.fillText("Customer Signature", 55, 582);

    // Right Column - Text Details
    const labels = [
      { label: "Name", val: "Rahul Sharma", y: 155 },
      { label: "Email", val: "rahul.sharma@example.com", y: 195 },
      { label: "Phone", val: "+91 9876543210", y: 235 },
      { label: "Address", val: "42 MG Road, Bhopal, MP - 462001", y: 275 },
      { label: "Account No.", val: "123456789012", y: 330 },
      { label: "PAN", val: "ABCDE1234F", y: 370 },
      { label: "IFSC", val: "SBIN0001234", y: 410 },
      { label: "API Token", val: "eyJhbGciOiJIUzI1NiJ9.demo123", y: 450 },
    ];

    for (const item of labels) {
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
      ctx.fillText(item.label, 190, item.y);
      ctx.fillText(":", 280, item.y);

      ctx.fillStyle = "#0f172a";
      ctx.font = "500 13px system-ui, -apple-system, sans-serif";
      ctx.fillText(item.val, 295, item.y);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to generate demo image canvas."));
      }, "image/png");
    });
  }

  private static drawMockQR(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 4, y + 4, size - 8, size - 8);

    // Finder patterns
    this.drawFinder(ctx, x + 10, y + 10, 30);
    this.drawFinder(ctx, x + size - 40, y + 10, 30);
    this.drawFinder(ctx, x + 10, y + size - 40, 30);

    // Matrix pseudo-bits
    ctx.fillStyle = "#000000";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if ((r + c * 3) % 2 === 0) {
          ctx.fillRect(x + 46 + c * 8, y + 46 + r * 8, 6, 6);
        }
      }
    }
  }

  private static drawFinder(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 4, y + 4, s - 8, s - 8);
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + 8, y + 8, s - 16, s - 16);
  }

  private static roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
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
  }
}

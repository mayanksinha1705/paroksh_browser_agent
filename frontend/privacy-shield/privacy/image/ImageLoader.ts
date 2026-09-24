/**
 * PrivacyShield - Image Loader & Lifecycle Manager
 * Handles local blob decoding, dimensions, and URL lifecycle.
 */

import { ImageFrame, ImageInput } from "../types.ts";
import { ImageValidator } from "./ImageValidator.ts";

export class ImageLoader {
  private activeUrls: Set<string> = new Set();

  public createManagedUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    return url;
  }

  public revokeUrl(url: string): void {
    if (this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    }
  }

  public cleanup(): void {
    for (const url of this.activeUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.activeUrls.clear();
  }

  public async loadImage(input: ImageInput): Promise<{
    frame: ImageFrame;
    blob: Blob;
    url: string;
  }> {
    let blob: Blob;

    if (input.file) {
      const validation = ImageValidator.validateFile(input.file);
      if (!validation.valid) {
        throw new Error(validation.error || "Invalid file");
      }
      blob = input.file;
    } else if (input.blob) {
      blob = input.blob;
    } else if (input.dataUrl) {
      const res = await fetch(input.dataUrl);
      blob = await res.blob();
    } else {
      throw new Error("No image source provided to ImageLoader.");
    }

    const objectUrl = this.createManagedUrl(blob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          frame: {
            element: img,
            width: img.naturalWidth,
            height: img.naturalHeight,
          },
          blob,
          url: objectUrl,
        });
      };
      img.onerror = () => {
        this.revokeUrl(objectUrl);
        reject(new Error("Failed to decode image. File may be corrupted or unreadable."));
      };
      img.src = objectUrl;
    });
  }
}

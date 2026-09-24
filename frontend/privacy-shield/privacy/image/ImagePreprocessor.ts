/**
 * PrivacyShield - Intelligent Image Preprocessor
 * Analyzes image luminance, inverts dark-mode screenshots, enhances contrast,
 * and scales small text so Tesseract OCR achieves near-100% accuracy.
 */

export interface PreprocessedImage {
  canvas: HTMLCanvasElement;
  scaleX: number;
  scaleY: number;
  isDarkMode: boolean;
  originalWidth: number;
  originalHeight: number;
}

export class ImagePreprocessor {
  /**
   * Preprocesses an image for OCR.
   * If the image has a dark background (like developer tools, terminal, dark mode UI),
   * it inverts colors to produce crisp dark text on a light background.
   */
  public static preprocessForOCR(
    img: HTMLImageElement | ImageBitmap,
    originalWidth: number,
    originalHeight: number
  ): PreprocessedImage {
    // 1. Determine optimal scaling (scale up small screenshots by 1.5x - 2x for sharp OCR)
    let scale = 1.0;
    if (originalWidth < 1400 || originalHeight < 1000) {
      scale = 1.5;
    }
    // Cap dimensions to prevent excessive memory usage
    if (originalWidth * scale > 2600) {
      scale = 2600 / originalWidth;
    }

    const targetW = Math.round(originalWidth * scale);
    const targetH = Math.round(originalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Could not acquire 2D context for image preprocessing.");
    }

    // Use high-quality image smoothing for upscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img as CanvasImageSource, 0, 0, targetW, targetH);

    // 2. Sample luminance to detect dark mode
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    let totalLuminance = 0;
    const step = 4; // sample every 4th pixel for performance
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // ITU-R BT.601 luminance formula
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;
      sampleCount++;
    }

    const avgLuminance = totalLuminance / sampleCount;
    const isDarkMode = avgLuminance < 130;

    // 3. Process pixel buffer
    // If dark mode: invert colors (255 - value) so white text on dark background becomes black on white!
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (isDarkMode) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }

      // Convert to high-contrast grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Gentle contrast stretch
      let adjusted = gray;
      if (adjusted > 210) adjusted = 255;
      else if (adjusted < 50) adjusted = 0;
      else adjusted = (adjusted - 50) * (255 / 160);

      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
      // Alpha remains unchanged (data[i + 3])
    }

    ctx.putImageData(imgData, 0, 0);

    return {
      canvas,
      scaleX: originalWidth / targetW,
      scaleY: originalHeight / targetH,
      isDarkMode,
      originalWidth,
      originalHeight,
    };
  }
}

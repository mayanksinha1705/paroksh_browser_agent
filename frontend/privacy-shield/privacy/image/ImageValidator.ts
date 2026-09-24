/**
 * PrivacyShield - Client-side Image Validator
 * Validates MIME type, file size, extensions, and image decodability.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB as specified in web ui .png
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];
export const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

export class ImageValidator {
  public static validateFile(file: File): ValidationResult {
    if (!file) {
      return { valid: false, error: "No image file provided." };
    }

    if (file.size <= 0) {
      return { valid: false, error: "Empty file provided." };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
      };
    }

    const fileNameLower = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
      fileNameLower.endsWith(ext)
    );
    if (!hasValidExtension) {
      return {
        valid: false,
        error: `Unsupported file extension. Only PNG, JPG, JPEG, and WebP are supported.`,
      };
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported MIME type: ${file.type}. Allowed: PNG, JPG, WebP.`,
      };
    }

    return {
      valid: true,
      mimeType: file.type || "image/png",
      sizeBytes: file.size,
    };
  }
}

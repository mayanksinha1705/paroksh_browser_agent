/**
 * PrivacyShield - Core Data Models & Type Definitions
 * SIH26171: On-Device Visual PII Detection & Redaction
 */

export type PIIType =
  | "private_person"
  | "private_address"
  | "private_email"
  | "private_phone"
  | "private_url"
  | "private_date"
  | "account_number"
  | "secret"
  | "pan"
  | "aadhaar"
  | "ifsc"
  | "gstin"
  | "credit_card"
  | "password"
  | "api_key"
  | "token"
  | "signature"
  | "face"
  | "qr_code"
  | "barcode"
  | "fingerprint"
  | "roll_number"
  | "id_number"
  | "unknown";

export type DetectionSource = "ocr" | "privacy_filter" | "rule" | "visual";

export type PolicyAction = "allow" | "mask" | "tokenize" | "block";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PIIDetection {
  id: string;
  type: PIIType;
  source: DetectionSource;
  text?: string; // Strictly internal to memory, NEVER exported or saved in logs
  confidence: number;
  bbox: BoundingBox;
  risk: RiskLevel;
  action?: PolicyAction;
  token?: string; // E.g., "<PERSON_01>", "<EMAIL_01>"
  tagLabel?: string; // E.g., "PRIVATE_PERSON", "PRIVATE_EMAIL"
}

export interface FusedDetection {
  id: string;
  type: PIIType;
  tagLabel: string;
  bbox: BoundingBox;
  confidence: number;
  risk: RiskLevel;
  sources: DetectionSource[];
  sourceDetails?: string; // E.g., "Face (Visual)", "Text (OCR + Model)", "Text (OCR + Rule)"
  action: PolicyAction;
  token: string;
}

export type RuntimeType = "webgpu" | "wasm";

export interface RuntimeInfo {
  type: RuntimeType;
  details: string;
  hardwareAcceleration: boolean;
  adapterName?: string;
}

export interface ImageInput {
  file?: File;
  blob?: Blob;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  bitmap?: ImageBitmap;
}

export interface ImageFrame {
  element: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
}

export interface RedactionResult {
  originalImageBlob: Blob;
  originalImageUrl: string;
  sanitizedImageBlob: Blob;
  sanitizedImageUrl: string;
  taggedImageBlob?: Blob;
  taggedImageUrl?: string;
  width: number;
  height: number;
  detections: FusedDetection[];
  summary: {
    total: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  runtime: RuntimeInfo;
  processingTimeMs: number;
  // true = redaction actually ran and sanitizedImageBlob has masks applied.
  // false = every redaction stage failed (fail-open) and sanitizedImageBlob
  // is just the original, unmodified screenshot.
  sanitized: boolean;
  error?: string;
  stagesTiming: Record<string, number>;
}

export type PipelineStage =
  | "image_loaded"
  | "ocr"
  | "pii_detection"
  | "rule_engine"
  | "visual_detection"
  | "fusion_scoring"
  | "redaction"
  | "complete";

export type PipelineStatus =
  | "idle"
  | "image-selected"
  | "processing"
  | "complete"
  | "error";

export interface PipelineStageEvent {
  stage: PipelineStage;
  status: "pending" | "active" | "completed" | "failed";
  label: string;
  sublabel?: string;
  error?: string;
}

export interface TaggedEntity {
  id: string;
  tagLabel: string;
  type: PIIType;
  risk: RiskLevel;
  confidence: number;
  token: string;
  bbox: BoundingBox;
  source: string;
  customNotes?: string;
}

export interface RedactionManifest {
  manifestVersion: "1.0";
  timestamp: string;
  filename: string;
  imageDimensions: {
    width: number;
    height: number;
  };
  privacyStatus: "PROTECTED";
  cloudExposure: "NONE";
  runtime: RuntimeInfo;
  processingTimeMs: number;
  summary: {
    totalRegions: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  detections: Array<{
    id: string;
    tag: string;
    type: PIIType;
    risk: RiskLevel;
    confidence: number;
    token: string;
    source: string;
    bbox: BoundingBox;
    action: PolicyAction;
  }>;
}

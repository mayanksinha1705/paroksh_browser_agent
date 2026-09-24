/**
 * PrivacyShield - Privacy-Safe Audit Logger
 * Strictly logs operational metadata only. Never logs raw PII strings or image bytes.
 */

export interface AuditEntry {
  timestamp: string;
  imageDimensions: string;
  totalDetections: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  runtime: string;
  // true means redaction failed and the raw, unmodified screenshot is the
  // one being used downstream (fail-open fallback) — still logged so it's
  // visible in the audit trail, never silently swallowed.
  cloudExposure: boolean;
  processingTimeMs: number;
  error?: string;
}

export class AuditLogger {
  private static logs: AuditEntry[] = [];

  public static log(entry: AuditEntry): void {
    this.logs.push(entry);
    // Console log only safe metadata
    console.info("[PrivacyShield Audit]", {
      time: entry.timestamp,
      detections: entry.totalDetections,
      runtime: entry.runtime,
      durationMs: entry.processingTimeMs,
      cloudExposure: entry.cloudExposure,
      ...(entry.error ? { error: entry.error } : {}),
    });
  }

  public static getLogs(): AuditEntry[] {
    return [...this.logs];
  }
}

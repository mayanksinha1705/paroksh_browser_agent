/**
 * PrivacyShield - Security Invariant & Fail-Closed Enforcement
 */

export class PrivacyPipelineError extends Error {
  public readonly stage: string;
  public readonly critical: boolean;

  constructor(stage: string, message: string, critical: boolean = true) {
    super(`PrivacyShield Error at [${stage}]: ${message}`);
    this.name = "PrivacyPipelineError";
    this.stage = stage;
    this.critical = critical;
  }
}

export class FailClosed {
  public static assertSafeOutput(sanitizedBlob: Blob | null): void {
    if (!sanitizedBlob || sanitizedBlob.size === 0) {
      throw new PrivacyPipelineError(
        "redaction",
        "Fail-closed invariant triggered: No valid sanitized output blob was produced."
      );
    }
  }

  public static assertNoLeakage(originalBlob: Blob, sanitizedBlob: Blob): void {
    if (originalBlob === sanitizedBlob) {
      throw new PrivacyPipelineError(
        "redaction",
        "CRITICAL SECURITY VIOLATION: Sanitized blob is identical reference to raw original image!"
      );
    }
  }
}

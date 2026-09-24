/**
 * PrivacyShield - Technical Details & Architecture Component
 */

import { RedactionResult, RuntimeInfo } from "../privacy/types.ts";

export class TechnicalDetailsComponent {
  public static render(runtime: RuntimeInfo, result?: RedactionResult): string {
    const timings = result?.stagesTiming || {};

    return `
      <section class="ps-details-section" id="technology">
        <details class="ps-details-wrapper">
          <summary class="ps-details-header">
            <span>▸ Technical Details & Security Architecture</span>
            <span style="font-size: 12px; color: #2563eb; font-weight: 600;">View Implementation Specs</span>
          </summary>
          <div class="ps-details-body">
            <!-- Left: Engine Specs -->
            <div class="ps-tech-grid">
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">OCR Engine</div>
                <div class="ps-tech-card-val">Tesseract.js (WebAssembly Worker)</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">PII Model</div>
                <div class="ps-tech-card-val">Privacy Filter (Q4 Quantized)</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">Inference Runtime</div>
                <div class="ps-tech-card-val">${runtime.type.toUpperCase()} (${runtime.adapterName || "Hardware Acceleration"})</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">Deterministic Rules</div>
                <div class="ps-tech-card-val">PAN · Aadhaar · IFSC · Phone · Secrets</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">Visual Detectors</div>
                <div class="ps-tech-card-val">Face · QR Code · Signature · Barcode</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">Redaction Engine</div>
                <div class="ps-tech-card-val">HTML5 Canvas (Destructive Pixel Fill)</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">Fail-Closed Boundary</div>
                <div class="ps-tech-card-val">Strict Assertion (No unredacted fallback)</div>
              </div>
              <div class="ps-tech-card">
                <div class="ps-tech-card-label">Measured Execution</div>
                <div class="ps-tech-card-val">${result ? `${result.processingTimeMs} ms (${Math.round(timings.ocr || 0)}ms OCR / ${Math.round(timings.fusion || 0)}ms Fusion)` : "Awaiting processing"}</div>
              </div>
            </div>

            <!-- Right: Architecture Boundary Diagram -->
            <div class="ps-arch-flow" id="how-it-works">
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                Zero-Trust Privacy Boundary
              </div>
              <div class="ps-arch-boundary">
                <div class="ps-arch-boundary-title">🔒 Local Device Sandbox (Browser Memory Only)</div>
                <div style="font-size: 12px; color: #1e3a8a; line-height: 1.6;">
                  <strong>1. Ingestion:</strong> Image decoded in memory (Read-only)<br>
                  <strong>2. Local OCR:</strong> Tesseract.js worker generates word coordinates<br>
                  <strong>3. Multi-Modal Fusion:</strong> Privacy Filter + Rules + Visual Detectors<br>
                  <strong>4. Policy Enforcement:</strong> Masking applied to all PII<br>
                  <strong>5. Canvas Obliteration:</strong> Opaque solid rectangles overwrite original pixels
                </div>
              </div>
              <div style="text-align: center; font-size: 12px; font-weight: 700; color: #166534; padding: 6px; background: #ecfdf5; border-radius: 6px;">
                ✓ RAW IMAGE NEVER TRANSMITTED TO CLOUD OR AI MODELS
              </div>
            </div>
          </div>
        </details>
      </section>
    `;
  }
}

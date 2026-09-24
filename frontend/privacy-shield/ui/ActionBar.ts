/**
 * PrivacyShield - Bottom Action Bar Component
 */

import { RedactionResult } from "../privacy/types.ts";

export class ActionBarComponent {
  public static render(result: RedactionResult): string {
    const seconds = (result.processingTimeMs / 1000).toFixed(1);

    return `
      <section class="ps-action-bar" id="action-bar">
        <div class="ps-action-left">
          <div class="ps-metric-time">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Processing Time: <strong>${seconds} seconds</strong></span>
          </div>

          <div class="ps-protected-msg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
            <span>Image Protected — Sensitive information has been detected and redacted locally.</span>
          </div>
        </div>

        <div class="ps-action-buttons">
          <button type="button" class="ps-btn-download" id="btn-download-sanitized">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Sanitized Image
          </button>

          <button type="button" class="ps-btn-secondary" id="btn-download-tagged" title="Download image with visual tag callouts">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            Download Tagged Image
          </button>

          <button type="button" class="ps-btn-secondary" id="btn-download-report">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Download Report (JSON)
          </button>

          <button type="button" class="ps-btn-secondary" id="btn-process-another">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21h5v-5"/>
            </svg>
            Process Another Image
          </button>
        </div>
      </section>
    `;
  }
}

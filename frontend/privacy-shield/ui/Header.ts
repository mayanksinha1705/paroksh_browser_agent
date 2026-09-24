/**
 * PrivacyShield - Header Component
 */

import { RuntimeInfo } from "../privacy/types.ts";

export class HeaderComponent {
  public static render(runtime: RuntimeInfo): string {
    const runtimeChip = runtime.type === "webgpu" ? "WebGPU" : "WASM";
    const runtimeSub = runtime.type === "webgpu" ? "Accelerated" : "Local Engine";

    return `
      <header class="ps-header">
        <div class="ps-logo-group">
          <div class="ps-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M12 8v8"/>
              <path d="M8 12h8"/>
            </svg>
          </div>
          <div class="ps-logo-title">
            <span>PrivacyShield</span>
            <span class="ps-logo-sub">On-Device PII Detection & Redaction</span>
          </div>
        </div>

        <nav class="ps-nav" aria-label="Main Navigation">
          <a href="#home" class="ps-nav-link active">Home</a>
          <a href="#how-it-works" class="ps-nav-link">How It Works</a>
          <a href="#technology" class="ps-nav-link">Technology</a>
          <a href="#about" class="ps-nav-link">About</a>
        </nav>

        <div class="ps-header-badges">
          <div class="ps-pill-badge">
            <span class="dot-green"></span>
            <span>100% Offline</span>
            <span class="ps-pill-sub">· Fully On-Device</span>
          </div>
          <div class="ps-pill-badge" style="color: #2563eb;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>${runtimeChip}</span>
            <span class="ps-pill-sub">· ${runtimeSub}</span>
          </div>
          <div class="ps-pill-badge" style="color: #7c3aed;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
              <line x1="2" y1="2" x2="22" y2="22"/>
            </svg>
            <span>No Cloud Upload</span>
            <span class="ps-pill-sub">· 100% Private</span>
          </div>
        </div>
      </header>
    `;
  }
}

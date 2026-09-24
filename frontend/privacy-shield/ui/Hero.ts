/**
 * PrivacyShield - Hero & Upload Component
 */

import { RuntimeInfo } from "../privacy/types.ts";

export class HeroComponent {
  public static render(runtime: RuntimeInfo): string {
    const runtimeName = runtime.type === "webgpu" ? "WebGPU" : "WASM";

    return `
      <section class="ps-hero-section" id="home">
        <div class="ps-hero-left">
          <h1 class="ps-hero-headline">
            Protect sensitive data
            <span class="ps-gradient-text">before it reaches AI.</span>
          </h1>
          <p class="ps-hero-subtitle">
            PrivacyShield analyzes images directly on your device, identifies sensitive information, and generates a sanitized copy without uploading the original image to the cloud.
          </p>

          <div class="ps-trust-indicators">
            <div class="ps-trust-chip">
              <span>🔒</span>
              <span>100% Local & Offline</span>
            </div>
            <div class="ps-trust-chip">
              <span>🇮🇳</span>
              <span>Hindi + English</span>
            </div>
            <div class="ps-trust-chip">
              <span>⚡</span>
              <span>WebGPU / WASM</span>
            </div>
            <div class="ps-trust-chip">
              <span>🧠</span>
              <span>openai/privacy-filter (q4)</span>
            </div>
            <div class="ps-trust-chip">
              <span>🛡️</span>
              <span>Fail-Closed Protection</span>
            </div>
          </div>
        </div>

        <div class="ps-hero-right">
          <div class="ps-dropzone" id="ps-dropzone">
            <svg class="ps-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
              <path d="M12 12v9"/>
              <path d="m16 16-4-4-4 4"/>
            </svg>
            <div class="ps-drop-title">
              Drop an image here <span>or click to browse</span>
            </div>
            <div class="ps-drop-hint">
              PNG · JPG · JPEG · WebP (Max 10MB)
            </div>
            <input type="file" id="ps-file-input" accept="image/png,image/jpeg,image/jpg,image/webp" style="display: none;" />
          </div>

          <div class="ps-language-selector-container" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0 4px;">
            <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">OCR Mode:</span>
            <div class="ps-lang-btn-group" style="display: inline-flex; background: #f1f5f9; padding: 3px; border-radius: 8px; border: 1px solid #cbd5e1; gap: 4px;">
              <button type="button" class="ps-lang-toggle-btn active" data-lang="eng+hin" style="padding: 4px 10px; font-size: 11px; border-radius: 6px; font-weight: 700; border: none; cursor: pointer; background: #2563eb; color: #ffffff;">
                🇮🇳 Hindi + English
              </button>
              <button type="button" class="ps-lang-toggle-btn" data-lang="eng" style="padding: 4px 10px; font-size: 11px; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; background: transparent; color: #475569;">
                English
              </button>
              <button type="button" class="ps-lang-toggle-btn" data-lang="hin" style="padding: 4px 10px; font-size: 11px; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; background: transparent; color: #475569;">
                हिन्दी
              </button>
            </div>
          </div>

          <div class="ps-upload-actions">
            <span class="ps-or-text">or</span>
            <button type="button" class="ps-btn-primary" id="btn-choose-image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
              </svg>
              Choose Image
            </button>
            <button type="button" class="ps-btn-secondary" id="btn-try-demo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Try Demo Image
            </button>
          </div>

          <div class="ps-privacy-banner">
            <div class="ps-banner-left">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
              <div>
                <div class="ps-banner-title">Your image stays on this device</div>
                <div class="ps-banner-sub">PrivacyShield processes the image locally. The original image is not uploaded to any cloud service.</div>
              </div>
            </div>
            <div class="ps-banner-right" title="${runtime.details}">
              <span class="dot-green"></span>
              <span>Runtime: ${runtimeName}</span>
              <span style="cursor: pointer; opacity: 0.8;" title="${runtime.details}">ⓘ</span>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}

/**
 * PrivacyShield - Workspace Results Section Component
 * 4-column layout matching web ui .png
 */

import { FusedDetection, RedactionResult } from "../privacy/types.ts";

export class ResultsSectionComponent {
  public static render(result: RedactionResult): string {
    const summary = result.summary;
    const runtimeName = result.runtime.type === "webgpu" ? "WebGPU" : "WASM";

    return `
      <section class="ps-results-grid" id="results-grid">
        <!-- CARD 1: Original Image -->
        <div class="ps-card" id="card-original">
          <div class="ps-card-header">
            <div class="ps-card-title">
              <span>Original Image</span>
              <label style="font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; margin-left: 8px;">
                <input type="checkbox" id="toggle-detections-overlay" checked />
                <span>Show Detections</span>
              </label>
            </div>
            <span class="ps-card-badge">🔍 100%</span>
          </div>
          <div class="ps-card-body" style="padding: 12px; align-items: center; justify-content: center;">
            <div class="ps-image-viewport" id="viewport-original">
              <img id="img-original" src="${result.originalImageUrl}" alt="Original Local Image" />
              <div class="ps-bbox-overlay" id="bbox-overlay"></div>
            </div>
          </div>
        </div>

        <!-- CARD 2: Sanitized Image -->
        <div class="ps-card" id="card-sanitized">
          <div class="ps-card-header">
            <div class="ps-card-title">
              <span>Sanitized Image</span>
              <label style="font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; margin-left: 8px;">
                <input type="checkbox" id="toggle-tag-callouts" />
                <span>Show Callout Tags</span>
              </label>
            </div>
            <span class="ps-card-badge">🔍 100%</span>
          </div>
          <div class="ps-card-body" style="padding: 12px; align-items: center; justify-content: center;">
            <div class="ps-image-viewport" id="viewport-sanitized">
              <img id="img-sanitized" src="${result.sanitizedImageUrl}" alt="Sanitized Irreversible Output" />
            </div>
          </div>
        </div>

        <!-- CARD 3: Detections List -->
        <div class="ps-card" id="card-detections">
          <div class="ps-card-header">
            <div class="ps-card-title">
              <span>Detections (${result.detections.length})</span>
            </div>
            <select id="filter-detection-risk" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: #ffffff; color: #334155;">
              <option value="all">All Types</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div class="ps-card-body">
            <div class="ps-detection-list" id="detection-items-list">
              ${this.renderDetectionItems(result.detections)}
            </div>
          </div>
        </div>

        <!-- CARD 4: Summary & Status -->
        <div class="ps-card" id="card-summary">
          <div class="ps-card-header">
            <div class="ps-card-title">Summary</div>
          </div>
          <div class="ps-card-body">
            <div class="ps-summary-card">
              <div>
                <div class="ps-count-display">
                  <span>${summary.total}</span>
                  <span class="ps-count-sub">PII Regions Detected</span>
                </div>
              </div>

              <div class="ps-breakdown-list">
                <div class="ps-breakdown-row">
                  <div class="ps-breakdown-label">
                    <span style="color: #dc2626;">●</span>
                    <span>Critical</span>
                  </div>
                  <span class="ps-breakdown-val">${summary.critical}</span>
                </div>
                <div class="ps-breakdown-row">
                  <div class="ps-breakdown-label">
                    <span style="color: #ea580c;">●</span>
                    <span>High</span>
                  </div>
                  <span class="ps-breakdown-val">${summary.high}</span>
                </div>
                <div class="ps-breakdown-row">
                  <div class="ps-breakdown-label">
                    <span style="color: #0284c7;">●</span>
                    <span>Medium</span>
                  </div>
                  <span class="ps-breakdown-val">${summary.medium}</span>
                </div>
                <div class="ps-breakdown-row">
                  <div class="ps-breakdown-label">
                    <span style="color: #94a3b8;">●</span>
                    <span>Low</span>
                  </div>
                  <span class="ps-breakdown-val">${summary.low}</span>
                </div>
              </div>

              <div class="ps-status-widget">
                <div class="ps-status-header">
                  <div class="ps-status-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      <polyline points="9 12 11 14 15 10"/>
                    </svg>
                  </div>
                  <div>
                    <div class="ps-status-title">PROTECTED</div>
                    <div class="ps-status-sub">Sensitive regions redacted successfully.</div>
                  </div>
                </div>

                <table class="ps-status-table">
                  <tbody>
                    <tr>
                      <td>Processing</td>
                      <td>On-Device</td>
                    </tr>
                    <tr>
                      <td>Runtime</td>
                      <td>${runtimeName}</td>
                    </tr>
                    <tr>
                      <td>Cloud Upload</td>
                      <td>None</td>
                    </tr>
                    <tr>
                      <td>Redaction</td>
                      <td>Irreversible</td>
                    </tr>
                    <tr>
                      <td>Failure Mode</td>
                      <td>Fail-Closed</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  public static renderDetectionItems(detections: FusedDetection[], riskFilter: string = "all"): string {
    const filtered = riskFilter === "all"
      ? detections
      : detections.filter((d) => d.risk === riskFilter);

    if (filtered.length === 0) {
      return `<div style="text-align: center; color: #94a3b8; padding: 24px; font-size: 13px;">No detections match filter.</div>`;
    }

    return filtered.map((d) => {
      const icon = this.getDetectionIcon(d.type);
      const iconBg = this.getIconBgColor(d.tagLabel);
      const riskClass = `risk-${d.risk}`;

      return `
        <div class="ps-detection-item" data-id="${d.id}" data-tag="${d.tagLabel}">
          <div class="ps-det-left">
            <div class="ps-det-icon" style="background: ${iconBg};">
              ${icon}
            </div>
            <div>
              <div class="ps-det-name">${d.tagLabel}</div>
              <div class="ps-det-source">${d.sourceDetails || d.sources.join(" + ")}</div>
            </div>
          </div>
          <div class="ps-det-right">
            <span class="ps-det-conf">${d.confidence.toFixed(2)}</span>
            <span class="ps-badge-risk ${riskClass}">${d.risk}</span>
            <button type="button" class="btn-focus-box" data-id="${d.id}" title="Highlight bounding box" style="color: #94a3b8; font-size: 14px; padding: 2px;">
              👁️
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  private static getDetectionIcon(type: string): string {
    switch (type) {
      case "face":
      case "private_person":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      case "private_email":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
      case "private_phone":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
      case "account_number":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`;
      case "pan":
      case "ifsc":
      case "aadhaar":
      case "gstin":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;
      case "secret":
      case "token":
      case "password":
      case "api_key":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
      case "qr_code":
      case "barcode":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/></svg>`;
      case "signature":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 2 4 4-14 14H4v-4Z"/><path d="m15 5 4 4"/></svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
    }
  }

  private static getIconBgColor(tag: string): string {
    const map: Record<string, string> = {
      PRIVATE_PERSON: "#3b82f6",
      PRIVATE_EMAIL: "#10b981",
      PRIVATE_PHONE: "#f97316",
      ACCOUNT_NUMBER: "#a855f7",
      PAN: "#06b6d4",
      IFSC: "#0284c7",
      SECRET: "#ef4444",
      FACE: "#f43f5e",
      QR_CODE: "#8b5cf6",
      SIGNATURE: "#f59e0b",
    };
    return map[tag] || "#64748b";
  }

  /**
   * Recalculates bounding box overlays using natural vs displayed image dimensions.
   */
  public static syncBoundingBoxes(
    imgElement: HTMLImageElement,
    overlayElement: HTMLElement,
    detections: FusedDetection[]
  ): void {
    overlayElement.innerHTML = "";
    if (!imgElement.naturalWidth || !imgElement.naturalHeight) return;

    const scaleX = imgElement.clientWidth / imgElement.naturalWidth;
    const scaleY = imgElement.clientHeight / imgElement.naturalHeight;

    for (const d of detections) {
      const x = Math.round(d.bbox.x0 * scaleX);
      const y = Math.round(d.bbox.y0 * scaleY);
      const w = Math.round((d.bbox.x1 - d.bbox.x0) * scaleX);
      const h = Math.round((d.bbox.y1 - d.bbox.y0) * scaleY);

      const boxDiv = document.createElement("div");
      boxDiv.className = "ps-bbox-rect";
      boxDiv.id = `bbox-${d.id}`;
      boxDiv.style.left = `${x}px`;
      boxDiv.style.top = `${y}px`;
      boxDiv.style.width = `${w}px`;
      boxDiv.style.height = `${h}px`;

      const color = this.getIconBgColor(d.tagLabel);
      boxDiv.style.borderColor = color;
      boxDiv.style.backgroundColor = `${color}22`;

      const tagSpan = document.createElement("span");
      tagSpan.className = "ps-bbox-tag";
      tagSpan.style.backgroundColor = color;
      tagSpan.innerText = `${d.tagLabel} (${d.confidence.toFixed(2)})`;
      boxDiv.appendChild(tagSpan);

      overlayElement.appendChild(boxDiv);
    }
  }
}

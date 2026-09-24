/**
 * PrivacyShield - Footer Component
 */

export class FooterComponent {
  public static render(): string {
    return `
      <footer class="ps-footer" id="about">
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong style="color: #0f172a;">PrivacyShield</strong>
          <span>On-Device PII Detection & Redaction</span>
          <span style="color: #cbd5e1;">|</span>
          <span style="color: #64748b;">SIH26171</span>
        </div>

        <div class="ps-footer-links">
          <a href="#privacy" onclick="alert('Privacy Guarantee: All processing executes locally on this machine inside your browser sandbox. Zero raw pixels or PII strings leave your device.'); return false;">Privacy</a>
          <a href="#security" onclick="document.querySelector('details')?.setAttribute('open', 'true'); location.href='#technology'; return false;">Security</a>
          <a href="#architecture" onclick="document.querySelector('details')?.setAttribute('open', 'true'); location.href='#technology'; return false;">Architecture</a>
          <a href="https://github.com" target="_blank" rel="noopener">GitHub</a>
        </div>

        <div style="font-weight: 600; color: #1e293b;">
          Your data. Your device. Your control.
        </div>
      </footer>
    `;
  }
}

/**
 * PrivacyShield - Main Application Entry & Controller
 * SIH26171: On-Device Visual PII Detection & Redaction
 */

import "./style.css";
import { PrivacyPipeline } from "./privacy/PrivacyPipeline.ts";
import { HeaderComponent } from "./ui/Header.ts";
import { HeroComponent } from "./ui/Hero.ts";
import { PipelineProgressComponent } from "./ui/PipelineProgress.ts";
import { ResultsSectionComponent } from "./ui/ResultsSection.ts";
import { ActionBarComponent } from "./ui/ActionBar.ts";
import { TechnicalDetailsComponent } from "./ui/TechnicalDetails.ts";
import { FooterComponent } from "./ui/Footer.ts";
import { DemoImageGenerator } from "./demo/DemoImageGenerator.ts";
import { ImageInput, RedactionResult } from "./privacy/types.ts";
import { TagManager } from "./privacy/tagging/TagManager.ts";

class AppController {
  private pipeline: PrivacyPipeline;
  private currentResult: RedactionResult | null = null;
  private isProcessing: boolean = false;
  private currentFileName: string = "image";

  constructor() {
    this.pipeline = new PrivacyPipeline();
  }

  public async init(): Promise<void> {
    const appEl = document.getElementById("app");
    if (!appEl) return;

    // Detect hardware runtime
    const runtime = await this.pipeline.getRuntimeInfo();

    // Render App Shell
    appEl.innerHTML = `
      ${HeaderComponent.render(runtime)}
      <main class="ps-main-container">
        ${HeroComponent.render(runtime)}
        ${PipelineProgressComponent.render()}
        <div id="results-mount"></div>
        <div id="action-bar-mount"></div>
        ${TechnicalDetailsComponent.render(runtime)}
      </main>
      ${FooterComponent.render()}
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const fileInput = document.getElementById("ps-file-input") as HTMLInputElement;
    const dropzone = document.getElementById("ps-dropzone");
    const btnChoose = document.getElementById("btn-choose-image");
    const btnDemo = document.getElementById("btn-try-demo");

    // File selection trigger
    btnChoose?.addEventListener("click", () => fileInput?.click());
    dropzone?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        this.handleFileSelected(target.files[0]);
      }
    });

    // Drag and Drop
    dropzone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone?.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag-over");
    });

    dropzone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    // Demo Image Button
    btnDemo?.addEventListener("click", async () => {
      if (this.isProcessing) return;
      btnDemo.innerHTML = `<span>⏳ Loading Demo...</span>`;
      try {
        const demoInput = await DemoImageGenerator.getDemoImage();
        btnDemo.innerHTML = `<span>✓ Demo Ready</span>`;
        await this.runPipeline(demoInput);
      } catch (err: any) {
        alert("Failed to load demo image: " + err.message);
        btnDemo.innerHTML = `<span>Try Demo Image</span>`;
      }
    });

    // Language Toggle Buttons
    const langButtons = document.querySelectorAll(".ps-lang-toggle-btn");
    langButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const lang = (btn as HTMLElement).dataset.lang as "eng" | "hin" | "eng+hin";
        if (!lang) return;

        langButtons.forEach((b) => {
          (b as HTMLElement).style.background = "transparent";
          (b as HTMLElement).style.color = "#475569";
          (b as HTMLElement).classList.remove("active");
        });
        (btn as HTMLElement).style.background = "#2563eb";
        (btn as HTMLElement).style.color = "#ffffff";
        (btn as HTMLElement).classList.add("active");

        await this.pipeline.setLanguage(lang);
      });
    });

    // Window resize handler for bounding box coordinate scaling
    window.addEventListener("resize", () => {
      if (this.currentResult) {
        const img = document.getElementById("img-original") as HTMLImageElement;
        const overlay = document.getElementById("bbox-overlay");
        if (img && overlay) {
          ResultsSectionComponent.syncBoundingBoxes(img, overlay, this.currentResult.detections);
        }
      }
    });
  }

  private async handleFileSelected(file: File): Promise<void> {
    if (this.isProcessing) return;
    const input: ImageInput = {
      file,
      name: file.name,
      type: file.type,
      size: file.size,
    };
    await this.runPipeline(input);
  }

  private async runPipeline(input: ImageInput): Promise<void> {
    this.isProcessing = true;
    this.currentFileName = input.name.replace(/\.[^/.]+$/, "");

    const pipelineContainer = document.getElementById("pipeline-container");
    if (pipelineContainer) pipelineContainer.style.display = "block";

    PipelineProgressComponent.resetAll();

    // Scroll to pipeline
    pipelineContainer?.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
      const result = await this.pipeline.processImage(input, (event) => {
        PipelineProgressComponent.setStepStatus(event.stage, event.status, event.sublabel);
      });

      this.currentResult = result;
      this.renderResults(result);
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      this.renderErrorState(err.message || "Failed to sanitize image.");
    } finally {
      this.isProcessing = false;
    }
  }

  private renderResults(result: RedactionResult): void {
    const resultsMount = document.getElementById("results-mount");
    const actionBarMount = document.getElementById("action-bar-mount");

    if (resultsMount) {
      resultsMount.innerHTML = ResultsSectionComponent.render(result);
    }
    if (actionBarMount) {
      actionBarMount.innerHTML = ActionBarComponent.render(result);
    }

    // Attach results interactive listeners
    const imgOriginal = document.getElementById("img-original") as HTMLImageElement;
    const imgSanitized = document.getElementById("img-sanitized") as HTMLImageElement;
    const bboxOverlay = document.getElementById("bbox-overlay");

    // Sync bounding boxes once image is decoded
    if (imgOriginal && bboxOverlay) {
      if (imgOriginal.complete) {
        ResultsSectionComponent.syncBoundingBoxes(imgOriginal, bboxOverlay, result.detections);
      } else {
        imgOriginal.onload = () => {
          ResultsSectionComponent.syncBoundingBoxes(imgOriginal, bboxOverlay, result.detections);
        };
      }
    }

    // Show Detections Toggle
    const toggleOverlay = document.getElementById("toggle-detections-overlay") as HTMLInputElement;
    toggleOverlay?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (bboxOverlay) {
        bboxOverlay.style.display = checked ? "block" : "none";
      }
    });

    // Toggle Callout Tags
    const toggleCallouts = document.getElementById("toggle-tag-callouts") as HTMLInputElement;
    toggleCallouts?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (imgSanitized) {
        imgSanitized.src = checked && result.taggedImageUrl
          ? result.taggedImageUrl
          : result.sanitizedImageUrl;
      }
    });

    // Risk Filter
    const riskSelect = document.getElementById("filter-detection-risk") as HTMLSelectElement;
    const detList = document.getElementById("detection-items-list");
    riskSelect?.addEventListener("change", (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (detList) {
        detList.innerHTML = ResultsSectionComponent.renderDetectionItems(result.detections, val);
        this.attachItemFocusListeners();
      }
    });

    this.attachItemFocusListeners();

    // Download Clean Sanitized Image
    const btnDownloadClean = document.getElementById("btn-download-sanitized");
    btnDownloadClean?.addEventListener("click", () => {
      TagManager.downloadImage(result.sanitizedImageBlob, `${this.currentFileName}_sanitized.png`);
    });

    // Download Tagged Image
    const btnDownloadTagged = document.getElementById("btn-download-tagged");
    btnDownloadTagged?.addEventListener("click", () => {
      const blob = result.taggedImageBlob || result.sanitizedImageBlob;
      TagManager.downloadImage(blob, `${this.currentFileName}_tagged.png`);
    });

    // Download Report JSON
    const btnDownloadReport = document.getElementById("btn-download-report");
    btnDownloadReport?.addEventListener("click", () => {
      const manifest = TagManager.createManifest(
        `${this.currentFileName}.png`,
        result.width,
        result.height,
        result.detections,
        result.runtime,
        result.processingTimeMs
      );
      TagManager.downloadManifest(manifest, this.currentFileName);
    });

    // Process Another Image
    const btnProcessAnother = document.getElementById("btn-process-another");
    btnProcessAnother?.addEventListener("click", () => {
      if (resultsMount) resultsMount.innerHTML = "";
      if (actionBarMount) actionBarMount.innerHTML = "";
      const pipelineContainer = document.getElementById("pipeline-container");
      if (pipelineContainer) pipelineContainer.style.display = "none";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Smooth scroll down to results
    resultsMount?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private attachItemFocusListeners(): void {
    const focusButtons = document.querySelectorAll(".btn-focus-box");
    focusButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (!id) return;
        this.highlightBox(id);
      });
    });

    const items = document.querySelectorAll(".ps-detection-item");
    items.forEach((item) => {
      item.addEventListener("click", () => {
        const id = (item as HTMLElement).dataset.id;
        if (id) this.highlightBox(id);
      });
    });
  }

  private highlightBox(id: string): void {
    document.querySelectorAll(".ps-bbox-rect").forEach((r) => r.classList.remove("highlighted"));
    const rect = document.getElementById(`bbox-${id}`);
    if (rect) {
      rect.classList.add("highlighted");
      rect.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  private renderErrorState(errorMessage: string): void {
    const resultsMount = document.getElementById("results-mount");
    if (resultsMount) {
      resultsMount.innerHTML = `
        <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 16px; padding: 24px; text-align: center; margin-top: 20px;">
          <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
          <h2 style="font-size: 18px; font-weight: 800; color: #991b1b; margin-bottom: 8px;">Protection Could Not Be Completed</h2>
          <p style="font-size: 14px; color: #b91c1c; max-width: 600px; margin: 0 auto 16px;">
            PrivacyShield enforces a <strong>strict fail-closed security boundary</strong>. Because a component reported an error, no sanitized image was generated. The original image has not been compromised or sent to any external server.
          </p>
          <div style="background: #fee2e2; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #7f1d1d; display: inline-block; margin-bottom: 16px;">
            ${errorMessage}
          </div>
          <div>
            <button type="button" onclick="location.reload()" class="ps-btn-primary" style="background: #dc2626;">Try Again</button>
          </div>
        </div>
      `;
      resultsMount.scrollIntoView({ behavior: "smooth" });
    }
  }
}

// Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  const app = new AppController();
  app.init().catch(console.error);
});

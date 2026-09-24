/**
 * PrivacyShield - Pipeline Progress Stepper Component
 * Visualizes the 8 stages of on-device detection and redaction.
 */

import { PipelineStage } from "../privacy/types.ts";

export interface StepDef {
  id: PipelineStage;
  num: number;
  name: string;
  sub: string;
}

export const PIPELINE_STEPS: StepDef[] = [
  { id: "image_loaded", num: 1, name: "Image Loaded", sub: "Ingested" },
  { id: "ocr", num: 2, name: "OCR", sub: "Tesseract.js" },
  { id: "pii_detection", num: 3, name: "PII Detection", sub: "Privacy Filter" },
  { id: "rule_engine", num: 4, name: "Rule Engine", sub: "Patterns & Heuristics" },
  { id: "visual_detection", num: 5, name: "Visual Detection", sub: "Face · QR · Sig" },
  { id: "fusion_scoring", num: 6, name: "Fusion & Scoring", sub: "Merge Results" },
  { id: "redaction", num: 7, name: "Redaction", sub: "Mask Regions" },
  { id: "complete", num: 8, name: "Complete", sub: "Generate Output" },
];

export class PipelineProgressComponent {
  public static render(): string {
    return `
      <section class="ps-pipeline-card" id="pipeline-container" style="display: none;">
        <div class="ps-stepper" id="ps-stepper">
          ${PIPELINE_STEPS.map((s) => `
            <div class="ps-step-item" id="step-${s.id}">
              <div class="ps-step-circle">
                <span class="step-num">${s.num}</span>
                <span class="step-check" style="display: none;">✓</span>
              </div>
              <div class="ps-step-info">
                <span class="ps-step-name">${s.name}</span>
                <span class="ps-step-desc">${s.sub}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  public static setStepStatus(
    stageId: PipelineStage,
    status: "pending" | "active" | "completed" | "failed",
    subtext?: string
  ): void {
    const el = document.getElementById(`step-${stageId}`);
    if (!el) return;

    el.classList.remove("active", "completed", "failed");
    const numSpan = el.querySelector(".step-num") as HTMLElement;
    const checkSpan = el.querySelector(".step-check") as HTMLElement;
    const descSpan = el.querySelector(".ps-step-desc") as HTMLElement;

    if (subtext && descSpan) {
      descSpan.innerText = subtext;
    }

    if (status === "completed") {
      el.classList.add("completed");
      if (numSpan) numSpan.style.display = "none";
      if (checkSpan) checkSpan.style.display = "inline";
    } else if (status === "active") {
      el.classList.add("active");
      if (numSpan) numSpan.style.display = "inline";
      if (checkSpan) checkSpan.style.display = "none";
    } else if (status === "failed") {
      el.classList.add("failed");
      if (numSpan) numSpan.innerText = "!";
    } else {
      if (numSpan) numSpan.style.display = "inline";
      if (checkSpan) checkSpan.style.display = "none";
    }
  }

  public static resetAll(): void {
    for (const s of PIPELINE_STEPS) {
      this.setStepStatus(s.id, "pending", s.sub);
    }
  }
}

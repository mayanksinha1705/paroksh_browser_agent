/**
 * PrivacyShield - Hardware Runtime Detector
 * Detects WebGPU availability or falls back to WebAssembly (WASM).
 */

import { RuntimeInfo } from "../types.ts";

export class RuntimeDetector {
  private static cachedInfo: RuntimeInfo | null = null;

  public static async detectRuntime(): Promise<RuntimeInfo> {
    if (this.cachedInfo) return this.cachedInfo;

    let hasWebGPU = false;
    let adapterName = "Standard WASM Runtime";

    if (typeof navigator !== "undefined" && "gpu" in navigator && (navigator as any).gpu) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          hasWebGPU = true;
          adapterName = adapter.info?.device || "WebGPU Hardware Accelerated";
        }
      } catch {
        hasWebGPU = false;
      }
    }

    this.cachedInfo = {
      type: hasWebGPU ? "webgpu" : "wasm",
      details: hasWebGPU
        ? `WebGPU Accelerated (${adapterName})`
        : "WASM Fallback (Local CPU execution)",
      hardwareAcceleration: hasWebGPU,
      adapterName,
    };

    return this.cachedInfo;
  }
}

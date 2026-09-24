/**
 * PrivacyShield - Security Policy Engine
 * Enforces masking, tokenization, or allow rules based on risk levels.
 */

import { FusedDetection, PolicyAction, RiskLevel } from "../types.ts";

export interface PolicyConfig {
  critical: PolicyAction;
  high: PolicyAction;
  medium: PolicyAction;
  low: PolicyAction;
}

export const DEFAULT_POLICY: PolicyConfig = {
  critical: "mask",
  high: "mask",
  medium: "mask",
  low: "allow",
};

export class PolicyEngine {
  private config: PolicyConfig;

  constructor(config: PolicyConfig = DEFAULT_POLICY) {
    this.config = config;
  }

  public evaluate(detections: FusedDetection[]): FusedDetection[] {
    return detections.map((d) => {
      const action = this.resolveAction(d.risk);
      return {
        ...d,
        action,
      };
    });
  }

  private resolveAction(risk: RiskLevel): PolicyAction {
    return this.config[risk] || "mask";
  }
}

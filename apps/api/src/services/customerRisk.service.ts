/**
 * services/customerRisk.service.ts — Customer Credit & Default Risk Scoring Engine
 *
 * Computes multi-factor risk tiering and recovery probability based on:
 *   1. Historical payment completion rate (Payment History Score: 0–100)
 *   2. Decline error taxonomy (Transient network vs recurring default)
 *   3. Customer default risk score (0–100)
 *
 * RISK TIERS:
 *   - LOW:    Risk Score < 30 (or History Score >= 80) → Recovery Probability ~85-95%
 *   - MEDIUM: Risk Score 30-60 (or History Score 50-79) → Recovery Probability ~60-80%
 *   - HIGH:   Risk Score > 60 (or History Score < 50) → Recovery Probability ~20-50%
 */

import { DeclineCategory, RiskTier } from "@revrec/types";

export { RiskTier };

export interface CustomerRiskProfile {
  riskScore: number;
  riskTier: RiskTier;
  paymentHistoryScore: number;
  recoveryProbabilityPercent: number;
  recommendedDunningStrategy: string;
}

export function evaluateCustomerRisk(
  rawRiskScore: number = 30,
  paymentHistoryScore: number = 85,
  declineCategory?: DeclineCategory | string,
  errorCode?: string
): CustomerRiskProfile {
  let adjustedRiskScore = Math.max(0, Math.min(100, rawRiskScore));
  let adjustedHistoryScore = Math.max(0, Math.min(100, paymentHistoryScore));

  const code = (errorCode ?? "").toUpperCase();
  const category = (declineCategory ?? "").toString().toUpperCase();

  // Adjust risk metrics dynamically based on payment failure signature
  if (code.includes("FRAUD") || code.includes("STOLEN") || code.includes("LOST_CARD") || code.includes("RESTRICTED") || category === "HARD") {
    adjustedRiskScore = Math.max(adjustedRiskScore, 85);
    adjustedHistoryScore = Math.min(adjustedHistoryScore, 20);
  } else if (code.includes("TIMEOUT") || code.includes("SWITCH_DOWN") || code.includes("GATEWAY") || code.includes("NETWORK") || category === "NETWORK") {
    adjustedRiskScore = Math.min(adjustedRiskScore, 20);
    adjustedHistoryScore = Math.max(adjustedHistoryScore, 90);
  } else if (code.includes("INSUFFICIENT") || code.includes("BALANCE") || code.includes("LIMIT") || category === "SOFT") {
    adjustedRiskScore = Math.max(30, Math.min(55, adjustedRiskScore));
    adjustedHistoryScore = Math.max(60, Math.min(80, adjustedHistoryScore));
  }

  // Derive Risk Tier
  let riskTier = RiskTier.LOW;
  if (adjustedRiskScore > 60 || adjustedHistoryScore < 50) {
    riskTier = RiskTier.HIGH;
  } else if (adjustedRiskScore >= 30 || adjustedHistoryScore < 80) {
    riskTier = RiskTier.MEDIUM;
  } else {
    riskTier = RiskTier.LOW;
  }

  // Calculate estimated recovery probability
  let recoveryProbabilityPercent = 75;
  if (riskTier === RiskTier.LOW) {
    recoveryProbabilityPercent = Math.round(85 + (100 - adjustedRiskScore) * 0.1);
  } else if (riskTier === RiskTier.MEDIUM) {
    recoveryProbabilityPercent = Math.round(60 + (60 - adjustedRiskScore) * 0.4);
  } else {
    recoveryProbabilityPercent = Math.round(20 + Math.max(0, 50 - adjustedRiskScore) * 0.4);
  }
  recoveryProbabilityPercent = Math.max(5, Math.min(98, recoveryProbabilityPercent));

  // Determine optimal strategy recommendation
  let recommendedDunningStrategy = "Standard automated smart retry with salary alignment.";
  if (riskTier === RiskTier.LOW) {
    recommendedDunningStrategy = "High-priority frictionless recovery. Fast jitter retry & 1-click WhatsApp intent.";
  } else if (riskTier === RiskTier.MEDIUM) {
    recommendedDunningStrategy = "Balanced dunning. Salary cycle schedule with gentle WhatsApp follow-up.";
  } else {
    recommendedDunningStrategy = "Strict compliance monitoring. Early escalation & re-authentication guard.";
  }

  return {
    riskScore: adjustedRiskScore,
    riskTier,
    paymentHistoryScore: adjustedHistoryScore,
    recoveryProbabilityPercent,
    recommendedDunningStrategy,
  };
}

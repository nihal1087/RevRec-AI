import { evaluateCustomerRisk } from "./customerRisk.service";
import { RiskTier } from "@revrec/types";

describe("Customer Risk & Scoring Engine", () => {
  describe("Low Risk Assessment", () => {
    it("should classify reliable customer with network failure as LOW risk", () => {
      const profile = evaluateCustomerRisk(15, 95, "NETWORK", "GATEWAY_TIMEOUT");
      expect(profile.riskTier).toBe(RiskTier.LOW);
      expect(profile.paymentHistoryScore).toBeGreaterThanOrEqual(80);
      expect(profile.recoveryProbabilityPercent).toBeGreaterThanOrEqual(85);
      expect(profile.recommendedDunningStrategy).toContain("High-priority frictionless recovery");
    });
  });

  describe("Medium Risk Assessment", () => {
    it("should classify customer with insufficient funds / salary delay as MEDIUM risk", () => {
      const profile = evaluateCustomerRisk(45, 70, "SOFT", "INSUFFICIENT_FUNDS");
      expect(profile.riskTier).toBe(RiskTier.MEDIUM);
      expect(profile.recoveryProbabilityPercent).toBeGreaterThanOrEqual(60);
      expect(profile.recoveryProbabilityPercent).toBeLessThan(85);
      expect(profile.recommendedDunningStrategy).toContain("Salary cycle schedule");
    });
  });

  describe("High Risk Assessment", () => {
    it("should classify suspected fraud or stolen card as HIGH risk", () => {
      const profile = evaluateCustomerRisk(50, 80, "HARD", "FRAUD_SUSPECTED");
      expect(profile.riskTier).toBe(RiskTier.HIGH);
      expect(profile.riskScore).toBeGreaterThanOrEqual(80);
      expect(profile.paymentHistoryScore).toBeLessThanOrEqual(30);
      expect(profile.recoveryProbabilityPercent).toBeLessThanOrEqual(50);
      expect(profile.recommendedDunningStrategy).toContain("Strict compliance monitoring");
    });
  });

  describe("Edge cases & boundaries", () => {
    it("should clamp out-of-bounds scores into 0-100", () => {
      const profile = evaluateCustomerRisk(150, -20);
      expect(profile.riskScore).toBeLessThanOrEqual(100);
      expect(profile.paymentHistoryScore).toBeGreaterThanOrEqual(0);
    });
  });
});

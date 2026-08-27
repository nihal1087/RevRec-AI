import { classifyPaymentFailure } from "./rca.service";
import { DeclineCategory, RecoveryStage } from "@revrec/types";

describe("RCA Service — Root Cause Analysis", () => {
  describe("Hard Declines", () => {
    it("should classify CARD_EXPIRED as HARD and non-retryable", () => {
      const result = classifyPaymentFailure("CARD_EXPIRED");
      expect(result.category).toBe(DeclineCategory.HARD);
      expect(result.isRetryable).toBe(false);
      expect(result.recommendedAction).toBe("UPDATE_PAYMENT_METHOD");
      expect(result.initialStage).toBe(RecoveryStage.HALTED);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it("should classify STOLEN_CARD as HARD and halted", () => {
      const result = classifyPaymentFailure("STOLEN_CARD");
      expect(result.category).toBe(DeclineCategory.HARD);
      expect(result.isRetryable).toBe(false);
      expect(result.initialStage).toBe(RecoveryStage.HALTED);
    });
  });

  describe("Soft Declines (Balance / Liquidity)", () => {
    it("should classify INSUFFICIENT_FUNDS as SOFT and retryable", () => {
      const result = classifyPaymentFailure("INSUFFICIENT_FUNDS", "Payment failed due to insufficient funds");
      expect(result.category).toBe(DeclineCategory.SOFT);
      expect(result.isRetryable).toBe(true);
      expect(result.recommendedAction).toBe("RETRY");
      expect(result.initialStage).toBe(RecoveryStage.ANALYZING);
      expect(result.suggestedRetryDelaySeconds).toBeDefined();
    });

    it("should classify EXCEEDS_BALANCE as SOFT", () => {
      const result = classifyPaymentFailure("EXCEEDS_BALANCE");
      expect(result.category).toBe(DeclineCategory.SOFT);
      expect(result.isRetryable).toBe(true);
    });
  });

  describe("Network and Gateway Errors", () => {
    it("should classify GATEWAY_TIMEOUT as NETWORK with fast retry", () => {
      const result = classifyPaymentFailure("GATEWAY_TIMEOUT");
      expect(result.category).toBe(DeclineCategory.NETWORK);
      expect(result.isRetryable).toBe(true);
      expect(result.recommendedAction).toBe("RETRY");
      expect(result.suggestedRetryDelaySeconds).toBeLessThan(3600); // under an hour
    });

    it("should classify UPI_SWITCH_DOWN as NETWORK", () => {
      const result = classifyPaymentFailure("UPI_SWITCH_DOWN", "Bank issuer switch is unavailable");
      expect(result.category).toBe(DeclineCategory.NETWORK);
      expect(result.isRetryable).toBe(true);
    });
  });

  describe("Intent Drops & Authentication Friction", () => {
    it("should classify OTP_TIMED_OUT as INTENT_DROP and recommend customer outreach", () => {
      const result = classifyPaymentFailure("OTP_TIMED_OUT");
      expect(result.category).toBe(DeclineCategory.INTENT_DROP);
      expect(result.isRetryable).toBe(false);
      expect(result.recommendedAction).toBe("OUTREACH");
      expect(result.initialStage).toBe(RecoveryStage.OUTREACH_SENT);
    });
  });

  describe("Mandate Failures", () => {
    it("should classify MANDATE_EXECUTION_FAILED as MANDATE_FAILURE and enforce compliance", () => {
      const result = classifyPaymentFailure("MANDATE_EXECUTION_FAILED");
      expect(result.category).toBe(DeclineCategory.MANDATE_FAILURE);
      expect(result.isRetryable).toBe(true);
      expect(result.initialStage).toBe(RecoveryStage.ANALYZING);
    });
  });
});

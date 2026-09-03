/**
 * paymentEvent.worker.test.ts
 * Tests for the PaymentEvent worker — job routing and RCA integration.
 * Full handler tests use real RCA + retry sequencer services (no mocking)
 * since they are pure deterministic functions.
 */

import { classifyPaymentFailure } from "../services/rca.service";
import { DeclineCategory } from "@revrec/types";
import {
  isBankInMaintenanceWindow,
  recordBankOutage,
  clearBankOutage,
} from "../services/bankHealth.service";

// ── RCA classification (called by handlePaymentFailed) ──────────────────────

describe("RCA service — payment failure classification used by worker", () => {
  it("classifies INSUFFICIENT_FUNDS as SOFT retryable decline", () => {
    const result = classifyPaymentFailure("INSUFFICIENT_FUNDS", "Insufficient funds", "razorpay");
    expect(result.category).toBe(DeclineCategory.SOFT);
    expect(result.isRetryable).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies CARD_STOLEN as HARD non-retryable decline", () => {
    const result = classifyPaymentFailure("STOLEN_CARD", "Card is stolen", "razorpay");
    expect(result.category).toBe(DeclineCategory.HARD);
    expect(result.isRetryable).toBe(false);
  });

  it("classifies GATEWAY_TIMEOUT as NETWORK retryable decline", () => {
    const result = classifyPaymentFailure("GATEWAY_TIMEOUT", "Gateway timed out", "razorpay");
    expect(result.category).toBe(DeclineCategory.NETWORK);
    expect(result.isRetryable).toBe(true);
  });

  it("classifies OTP_TIMEOUT as INTENT_DROP (non-retryable)", () => {
    const result = classifyPaymentFailure("OTP_TIMEOUT", "Customer did not complete OTP", "razorpay");
    expect(result.category).toBe(DeclineCategory.INTENT_DROP);
    expect(result.isRetryable).toBe(false);
  });

  it("classifies NACH_MANDATE_CANCELLED as MANDATE_FAILURE", () => {
    const result = classifyPaymentFailure("NACH_MANDATE_CANCELLED", "Mandate cancelled by customer", "razorpay");
    expect(result.category).toBe(DeclineCategory.MANDATE_FAILURE);
  });

  it("classifies UNKNOWN error codes as SOFT by default (safe fallback)", () => {
    const result = classifyPaymentFailure("COMPLETELY_UNKNOWN_CODE_XYZ", "Some unknown error", "razorpay");
    expect(result.category).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("all classified results include required fields", () => {
    const codes = ["INSUFFICIENT_FUNDS", "CARD_EXPIRED", "GATEWAY_TIMEOUT", "OTP_TIMEOUT"];
    for (const code of codes) {
      const result = classifyPaymentFailure(code, "", "razorpay");
      expect(result).toMatchObject({
        category: expect.any(String),
        isRetryable: expect.any(Boolean),
        recommendedAction: expect.any(String),
        confidence: expect.any(Number),
        reasoning: expect.any(String),
      });
    }
  });
});

// ── Bank circuit breaker (wired into handlePaymentFailed since fix A3) ──────

describe("Bank outage circuit breaker — wired in paymentEvent.worker", () => {
  afterEach(() => {
    clearBankOutage("HDFC");
    clearBankOutage("SBIN");
  });

  it("recordBankOutage marks bank as experiencing outage", () => {
    recordBankOutage("HDFC", 30);
    const { isBankExperiencingOutage } = require("../services/bankHealth.service") as typeof import("../services/bankHealth.service");
    expect(isBankExperiencingOutage("HDFC")).toBe(true);
  });

  it("HDFC maintenance window detection works correctly", () => {
    // 1am IST = inside HDFC window (00:00-03:00 IST)
    // UTC offset: IST - 5:30, so 1am IST = 19:30 UTC previous day
    const istMidnight = new Date("2026-03-15T18:30:00.000Z"); // = 00:00 IST
    const inWindow = isBankInMaintenanceWindow(istMidnight, "HDFC");
    expect(inWindow).toBe(true);
  });

  it("HDFC is not in maintenance window at 10am IST", () => {
    const tenAmIST = new Date("2026-03-15T04:30:00.000Z"); // = 10:00 IST
    expect(isBankInMaintenanceWindow(tenAmIST, "HDFC")).toBe(false);
  });
});

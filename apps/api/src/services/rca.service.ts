/**
 * services/rca.service.ts — Payment Failure Root Cause Analysis Engine
 *
 * Classifies gateway-specific and network-level error codes into standardized
 * decline categories, determining whether an automated retry is mathematically
 * viable and compliant.
 */

import { DeclineCategory, RecoveryStage } from "@revrec/types";

export interface RcaClassificationResult {
  readonly category: DeclineCategory;
  readonly isRetryable: boolean;
  readonly recommendedAction: "RETRY" | "OUTREACH" | "UPDATE_PAYMENT_METHOD" | "HALT" | "ESCALATE";
  readonly initialStage: RecoveryStage;
  readonly confidence: number;
  readonly reasoning: string;
  readonly suggestedRetryDelaySeconds?: number;
}

/**
 * Normalizes gateway error codes to upper-case alphanumeric tokens for matching.
 */
function normalizeErrorCode(rawCode: string): string {
  return rawCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

// ── Error Code Mapping Tables ────────────────────────────────────────────────

// HARD DECLINES: Permanent failures. Card invalid, stolen, expired, account closed.
// Retrying these is a violation of card network rules and incurs merchant fines.
const HARD_DECLINE_CODES = new Set([
  "CARD_EXPIRED",
  "EXPIRED_CARD",
  "INVALID_CARD_NUMBER",
  "INVALID_ACCOUNT",
  "ACCOUNT_CLOSED",
  "STOLEN_CARD",
  "LOST_CARD",
  "FRAUD_SUSPECTED",
  "RESTRICTED_CARD",
  "DO_NOT_HONOR_HARD",
  "INVALID_EXPIRY_DATE",
  "INVALID_CVV",
  "CARD_HOLDER_DECEASED",
  "BAD_REQUEST_PAYMENT_CARD_INVALID",
]);

// SOFT DECLINES: Temporary liquidity or balance issues. Highly recoverable if timed correctly.
const SOFT_DECLINE_CODES = new Set([
  "INSUFFICIENT_FUNDS",
  "PAYMENT_FAILED_DUE_TO_INSUFFICIENT_FUNDS",
  "EXCEEDS_WITHDRAWAL_AMOUNT_LIMIT",
  "EXCEEDS_BALANCE",
  "LIMIT_EXCEEDED",
  "AMOUNT_EXCEEDS_LIMIT",
  "CUSTOMER_BALANCE_LOW",
  "TRANSACTION_LIMIT_EXCEEDED",
  "DAILY_LIMIT_EXCEEDED",
]);

// NETWORK & TECHNICAL ERRORS: Transient gateway, bank switch, or processor drops.
const NETWORK_ERROR_CODES = new Set([
  "GATEWAY_ERROR",
  "BAD_GATEWAY",
  "GATEWAY_TIMEOUT",
  "NETWORK_ERROR",
  "ISSUER_DOWN",
  "BANK_UNAVAILABLE",
  "ACQUIRER_DOWN",
  "SYSTEM_ERROR",
  "INTERNAL_SERVER_ERROR",
  "CONNECTION_TIMEOUT",
  "NPCI_TIMEOUT",
  "UPI_SWITCH_DOWN",
  "PAYMENT_PROCESSING_TIMED_OUT",
]);

// INTENT DROP-OFFS & CUSTOMER FRICTION: User abandoned OTP, closed app, or timed out.
const INTENT_DROP_CODES = new Set([
  "BAD_REQUEST_PAYMENT_PIN_INCORRECT",
  "INCORRECT_PIN",
  "INCORRECT_OTP",
  "OTP_EXPIRED",
  "OTP_TIMED_OUT",
  "CUSTOMER_ABANDONED",
  "USER_CANCELLED",
  "SESSION_EXPIRED",
  "AUTHENTICATION_FAILED",
  "USER_DROPPED_OFF",
]);

// MANDATE & SUBSCRIPTION FAILURES: e-NACH, UPI AutoPay, or SI on Card mandate registration/execution drops.
const MANDATE_FAILURE_CODES = new Set([
  "MANDATE_INACTIVE",
  "MANDATE_EXPIRED",
  "MANDATE_EXECUTION_FAILED",
  "MANDATE_MAX_AMOUNT_EXCEEDED",
  "MANDATE_FREQUENCY_LIMIT_EXCEEDED",
  "CUSTOMER_MANDATE_CANCELLED",
  "NACH_DEBIT_FAILED",
  "SI_NOT_REGISTERED",
]);

/**
 * Analyzes a raw payment failure and produces a deterministic RCA classification.
 */
export function classifyPaymentFailure(
  rawErrorCode: string,
  rawErrorDescription?: string,
  gateway: string = "razorpay"
): RcaClassificationResult {
  const code = normalizeErrorCode(rawErrorCode || "UNKNOWN");
  const desc = (rawErrorDescription ?? "").toLowerCase();

  // 1. Check Hard Declines
  if (
    HARD_DECLINE_CODES.has(code) ||
    desc.includes("expired") ||
    desc.includes("stolen") ||
    desc.includes("invalid card") ||
    desc.includes("account closed")
  ) {
    return {
      category: DeclineCategory.HARD,
      isRetryable: false,
      recommendedAction: "UPDATE_PAYMENT_METHOD",
      initialStage: RecoveryStage.HALTED,
      confidence: 0.98,
      reasoning: `Permanent decline detected (${code}). Payment method is unusable. Automated retries halted to avoid network fines. Customer must provide a new payment instrument.`,
    };
  }

  // 2. Check Soft Balance Declines
  if (
    SOFT_DECLINE_CODES.has(code) ||
    desc.includes("insufficient") ||
    desc.includes("low balance") ||
    desc.includes("limit exceeded")
  ) {
    return {
      category: DeclineCategory.SOFT,
      isRetryable: true,
      recommendedAction: "RETRY",
      initialStage: RecoveryStage.ANALYZING,
      confidence: 0.95,
      reasoning: `Temporary liquidity constraint (${code}). Account is active but lacked balance at debit time. Scheduled for salary-cycle aligned smart retry.`,
      suggestedRetryDelaySeconds: 86400, // 24 hours default, optimized further by Sequencer
    };
  }

  // 3. Check Network / Bank Switch Outages
  if (
    NETWORK_ERROR_CODES.has(code) ||
    desc.includes("issuer down") ||
    desc.includes("timeout") ||
    desc.includes("switch down") ||
    desc.includes("unavailable")
  ) {
    return {
      category: DeclineCategory.NETWORK,
      isRetryable: true,
      recommendedAction: "RETRY",
      initialStage: RecoveryStage.ANALYZING,
      confidence: 0.92,
      reasoning: `Transient network or bank issuer switch downtime (${code}). The customer balance was unaffected. Rapid jittered retry recommended once the bank recovers.`,
      suggestedRetryDelaySeconds: 900, // 15 minutes initial backoff
    };
  }

  // 4. Check Intent Drops / Auth Friction
  if (
    INTENT_DROP_CODES.has(code) ||
    desc.includes("otp") ||
    desc.includes("pin") ||
    desc.includes("cancelled by user")
  ) {
    return {
      category: DeclineCategory.INTENT_DROP,
      isRetryable: false, // Cannot auto-retry without user auth
      recommendedAction: "OUTREACH",
      initialStage: RecoveryStage.OUTREACH_SENT,
      confidence: 0.90,
      reasoning: `Payer drop-off or authentication friction (${code}). Payment requires customer 2FA/OTP interaction. Triggering WhatsApp/SMS recovery link with friction-free 1-click checkout.`,
    };
  }

  // 5. Check Mandate Failures
  if (
    MANDATE_FAILURE_CODES.has(code) ||
    desc.includes("mandate") ||
    desc.includes("nach")
  ) {
    return {
      category: DeclineCategory.MANDATE_FAILURE,
      isRetryable: true,
      recommendedAction: "RETRY",
      initialStage: RecoveryStage.ANALYZING,
      confidence: 0.94,
      reasoning: `Recurring auto-debit mandate execution dropped (${code}). Governed by RBI pre-debit rules. Requires 24-hour compliance window before secondary debit attempt.`,
      suggestedRetryDelaySeconds: 86400 * 2, // 48h compliance window
    };
  }

  // 6. Default Fallback
  return {
    category: DeclineCategory.SOFT,
    isRetryable: true,
    recommendedAction: "RETRY",
    initialStage: RecoveryStage.ANALYZING,
    confidence: 0.60,
    reasoning: `Unrecognized error code (${code}) on gateway ${gateway}. Defaulting to conservative soft retry sequence with standard backoff.`,
    suggestedRetryDelaySeconds: 3600 * 4, // 4 hours default
  };
}

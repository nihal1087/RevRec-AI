/**
 * payment.types.ts — Payment & Subscription Domain Interfaces
 *
 * These interfaces mirror the database schema but are decoupled from the ORM.
 * WHY: We don't want Prisma types leaking into the frontend or agent layer.
 * The ORM layer maps DB records → these pure interfaces, keeping domain logic
 * free of persistence concerns (Clean Architecture's Domain layer).
 */

import { DeclineCategory, PaymentStatus, RiskTier } from "./enums";

// ─────────────────────────────────────────────────────────────────────────────
// CORE MONEY TYPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MoneyAmount represents all monetary values in the system.
 *
 * WHY INTEGER PAISE, NOT FLOAT RUPEES:
 * Floating point arithmetic is DANGEROUS with money.
 *   0.1 + 0.2 = 0.30000000000000004  ← This would be a real financial bug.
 * We store everything in the smallest currency unit (paise for INR).
 * ₹100.50 is stored as 10050 paise. Division happens only at display time.
 */
export interface MoneyAmount {
  readonly valueInPaise: number; // Always integer, never float
  readonly currency: "INR";      // Only INR for now, ready to extend
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

export interface Customer {
  readonly id: string;
  readonly externalId: string;      // Razorpay customer ID (e.g., cust_xxxxx)
  readonly name: string;
  readonly email: string;
  readonly phone: string;           // E.164 format: +919876543210
  readonly riskScore: number;       // 0-100: higher = higher default risk
  readonly riskTier?: RiskTier | string; // LOW / MEDIUM / HIGH
  readonly paymentHistoryScore?: number; // 0-100: past payment reliability
  readonly ltv: MoneyAmount;        // Lifetime value — informs recovery investment
  readonly preferredChannel: string; // WhatsApp / SMS / Email
  readonly createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface Payment {
  readonly id: string;
  readonly externalId: string;       // Gateway payment ID (e.g., pay_xxxxx)
  readonly customerId: string;
  readonly subscriptionId?: string;  // Linked if this is a recurring payment
  readonly invoiceId?: string;       // Linked if this is a B2B invoice payment
  readonly amount: MoneyAmount;
  readonly status: PaymentStatus;
  readonly gateway: string;          // razorpay | stripe | paytm
  readonly gatewayErrorCode?: string; // Raw error code from gateway (e.g., "INSUFFICIENT_FUNDS")
  readonly declineCategory?: DeclineCategory; // Classified by RCA engine
  readonly idempotencyKey: string;   // Prevents double-processing
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION (Recurring Billing)
// ─────────────────────────────────────────────────────────────────────────────

export enum SubscriptionStatus {
  ACTIVE = "ACTIVE",
  PAST_DUE = "PAST_DUE",       // Last payment failed, in recovery
  CANCELLED = "CANCELLED",
  PAUSED = "PAUSED",
  EXPIRED = "EXPIRED",
}

export interface Subscription {
  readonly id: string;
  readonly externalId: string;
  readonly customerId: string;
  readonly planName: string;
  readonly amount: MoneyAmount;     // Amount charged per billing cycle
  readonly status: SubscriptionStatus;
  readonly mandateType: "ENACH" | "UPI_AUTOPAY" | "CARD";
  readonly nextBillingDate: Date;
  readonly failedAttempts: number;  // Counter resets to 0 on successful payment
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// GATEWAY ERROR CODE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The structured output of the DeclineCodeClassifier.
 * Maps a raw gateway error code to its category and recommended first action.
 */
export interface DeclineClassification {
  readonly rawCode: string;
  readonly category: DeclineCategory;
  readonly isRetryable: boolean;
  readonly recommendedInitialAction: string;
  readonly humanReadableReason: string;
}

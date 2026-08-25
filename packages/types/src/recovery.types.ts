/**
 * recovery.types.ts — Recovery Workflow & Dunning Domain Interfaces
 *
 * The RecoveryWorkflow is the central aggregate of this entire system.
 * Every payment failure creates exactly ONE RecoveryWorkflow which owns
 * the complete lifecycle of the recovery attempt for that failure event.
 */

import { DunningChannel, RecoveryMethod, RecoveryStage } from "./enums";
import { MoneyAmount } from "./payment.types";

// ─────────────────────────────────────────────────────────────────────────────
// RECOVERY WORKFLOW (Central Aggregate)
// ─────────────────────────────────────────────────────────────────────────────

export interface RecoveryWorkflow {
  readonly id: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly amountAtRisk: MoneyAmount;      // The money we're trying to recover
  readonly amountRecovered: MoneyAmount;   // Actual money collected (0 until success)
  readonly stage: RecoveryStage;
  readonly retryCount: number;             // How many auto-retries have been attempted
  readonly outreachCount: number;          // How many times we contacted the customer
  readonly recoveryMethod?: RecoveryMethod; // Set when stage = RECOVERED
  readonly haltReason?: string;            // Set when stage = HALTED
  readonly escalationReason?: string;      // Set when stage = ESCALATED
  readonly nextActionAt?: Date;            // When the next retry / outreach is scheduled
  readonly expiresAt: Date;               // Deadline: workflow auto-abandons after this
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// DUNNING CONTACT LOG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every outreach attempt to a customer is logged here.
 * WHY: Compliance requires proof that we didn't exceed RBI's contact limits.
 * This is also the data source for the DunningRuleEngine's frequency checks.
 */
export interface DunningContact {
  readonly id: string;
  readonly workflowId: string;
  readonly customerId: string;
  readonly channel: DunningChannel;
  readonly messageTemplate: string;   // Which message template was sent
  readonly sentAt: Date;
  readonly deliveredAt?: Date;
  readonly openedAt?: Date;
  readonly clickedAt?: Date;          // Customer clicked the recovery link
  readonly customerResponse?: string; // Raw customer reply (for Hinglish bot)
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMISE TO PAY (PTP)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Created when a customer commits to paying by a specific date.
 * The Hinglish bot and human agents create PTPs.
 * A background job monitors promise breaches and re-triggers dunning.
 */
export interface PromiseToPay {
  readonly id: string;
  readonly workflowId: string;
  readonly customerId: string;
  readonly promisedAmount: MoneyAmount;
  readonly promisedByDate: Date;        // Customer's committed payment date
  readonly status: PromiseStatus;
  readonly createdByChannel: DunningChannel;
  readonly reminderScheduledAt?: Date;  // We send a reminder 24h before promise date
  readonly fulfilledAt?: Date;          // Set when customer actually pays
  readonly breachedAt?: Date;           // Set if payment not received after promise date
  readonly createdAt: Date;
}

export enum PromiseStatus {
  ACTIVE = "ACTIVE",
  FULFILLED = "FULFILLED",   // ✅ Customer paid as promised
  BREACHED = "BREACHED",     // ❌ Promise date passed with no payment
  CANCELLED = "CANCELLED",   // Customer withdrew the promise
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Used by the Batch Simulator in Phase 4.
 * Represents the aggregate result of running a batch recovery simulation.
 */
export interface BatchSimulationResult {
  readonly batchId: string;
  readonly totalTransactions: number;
  readonly totalAtRisk: MoneyAmount;
  readonly totalRecovered: MoneyAmount;
  readonly recoveryRate: number;            // Percentage: 0-100
  readonly roiMultiplier: number;           // (Recovered - Cost) / Cost
  readonly costOfRecovery: MoneyAmount;     // LLM token costs + outreach costs
  readonly byMethod: RecoveryMethodBreakdown[];
  readonly byDeclineCategory: DeclineCategoryBreakdown[];
  readonly durationMs: number;
}

export interface RecoveryMethodBreakdown {
  readonly method: RecoveryMethod;
  readonly count: number;
  readonly amountRecovered: MoneyAmount;
}

export interface DeclineCategoryBreakdown {
  readonly category: string;
  readonly count: number;
  readonly recovered: number;
  readonly abandoned: number;
}

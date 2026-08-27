/**
 * services/retrySequencer.service.ts — Smart Retry Sequencer & Schedule Calculator
 *
 * Implements intelligent, regulation-compliant retry scheduling:
 * 1. Category-specific backoff policies (SOFT, NETWORK, MANDATE)
 * 2. Salary cycle alignment (1st, 5th, 30th/31st of month for consumer balance recoveries)
 * 3. Decorrelated jitter to eliminate thundering-herd retry storms on banking partners
 * 4. RBI 24-hour pre-debit mandate compliance constraints
 * 5. Indian banking maintenance window evasion
 */

import { DeclineCategory } from "@revrec/types";
import { shiftPastBankMaintenance } from "./bankHealth.service";

export interface RetryScheduleCalculation {
  readonly shouldRetry: boolean;
  readonly attemptNumber: number;
  readonly scheduledAt: Date | null;
  readonly delaySeconds: number;
  readonly strategyUsed: "SALARY_CYCLE_ALIGNED" | "EXPONENTIAL_JITTER" | "FAST_NETWORK_RETRY" | "MANDATE_COMPLIANT_RETRY" | "MAX_ATTEMPTS_EXCEEDED" | "NON_RETRYABLE";
  readonly reasoning: string;
}

export interface RetryContext {
  readonly category: DeclineCategory;
  readonly currentAttemptCount: number; // 0 for first failure
  readonly maxAllowedAttempts?: number;
  readonly bankCode?: string;
  readonly failureTimestamp?: Date;
  readonly customerRiskScore?: number; // 0 - 100
}

const DEFAULT_MAX_RETRIES: Record<DeclineCategory, number> = {
  [DeclineCategory.SOFT]: 3,
  [DeclineCategory.NETWORK]: 4,
  [DeclineCategory.MANDATE_FAILURE]: 3,
  [DeclineCategory.INTENT_DROP]: 0,
  [DeclineCategory.HARD]: 0,
};

/**
 * Calculates randomized jitter between min (80% of base) and max (120% of base).
 */
function applyJitter(baseSeconds: number): number {
  const min = baseSeconds * 0.8;
  const max = baseSeconds * 1.2;
  return Math.round(min + Math.random() * (max - min));
}

/**
 * Determines if a given date is near Indian salary credit dates (25th to 5th).
 * If failure happens between 24th and 30th, aligns to the 1st of the upcoming month at 09:30 AM IST.
 */
function calculateSalaryCycleAlignment(now: Date): Date | null {
  // Compute current day in IST
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  const dayOfMonth = istDate.getUTCDate();
  const currentYear = istDate.getUTCFullYear();
  const currentMonth = istDate.getUTCMonth();

  // If failed between 24th and 29th, align to the 1st of the next month at 04:00 AM UTC (09:30 AM IST)
  if (dayOfMonth >= 24 && dayOfMonth <= 29) {
    const targetMonth = currentMonth + 1;
    return new Date(Date.UTC(currentYear, targetMonth, 1, 4, 0, 0, 0));
  }

  // If failed on 30th or 31st, align to 2nd of upcoming month at 04:00 AM UTC (09:30 AM IST)
  if (dayOfMonth >= 30) {
    const targetMonth = currentMonth + 1;
    return new Date(Date.UTC(currentYear, targetMonth, 2, 4, 0, 0, 0));
  }

  return null;
}

/**
 * Computes the optimal next retry timestamp based on category, history, and banking windows.
 */
export function calculateNextRetrySchedule(context: RetryContext): RetryScheduleCalculation {
  const {
    category,
    currentAttemptCount,
    maxAllowedAttempts = DEFAULT_MAX_RETRIES[category],
    bankCode = "DEFAULT",
    failureTimestamp = new Date(),
  } = context;

  const nextAttemptNumber = currentAttemptCount + 1;

  // 1. Guard against non-retryable categories
  if (category === DeclineCategory.HARD || category === DeclineCategory.INTENT_DROP) {
    return {
      shouldRetry: false,
      attemptNumber: nextAttemptNumber,
      scheduledAt: null,
      delaySeconds: 0,
      strategyUsed: "NON_RETRYABLE",
      reasoning: `Category ${category} is non-retryable. Automated retry is disallowed by policy.`,
    };
  }

  // 2. Guard against max attempt limit
  if (nextAttemptNumber > maxAllowedAttempts) {
    return {
      shouldRetry: false,
      attemptNumber: nextAttemptNumber,
      scheduledAt: null,
      delaySeconds: 0,
      strategyUsed: "MAX_ATTEMPTS_EXCEEDED",
      reasoning: `Maximum retry limit of ${maxAllowedAttempts} attempts reached for ${category}. Escalating workflow.`,
    };
  }

  let delaySeconds: number;
  let strategy: RetryScheduleCalculation["strategyUsed"] = "EXPONENTIAL_JITTER";
  let reasoning: string;

  // 3. Category-specific scheduling logic
  if (category === DeclineCategory.NETWORK) {
    // Fast progressive backoff for network/switch outages:
    // Attempt 1: ~15 mins, Attempt 2: ~45 mins, Attempt 3: ~3 hours, Attempt 4: ~8 hours
    const baseDelays = [900, 2700, 10800, 28800];
    const base = baseDelays[currentAttemptCount] ?? 28800;
    delaySeconds = applyJitter(base);
    strategy = "FAST_NETWORK_RETRY";
    reasoning = `Network/Switch outage backoff for attempt #${nextAttemptNumber} (${Math.round(delaySeconds / 60)} mins delay with jitter).`;
  } else if (category === DeclineCategory.MANDATE_FAILURE) {
    // RBI Mandate recovery: enforce 24h+ pre-notification gap between auto-debits
    // Attempt 1: 48h, Attempt 2: 96h, Attempt 3: 144h
    const baseDelays = [86400 * 2, 86400 * 4, 86400 * 6];
    const base = baseDelays[currentAttemptCount] ?? 86400 * 3;
    delaySeconds = applyJitter(base);
    strategy = "MANDATE_COMPLIANT_RETRY";
    reasoning = `RBI Mandate compliant retry #${nextAttemptNumber} scheduled with 48h+ gap (${Math.round(delaySeconds / 3600)} hrs delay) to honor pre-debit rules.`;
  } else {
    // SOFT Declines (Insufficient Balance)
    // Check for salary cycle alignment first
    const salaryAlignedDate = calculateSalaryCycleAlignment(failureTimestamp);
    if (salaryAlignedDate && nextAttemptNumber === 1) {
      // Apply micro-jitter (between -15m and +30m) around 09:30 AM IST on salary day
      const microJitterSeconds = Math.round((Math.random() * 45 - 15) * 60);
      const alignedWithJitter = new Date(salaryAlignedDate.getTime() + microJitterSeconds * 1000);
      const finalScheduled = shiftPastBankMaintenance(alignedWithJitter, bankCode);
      const diffSeconds = Math.max(1, Math.round((finalScheduled.getTime() - failureTimestamp.getTime()) / 1000));

      return {
        shouldRetry: true,
        attemptNumber: nextAttemptNumber,
        scheduledAt: finalScheduled,
        delaySeconds: diffSeconds,
        strategyUsed: "SALARY_CYCLE_ALIGNED",
        reasoning: `End-of-month liquidity recovery: rescheduled debit to coincide with 1st of month salary credit at 09:30 AM IST.`,
      };
    }

    // Standard progressive liquidity backoff: 24h, 48h, 72h
    const baseDelays = [86400, 86400 * 2, 86400 * 3];
    const base = baseDelays[currentAttemptCount] ?? 86400 * 2;
    delaySeconds = applyJitter(base);
    strategy = "EXPONENTIAL_JITTER";
    reasoning = `Progressive soft decline backoff for attempt #${nextAttemptNumber} (${Math.round(delaySeconds / 3600)} hrs delay with jitter).`;
  }

  // 4. Calculate candidate date and shift past any Indian banking maintenance hours
  const candidateDate = new Date(failureTimestamp.getTime() + delaySeconds * 1000);
  const finalScheduledAt = shiftPastBankMaintenance(candidateDate, bankCode);
  const finalDelaySeconds = Math.max(1, Math.round((finalScheduledAt.getTime() - failureTimestamp.getTime()) / 1000));

  return {
    shouldRetry: true,
    attemptNumber: nextAttemptNumber,
    scheduledAt: finalScheduledAt,
    delaySeconds: finalDelaySeconds,
    strategyUsed: strategy,
    reasoning,
  };
}

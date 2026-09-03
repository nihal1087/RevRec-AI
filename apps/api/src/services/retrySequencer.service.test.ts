import { calculateNextRetrySchedule } from "./retrySequencer.service";
import { isBankInMaintenanceWindow } from "./bankHealth.service";
import { DeclineCategory } from "@revrec/types";

describe("Smart Retry Sequencer Service", () => {
  describe("Category Handling", () => {
    it("should refuse retries on HARD declines", () => {
      const schedule = calculateNextRetrySchedule({
        category: DeclineCategory.HARD,
        currentAttemptCount: 0,
      });

      expect(schedule.shouldRetry).toBe(false);
      expect(schedule.scheduledAt).toBeNull();
      expect(schedule.strategyUsed).toBe("NON_RETRYABLE");
    });

    it("should refuse retries on INTENT_DROP declines", () => {
      const schedule = calculateNextRetrySchedule({
        category: DeclineCategory.INTENT_DROP,
        currentAttemptCount: 0,
      });

      expect(schedule.shouldRetry).toBe(false);
      expect(schedule.scheduledAt).toBeNull();
      expect(schedule.strategyUsed).toBe("NON_RETRYABLE");
    });

    it("should schedule fast jittered retry for NETWORK errors", () => {
      // Use daytime timestamp (14:00 IST = 08:30 UTC) outside bank maintenance window (00:00-03:30 IST)
      const daytimeFailure = new Date("2026-03-15T08:30:00.000Z");
      const schedule = calculateNextRetrySchedule({
        category: DeclineCategory.NETWORK,
        currentAttemptCount: 0,
        failureTimestamp: daytimeFailure,
      });

      expect(schedule.shouldRetry).toBe(true);
      expect(schedule.scheduledAt).not.toBeNull();
      expect(schedule.strategyUsed).toBe("FAST_NETWORK_RETRY");
      // scheduledAt should be ~900s after failureTimestamp (±30% jitter)
      const diffMs = schedule.scheduledAt!.getTime() - daytimeFailure.getTime();
      expect(diffMs).toBeGreaterThanOrEqual(700 * 1000);
      expect(diffMs).toBeLessThanOrEqual(1200 * 1000);
    });

    it("should schedule 48h+ gap for MANDATE failures", () => {
      const schedule = calculateNextRetrySchedule({
        category: DeclineCategory.MANDATE_FAILURE,
        currentAttemptCount: 0,
      });

      expect(schedule.shouldRetry).toBe(true);
      expect(schedule.strategyUsed).toBe("MANDATE_COMPLIANT_RETRY");
      expect(schedule.delaySeconds).toBeGreaterThanOrEqual(86400 * 1.5);
    });
  });

  describe("Salary Cycle Alignment", () => {
    it("should align SOFT failure on 26th of month to the 1st of next month", () => {
      // 26th of March 2026 at 14:00 IST
      const failureOn26th = new Date("2026-03-26T08:30:00.000Z");

      const schedule = calculateNextRetrySchedule({
        category: DeclineCategory.SOFT,
        currentAttemptCount: 0,
        failureTimestamp: failureOn26th,
      });

      expect(schedule.shouldRetry).toBe(true);
      expect(schedule.strategyUsed).toBe("SALARY_CYCLE_ALIGNED");
      expect(schedule.scheduledAt).not.toBeNull();
      // Target is near 1st of April 2026
      expect(schedule.scheduledAt?.getUTCMonth()).toBe(3); // April in 0-indexed month
    });
  });

  describe("Max Attempt Limits", () => {
    it("should halt when SOFT decline hits 3 retry attempts", () => {
      const schedule = calculateNextRetrySchedule({
        category: DeclineCategory.SOFT,
        currentAttemptCount: 3, // Already attempted 3 times
      });

      expect(schedule.shouldRetry).toBe(false);
      expect(schedule.strategyUsed).toBe("MAX_ATTEMPTS_EXCEEDED");
    });
  });

  describe("Bank Maintenance Window Evasion", () => {
    it("should correctly identify nightly Indian maintenance hours (00:00 - 03:00 IST)", () => {
      // 01:30 AM IST is 20:00 UTC previous day
      const nightTimeIST = new Date("2026-03-15T20:00:00.000Z");
      expect(isBankInMaintenanceWindow(nightTimeIST, "HDFC")).toBe(true);

      // 14:00 PM IST is 08:30 UTC
      const dayTimeIST = new Date("2026-03-15T08:30:00.000Z");
      expect(isBankInMaintenanceWindow(dayTimeIST, "HDFC")).toBe(false);
    });
  });
});

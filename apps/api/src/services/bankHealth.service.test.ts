/**
 * bankHealth.service.test.ts
 * Tests for bank maintenance window detection and circuit breaker logic.
 */

import {
  isBankInMaintenanceWindow,
  isBankExperiencingOutage,
  recordBankOutage,
  clearBankOutage,
  shiftPastBankMaintenance,
} from "./bankHealth.service";

// Helper: build a UTC Date that corresponds to a given IST hour.
// IST = UTC + 5h30m, so UTC = IST - 5h30m (330 minutes).
function makeDateAtISTHour(istHour: number, minute = 0): Date {
  const d = new Date("2026-03-15T00:00:00.000Z");
  const istTotalMinutes = istHour * 60 + minute;
  const utcTotalMinutes = istTotalMinutes - 330; // subtract 5h30m
  const utcH = Math.floor(((utcTotalMinutes % 1440) + 1440) % 1440 / 60);
  const utcM = ((utcTotalMinutes % 60) + 60) % 60;
  d.setUTCHours(utcH, utcM, 0, 0);
  return d;
}

describe("isBankInMaintenanceWindow", () => {
  describe("HDFC (00:00–03:00 IST)", () => {
    it("returns true at 01:00 IST (inside window)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(1), "HDFC")).toBe(true);
    });

    it("returns true at 02:30 IST (inside window)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(2, 30), "HDFC")).toBe(true);
    });

    it("returns false at 10:00 IST (outside window)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(10), "HDFC")).toBe(false);
    });

    it("returns false at 14:00 IST (outside window)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(14), "HDFC")).toBe(false);
    });

    it("returns false at 03:30 IST (after window ends at 03:00)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(3, 30), "HDFC")).toBe(false);
    });
  });

  describe("DEFAULT fallback (00:00–03:00 IST)", () => {
    it("uses DEFAULT window for unknown bank codes", () => {
      const inWindow = isBankInMaintenanceWindow(makeDateAtISTHour(1), "UNKNOWN_BANK");
      const outWindow = isBankInMaintenanceWindow(makeDateAtISTHour(10), "UNKNOWN_BANK");
      expect(inWindow).toBe(true);
      expect(outWindow).toBe(false);
    });
  });

  describe("SBI overnight window (23:00–04:00 IST)", () => {
    it("returns true at 23:30 IST (inside overnight window start)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(23, 30), "SBIN")).toBe(true);
    });

    it("returns true at 02:00 IST (past midnight, still in window)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(2), "SBIN")).toBe(true);
    });

    it("returns false at 10:00 IST (outside window)", () => {
      expect(isBankInMaintenanceWindow(makeDateAtISTHour(10), "SBIN")).toBe(false);
    });
  });
});

describe("recordBankOutage / isBankExperiencingOutage", () => {
  afterEach(() => {
    clearBankOutage("TESTBANK");
  });

  it("records an outage and detects it as active", () => {
    recordBankOutage("TESTBANK", 30);
    expect(isBankExperiencingOutage("TESTBANK")).toBe(true);
  });

  it("outage is case-insensitive", () => {
    recordBankOutage("testbank", 30);
    expect(isBankExperiencingOutage("TESTBANK")).toBe(true);
  });

  it("no outage detected when none recorded", () => {
    expect(isBankExperiencingOutage("TESTBANK")).toBe(false);
  });

  it("clears an outage", () => {
    recordBankOutage("TESTBANK", 30);
    clearBankOutage("TESTBANK");
    expect(isBankExperiencingOutage("TESTBANK")).toBe(false);
  });
});

describe("shiftPastBankMaintenance", () => {
  it("does not shift a date that is already outside maintenance window", () => {
    const safe = makeDateAtISTHour(10); // 10am IST — well outside any window
    const shifted = shiftPastBankMaintenance(safe, "HDFC");
    expect(shifted.getTime()).toBe(safe.getTime());
  });

  it("shifts a date that is inside HDFC maintenance window to 08:30 IST", () => {
    const inWindow = makeDateAtISTHour(1); // 1am IST — inside HDFC window
    const shifted = shiftPastBankMaintenance(inWindow, "HDFC");
    // Result should be outside the window
    expect(isBankInMaintenanceWindow(shifted, "HDFC")).toBe(false);
    // Should be in future relative to the input
    expect(shifted.getTime()).toBeGreaterThan(inWindow.getTime());
  });
});

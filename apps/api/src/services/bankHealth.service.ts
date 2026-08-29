/**
 * services/bankHealth.service.ts — Indian Banking Network Health & Maintenance Guard
 *
 * Prevents retrying transactions during known nightly batch maintenance windows
 * (typically 00:00 - 03:30 IST) or active degraded switch states across major
 * Indian banks (HDFC, SBI, ICICI, Axis, Kotak).
 */

export interface BankMaintenanceWindow {
  readonly bankCode: string;
  readonly startHourIST: number; // 0-23
  readonly endHourIST: number;   // 0-23
  readonly description: string;
}

// Known recurring Indian core banking system (CBS) maintenance hours in Indian Standard Time (UTC+5:30)
const KNOWN_MAINTENANCE_WINDOWS: Record<string, BankMaintenanceWindow> = {
  HDFC: { bankCode: "HDFC", startHourIST: 0, endHourIST: 3, description: "HDFC Nightly CBS Batch & UPI Sync" },
  SBIN: { bankCode: "SBIN", startHourIST: 23, endHourIST: 4, description: "SBI Core Banking Nightly Reconciliation" },
  ICIC: { bankCode: "ICIC", startHourIST: 1, endHourIST: 3, description: "ICICI Switch Maintenance Window" },
  UTIB: { bankCode: "UTIB", startHourIST: 0, endHourIST: 2, description: "Axis Bank Nightly Batch Processing" },
  KKBK: { bankCode: "KKBK", startHourIST: 1, endHourIST: 3, description: "Kotak Mahindra Maintenance" },
  DEFAULT: { bankCode: "DEFAULT", startHourIST: 0, endHourIST: 3, description: "General Interbank Clearing Window" },
};

// In-memory registry for transient live outages (simulated or updated by gateway health pings)
const liveBankOutages = new Map<string, { reportedAt: Date; estimatedRecoveryMinutes: number }>();

/**
 * Checks if a given timestamp falls within Indian banking nightly maintenance.
 */
export function isBankInMaintenanceWindow(date: Date, bankCode: string = "DEFAULT"): boolean {
  // Convert date to IST hours (UTC + 5.5 hours)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const istHour = istDate.getUTCHours();

  const window = KNOWN_MAINTENANCE_WINDOWS[bankCode.toUpperCase()] ?? KNOWN_MAINTENANCE_WINDOWS["DEFAULT"];
  if (!window) return false;

  if (window.startHourIST <= window.endHourIST) {
    return istHour >= window.startHourIST && istHour < window.endHourIST;
  } else {
    // Overnight window (e.g. 23:00 to 04:00)
    return istHour >= window.startHourIST || istHour < window.endHourIST;
  }
}

/**
 * Checks if a bank has an active transient outage.
 */
export function isBankExperiencingOutage(bankCode: string): boolean {
  const outage = liveBankOutages.get(bankCode.toUpperCase());
  if (!outage) return false;

  const expiry = new Date(outage.reportedAt.getTime() + outage.estimatedRecoveryMinutes * 60 * 1000);
  if (Date.now() > expiry.getTime()) {
    liveBankOutages.delete(bankCode.toUpperCase());
    return false;
  }

  return true;
}

/**
 * Records a bank outage (used when multiple consecutive gateway timeouts are detected).
 */
export function recordBankOutage(bankCode: string, recoveryMinutes: number = 30): void {
  liveBankOutages.set(bankCode.toUpperCase(), {
    reportedAt: new Date(),
    estimatedRecoveryMinutes: recoveryMinutes,
  });
}

/**
 * Clears recorded outage for testing or recovery confirmation.
 */
export function clearBankOutage(bankCode: string): void {
  liveBankOutages.delete(bankCode.toUpperCase());
}

/**
 * Adjusts a candidate retry date forward so it lands outside of maintenance windows
 * and outside of quiet night hours, targeting a high-liquidity window (09:00 - 18:00 IST).
 */
export function shiftPastBankMaintenance(candidateDate: Date, bankCode: string = "DEFAULT"): Date {
  let adjusted = new Date(candidateDate.getTime());

  // If the bank is in an active outage, add outage recovery buffer
  if (isBankExperiencingOutage(bankCode)) {
    const outage = liveBankOutages.get(bankCode.toUpperCase());
    if (outage) {
      adjusted = new Date(outage.reportedAt.getTime() + (outage.estimatedRecoveryMinutes + 10) * 60 * 1000);
    }
  }

  // If candidate time lands in nightly maintenance window, push to 08:30 AM IST of the same or next morning
  if (isBankInMaintenanceWindow(adjusted, bankCode)) {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    // Shift to IST time domain so we can work with IST hours
    const istTime = new Date(adjusted.getTime() + istOffsetMs);

    // Set to 08:30 AM IST — this is UTC hour 8, minute 30 (we then subtract the offset)
    // Using setUTCHours on istTime (which is already offset to IST) correctly sets the IST hour.
    istTime.setUTCHours(8, 30, 0, 0);

    // Convert back to UTC
    let targetUtc = new Date(istTime.getTime() - istOffsetMs);

    // If 08:30 IST today is already in the past relative to the adjusted time,
    // move to 08:30 IST the next morning
    if (targetUtc.getTime() <= adjusted.getTime()) {
      istTime.setUTCDate(istTime.getUTCDate() + 1);
      targetUtc = new Date(istTime.getTime() - istOffsetMs);
    }

    adjusted = targetUtc;
  }

  return adjusted;
}

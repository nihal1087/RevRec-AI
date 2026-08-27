/**
 * services/agent/dunningRules.ts — Dunning Compliance & Policy Guard
 *
 * Enforces regulatory mandates (RBI, TRAI DND) and merchant business bounds:
 * 1. Max 3 contacts per 7-day rolling window (RBI Fair Practices Code)
 * 2. Strict quiet hours (20:00 to 08:00 IST) for voice/SMS/WhatsApp
 * 3. Max concession cap (max 10% or ₹500 discount without supervisor authorization)
 * 4. Minimum 4-hour channel cooldown
 * 5. Suppression during active Promise-to-Pay (PTP) commitments
 */

import { AgentToolInput, AgentToolName, DeclineCategory, DunningChannel } from "@revrec/types";
import { prisma, PromiseStatus } from "@revrec/db";

export interface PolicyCheckResult {
  readonly allowed: boolean;
  readonly ruleName: string;
  readonly violationReason?: string;
  readonly recommendedAlternative?: AgentToolInput;
}

export interface DunningContext {
  readonly customerId: string;
  readonly workflowId: string;
  readonly amountAtRiskInPaise: number;
  readonly declineCategory?: DeclineCategory;
  readonly targetTimestamp?: Date;
}

const MAX_CONTACTS_PER_7_DAYS = 3;
const MIN_CHANNEL_COOLDOWN_HOURS = 4;
const MAX_AUTO_DISCOUNT_PERCENT = 10; // 10%
const MAX_AUTO_DISCOUNT_PAISE = 50000; // ₹500 in paise

/**
 * Checks if the given timestamp falls inside TRAI quiet hours (20:00 to 08:00 IST).
 */
export function isInsideQuietHours(date: Date = new Date()): boolean {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const istHour = istDate.getUTCHours();

  // Quiet hours: 20:00 (8 PM) to 08:00 (8 AM) IST
  return istHour >= 20 || istHour < 8;
}

/**
 * Evaluates an AI Agent tool input against all compliance and business rules.
 */
export async function validateAgentAction(
  toolInput: AgentToolInput,
  context: DunningContext
): Promise<PolicyCheckResult> {
  const now = context.targetTimestamp ?? new Date();

  // ── 1. HARD DECLINE RETRY GUARD ──────────────────────────────────────────
  if (
    toolInput.tool === AgentToolName.RETRY_PAYMENT &&
    context.declineCategory === DeclineCategory.HARD
  ) {
    return {
      allowed: false,
      ruleName: "HARD_DECLINE_RETRY_PROHIBITED",
      violationReason: "Automated retry attempted on a HARD decline (expired/stolen card). Prohibited by card network rules.",
      recommendedAlternative: {
        tool: AgentToolName.HALT_DUNNING,
        reason: "Hard decline detected — customer must update payment method.",
        writeOff: false,
      },
    };
  }

  // ── 2. ACTIVE PROMISE TO PAY SUPPRESSION GUARD ───────────────────────────
  if (
    toolInput.tool === AgentToolName.SEND_WHATSAPP_RECOVERY_LINK ||
    toolInput.tool === AgentToolName.RETRY_PAYMENT
  ) {
    const activePromise = await prisma.promiseToPay.findFirst({
      where: {
        customerId: context.customerId,
        status: PromiseStatus.ACTIVE,
        promisedByDate: { gt: now },
      },
    });

    if (activePromise) {
      return {
        allowed: false,
        ruleName: "ACTIVE_PROMISE_TO_PAY_SUPPRESSION",
        violationReason: `Customer committed to pay by ${activePromise.promisedByDate.toISOString().split("T")[0]}. Dunning suppressed until promise date.`,
      };
    }
  }

  // ── 3. QUIET HOURS OUTREACH GUARD (TRAI DND) ─────────────────────────────
  if (toolInput.tool === AgentToolName.SEND_WHATSAPP_RECOVERY_LINK) {
    if (isInsideQuietHours(now)) {
      return {
        allowed: false,
        ruleName: "TRAI_QUIET_HOURS_VIOLATION",
        violationReason: "Direct customer outreach (WhatsApp/SMS/Voice) is prohibited between 20:00 and 08:00 IST by TRAI DND regulations.",
        recommendedAlternative: {
          tool: AgentToolName.RETRY_PAYMENT,
          delayMinutes: 720, // 12 hours delay
          reason: "Outreach shifted to morning business hours (09:00 AM IST).",
        },
      };
    }
  }

  // ── 4. RBI 7-DAY CONTACT FREQUENCY CAP ──────────────────────────────────
  if (toolInput.tool === AgentToolName.SEND_WHATSAPP_RECOVERY_LINK) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentContactsCount = await prisma.dunningContact.count({
      where: {
        customerId: context.customerId,
        sentAt: { gte: sevenDaysAgo },
      },
    });

    if (recentContactsCount >= MAX_CONTACTS_PER_7_DAYS) {
      return {
        allowed: false,
        ruleName: "RBI_MAX_CONTACT_FREQUENCY_EXCEEDED",
        violationReason: `Customer has already been contacted ${recentContactsCount} times in the last 7 days. Exceeds RBI Fair Practices limit of ${MAX_CONTACTS_PER_7_DAYS}.`,
        recommendedAlternative: {
          tool: AgentToolName.ESCALATE_TO_HUMAN,
          priority: "MEDIUM",
          escalationReason: "Max automated contact frequency reached. Requires manual customer evaluation.",
          suggestedAction: "Pause automated messages and review customer payment history.",
        },
      };
    }

    // ── 5. CHANNEL COOLDOWN CHECK (MIN 4 HOURS) ───────────────────────────
    const fourHoursAgo = new Date(now.getTime() - MIN_CHANNEL_COOLDOWN_HOURS * 60 * 60 * 1000);
    const recentSameChannelContact = await prisma.dunningContact.findFirst({
      where: {
        customerId: context.customerId,
        channel: DunningChannel.WHATSAPP,
        sentAt: { gte: fourHoursAgo },
      },
      orderBy: { sentAt: "desc" },
    });

    if (recentSameChannelContact) {
      return {
        allowed: false,
        ruleName: "CHANNEL_COOLDOWN_ACTIVE",
        violationReason: `Channel WHATSAPP was contacted less than ${MIN_CHANNEL_COOLDOWN_HOURS} hours ago. Cooldown in effect.`,
      };
    }
  }

  // ── 6. CONCESSION / DISCOUNT CAP GUARD ──────────────────────────────────
  if (toolInput.tool === AgentToolName.APPLY_PARTIAL_SETTLEMENT) {
    const discountPaise = context.amountAtRiskInPaise - toolInput.settlementAmountInPaise;
    const maxAllowedDiscount = Math.min(
      Math.round((context.amountAtRiskInPaise * MAX_AUTO_DISCOUNT_PERCENT) / 100),
      MAX_AUTO_DISCOUNT_PAISE
    );

    if (toolInput.discountPercent > MAX_AUTO_DISCOUNT_PERCENT || discountPaise > maxAllowedDiscount) {
      return {
        allowed: false,
        ruleName: "DISCOUNT_CAP_EXCEEDED",
        violationReason: `Requested discount of ${toolInput.discountPercent}% (₹${discountPaise / 100}) exceeds allowed autonomous concession cap (Max: ₹${maxAllowedDiscount / 100} or 10%).`,
        recommendedAlternative: {
          tool: AgentToolName.APPLY_PARTIAL_SETTLEMENT,
          settlementAmountInPaise: context.amountAtRiskInPaise - maxAllowedDiscount,
          discountPercent: MAX_AUTO_DISCOUNT_PERCENT,
          validForHours: toolInput.validForHours,
          justification: `Adjusted to maximum autonomous cap (${MAX_AUTO_DISCOUNT_PERCENT}%).`,
        },
      };
    }
  }

  // ── ALL CHECKS PASSED ───────────────────────────────────────────────────
  return {
    allowed: true,
    ruleName: "ALL_POLICIES_PASSED",
  };
}

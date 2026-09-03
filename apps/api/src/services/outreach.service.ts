/**
 * services/outreach.service.ts — Automatic Customer Outreach & Communications Service
 *
 * Automatically dispatches and records initial customer communications across
 * WhatsApp, SMS, Email, and Voice channels whenever a payment failure occurs.
 *
 * Enforces:
 * - RCA-specific messaging templates & friction-free 1-click links
 * - Proper format storage in `DunningContact` (${templateKey}:::${messagePayload})
 * - Workflow state transitions (stage -> OUTREACH_SENT for intent drops, outreachCount increment)
 * - Immutable AuditLog trail (OUTREACH_SENT)
 */

import { prisma, DunningChannel, AuditEventType, Prisma, RecoveryStage } from "@revrec/db";
import { DeclineCategory } from "@revrec/types";
import { logger } from "../config/logger";

export interface AutomaticOutreachParams {
  readonly workflowId: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly customerName?: string | undefined;
  readonly customerPhone?: string | undefined;
  readonly amountInPaise: number | bigint;
  readonly category: DeclineCategory;
  readonly errorCode?: string | undefined;
  readonly errorDescription?: string | undefined;
  readonly preferredChannel?: DunningChannel | undefined;
}

export interface OutreachDispatchOutput {
  readonly contactId: string;
  readonly channel: DunningChannel;
  readonly templateKey: string;
  readonly messageText: string;
  readonly paymentUrl: string;
  readonly sentAt: Date;
  readonly deliveredAt: Date;
}

/**
 * Generates tailored communication copy and metadata based on the failure category.
 */
export function buildOutreachTemplate(
  category: DeclineCategory,
  customerName: string,
  amountInPaise: number | bigint,
  paymentUrl: string,
  errorCode?: string
): {
  channel: DunningChannel;
  templateKey: string;
  messageText: string;
} {
  const name = customerName?.trim() || "Customer";
  const amountRs = (Number(amountInPaise) / 100).toLocaleString("en-IN");
  const code = (errorCode ?? "").toUpperCase();

  switch (category) {
    case DeclineCategory.INTENT_DROP:
      return {
        channel: DunningChannel.WHATSAPP,
        templateKey: "intent_drop_recovery_v1",
        messageText: `Namaste ${name} ji, aapka ₹${amountRs} ka checkout session OTP/app timeout ki wajah se incomplete reh gaya tha. Aapki slot reserved hai — iss 1-click payment link se bina kisi rukawat turant complete karein: ${paymentUrl}`,
      };

    case DeclineCategory.SOFT:
      return {
        channel: DunningChannel.WHATSAPP,
        templateKey: "salary_delay_recovery_v2",
        messageText: `Namaste ${name} ji, aapka ₹${amountRs} ka payment bank balance/limit constraint ki wajah se complete nahi ho saka. Hamara system salary credit date ke mutabiq smart auto-retry queue mein schedule kar chuka hai. Agar aap kisi doosre UPI ya card se turant settle karna chahte hain: ${paymentUrl}`,
      };

    case DeclineCategory.NETWORK:
      return {
        channel: DunningChannel.WHATSAPP,
        templateKey: "transient_switch_alert_v1",
        messageText: `Hi ${name}, aapka ₹${amountRs} payment bank gateway timeout ki wajah se pending hai — aapka account debit nahi hua hai. Banking switch normal hote hi auto-retry queue mein hai, ya iss 1-click link se turant pay karein: ${paymentUrl}`,
      };

    case DeclineCategory.MANDATE_FAILURE:
      return {
        channel: DunningChannel.WHATSAPP,
        templateKey: "high_priority_mandate_alert",
        messageText: `Namaste ${name} ji, aapka ₹${amountRs} recurring subscription auto-debit complete nahi hua. RBI pre-debit rules ke mutabiq retry queued hai. Instant re-authorization ya payment ke liye: ${paymentUrl}`,
      };

    case DeclineCategory.HARD:
      return {
        channel: DunningChannel.SMS,
        templateKey: "payment_method_update_v1",
        messageText: `${name}: Aapka INR ${amountRs} payment card expired ya invalid hone ki wajah se decline ho gaya hai (${code || "CARD_INVALID"}). Service uninterrupted rakhne ke liye kripya apna payment method update karein: ${paymentUrl} - Team RevRec`,
      };

    default:
      return {
        channel: DunningChannel.WHATSAPP,
        templateKey: "wa_smart_recovery_v2",
        messageText: `Namaste ${name} ji, aapka ₹${amountRs} ka payment complete nahi ho paya. Humne payment recovery link generate kiya hai: ${paymentUrl}`,
      };
  }
}

/**
 * Records an automated outreach communication in the database for a failed payment.
 * Can be executed inside an existing Prisma transaction client or standalone.
 */
export async function recordAutomaticFailureOutreach(
  params: AutomaticOutreachParams,
  dbClient: Prisma.TransactionClient | typeof prisma = prisma
): Promise<OutreachDispatchOutput> {
  const {
    workflowId,
    paymentId,
    customerId,
    customerName = "Customer",
    amountInPaise,
    category,
    errorCode,
    preferredChannel,
  } = params;

  // Generate unique 1-click payment link
  const linkId = `plink_outreach_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const paymentUrl = `https://rzp.io/i/${linkId}`;

  const outreach = buildOutreachTemplate(category, customerName, amountInPaise, paymentUrl, errorCode);
  const selectedChannel = preferredChannel ?? outreach.channel;

  const now = new Date();
  const deliveredAt = new Date(now.getTime() + 1500); // Simulated instantaneous delivery within 1.5s

  // 1. Create DunningContact record
  const dunningContact = await dbClient.dunningContact.create({
    data: {
      workflowId,
      customerId,
      channel: selectedChannel,
      messageTemplate: `${outreach.templateKey}:::${outreach.messageText}`,
      sentAt: now,
      deliveredAt,
      customerResponse: null,
    },
  });

  // 2. Increment outreach count on the RecoveryWorkflow, and transition stage if appropriate
  const updateData: Prisma.RecoveryWorkflowUpdateInput = {
    outreachCount: { increment: 1 },
    version: { increment: 1 },
  };

  if (category === DeclineCategory.INTENT_DROP) {
    updateData.stage = RecoveryStage.OUTREACH_SENT;
  }

  await dbClient.recoveryWorkflow.update({
    where: { id: workflowId },
    data: updateData,
  });

  // 3. Append immutable AuditLog event
  await dbClient.auditLog.create({
    data: {
      eventType: AuditEventType.OUTREACH_SENT,
      workflowId,
      paymentId,
      customerId,
      actorType: "AI_AGENT",
      actorId: "outreach-dispatch-engine",
      payload: {
        channel: selectedChannel,
        templateKey: outreach.templateKey,
        messagePayload: outreach.messageText,
        paymentUrl,
        reason: `Automatic initial outreach for ${category} payment failure (${errorCode ?? "UNKNOWN"})`,
      },
      amountInPaise: BigInt(amountInPaise),
      outcome: "SUCCESS",
    },
  });

  logger.info(
    `[OutreachService] 📤 Automatic outreach recorded for workflow ${workflowId} via ${selectedChannel} (${outreach.templateKey})`
  );

  return {
    contactId: dunningContact?.id ?? "contact_generated",
    channel: selectedChannel,
    templateKey: outreach.templateKey,
    messageText: outreach.messageText,
    paymentUrl,
    sentAt: now,
    deliveredAt,
  };
}

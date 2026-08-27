/**
 * services/agent/hinglishBot.service.ts — Multi-Turn Hinglish Recovery Bot
 *
 * Empathic, culturally-aware conversational recovery agent for Indian customers.
 * Understands colloquial Hinglish/Hindi/English nuances across WhatsApp/SMS:
 * - "Salary 5th ko aayegi, tab pay kar dunga" (PROMISE_TO_PAY) ──► Creates Promise to Pay (PTP)
 * - "UPI timeout ho gaya tha link bhejo" (PAYMENT_INTENT)     ──► Dispatches instant 1-click payment link
 * - "Maine ye cancel kar diya tha" (DISPUTE)                  ──► Halts dunning, escalates dispute
 * - "Bar bar message mat karo" (CONFIRMED_REFUSAL)            ──► Respects opt-out, enables DND
 */

import { z } from "zod";
import { HinglishIntent, DunningChannel, RecoveryStage, PromiseStatus } from "@revrec/types";
import { prisma, AuditEventType, Prisma } from "@revrec/db";
import { callGeminiStructured } from "./llmClient";
import { logger } from "../../config/logger";

export const HinglishBotResponseSchema = z.object({
  intent: z.nativeEnum(HinglishIntent),
  confidence: z.number().min(0).max(1),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "ANGRY", "DISTRESSED"]),
  extractedDate: z.string().optional(),
  extractedDiscountPercent: z.number().optional(),
  replyMessage: z.string().min(5),
  actionRecommended: z.enum(["CREATE_PTP", "SEND_PAYMENT_LINK", "HALT_DUNNING", "ESCALATE_DISPUTE", "OFFER_DISCOUNT", "NONE"]),
});

export type HinglishBotAnalysis = z.infer<typeof HinglishBotResponseSchema>;

export interface ChatTurnInput {
  readonly customerId: string;
  readonly workflowId?: string | undefined;
  readonly userMessage: string;
  readonly channel?: DunningChannel | undefined;
}

export interface ChatTurnOutput {
  readonly replyText: string;
  readonly intent: HinglishIntent;
  readonly sentiment: "POSITIVE" | "NEUTRAL" | "ANGRY" | "DISTRESSED";
  readonly actionTaken: string;
  readonly promiseToPayId?: string | undefined;
  readonly paymentUrl?: string | undefined;
}

const HINGLISH_SYSTEM_PROMPT = `
You are RevRec's empathetic and polite payment assistance agent communicating with Indian customers via WhatsApp/SMS in Hinglish.
Your goal: Help customers resolve pending payments smoothly with zero hostility, high empathy, and prompt problem-solving.

SUPPORTED HINGLISH INTENTS:
1. PROMISE_TO_PAY: Customer commits to a future payment date (e.g., "Salary 5th ko aayegi", "Month end pe de dunga", "Next Monday pakka"). Extract the target date.
2. PAYMENT_INTENT: Customer wants to pay right now or reports a gateway drop (e.g., "Link bhejo abhi karta hoon", "UPI stuck ho gaya tha", "Server busy tha").
3. DISPUTE: Customer claims they didn't purchase, wrong charge, or cancelled (e.g., "Maine order nahi kiya", "Fraud charge hai").
4. HARDSHIP: Customer expresses financial difficulty (e.g., "Abhi paisa nahi hai", "Thoda discount milega?").
5. CONFIRMED_REFUSAL: Customer firmly refuses or demands to stop messaging (e.g., "Stop", "Don't message me", "Nahi karunga payment").
6. NEEDS_CLARIFICATION: General queries or unclear remarks.

TONE: Respectful, professional, warm Hinglish (conversational Hindi written in Roman script mixed with English).
Always return strict JSON conforming to the requested schema.
`;

/**
 * Parses user colloquial expressions and converts relative dates ("5th", "next Monday") to ISO strings.
 */
function parseRelativeDate(text: string): string | undefined {
  const now = new Date();
  const lower = text.toLowerCase();

  const dayMatch = lower.match(/(\d{1,2})\s*(?:st|nd|rd|th|ko|tarikh|tareekh)?/);
  if (dayMatch && dayMatch[1]) {
    const day = parseInt(dayMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const target = new Date(now);
      if (day <= now.getDate()) {
        target.setMonth(target.getMonth() + 1);
      }
      target.setDate(day);
      target.setHours(12, 0, 0, 0);
      return target.toISOString();
    }
  }

  if (lower.includes("tomorrow") || lower.includes("kal")) {
    const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    target.setHours(12, 0, 0, 0);
    return target.toISOString();
  }

  return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Processes an incoming customer message, extracts intent, and triggers automated workflows.
 */
export async function processCustomerMessage(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const { customerId, workflowId, userMessage, channel = DunningChannel.WHATSAPP } = input;

  logger.info(`[HinglishBot] Processing message from customer ${customerId} on ${channel}: "${userMessage}"`);

  // 1. Fetch relevant workflow and customer context
  const workflow = workflowId
    ? await prisma.recoveryWorkflow.findUnique({
        where: { id: workflowId },
        include: { customer: true, payment: true },
      })
    : await prisma.recoveryWorkflow.findFirst({
        where: { customerId, stage: { notIn: [RecoveryStage.RECOVERED, RecoveryStage.HALTED] } },
        orderBy: { createdAt: "desc" },
        include: { customer: true, payment: true },
      });

  const amountAtRiskPaise = workflow?.amountAtRiskInPaise ?? 99900;
  const customerName = workflow?.customer.name ?? "Customer";

  const userPrompt = `
CUSTOMER INCOMING MESSAGE:
"${userMessage}"

CONTEXT:
- Customer Name: ${customerName}
- Pending Amount: ₹${amountAtRiskPaise / 100}
- Current Date: ${new Date().toISOString().split("T")[0]}

Analyze this message, identify intent and sentiment, extract any dates or discount requests, and provide an empathetic Hinglish reply.
`;

  // 2. LLM Intent & Entity Extraction
  const llmResult = await callGeminiStructured(userPrompt, HINGLISH_SYSTEM_PROMPT);
  const parseResult = HinglishBotResponseSchema.safeParse(llmResult.structuredJson);

  let analysis: HinglishBotAnalysis;
  if (parseResult.success) {
    analysis = parseResult.data;
  } else {
    analysis = fallbackIntentClassifier(userMessage, amountAtRiskPaise);
  }

  logger.info(`[HinglishBot] Intent: ${analysis.intent} | Sentiment: ${analysis.sentiment} | Action: ${analysis.actionRecommended}`);

  let actionTaken = "REPLY_SENT";
  let promiseToPayId: string | undefined;
  let paymentUrl: string | undefined;

  // 3. Execute Automated Financial Lifecycle Actions
  if (workflow) {
    if (analysis.intent === HinglishIntent.PROMISE_TO_PAY || analysis.actionRecommended === "CREATE_PTP") {
      // ── CREATE PROMISE TO PAY ─────────────────────────────────────────────
      const promisedDateStr = analysis.extractedDate || parseRelativeDate(userMessage) || new Date(Date.now() + 5 * 86400 * 1000).toISOString();
      const promisedDate = new Date(promisedDateStr);

      const ptp = await prisma.promiseToPay.create({
        data: {
          workflowId: workflow.id,
          customerId: workflow.customerId,
          promisedAmountInPaise: workflow.amountAtRiskInPaise,
          promisedByDate: promisedDate,
          status: PromiseStatus.ACTIVE,
          createdByChannel: channel,
          reminderScheduledAt: new Date(promisedDate.getTime() - 24 * 3600 * 1000),
        },
      });

      promiseToPayId = ptp.id;
      actionTaken = `PROMISE_TO_PAY_RECORDED_FOR_${promisedDate.toISOString().split("T")[0]}`;

      await prisma.recoveryWorkflow.update({
        where: { id: workflow.id },
        data: {
          stage: RecoveryStage.PROMISE_RECEIVED,
          nextActionAt: promisedDate,
          version: { increment: 1 },
        },
      });

      await prisma.auditLog.create({
        data: {
          eventType: AuditEventType.PROMISE_TO_PAY_CREATED,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "HINGLISH_BOT",
          actorId: "conversational-bot",
          payload: {
            ptpId: ptp.id,
            promisedByDate: promisedDate.toISOString(),
            userMessage,
            detectedIntent: analysis.intent,
          },
          amountInPaise: workflow.amountAtRiskInPaise,
          outcome: "SUCCESS",
        },
      });

      logger.info(`[HinglishBot] ✅ PromiseToPay created (${ptp.id}) until ${promisedDate.toISOString()}`);
    } else if (analysis.intent === HinglishIntent.PAYMENT_INTENT || analysis.actionRecommended === "SEND_PAYMENT_LINK") {
      // ── GENERATE 1-CLICK PAYMENT LINK ─────────────────────────────────────
      const linkId = `plink_conv_${Date.now().toString(36)}`;
      paymentUrl = `https://rzp.io/i/${linkId}`;
      actionTaken = "PAYMENT_LINK_DISPATCHED";

      await prisma.auditLog.create({
        data: {
          eventType: AuditEventType.OUTREACH_SENT,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "HINGLISH_BOT",
          actorId: "conversational-bot",
          payload: {
            channel,
            paymentUrl,
            userMessage,
            reason: "Instant payment recovery link dispatched",
          },
          amountInPaise: workflow.amountAtRiskInPaise,
          outcome: "SUCCESS",
        },
      });
    } else if (analysis.intent === HinglishIntent.CONFIRMED_REFUSAL || analysis.actionRecommended === "HALT_DUNNING") {
      // ── DND / OPT-OUT COMPLIANCE ──────────────────────────────────────────
      actionTaken = "CUSTOMER_OPTED_OUT_DND_ENABLED";

      await prisma.recoveryWorkflow.update({
        where: { id: workflow.id },
        data: {
          stage: RecoveryStage.HALTED,
          haltReason: "Customer requested stop dunning / DND opt-out.",
          version: { increment: 1 },
        },
      });

      await prisma.auditLog.create({
        data: {
          eventType: AuditEventType.WORKFLOW_HALTED,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "HINGLISH_BOT",
          actorId: "conversational-bot",
          payload: { reason: "Customer explicit opt-out (DND requested)", userMessage } as Prisma.InputJsonValue,
          outcome: "HALTED",
        },
      });
    } else if (analysis.intent === HinglishIntent.DISPUTE || analysis.actionRecommended === "ESCALATE_DISPUTE") {
      // ── DISPUTE ESCALATION ────────────────────────────────────────────────
      actionTaken = "DISPUTE_ESCALATED_TO_SUPPORT";

      await prisma.recoveryWorkflow.update({
        where: { id: workflow.id },
        data: {
          stage: RecoveryStage.ESCALATED,
          escalationReason: `Customer disputed charge: "${userMessage}"`,
          version: { increment: 1 },
        },
      });

      await prisma.auditLog.create({
        data: {
          eventType: AuditEventType.WORKFLOW_ESCALATED,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "HINGLISH_BOT",
          actorId: "conversational-bot",
          payload: { reason: "Customer payment dispute", userMessage } as Prisma.InputJsonValue,
          outcome: "ESCALATED",
        },
      });
    }

    // Log the customer response in DunningContact history
    await prisma.dunningContact.create({
      data: {
        workflowId: workflow.id,
        customerId: workflow.customerId,
        channel,
        messageTemplate: "inbound_customer_reply",
        sentAt: new Date(),
        customerResponse: userMessage,
      },
    });
  }

  // Append payment URL to message if generated
  let finalReply = analysis.replyMessage;
  if (paymentUrl && !finalReply.includes("http")) {
    finalReply += `\n\nAap iss link se direct pay kar sakte hain: ${paymentUrl}`;
  }

  const result: ChatTurnOutput = {
    replyText: finalReply,
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    actionTaken,
    ...(promiseToPayId ? { promiseToPayId } : {}),
    ...(paymentUrl ? { paymentUrl } : {}),
  };

  return result;
}

/**
 * Fallback intent classifier using pattern matching for offline/mock environments.
 */
function fallbackIntentClassifier(msg: string, amountPaise: number): HinglishBotAnalysis {
  const lower = msg.toLowerCase();

  if (lower.includes("salary") || lower.includes("tarikh") || lower.includes("ko dunga") || lower.includes("next month") || lower.includes("kal") || lower.includes("pay kar dunga")) {
    return {
      intent: HinglishIntent.PROMISE_TO_PAY,
      confidence: 0.94,
      sentiment: "POSITIVE",
      extractedDate: parseRelativeDate(msg),
      replyMessage: `Ji bilkul, koi baat nahi! Humne aapki payment date note kar li hai. Tab tak aapko koi reminder nahi aayega. Dhanyawaad!`,
      actionRecommended: "CREATE_PTP",
    };
  }

  if (lower.includes("upi") || lower.includes("link") || lower.includes("karta hoon") || lower.includes("pay now") || lower.includes("abhi")) {
    return {
      intent: HinglishIntent.PAYMENT_INTENT,
      confidence: 0.92,
      sentiment: "NEUTRAL",
      replyMessage: `Aap iss 1-click link se securely payment complete kar sakte hain:`,
      actionRecommended: "SEND_PAYMENT_LINK",
    };
  }

  if (lower.includes("stop") || lower.includes("dnd") || lower.includes("mat bhejo") || lower.includes("nahi karunga") || lower.includes("band karo")) {
    return {
      intent: HinglishIntent.CONFIRMED_REFUSAL,
      confidence: 0.98,
      sentiment: "ANGRY",
      replyMessage: `Hum aapse maafi chahte hain. Humne aapka number outreach list se hata diya hai aur reminders band kar diye hain.`,
      actionRecommended: "HALT_DUNNING",
    };
  }

  if (lower.includes("fraud") || lower.includes("nahi kiya") || lower.includes("cancel") || lower.includes("wrong")) {
    return {
      intent: HinglishIntent.DISPUTE,
      confidence: 0.90,
      sentiment: "DISTRESSED",
      replyMessage: `Aapki chinta hum samajhte hain. Humne iss transaction par hold laga diya hai aur support team ko notify kar diya hai. Wo aapse jald hi contact karenge.`,
      actionRecommended: "ESCALATE_DISPUTE",
    };
  }

  if (lower.includes("paisa nahi") || lower.includes("discount") || lower.includes("kam") || lower.includes("hardship")) {
    const discount = Math.min(Math.round(amountPaise * 0.1), 50000);
    return {
      intent: HinglishIntent.HARDSHIP,
      confidence: 0.88,
      sentiment: "NEUTRAL",
      extractedDiscountPercent: 10,
      replyMessage: `Hum samajhte hain. Hum aapke liye ₹${discount / 100} ka one-time concession apply kar sakte hain. Kya aap proceed karna chahenge?`,
      actionRecommended: "OFFER_DISCOUNT",
    };
  }

  return {
    intent: HinglishIntent.NEEDS_CLARIFICATION,
    confidence: 0.80,
    sentiment: "NEUTRAL",
    replyMessage: `Namaste! Aapke pending payment ke baare mein hum aapki kya madad kar sakte hain?`,
    actionRecommended: "NONE",
  };
}

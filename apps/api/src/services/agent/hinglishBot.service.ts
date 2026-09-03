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
import { callGroqStructured } from "./llmClient";
import { logger } from "../../config/logger";

export const HinglishBotResponseSchema = z.preprocess(
  (val: unknown) => {
    if (typeof val === "object" && val !== null) {
      const raw = val as Record<string, unknown>;
      return {
        intent: typeof raw.intent === "string" ? raw.intent.toUpperCase() : "NEEDS_CLARIFICATION",
        confidence: typeof raw.confidence === "number" ? raw.confidence : 0.9,
        sentiment: typeof raw.sentiment === "string" ? raw.sentiment.toUpperCase() : "NEUTRAL",
        extractedDate: raw.extractedDate ?? raw.extracted_date ?? (Array.isArray(raw.extracted_dates) && raw.extracted_dates.length > 0 ? raw.extracted_dates[0] : null),
        extractedDiscountPercent: raw.extractedDiscountPercent ?? raw.extracted_discount_percent ?? null,
        replyMessage: raw.replyMessage ?? raw.reply ?? raw.message ?? raw.reply_message ?? "Namaste! Aapke payment ke baare mein hum aapki kya madad kar sakte hain?",
        actionRecommended: typeof raw.actionRecommended === "string" ? raw.actionRecommended.toUpperCase() : (typeof raw.action === "string" ? raw.action.toUpperCase() : "NONE"),
      };
    }
    return val;
  },
  z.object({
    intent: z.nativeEnum(HinglishIntent).catch(HinglishIntent.NEEDS_CLARIFICATION),
    confidence: z.number().min(0).max(1).optional().default(0.9),
    sentiment: z.enum(["POSITIVE", "NEUTRAL", "ANGRY", "DISTRESSED"]).catch("NEUTRAL"),
    extractedDate: z.string().nullable().optional(),
    extractedDiscountPercent: z.number().nullable().optional(),
    replyMessage: z.string().min(2),
    actionRecommended: z.enum(["CREATE_PTP", "SEND_PAYMENT_LINK", "HALT_DUNNING", "ESCALATE_DISPUTE", "OFFER_DISCOUNT", "NONE"]).catch("NONE"),
  })
);

export type HinglishBotAnalysis = z.infer<typeof HinglishBotResponseSchema>;

export interface ChatTurnInput {
  readonly customerId?: string | undefined;
  readonly workflowId?: string | undefined;
  readonly userMessage: string;
  readonly channel?: DunningChannel | undefined;
}

export interface ChatTurnOutput {
  readonly replyText: string;
  readonly intent: HinglishIntent;
  readonly sentiment: "POSITIVE" | "NEUTRAL" | "ANGRY" | "DISTRESSED";
  readonly actionTaken: string;
  readonly workflowId?: string | undefined;
  readonly customerId?: string | undefined;
  readonly customerName?: string | undefined;
  readonly promiseToPayId?: string | undefined;
  readonly paymentUrl?: string | undefined;
}

const HINGLISH_SYSTEM_PROMPT = `
You are RevRec's empathetic, intelligent, and polite payment assistance agent communicating with Indian customers via WhatsApp/SMS in natural Hinglish.
Your goal: Help customers resolve pending payments smoothly with zero hostility, high empathy, and clear, helpful answers to whatever they ask.

SUPPORTED HINGLISH INTENTS:
1. PROMISE_TO_PAY: Customer commits to a future payment date (e.g., "Salary 5th ko aayegi", "Month end pe de dunga", "Next Monday pakka", "Kal tak ho jayega"). Extract the target date in ISO format.
2. PAYMENT_INTENT: Customer wants to pay right now or reports a gateway drop (e.g., "Link bhejo abhi karta hoon", "UPI stuck ho gaya tha", "Server busy tha", "QR code do").
3. DISPUTE: Customer claims they didn't purchase, wrong charge, or cancelled (e.g., "Maine order nahi kiya", "Fraud charge hai", "Galat charge hai").
4. HARDSHIP: Customer expresses financial difficulty or asks for concession (e.g., "Abhi paisa nahi hai", "Thoda discount milega?", "Paise kam kar do").
5. CONFIRMED_REFUSAL: Customer firmly refuses or demands to stop messaging (e.g., "Stop", "Don't message me", "Nahi karunga payment", "Bar bar mat bhejo").
6. NEEDS_CLARIFICATION: General queries, greetings, questions about why the payment failed, what plan it is for, or conversational remarks. Answer their specific question politely, accurately, and clearly in Hinglish.

TONE & STYLE:
- Respectful, professional, warm Hinglish (conversational Hindi written in Roman/English script).
- Address customer by name if known. Be helpful and never robotic.
- Always return valid JSON conforming to the requested schema.
`;

/**
 * Extracts phone, email, or payment/workflow identifier from free-form user message.
 */
function extractCustomerIdentifier(text: string): { email?: string; phone?: string; id?: string } | null {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(?:\+?91[\-\s]?)?([6-9]\d{9})/);
  const idMatch = text.match(/\b(pay_[a-zA-Z0-9_]+|wf_[a-zA-Z0-9_]+|cust_[a-zA-Z0-9_]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/i);

  if (emailMatch || phoneMatch || idMatch) {
    return {
      ...(emailMatch ? { email: emailMatch[0].toLowerCase() } : {}),
      ...(phoneMatch ? { phone: phoneMatch[1] } : {}),
      ...(idMatch ? { id: idMatch[1] } : {}),
    };
  }
  return null;
}

/**
 * Parses user colloquial expressions and converts relative dates ("5th", "kal", "next Monday") to ISO strings.
 * Returns undefined if no clear date expression is found in the message.
 */
function parseRelativeDate(text: string): string | undefined {
  const now = new Date();
  const lower = text.toLowerCase();

  // H6 fix: require an explicit date suffix (st/nd/rd/th/ko/tarikh/tareekh) so that
  // bare numbers like "20 rupees" or "order 15" don't get misread as a PTP day.
  // The suffix group is now mandatory (\S+ not ?).
  const dayMatch = lower.match(/\b(\d{1,2})\s*(?:st|nd|rd|th|ko|tarikh|tareekh)\b/i);
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

  // H6 fix: return undefined when no date expression found instead of defaulting
  // to 3 days — the caller must handle undefined and not create a spurious PTP.
  return undefined;
}

/**
 * Processes an incoming customer message, extracts intent, and triggers automated workflows.
 */
export async function processCustomerMessage(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const { customerId, workflowId, userMessage, channel = DunningChannel.WHATSAPP } = input;

  logger.info(`[HinglishBot] Processing message from customer ${customerId ?? "anonymous"} on ${channel}: "${userMessage}"`);

  // 1. Fetch relevant workflow and customer context
  let workflow = null;
  if (workflowId) {
    workflow = await prisma.recoveryWorkflow.findFirst({
      where: {
        OR: [
          { id: workflowId },
          { paymentId: workflowId },
          { payment: { externalId: workflowId } },
        ],
      },
      include: { customer: true, payment: true },
    });
  }

  if (!workflow && customerId && customerId !== "anonymous") {
    workflow = await prisma.recoveryWorkflow.findFirst({
      where: {
        OR: [
          { customerId },
          { customer: { externalId: customerId } },
          { customer: { phone: customerId } },
          { customer: { email: customerId } },
        ],
        stage: { notIn: [RecoveryStage.RECOVERED, RecoveryStage.HALTED] },
      },
      orderBy: { createdAt: "desc" },
      include: { customer: true, payment: true },
    });
  }

  // Fallback: If still no active workflow, try any latest workflow for this customer
  if (!workflow && customerId && customerId !== "anonymous") {
    workflow = await prisma.recoveryWorkflow.findFirst({
      where: {
        OR: [
          { customerId },
          { customer: { externalId: customerId } },
          { customer: { phone: customerId } },
          { customer: { email: customerId } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { customer: true, payment: true },
    });
  }

  // ── LOOKUP MODE: If opened without context, search for identifiers in the user message ──
  if (!workflow) {
    const extracted = extractCustomerIdentifier(userMessage) || (customerId ? extractCustomerIdentifier(customerId) : null);
    if (extracted) {
      const orFilters: Prisma.RecoveryWorkflowWhereInput[] = [];
      if (extracted.id) {
        orFilters.push(
          { id: extracted.id },
          { paymentId: extracted.id },
          { payment: { externalId: extracted.id } },
          { customerId: extracted.id },
          { customer: { externalId: extracted.id } }
        );
      }
      if (extracted.phone) {
        orFilters.push({ customer: { phone: { contains: extracted.phone } } });
      }
      if (extracted.email) {
        orFilters.push({ customer: { email: { equals: extracted.email, mode: "insensitive" } } });
      }

      if (orFilters.length > 0) {
        workflow = await prisma.recoveryWorkflow.findFirst({
          where: { OR: orFilters },
          orderBy: { createdAt: "desc" },
          include: { customer: true, payment: true },
        });
      }

      // If matching workflow found during lookup:
      if (workflow) {
        const amountRs = (Number(workflow.amountAtRiskInPaise) / 100).toLocaleString("en-IN");
        const failureReason = workflow.payment?.gatewayErrorCode ?? "PAYMENT_FAILED";
        const customerName = workflow.customer.name;
        const paymentId = workflow.payment?.externalId ?? workflow.id;

        return {
          replyText: `Dhanyawad ${customerName} ji! Hume aapka transaction mil gaya hai:\n\n• Amount: ₹${amountRs}\n• Payment ID: ${paymentId}\n• Status: Failed (${failureReason})\n\nAap is payment ke baare mein kya janna chahte hain? (Aap failure reason pooch sakte hain, instant payment link maang sakte hain, ya future payment date commit kar sakte hain).`,
          intent: HinglishIntent.NEEDS_CLARIFICATION,
          sentiment: "POSITIVE",
          actionTaken: "WORKFLOW_IDENTIFIED",
          workflowId: workflow.id,
          customerId: workflow.customerId,
          customerName: workflow.customer.name,
        };
      } else {
        // Identifier provided but not found in database:
        return {
          replyText: `Hume "${userMessage.trim()}" par koi active pending ya failed transaction nahi mila. Kripya apna registered 10-digit mobile number, email address ya Payment ID check karke dubara enter karein.`,
          intent: HinglishIntent.NEEDS_CLARIFICATION,
          sentiment: "NEUTRAL",
          actionTaken: "LOOKUP_NOT_FOUND",
        };
      }
    } else {
      // Check if message contains a recognizable customer name in DB (e.g. "Nihal", "Priya", "Tanishka")
      const words = userMessage.trim().split(/\s+/).filter((w) => w.length >= 3);
      let nameMatchedWorkflow = null;
      if (words.length > 0) {
        const matchedCustomer = await prisma.customer.findFirst({
          where: {
            OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" } })),
          },
          include: {
            recoveryWorkflows: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { customer: true, payment: true },
            },
          },
        });
        if (matchedCustomer && matchedCustomer.recoveryWorkflows.length > 0) {
          nameMatchedWorkflow = matchedCustomer.recoveryWorkflows[0];
        }
      }

      if (nameMatchedWorkflow) {
        workflow = nameMatchedWorkflow;
        const amountRs = (Number(workflow.amountAtRiskInPaise) / 100).toLocaleString("en-IN");
        const failureReason = workflow.payment?.gatewayErrorCode ?? "PAYMENT_FAILED";
        const customerName = workflow.customer.name;
        const paymentId = workflow.payment?.externalId ?? workflow.id;

        return {
          replyText: `Namaste ${customerName} ji! Hume aapka ₹${amountRs} ka transaction mil gaya (ID: ${paymentId}), jo ${failureReason} ki wajah se decline hua tha. Aap is payment ke baare mein kya discuss karna chahte hain?`,
          intent: HinglishIntent.NEEDS_CLARIFICATION,
          sentiment: "POSITIVE",
          actionTaken: "WORKFLOW_IDENTIFIED",
          workflowId: workflow.id,
          customerId: workflow.customerId,
          customerName: workflow.customer.name,
        };
      }

      // General question without any identifier in lookup mode:
      return {
        replyText: `Ji zaroor, main aapka failed transaction find karta hoon! Kripya apna registered Mobile Number (jaise: +91 8789600276), Email ID ya Payment ID share karein.`,
        intent: HinglishIntent.NEEDS_CLARIFICATION,
        sentiment: "NEUTRAL",
        actionTaken: "AWAITING_IDENTIFIER",
      };
    }
  }

  // ── CONTEXTUAL MODE: Workflow is loaded (from Ledger entry or successful lookup) ──
  const amountAtRiskPaise = Number(workflow.amountAtRiskInPaise);
  const customerName = workflow.customer.name ?? "Customer";
  const gatewayError = workflow.payment?.gatewayErrorCode ?? "INSUFFICIENT_FUNDS";
  const declineCategory = workflow.payment?.declineCategory ?? "SOFT";

  const userPrompt = `
CUSTOMER INCOMING MESSAGE:
"${userMessage}"

CONTEXT:
- Customer Name: ${customerName}
- Pending Amount: ₹${amountAtRiskPaise / 100}
- Failure Reason / Gateway Error: ${gatewayError} (Decline Category: ${declineCategory})
- Current Date: ${new Date().toISOString().split("T")[0]}

Analyze this message, identify intent and sentiment, extract any dates or discount requests, and provide an empathetic, helpful Hinglish reply. If the user asks why the payment failed, explain the failure reason politely and suggest clear next steps.
`;

  // 2. LLM Intent & Entity Extraction via Groq LPU
  const llmResult = await callGroqStructured(userPrompt, HINGLISH_SYSTEM_PROMPT);
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

  // Always generate 1-click payment link if intent is payment
  if (analysis.intent === HinglishIntent.PAYMENT_INTENT || analysis.actionRecommended === "SEND_PAYMENT_LINK") {
    const linkId = `plink_conv_${Date.now().toString(36)}`;
    paymentUrl = `https://rzp.io/i/${linkId}`;
    actionTaken = "PAYMENT_LINK_DISPATCHED";
  }

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
      // ── LOG 1-CLICK PAYMENT LINK ──────────────────────────────────────────
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
        messageTemplate: `hinglish_inbound_reply:::${userMessage}`,
        sentAt: new Date(),
        customerResponse: null,
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

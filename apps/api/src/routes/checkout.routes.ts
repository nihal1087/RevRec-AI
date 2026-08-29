/**
 * routes/checkout.routes.ts — Live Demo Checkout Endpoints
 *
 * Powers the "Demo Store" in the frontend dashboard:
 *   POST /api/checkout/order          — Create a Razorpay order (or mock)
 *   POST /api/checkout/simulate-failure — Inject a payment.failed event into
 *                                         BullMQ without going through the
 *                                         HMAC-signed webhook endpoint.
 *                                         DEMO ONLY — never expose in production.
 *
 * WHY a separate simulate-failure endpoint?
 * Razorpay's test mode doesn't let us force a failure from the server side.
 * To give evaluators a live end-to-end demo (checkout → failure → recovery agent),
 * we need an internal bypass that speaks the same job data contract as the real
 * webhook worker — so the *exact* same recovery pipeline fires.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import Razorpay from "razorpay";
import { retryExecutionQueue } from "../queues/retryExecution.queue";
import { classifyPaymentFailure } from "../services/rca.service";
import { evaluateCustomerRisk } from "../services/customerRisk.service";
import { calculateNextRetrySchedule } from "../services/retrySequencer.service";
import { prisma, PaymentStatus, RecoveryStage, AuditEventType, DeclineCategory, Prisma } from "@revrec/db";
import { logger } from "../config/logger";

const router = Router();

// ── Razorpay Client (lazy-initialised so the app starts even without keys) ────
function getRazorpayClient(): Razorpay | null {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ── Zod Schemas ────────────────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  amountInPaise: z.number().int().positive().max(50000000), // max ₹5 lakh
  productName: z.string().min(1).max(120),
  customerName: z.string().optional().default("Nihal"),
  customerEmail: z.string().email().optional().default("nihal@revrec.ai"),
  customerPhone: z.string().optional().default("+918789600276"),
});

const SimulateFailureSchema = z.object({
  paymentId: z.string().min(1),         // e.g. "pay_DemoXyz1234"
  amountInPaise: z.number().int().positive(),
  errorCode: z.string().min(1),         // e.g. "GATEWAY_TIMEOUT"
  errorDescription: z.string().default(""),
  customerName: z.string().default("Nihal"),
  customerEmail: z.string().default("nihal@revrec.ai"),
  customerPhone: z.string().default("+918789600276"),
});

// ── POST /api/checkout/order ──────────────────────────────────────────────────

/**
 * Creates a Razorpay order_id for the frontend Razorpay.js modal.
 * Falls back to a mock order_id when RAZORPAY_KEY_ID is not set (offline demo).
 */
router.post("/order", async (req: Request, res: Response): Promise<void> => {
  const parseResult = CreateOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({ error: "Invalid request", details: parseResult.error.flatten() });
    return;
  }

  const { amountInPaise, productName, customerName, customerEmail, customerPhone } =
    parseResult.data;

  const rzp = getRazorpayClient();

  if (!rzp) {
    // Offline / mock mode — return a fake order so the UI can still demo
    const mockOrderId = `order_mock_${Date.now()}`;
    logger.warn("[Checkout] No Razorpay keys configured — returning mock order");
    res.json({
      success: true,
      order_id: mockOrderId,
      amount: amountInPaise,
      currency: "INR",
      key_id: "rzp_test_MOCK",
      mock: true,
    });
    return;
  }

  try {
    const order = await rzp.orders.create({
      amount: amountInPaise,
      currency: "INR",
      notes: {
        productName,
        customerName,
        customerEmail,
        customerPhone,
        source: "RevRec_Demo_Store",
      },
    });

    logger.info(`[Checkout] Created Razorpay order: ${order.id} for ₹${amountInPaise / 100}`);

    res.json({
      success: true,
      order_id: order.id,
      amount: amountInPaise,
      currency: "INR",
      key_id: process.env["RAZORPAY_KEY_ID"],
      mock: false,
    });
  } catch (error) {
    logger.error("[Checkout] Razorpay order creation failed:", error);
    res.status(502).json({ error: "Failed to create Razorpay order" });
  }
});

// ── POST /api/checkout/simulate-failure ───────────────────────────────────────

/**
 * Injects a realistic payment.failed event directly into the BullMQ worker.
 * The job data structure is identical to what the real webhook handler produces,
 * so the exact same RCA → Retry Sequencer → Agent pipeline fires.
 *
 * Called by the frontend immediately after:
 *   a) The user closes the Razorpay modal without paying (simulated failure)
 *   b) A mock payment is submitted in offline mode
 */
router.post(
  "/simulate-failure",
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = SimulateFailureSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(422).json({ error: "Invalid request", details: parseResult.error.flatten() });
      return;
    }

    const {
      paymentId,
      amountInPaise,
      errorCode,
      errorDescription,
      customerName,
      customerEmail,
      customerPhone,
    } = parseResult.data;

    // Build the exact same rawPayload shape that the real webhook worker expects
    const rawPayload = {
      payment: {
        entity: {
          id: paymentId,
          amount: amountInPaise,
          currency: "INR",
          status: "failed",
          error_code: errorCode,
          error_description: errorDescription,
          customer_id: `demo_${Date.now()}`,
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
          // Intentionally realistic gateway metadata for RCA classification
          method: "card",
          bank: "HDFC",
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    };

    const eventId = `demo_failure:${paymentId}:${Date.now()}`;
    const customerId = `cust_demo_${paymentId}`;

    try {
      // 1. Perform RCA Classification immediately
      const rcaResult = classifyPaymentFailure(errorCode, errorDescription, "razorpay");
      const riskProfile = evaluateCustomerRisk(35, 85, rcaResult.category, errorCode);

      // 2. Persist Customer, Payment, Workflow and AuditLog synchronously to PostgreSQL
      const workflow = await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.upsert({
          where: { externalId: customerId },
          update: { updatedAt: new Date() },
          create: {
            externalId: customerId,
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            riskScore: riskProfile.riskScore,
            riskTier: riskProfile.riskTier,
            paymentHistoryScore: riskProfile.paymentHistoryScore,
            ltvInPaise: 0n,
          },
        });

        const payment = await tx.payment.upsert({
          where: { externalId: paymentId },
          update: {
            amountInPaise,
            status: PaymentStatus.FAILED,
            gatewayErrorCode: errorCode,
            declineCategory: rcaResult.category,
            updatedAt: new Date(),
          },
          create: {
            externalId: paymentId,
            customerId: customer.id,
            amountInPaise,
            status: PaymentStatus.FAILED,
            gateway: "razorpay",
            gatewayErrorCode: errorCode,
            declineCategory: rcaResult.category,
            idempotencyKey: eventId,
          },
        });

        const existingWf = await tx.recoveryWorkflow.findFirst({
          where: { paymentId: payment.id },
        });

        const wf = existingWf
          ? await tx.recoveryWorkflow.update({
              where: { id: existingWf.id },
              data: {
                stage: rcaResult.initialStage,
                amountAtRiskInPaise: amountInPaise,
                version: { increment: 1 },
                updatedAt: new Date(),
              },
            })
          : await tx.recoveryWorkflow.create({
              data: {
                paymentId: payment.id,
                customerId: customer.id,
                amountAtRiskInPaise: amountInPaise,
                stage: rcaResult.initialStage,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              },
            });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.PAYMENT_FAILED,
            workflowId: wf.id,
            paymentId: payment.id,
            customerId: customer.id,
            actorType: "WEBHOOK_PROCESSOR",
            actorId: "demo-checkout-simulator",
            payload: {
              eventId,
              gateway: "razorpay",
              errorCode,
              errorDescription,
              amountInPaise,
              receivedAt: new Date().toISOString(),
              rawEntity: rawPayload.payment.entity as unknown as Prisma.InputJsonValue,
            },
            amountInPaise,
            outcome: "FAILURE",
            errorMessage: `${errorCode}: ${errorDescription}`,
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.RCA_CLASSIFIED,
            workflowId: wf.id,
            paymentId: payment.id,
            customerId: customer.id,
            actorType: "RCA_ENGINE",
            actorId: "rca-service",
            payload: {
              category: rcaResult.category,
              confidence: rcaResult.confidence,
              reasoning: rcaResult.reasoning,
              isRetryable: rcaResult.isRetryable,
              recommendedAction: rcaResult.recommendedAction,
            },
            amountInPaise,
            outcome: "SUCCESS",
          },
        });

        let pendingRetry: {
          data: {
            workflowId: string;
            paymentId: string;
            customerId: string;
            attemptNumber: number;
            scheduledFor: string;
            strategyUsed: string;
          };
          opts: { delay: number; jobId: string };
        } | null = null;

        if (rcaResult.isRetryable) {
          const retrySchedule = calculateNextRetrySchedule({
            category: rcaResult.category,
            currentAttemptCount: 0,
            bankCode: "HDFC",
            customerRiskScore: customer.riskScore,
          });

          if (retrySchedule.shouldRetry && retrySchedule.scheduledAt) {
            await tx.recoveryWorkflow.update({
              where: { id: wf.id },
              data: {
                stage: RecoveryStage.RETRYING,
                nextActionAt: retrySchedule.scheduledAt,
                version: { increment: 1 },
              },
            });

            pendingRetry = {
              data: {
                workflowId: wf.id,
                paymentId: payment.id,
                customerId: customer.id,
                attemptNumber: 1,
                scheduledFor: retrySchedule.scheduledAt.toISOString(),
                strategyUsed: retrySchedule.strategyUsed,
              },
              opts: {
                delay: Math.max(1000, retrySchedule.delaySeconds * 1000),
                jobId: `retry_${wf.id}_att_1`,
              },
            };

            await tx.auditLog.create({
              data: {
                eventType: AuditEventType.PAYMENT_RETRY_SCHEDULED,
                workflowId: wf.id,
                paymentId: payment.id,
                customerId: customer.id,
                actorType: "RETRY_SEQUENCER",
                actorId: "retry-sequencer-service",
                payload: {
                  attemptNumber: 1,
                  scheduledAt: retrySchedule.scheduledAt.toISOString(),
                  delaySeconds: retrySchedule.delaySeconds,
                  strategyUsed: retrySchedule.strategyUsed,
                  reasoning: retrySchedule.reasoning,
                },
                previousStage: RecoveryStage.PENDING,
                newStage: RecoveryStage.RETRYING,
                amountInPaise,
                outcome: "SUCCESS",
              },
            });
          }
        } else if (rcaResult.category === DeclineCategory.HARD) {
          await tx.recoveryWorkflow.update({
            where: { id: wf.id },
            data: {
              stage: RecoveryStage.HALTED,
              haltReason: rcaResult.reasoning,
              version: { increment: 1 },
            },
          });

          await tx.auditLog.create({
            data: {
              eventType: AuditEventType.WORKFLOW_HALTED,
              workflowId: wf.id,
              paymentId: payment.id,
              customerId: customer.id,
              actorType: "RCA_ENGINE",
              actorId: "rca-service",
              payload: { reason: rcaResult.reasoning },
              previousStage: RecoveryStage.PENDING,
              newStage: RecoveryStage.HALTED,
              outcome: "HALTED",
            },
          });
        }

        return { wf, pendingRetry };
      });

      if (workflow.pendingRetry) {
        try {
          await retryExecutionQueue.add(
            "execute-retry",
            workflow.pendingRetry.data,
            workflow.pendingRetry.opts
          );
        } catch (queueErr) {
          logger.warn(`[Checkout] Could not enqueue retry job to BullMQ: ${(queueErr as Error).message}`);
        }
      }

      logger.info(`[Checkout] 🎬 Demo failure injected & persisted to DB: ${paymentId} | ${errorCode} | ₹${amountInPaise / 100} (Workflow: ${workflow.wf.id})`);

      res.json({
        success: true,
        eventId,
        workflowId: workflow.wf.id,
        message: "Payment failure injected into recovery pipeline",
        rca_hint: getRcaHint(errorCode),
      });
    } catch (error) {
      logger.error("[Checkout] Failed to inject simulated failure:", error);
      res.status(500).json({ error: "Failed to inject payment failure" });
    }
  }
);

// ── Helper: Give the UI a quick RCA hint before the worker processes the job ──

function getRcaHint(errorCode: string): {
  category: string;
  label: string;
  isRetryable: boolean;
  suggestedAction: string;
} {
  const code = errorCode.toUpperCase();

  if (code.includes("TIMEOUT") || code.includes("GATEWAY") || code.includes("SWITCH_DOWN") || code.includes("NETWORK")) {
    return {
      category: "NETWORK",
      label: "Network / Gateway Timeout",
      isRetryable: true,
      suggestedAction: "Exponential backoff retry (5–30 min jitter). Bank downtime window avoided.",
    };
  }
  if (code.includes("INSUFFICIENT") || code.includes("LOW_BALANCE")) {
    return {
      category: "SOFT",
      label: "Soft Decline — Insufficient Funds",
      isRetryable: true,
      suggestedAction: "Retry scheduled for salary window (1st–5th of next month at 09:30 IST).",
    };
  }
  if (code.includes("OTP") || code.includes("DROPPED") || code.includes("ABANDONED")) {
    return {
      category: "INTENT_DROP",
      label: "Intent Drop — OTP Timeout / Abandonment",
      isRetryable: true,
      suggestedAction: "WhatsApp 1-click recovery link dispatched immediately.",
    };
  }
  if (code.includes("EXPIRED") || code.includes("FRAUD") || code.includes("BLOCKED") || code.includes("CLOSED")) {
    return {
      category: "HARD",
      label: "Hard Decline — Non-Retryable",
      isRetryable: false,
      suggestedAction: "Dunning halted. Human escalation path activated.",
    };
  }
  if (code.includes("MANDATE") || code.includes("NACH") || code.includes("UPI_AUTOPAY")) {
    return {
      category: "MANDATE_FAILURE",
      label: "Mandate Execution Failure",
      isRetryable: true,
      suggestedAction: "Re-authentication flow. 48-hour compliance gap enforced.",
    };
  }

  if (code.includes("LIMIT") || code.includes("VELOCITY")) {
    return {
      category: "SOFT",
      label: "Soft Decline — Daily / Velocity Limit",
      isRetryable: true,
      suggestedAction: "Retry scheduled for next morning (09:30 AM IST) after bank limit resets.",
    };
  }
  if (code.includes("INVOICE") || code.includes("RECEIVABLE") || code.includes("B2B")) {
    return {
      category: "INTENT_DROP",
      label: "B2B Overdue Invoice Chaser",
      isRetryable: true,
      suggestedAction: "Multi-channel outreach with conditional 5% prompt payment concession.",
    };
  }

  return {
    category: "SOFT",
    label: "Soft Decline",
    isRetryable: true,
    suggestedAction: "Smart retry scheduled based on salary-cycle alignment.",
  };
}

export { router as checkoutRouter };

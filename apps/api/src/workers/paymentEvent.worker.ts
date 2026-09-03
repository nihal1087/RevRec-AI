/**
 * workers/paymentEvent.worker.ts — BullMQ Payment Event Processor (Phase 2 Upgrade)
 *
 * Consumes raw payment failures, performs instant Root Cause Analysis (RCA),
 * persists transactional entities, schedules smart retry jobs into BullMQ,
 * and appends tamper-evident audit logs.
 */

import { Worker, Job } from "bullmq";
import { getBullMQRedisClient } from "../config/redis";
import { paymentEventsQueue, type PaymentEventJobData } from "../queues/paymentEvents.queue";
import { retryExecutionQueue } from "../queues/retryExecution.queue";
import { classifyPaymentFailure } from "../services/rca.service";
import { calculateNextRetrySchedule } from "../services/retrySequencer.service";
import { evaluateCustomerRisk } from "../services/customerRisk.service";
import { runAgentDecision } from "../services/agent/agent.service";
import { recordAutomaticFailureOutreach } from "../services/outreach.service";
import { prisma, PaymentStatus, RecoveryStage, AuditEventType, DeclineCategory, Prisma } from "@revrec/db";
import { logger } from "../config/logger";
import { recordBankOutage } from "../services/bankHealth.service";


const WORKER_CONCURRENCY = 5;

// ── Main Job Processor ────────────────────────────────────────────────────────

async function processPaymentEvent(
  job: Job<PaymentEventJobData>
): Promise<void> {
  const { eventId, eventType, gateway, rawPayload, receivedAt } = job.data;

  logger.info(
    `[Worker] Processing | event: ${eventType} | id: ${eventId} | attempt: ${job.attemptsMade + 1}`
  );

  switch (eventType) {
    case "payment.failed":
      await handlePaymentFailed(rawPayload, gateway, eventId, receivedAt);
      break;

    case "subscription.charged.failed":
      await handleSubscriptionChargeFailed(rawPayload, gateway, eventId, receivedAt);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(rawPayload, gateway, eventId, receivedAt);
      break;

    case "agent.decide": {
      const workflowId = (rawPayload?.["workflowId"] as string | undefined) ?? (rawPayload?.["id"] as string | undefined);
      if (workflowId) {
        logger.info(`[Worker] Executing autonomous agent decision for workflow ${workflowId}`);
        await runAgentDecision(workflowId);
      } else {
        logger.warn(`[Worker] agent.decide received without workflowId`);
      }
      break;
    }

    default:
      logger.info(`[Worker] Unhandled event type: ${eventType} — job complete with no action`);
  }
}

// ── payment.failed Handler ────────────────────────────────────────────────────

async function handlePaymentFailed(
  payload: Record<string, unknown>,
  gateway: string,
  eventId: string,
  receivedAt: string
): Promise<void> {
  const paymentWrapper = payload["payment"] as { entity: Record<string, unknown> } | undefined;

  if (!paymentWrapper?.entity) {
    throw new Error(`payment.failed webhook missing payment.entity | eventId: ${eventId}`);
  }

  const entity = paymentWrapper.entity;
  const externalId = entity["id"] as string | undefined;
  const externalCustomerId = entity["customer_id"] as string | undefined;
  const amountInPaise = entity["amount"] as number | undefined;
  const errorCode = (entity["error_code"] as string | undefined) ?? "UNKNOWN";
  const errorDescription = (entity["error_description"] as string | undefined) ?? "";
  const bankCode = (entity["bank"] as string | undefined) ?? "DEFAULT";

  if (!externalId || amountInPaise == null) {
    throw new Error(`payment.failed entity missing required fields (id, amount) | eventId: ${eventId}`);
  }

  const customerId = externalCustomerId ?? `anonymous_${externalId}`;

  // 1. Execute instant Root Cause Analysis (RCA)
  const rcaResult = classifyPaymentFailure(errorCode, errorDescription, gateway);
  logger.info(`[RCA] Classified ${externalId} as ${rcaResult.category} (Confidence: ${rcaResult.confidence * 100}%) — ${rcaResult.reasoning}`);

  // Auto-record bank outage when GATEWAY_TIMEOUT detected — triggers 30-min cooldown
  // on retry scheduling to prevent hammering a degraded gateway.
  if (errorCode === "GATEWAY_TIMEOUT" || errorCode === "UPI_SWITCH_DOWN" || errorCode === "NETWORK_ERROR") {
    recordBankOutage(bankCode, 30);
    logger.warn(`[Worker] ⚡ Circuit breaker triggered for bank ${bankCode} — 30-min outage recorded due to ${errorCode}`);
  }

  // 2. Transactional Database Ingestion & Workflow State Machine Setup
  const pendingRetryJob = await prisma.$transaction(async (tx) => {

    let jobToSchedule: {
      name: string;
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

    // ── Upsert Customer Record ───────────────────────────────────────────────
    const riskProfile = evaluateCustomerRisk(35, 85, rcaResult.category, errorCode);

    const customer = await tx.customer.upsert({
      where: { externalId: customerId },
      update: { updatedAt: new Date() },
      create: {
        externalId: customerId,
        name: (entity["name"] as string | undefined) ?? "Unknown Customer",
        email: (entity["email"] as string | undefined) ?? `${customerId}@unknown.revrec`,
        phone: (entity["contact"] as string | undefined) ?? "+910000000000",
        riskScore: riskProfile.riskScore,
        riskTier: riskProfile.riskTier,
        paymentHistoryScore: riskProfile.paymentHistoryScore,
        ltvInPaise: 0n,
      },
    });

    // ── Upsert Payment Record with RCA Category ──────────────────────────────
    const payment = await tx.payment.upsert({
      where: { externalId },
      update: {
        status: PaymentStatus.FAILED,
        gatewayErrorCode: errorCode,
        declineCategory: rcaResult.category,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        externalId,
        customerId: customer.id,
        amountInPaise,
        status: PaymentStatus.FAILED,
        gateway,
        gatewayErrorCode: errorCode,
        declineCategory: rcaResult.category,
        idempotencyKey: eventId,
      },
    });

    // ── Check / Create Recovery Workflow ────────────────────────────────────
    const existingWorkflow = await tx.recoveryWorkflow.findUnique({
      where: { paymentId: payment.id },
    });

    if (!existingWorkflow) {
      const workflow = await tx.recoveryWorkflow.create({
        data: {
          paymentId: payment.id,
          customerId: customer.id,
          amountAtRiskInPaise: amountInPaise,
          stage: rcaResult.initialStage,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day lifecycle
        },
      });

      // Audit: Workflow Created
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.WORKFLOW_CREATED,
          workflowId: workflow.id,
          paymentId: payment.id,
          customerId: customer.id,
          actorType: "WEBHOOK_PROCESSOR",
          actorId: "payment-event-worker",
          payload: { eventId, gateway, errorCode, errorDescription, amountInPaise, receivedAt },
          newStage: rcaResult.initialStage,
          amountInPaise,
          outcome: "SUCCESS",
        },
      });

      // Audit: RCA Classification Record
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.RCA_CLASSIFIED,
          workflowId: workflow.id,
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

      // ── Automatically Record Customer Outreach in Communications Hub ──
      await recordAutomaticFailureOutreach(
        {
          workflowId: workflow.id,
          paymentId: payment.id,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          amountInPaise,
          category: rcaResult.category,
          errorCode,
          errorDescription,
        },
        tx
      );

      // ── Smart Retry Scheduling if Retryable ─────────────────────────────────
      if (rcaResult.isRetryable) {
        const retrySchedule = calculateNextRetrySchedule({
          category: rcaResult.category,
          currentAttemptCount: 0,
          bankCode,
          customerRiskScore: customer.riskScore,
        });

        if (retrySchedule.shouldRetry && retrySchedule.scheduledAt) {
          // Update workflow state to RETRYING with nextActionAt
          await tx.recoveryWorkflow.update({
            where: { id: workflow.id },
            data: {
              stage: RecoveryStage.RETRYING,
              nextActionAt: retrySchedule.scheduledAt,
              version: { increment: 1 },
            },
          });

          // Prepare BullMQ job to be enqueued outside transaction
          jobToSchedule = {
            name: "execute-retry",
            data: {
              workflowId: workflow.id,
              paymentId: payment.id,
              customerId: customer.id,
              attemptNumber: 1,
              scheduledFor: retrySchedule.scheduledAt.toISOString(),
              strategyUsed: retrySchedule.strategyUsed,
            },
            opts: {
              delay: Math.max(1000, retrySchedule.delaySeconds * 1000),
              jobId: `retry_${workflow.id}_att_1`,
            },
          };

          // Audit: Payment Retry Scheduled
          await tx.auditLog.create({
            data: {
              eventType: AuditEventType.PAYMENT_RETRY_SCHEDULED,
              workflowId: workflow.id,
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

          logger.info(`[Sequencer] ⏰ Retry #1 scheduled for workflow ${workflow.id} at ${retrySchedule.scheduledAt.toISOString()} (${retrySchedule.strategyUsed})`);
        }
      } else if (rcaResult.category === DeclineCategory.HARD) {
        // Halt workflow immediately on Hard Declines
        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.HALTED,
            haltReason: rcaResult.reasoning,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.WORKFLOW_HALTED,
            workflowId: workflow.id,
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
      } else {
        // Trigger the AI agent immediately for INTENT_DROP or MANDATE failures
        jobToSchedule = {
          name: "agent.decide",
          data: {
            workflowId: workflow.id,
            paymentId: payment.id,
            customerId: customer.id,
            attemptNumber: 0,
            scheduledFor: new Date().toISOString(),
            strategyUsed: "immediate_escalation",
          },
          opts: { delay: 1000, jobId: `agent_decide_${workflow.id}` },
        };
      }
    }

    // Audit: Raw Payment Failed Event
    await tx.auditLog.create({
      data: {
        eventType: AuditEventType.PAYMENT_FAILED,
        paymentId: payment.id,
        customerId: customer.id,
        actorType: "WEBHOOK_PROCESSOR",
        actorId: "payment-event-worker",
        payload: {
          eventId,
          gateway,
          errorCode,
          errorDescription,
          amountInPaise,
          receivedAt,
          rawEntity: entity as Prisma.InputJsonValue,
        },
        amountInPaise,
        outcome: "FAILURE",
        errorMessage: `${errorCode}: ${errorDescription}`,
      },
    });

    return jobToSchedule;
  });

  // Enqueue delayed job into BullMQ OUTSIDE the database transaction
  if (pendingRetryJob) {
    if (pendingRetryJob.name === "agent.decide") {
      await paymentEventsQueue.add(
        "agent.decide",
        {
          eventId: `agent_escalation:${pendingRetryJob.data.workflowId}:${Date.now()}`,
          eventType: "agent.decide",
          gateway: "internal",
          rawPayload: { workflowId: pendingRetryJob.data.workflowId, trigger: "intent_drop_or_mandate" },
          receivedAt: new Date().toISOString(),
        },
        pendingRetryJob.opts
      );
    } else {
      await retryExecutionQueue.add(
        pendingRetryJob.name,
        pendingRetryJob.data,
        pendingRetryJob.opts
      );
    }
  }

  logger.info(`[Worker] ✅ Processed payment failure ${externalId} with RCA category ${rcaResult.category}`);
}

// ── subscription.charged.failed Handler ───────────────────────────────────────

async function handleSubscriptionChargeFailed(
  payload: Record<string, unknown>,
  gateway: string,
  eventId: string,
  receivedAt: string
): Promise<void> {
  const subWrapper = payload["subscription"] as { entity: Record<string, unknown> } | undefined;
  if (!subWrapper?.entity) return;

  const entity = subWrapper.entity;
  const externalSubId = entity["id"] as string | undefined;
  const externalCustomerId = (entity["customer_id"] as string | undefined) ?? `sub_cust_${externalSubId}`;
  // Subscription charge amounts come as recurring_amount_in_paise or plan amount
  const amountInPaise = (entity["recurring_amount_in_paise"] as number | undefined)
    ?? (entity["amount"] as number | undefined)
    ?? 0;
  const bankCode = (entity["bank"] as string | undefined) ?? "DEFAULT";
  const errorCode = "MANDATE_EXECUTION_FAILED";
  const errorDescription = (entity["error_description"] as string | undefined) ?? "Subscription auto-debit mandate execution dropped";

  if (!externalSubId) {
    logger.warn(`[Worker] subscription.charged.failed missing subscription id | eventId: ${eventId}`);
    return;
  }

  logger.info(`[Worker] Processing subscription failure for ${externalSubId} (Customer: ${externalCustomerId}, Gateway: ${gateway}, Event: ${eventId}, Received: ${receivedAt})`);

  // 1. RCA — subscription failures are always MANDATE_FAILURE category
  const rcaResult = classifyPaymentFailure(errorCode, errorDescription, gateway);
  logger.info(`[RCA] Subscription ${externalSubId} classified as ${rcaResult.category} — ${rcaResult.reasoning}`);

  // 2. Increment the Subscription failed-attempts counter
  await prisma.subscription.updateMany({
    where: { externalId: externalSubId },
    data: { failedAttempts: { increment: 1 }, updatedAt: new Date() },
  });

  // 3. Upsert Customer + synthetic Payment + RecoveryWorkflow (same as payment.failed)
  const pendingRetryJob = await prisma.$transaction(async (tx) => {
    let jobToSchedule: {
      name: string;
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

    const riskProfile = evaluateCustomerRisk(35, 85, rcaResult.category, errorCode);

    const customer = await tx.customer.upsert({
      where: { externalId: externalCustomerId },
      update: { updatedAt: new Date() },
      create: {
        externalId: externalCustomerId,
        name: (entity["customer_name"] as string | undefined) ?? "Subscription Customer",
        email: (entity["email"] as string | undefined) ?? `${externalCustomerId}@unknown.revrec`,
        phone: (entity["contact"] as string | undefined) ?? "+910000000000",
        riskScore: riskProfile.riskScore,
        riskTier: riskProfile.riskTier,
        paymentHistoryScore: riskProfile.paymentHistoryScore,
        ltvInPaise: 0n,
      },
    });

    // Synthetic payment record representing the failed subscription debit
    const syntheticPaymentId = `sub_pay_${externalSubId}_${Date.now()}`;
    const payment = await tx.payment.upsert({
      where: { externalId: syntheticPaymentId },
      update: {
        status: PaymentStatus.FAILED,
        gatewayErrorCode: errorCode,
        declineCategory: rcaResult.category,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        externalId: syntheticPaymentId,
        customerId: customer.id,
        amountInPaise,
        status: PaymentStatus.FAILED,
        gateway,
        gatewayErrorCode: errorCode,
        declineCategory: rcaResult.category,
        idempotencyKey: eventId,
      },
    });

    const existingWorkflow = await tx.recoveryWorkflow.findUnique({
      where: { paymentId: payment.id },
    });

    if (!existingWorkflow) {
      const workflow = await tx.recoveryWorkflow.create({
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
          eventType: AuditEventType.WORKFLOW_CREATED,
          workflowId: workflow.id,
          paymentId: payment.id,
          customerId: customer.id,
          actorType: "WEBHOOK_PROCESSOR",
          actorId: "payment-event-worker",
          payload: { eventId, gateway, errorCode, errorDescription, amountInPaise, receivedAt, subscriptionId: externalSubId },
          newStage: rcaResult.initialStage,
          amountInPaise,
          outcome: "SUCCESS",
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.RCA_CLASSIFIED,
          workflowId: workflow.id,
          paymentId: payment.id,
          customerId: customer.id,
          actorType: "RCA_ENGINE",
          actorId: "rca-service",
          payload: {
            category: rcaResult.category,
            confidence: rcaResult.confidence,
            reasoning: rcaResult.reasoning,
            isRetryable: rcaResult.isRetryable,
          },
          amountInPaise,
          outcome: "SUCCESS",
        },
      });

      // ── Automatically Record Customer Outreach in Communications Hub ──
      await recordAutomaticFailureOutreach(
        {
          workflowId: workflow.id,
          paymentId: payment.id,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          amountInPaise,
          category: rcaResult.category,
          errorCode,
          errorDescription,
        },
        tx
      );

      // Schedule RBI-compliant mandate retry (48h+ gap)
      if (rcaResult.isRetryable) {
        const retrySchedule = calculateNextRetrySchedule({
          category: rcaResult.category,
          currentAttemptCount: 0,
          bankCode,
          customerRiskScore: customer.riskScore,
        });

        if (retrySchedule.shouldRetry && retrySchedule.scheduledAt) {
          await tx.recoveryWorkflow.update({
            where: { id: workflow.id },
            data: {
              stage: RecoveryStage.RETRYING,
              nextActionAt: retrySchedule.scheduledAt,
              version: { increment: 1 },
            },
          });

          jobToSchedule = {
            name: "execute-retry",
            data: {
              workflowId: workflow.id,
              paymentId: payment.id,
              customerId: customer.id,
              attemptNumber: 1,
              scheduledFor: retrySchedule.scheduledAt.toISOString(),
              strategyUsed: retrySchedule.strategyUsed,
            },
            opts: {
              delay: Math.max(1000, retrySchedule.delaySeconds * 1000),
              jobId: `retry_${workflow.id}_att_1`,
            },
          };

          await tx.auditLog.create({
            data: {
              eventType: AuditEventType.PAYMENT_RETRY_SCHEDULED,
              workflowId: workflow.id,
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

          logger.info(`[Sequencer] ⏰ Mandate retry #1 scheduled for subscription workflow ${workflow.id} at ${retrySchedule.scheduledAt.toISOString()} (${retrySchedule.strategyUsed})`);
        }
      }
    }

    return jobToSchedule;
  });

  // Enqueue retry job outside the transaction
  if (pendingRetryJob) {
    await retryExecutionQueue.add(
      pendingRetryJob.name,
      pendingRetryJob.data,
      pendingRetryJob.opts
    );
  }

  logger.info(`[Worker] ✅ Processed subscription failure ${externalSubId} with RCA category ${rcaResult.category}`);
}

// ── invoice.payment_failed Handler ───────────────────────────────────────────

async function handleInvoicePaymentFailed(
  payload: Record<string, unknown>,
  gateway: string,
  eventId: string,
  receivedAt: string
): Promise<void> {
  // If the invoice payload contains a nested payment object, use the standard payment processor
  if (payload["payment"]) {
    await handlePaymentFailed(payload, gateway, eventId, receivedAt);
    return;
  }

  const invoiceWrapper = payload["invoice"] as { entity: Record<string, unknown> } | undefined;
  if (!invoiceWrapper?.entity) {
    logger.warn(`[Worker] invoice.payment_failed missing invoice entity | eventId: ${eventId}`);
    return;
  }

  const entity = invoiceWrapper.entity;
  const externalInvoiceId = entity["id"] as string | undefined;
  const customerId = (entity["customer_id"] as string | undefined) ?? `inv_cust_${externalInvoiceId}`;
  const amountInPaise = (entity["amount"] as number | undefined) ?? (entity["amount_due"] as number | undefined) ?? 0;
  const errorCode = (entity["error_code"] as string | undefined) ?? "INVOICE_PAYMENT_FAILED";
  const errorDescription = (entity["error_description"] as string | undefined) ?? "B2B Invoice settlement payment dropped";

  if (!externalInvoiceId) return;

  // Construct synthetic payment payload to process through standard recovery flow
  const syntheticPayload = {
    payment: {
      entity: {
        id: `pay_${externalInvoiceId}_${Date.now()}`,
        customer_id: customerId,
        amount: amountInPaise,
        error_code: errorCode,
        error_description: errorDescription,
        bank: (entity["bank"] as string | undefined) ?? "DEFAULT",
        name: (entity["customer_name"] as string | undefined) ?? "Invoice Customer",
        email: (entity["customer_email"] as string | undefined) ?? `${customerId}@unknown.revrec`,
        contact: (entity["customer_contact"] as string | undefined) ?? "+910000000000",
      },
    },
  };

  await handlePaymentFailed(syntheticPayload, gateway, eventId, receivedAt);
}

// ── Worker Factory ────────────────────────────────────────────────────────────

export function startPaymentEventWorker(): Worker<PaymentEventJobData> {
  const worker = new Worker<PaymentEventJobData>(
    "payment-events",
    processPaymentEvent,
    {
      connection: getBullMQRedisClient(),
      concurrency: WORKER_CONCURRENCY,
      lockDuration: 30_000,
    }
  );

  worker.on("completed", (job: Job<PaymentEventJobData>) => {
    logger.info(`[Worker] ✅ Completed event: ${job.name} | id: ${job.id}`);
  });

  worker.on("failed", (job: Job<PaymentEventJobData> | undefined, err: Error) => {
    logger.error(`[Worker] ❌ Failed event: ${job?.name} | id: ${job?.id} | error: ${err.message}`);
  });

  return worker;
}

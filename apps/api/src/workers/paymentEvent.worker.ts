/**
 * workers/paymentEvent.worker.ts — BullMQ Payment Event Processor (Phase 2 Upgrade)
 *
 * Consumes raw payment failures, performs instant Root Cause Analysis (RCA),
 * persists transactional entities, schedules smart retry jobs into BullMQ,
 * and appends tamper-evident audit logs.
 */

import { Worker, Job } from "bullmq";
import { getBullMQRedisClient } from "../config/redis";
import { type PaymentEventJobData } from "../queues/paymentEvents.queue";
import { retryExecutionQueue } from "../queues/retryExecution.queue";
import { classifyPaymentFailure } from "../services/rca.service";
import { calculateNextRetrySchedule } from "../services/retrySequencer.service";
import { prisma, PaymentStatus, RecoveryStage, AuditEventType, DeclineCategory, Prisma } from "@revrec/db";
import { logger } from "../config/logger";

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
      logger.info(`[Worker] invoice.payment_failed received — queued for Phase 3 handler`);
      break;

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

  if (!externalId || !amountInPaise) {
    throw new Error(`payment.failed entity missing required fields (id, amount) | eventId: ${eventId}`);
  }

  const customerId = externalCustomerId ?? `anonymous_${externalId}`;

  // 1. Execute instant Root Cause Analysis (RCA)
  const rcaResult = classifyPaymentFailure(errorCode, errorDescription, gateway);
  logger.info(`[RCA] Classified ${externalId} as ${rcaResult.category} (Confidence: ${rcaResult.confidence * 100}%) — ${rcaResult.reasoning}`);

  // 2. Transactional Database Ingestion & Workflow State Machine Setup
  await prisma.$transaction(async (tx) => {
    // ── Upsert Customer Record ───────────────────────────────────────────────
    const customer = await tx.customer.upsert({
      where: { externalId: customerId },
      update: { updatedAt: new Date() },
      create: {
        externalId: customerId,
        name: (entity["name"] as string | undefined) ?? "Unknown Customer",
        email: (entity["email"] as string | undefined) ?? `${customerId}@unknown.revrec`,
        phone: (entity["contact"] as string | undefined) ?? "+910000000000",
        riskScore: 50,
        ltvInPaise: 0,
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

          // Enqueue delayed job into BullMQ
          await retryExecutionQueue.add(
            "execute-retry",
            {
              workflowId: workflow.id,
              paymentId: payment.id,
              customerId: customer.id,
              attemptNumber: 1,
              scheduledFor: retrySchedule.scheduledAt.toISOString(),
              strategyUsed: retrySchedule.strategyUsed,
            },
            {
              delay: Math.max(1000, retrySchedule.delaySeconds * 1000),
              jobId: `retry_${workflow.id}_att_1`,
            }
          );

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
  });

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
  const customerId = (entity["customer_id"] as string | undefined) ?? `sub_cust_${externalSubId}`;

  logger.info(`[Worker] Processing subscription failure for ${externalSubId} (Customer: ${customerId}, Gateway: ${gateway}, Event: ${eventId}, Received: ${receivedAt})`);

  // Phase 2 Mandate handler: Upsert Subscription failed attempts counter
  if (externalSubId) {
    await prisma.subscription.updateMany({
      where: { externalId: externalSubId },
      data: {
        failedAttempts: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }
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

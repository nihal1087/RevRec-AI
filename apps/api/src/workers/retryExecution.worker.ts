/**
 * workers/retryExecution.worker.ts — BullMQ Retry Execution Worker
 *
 * Executes scheduled payment retries with versioned optimistic locking,
 * simulates/calls gateway debit endpoints, transitions recovery state machines,
 * and appends immutable audit records.
 */

import { Worker, Job } from "bullmq";
import { getBullMQRedisClient } from "../config/redis";
import { retryExecutionQueue, type RetryExecutionJobData } from "../queues/retryExecution.queue";
import { calculateNextRetrySchedule } from "../services/retrySequencer.service";
import {
  prisma,
  RecoveryStage,
  PaymentStatus,
  AuditEventType,
  RecoveryMethod,
  Prisma,
} from "@revrec/db";
import { DeclineCategory } from "@revrec/types";
import { logger } from "../config/logger";

const WORKER_CONCURRENCY = 5;

/**
 * Simulates a payment gateway retry execution.
 * In a real production setup, this calls Razorpay's `/payments/{id}/retry` or customer charge API.
 * High-probability success for simulated realistic demonstration (75% default on smart retries).
 */
async function executeGatewayRetry(paymentId: string, amountInPaise: number): Promise<{ success: boolean; gatewayPaymentId: string; errorCode?: string }> {
  logger.info(`[GatewayMock] Simulating retry debit for ₹${amountInPaise / 100} (PaymentId: ${paymentId})`);
  // If paymentId starts with "fail_always", simulate persistent failure for testing
  if (paymentId.includes("fail_always")) {
    return { success: false, gatewayPaymentId: `retry_${paymentId}`, errorCode: "INSUFFICIENT_FUNDS" };
  }
  if (paymentId.includes("success_always")) {
    return { success: true, gatewayPaymentId: `retry_succ_${paymentId}` };
  }

  // Realistic mock: higher success rate if retry was properly timed
  const isSuccess = Math.random() < 0.75;
  if (isSuccess) {
    return { success: true, gatewayPaymentId: `pay_retry_${Date.now()}` };
  } else {
    return {
      success: false,
      gatewayPaymentId: `pay_retry_${Date.now()}`,
      errorCode: "PAYMENT_FAILED_DUE_TO_INSUFFICIENT_FUNDS",
    };
  }
}

async function processRetryJob(job: Job<RetryExecutionJobData>): Promise<void> {
  const { workflowId, paymentId, attemptNumber, strategyUsed } = job.data;

  logger.info(`[RetryWorker] Executing retry attempt #${attemptNumber} for workflow ${workflowId} (Strategy: ${strategyUsed})`);

  // 1. Fetch current workflow and payment state
  const workflow = await prisma.recoveryWorkflow.findUnique({
    where: { id: workflowId },
    include: { payment: true, customer: true },
  });

  if (!workflow) {
    logger.warn(`[RetryWorker] Workflow ${workflowId} not found — dropping job`);
    return;
  }

  // 2. State machine guard: if workflow already completed, halted, or escalated, abort retry
  if (
    workflow.stage === RecoveryStage.RECOVERED ||
    workflow.stage === RecoveryStage.HALTED ||
    workflow.stage === RecoveryStage.ABANDONED
  ) {
    logger.info(`[RetryWorker] Workflow ${workflowId} is in terminal state ${workflow.stage} — skipping retry`);
    return;
  }

  const currentVersion = workflow.version;

  // 3. Execute gateway retry attempt
  const retryResult = await executeGatewayRetry(paymentId, workflow.amountAtRiskInPaise);

  if (retryResult.success) {
    // ── SUCCESSFUL RECOVERY ─────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      // Optimistic lock verification on update
      const updated = await tx.recoveryWorkflow.updateMany({
        where: { id: workflowId, version: currentVersion },
        data: {
          stage: RecoveryStage.RECOVERED,
          amountRecoveredInPaise: workflow.amountAtRiskInPaise,
          recoveryMethod: RecoveryMethod.AUTO_RETRY,
          retryCount: workflow.retryCount + 1,
          nextActionAt: null,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new Error(`[RetryWorker] Optimistic lock conflict on workflow ${workflowId}`);
      }

      await tx.payment.update({
        where: { id: workflow.paymentId },
        data: {
          status: PaymentStatus.CAPTURED,
          version: { increment: 1 },
        },
      });

      // Audit Log: Retry Succeeded
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.PAYMENT_RETRY_SUCCEEDED,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "RETRY_SEQUENCER",
          actorId: "smart-retry-worker",
          payload: {
            attemptNumber,
            strategyUsed,
            gatewayPaymentId: retryResult.gatewayPaymentId,
            amountRecoveredInPaise: workflow.amountAtRiskInPaise,
          },
          previousStage: workflow.stage,
          newStage: RecoveryStage.RECOVERED,
          amountInPaise: workflow.amountAtRiskInPaise,
          outcome: "SUCCESS",
        },
      });

      // Audit Log: Workflow Recovered
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.WORKFLOW_RECOVERED,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "RETRY_SEQUENCER",
          actorId: "smart-retry-worker",
          payload: {
            recoveredVia: "SMART_AUTO_RETRY",
            totalAttempts: workflow.retryCount + 1,
          },
          previousStage: workflow.stage,
          newStage: RecoveryStage.RECOVERED,
          amountInPaise: workflow.amountAtRiskInPaise,
          outcome: "SUCCESS",
        },
      });
    });

    logger.info(`[RetryWorker] 💰 SUCCESS! Recovered ₹${workflow.amountAtRiskInPaise / 100} on workflow ${workflowId}`);
  } else {
    // ── RETRY FAILED ────────────────────────────────────────────────────────
    const rawCategory = workflow.payment.declineCategory ?? "SOFT";
    const category = (DeclineCategory[rawCategory as keyof typeof DeclineCategory] ?? DeclineCategory.SOFT) as DeclineCategory;
    const nextSchedule = calculateNextRetrySchedule({
      category,
      currentAttemptCount: workflow.retryCount + 1,
      customerRiskScore: workflow.customer.riskScore,
    });

    await prisma.$transaction(async (tx) => {
      // Audit Log: Payment Retry Failed
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.PAYMENT_RETRY_FAILED,
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          actorType: "RETRY_SEQUENCER",
          actorId: "smart-retry-worker",
          payload: {
            attemptNumber,
            errorCode: retryResult.errorCode ?? "UNKNOWN",
            nextSchedule: JSON.parse(JSON.stringify(nextSchedule)) as Prisma.InputJsonValue,
          },
          amountInPaise: workflow.amountAtRiskInPaise,
          outcome: "FAILURE",
          errorMessage: retryResult.errorCode ?? null,
        },
      });

      if (nextSchedule.shouldRetry && nextSchedule.scheduledAt) {
        // Schedule next automatic retry
        await tx.recoveryWorkflow.updateMany({
          where: { id: workflowId, version: currentVersion },
          data: {
            retryCount: workflow.retryCount + 1,
            nextActionAt: nextSchedule.scheduledAt,
            stage: RecoveryStage.RETRYING,
            version: { increment: 1 },
          },
        });

        // Add to BullMQ delayed queue
        await retryExecutionQueue.add(
          "execute-retry",
          {
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            attemptNumber: nextSchedule.attemptNumber,
            scheduledFor: nextSchedule.scheduledAt.toISOString(),
            strategyUsed: nextSchedule.strategyUsed,
          },
          {
            delay: Math.max(1000, nextSchedule.delaySeconds * 1000),
            jobId: `retry_${workflow.id}_att_${nextSchedule.attemptNumber}`,
          }
        );

        logger.info(`[RetryWorker] Rescheduled attempt #${nextSchedule.attemptNumber} for workflow ${workflowId} at ${nextSchedule.scheduledAt.toISOString()}`);
      } else {
        // Max retries exceeded -> escalate to customer outreach / AI Agent
        await tx.recoveryWorkflow.updateMany({
          where: { id: workflowId, version: currentVersion },
          data: {
            retryCount: workflow.retryCount + 1,
            stage: RecoveryStage.OUTREACH_SENT,
            escalationReason: nextSchedule.reasoning,
            nextActionAt: null,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.MAX_ATTEMPTS_REACHED,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "RETRY_SEQUENCER",
            actorId: "smart-retry-worker",
            payload: {
              totalRetryAttempts: workflow.retryCount + 1,
              reason: nextSchedule.reasoning,
            },
            previousStage: workflow.stage,
            newStage: RecoveryStage.OUTREACH_SENT,
            outcome: "ESCALATED",
          },
        });

        logger.info(`[RetryWorker] Retries exhausted for workflow ${workflowId}. Escalated to stage OUTREACH_SENT.`);
      }
    });
  }
}

export function startRetryExecutionWorker(): Worker<RetryExecutionJobData> {
  const worker = new Worker<RetryExecutionJobData>(
    "retry-execution",
    processRetryJob,
    {
      connection: getBullMQRedisClient(),
      concurrency: WORKER_CONCURRENCY,
      lockDuration: 30_000,
    }
  );

  worker.on("completed", (job: Job<RetryExecutionJobData>) => {
    logger.info(`[RetryWorker] ✅ Completed retry job ${job.id}`);
  });

  worker.on("failed", (job: Job<RetryExecutionJobData> | undefined, err: Error) => {
    logger.error(`[RetryWorker] ❌ Failed retry job ${job?.id}: ${err.message}`);
  });

  return worker;
}

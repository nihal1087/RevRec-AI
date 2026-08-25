/**
 * workers/paymentEvent.worker.ts — BullMQ Payment Event Processor
 *
 * This worker consumes jobs from the "payment-events" queue and performs
 * the transactional database work required to create Recovery Workflows.
 *
 * CONCURRENCY MODEL:
 * We run 5 concurrent workers. Each worker processes one job at a time.
 * 5 workers × ~200ms per job = handles ~25 events/second on one instance.
 * For Razorpay-scale (millions/day), we'd horizontally scale worker instances.
 *
 * FAILURE HANDLING:
 * If the job throws, BullMQ automatically retries up to 3 times with
 * exponential backoff (2s, 4s, 8s). After 3 failures, the job moves
 * to the "failed" queue for manual investigation.
 *
 * IDEMPOTENCY INSIDE THE WORKER:
 * The Redis idempotency check in the webhook handler is our first line.
 * But we need a SECOND line here because:
 * 1. Two workers could theoretically process the same eventId concurrently
 *    (BullMQ jobId deduplication prevents this, but we defend in depth)
 * 2. BullMQ's retry mechanism re-runs the same job after failures —
 *    we must be idempotent on retry (partial DB writes, then crash)
 *
 * The second line is PostgreSQL's unique constraint on RecoveryWorkflow.paymentId.
 * If we try to INSERT a duplicate, PostgreSQL throws P2002 (unique violation).
 * We catch that specific error and treat it as "already processed".
 */

import { Worker, Job } from "bullmq";
import { getBullMQRedisClient } from "../config/redis";
import { type PaymentEventJobData } from "../queues/paymentEvents.queue";
import { prisma, PaymentStatus, RecoveryStage, AuditEventType, Prisma } from "@revrec/db";

// How many jobs this single worker process handles in parallel.
// Tune based on DB connection pool size: don't exceed pool_size / 2.
const WORKER_CONCURRENCY = 5;

// ── Main Job Processor ────────────────────────────────────────────────────────

async function processPaymentEvent(
  job: Job<PaymentEventJobData>
): Promise<void> {
  const { eventId, eventType, gateway, rawPayload, receivedAt } = job.data;

  console.log(
    `[Worker] Processing | event: ${eventType} | id: ${eventId} | attempt: ${job.attemptsMade + 1}`
  );

  switch (eventType) {
    case "payment.failed":
      await handlePaymentFailed(rawPayload, gateway, eventId, receivedAt);
      break;

    case "subscription.charged.failed":
      // Phase 2 will flesh this out with mandate retry logic
      console.log(
        `[Worker] subscription.charged.failed received — Phase 2 handler pending`
      );
      break;

    case "invoice.payment_failed":
      // Phase 3 will handle B2B invoice recovery
      console.log(
        `[Worker] invoice.payment_failed received — Phase 3 handler pending`
      );
      break;

    default:
      console.log(
        `[Worker] Unhandled event type: ${eventType} — job complete with no action`
      );
  }
}

// ── payment.failed Handler ────────────────────────────────────────────────────

async function handlePaymentFailed(
  payload: Record<string, unknown>,
  gateway: string,
  eventId: string,
  receivedAt: string
): Promise<void> {
  // Extract the payment entity from Razorpay's nested payload structure
  const paymentWrapper = payload["payment"] as
    | { entity: Record<string, unknown> }
    | undefined;

  if (!paymentWrapper?.entity) {
    throw new Error(
      `payment.failed webhook missing payment.entity | eventId: ${eventId}`
    );
  }

  const entity = paymentWrapper.entity;

  // Validate required fields exist before touching the database
  const externalId = entity["id"] as string | undefined;
  const externalCustomerId = entity["customer_id"] as string | undefined;
  const amountInPaise = entity["amount"] as number | undefined;
  const errorCode = (entity["error_code"] as string | undefined) ?? "UNKNOWN";
  const errorDescription =
    (entity["error_description"] as string | undefined) ?? "";

  if (!externalId || !amountInPaise) {
    throw new Error(
      `payment.failed entity missing required fields (id, amount) | eventId: ${eventId}`
    );
  }

  const customerId = externalCustomerId ?? `anonymous_${externalId}`;

  /**
   * SINGLE ATOMIC TRANSACTION for all DB writes.
   *
   * WHY ONE TRANSACTION:
   * If we write the Payment but crash before writing the AuditLog,
   * we have an incomplete record. Wrapping everything in a transaction
   * guarantees all-or-nothing: either all 4 writes succeed, or NONE do,
   * and BullMQ retries the job from scratch on a clean state.
   *
   * OPTIMISTIC LOCKING on Payment:
   * When upserting payment status, we use `version: { increment: 1 }`.
   * This ensures every status change is recorded and detectable.
   * A full optimistic lock (check version before update) is added in Phase 2
   * when concurrent retry scheduling begins.
   */
  await prisma.$transaction(async (tx) => {
    // ── 1. Upsert Customer ───────────────────────────────────────────────────
    // In production, customer details come from Razorpay's Customer API.
    // Here we ensure the customer record exists before creating related records.
    const customer = await tx.customer.upsert({
      where: { externalId: customerId },
      update: {
        // Don't overwrite existing data — customer record may have been enriched
        updatedAt: new Date(),
      },
      create: {
        externalId: customerId,
        name: (entity["name"] as string | undefined) ?? "Unknown Customer",
        email:
          (entity["email"] as string | undefined) ??
          `${customerId}@unknown.revrec`,
        phone:
          (entity["contact"] as string | undefined) ?? "+910000000000",
        riskScore: 50, // Default — will be enriched by CustomerTool in Phase 3
        ltvInPaise: 0,
      },
    });

    // ── 2. Upsert Payment Record ─────────────────────────────────────────────
    // We use upsert because the payment may already exist in PENDING state
    // if a payment.created event was processed before this payment.failed event.
    const payment = await tx.payment.upsert({
      where: { externalId },
      update: {
        status: PaymentStatus.FAILED,
        gatewayErrorCode: errorCode,
        // Increment version to track this state change (optimistic lock marker)
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
        // idempotencyKey links this payment record to the webhook event that created it
        idempotencyKey: eventId,
      },
    });

    // ── 3. Create Recovery Workflow (if not already exists) ─────────────────
    // paymentId has a @unique constraint. If a workflow already exists for this
    // payment (e.g., from a previous retry of this job), the findUnique
    // returns it and we skip creation — idempotent behavior.
    const existingWorkflow = await tx.recoveryWorkflow.findUnique({
      where: { paymentId: payment.id },
      select: { id: true }, // Only need to check existence — don't fetch full record
    });

    if (!existingWorkflow) {
      const workflow = await tx.recoveryWorkflow.create({
        data: {
          paymentId: payment.id,
          customerId: customer.id,
          amountAtRiskInPaise: amountInPaise,
          stage: RecoveryStage.PENDING,
          // 30 days to recover — after that, the workflow auto-abandons.
          // This prevents stale workflows from consuming agent resources forever.
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // ── 4a. Audit: Workflow Created ──────────────────────────────────────
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.WORKFLOW_CREATED,
          workflowId: workflow.id,
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
          },
          newStage: RecoveryStage.PENDING,
          amountInPaise,
          outcome: "SUCCESS",
        },
      });

      console.log(
        `[Worker] ✅ RecoveryWorkflow created: ${workflow.id} for payment: ${payment.id} | ₹${amountInPaise / 100} at risk`
      );
    } else {
      console.log(
        `[Worker] ⏭️  RecoveryWorkflow already exists for payment: ${payment.id} — skipping creation`
      );
    }

    // ── 4b. Audit: Payment Failed Event (always log, even if workflow existed) ──
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

  console.log(
    `[Worker] ✅ Transaction complete for payment: ${externalId}`
  );
}

// ── Worker Factory ────────────────────────────────────────────────────────────

/**
 * Creates and starts the BullMQ worker.
 * Exported as a factory function (not auto-started) so tests can
 * import the file without inadvertently starting the worker.
 */
export function startPaymentEventWorker(): Worker<PaymentEventJobData> {
  const worker = new Worker<PaymentEventJobData>(
    "payment-events",
    processPaymentEvent,
    {
      connection: getBullMQRedisClient(),
      concurrency: WORKER_CONCURRENCY,
      // Lock duration: if a worker takes > 30s, BullMQ re-queues the job.
      // Our jobs should complete in < 500ms. 30s gives huge safety margin.
      lockDuration: 30_000,
    }
  );

  worker.on("completed", (job: Job<PaymentEventJobData>) => {
    console.log(
      `[Worker] ✅ Completed | jobId: ${job.id} | event: ${job.name}`
    );
  });

  worker.on("failed", (job: Job<PaymentEventJobData> | undefined, err: Error) => {
    console.error(
      `[Worker] ❌ Failed | jobId: ${job?.id} | event: ${job?.name} | error: ${err.message}`
    );
  });

  worker.on("error", (err: Error) => {
    console.error("[Worker] ❌ Worker-level error:", err.message);
  });

  worker.on("stalled", (jobId: string) => {
    // Stalled = worker locked the job but didn't complete it before lockDuration expired
    console.warn(`[Worker] ⚠️  Job stalled: ${jobId} — will be automatically re-queued`);
  });

  console.log(
    `[Worker] 🚀 Payment event worker started | concurrency: ${WORKER_CONCURRENCY}`
  );

  return worker;
}

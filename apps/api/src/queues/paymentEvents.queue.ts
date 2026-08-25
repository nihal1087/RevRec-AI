/**
 * queues/paymentEvents.queue.ts — BullMQ Payment Events Queue
 *
 * WHY BULLMQ OVER setTimeout OR DIRECT DB WRITES IN THE WEBHOOK HANDLER:
 *
 * 1. DURABILITY: BullMQ persists jobs in Redis. If the worker process
 *    crashes mid-execution, the job is NOT lost — it re-enters the queue
 *    and is retried. setTimeout jobs vanish on process crash.
 *
 * 2. SPEED: The webhook handler adds a job in ~2ms and returns 200.
 *    Razorpay's 5-second webhook timeout is never breached.
 *    Doing DB writes + AI agent calls synchronously would regularly
 *    hit 2-10 seconds under load.
 *
 * 3. BACKPRESSURE: BullMQ's concurrency setting prevents a flood of
 *    webhooks from overwhelming the database. Without it, 1000 concurrent
 *    webhooks = 1000 simultaneous Prisma transactions = PostgreSQL crash.
 *
 * 4. OBSERVABILITY: BullMQ tracks job state (waiting, active, completed,
 *    failed) in Redis. Bull Board UI (added in Phase 5) lets you see
 *    exactly which jobs are stuck, retrying, or failed — essential for
 *    incident investigation.
 */

import { Queue } from "bullmq";
import { getBullMQRedisClient } from "../config/redis";

// ── Job Data Contract ─────────────────────────────────────────────────────────

/**
 * The data payload attached to every job in the payment-events queue.
 * This is what the worker receives when it dequeues a job.
 *
 * All fields are readonly — jobs are immutable once enqueued.
 * The worker must not mutate this data.
 */
export interface PaymentEventJobData {
  readonly eventId: string;       // Our constructed idempotency key
  readonly eventType: string;     // e.g., "payment.failed", "invoice.payment_failed"
  readonly gateway: string;       // e.g., "razorpay"
  readonly rawPayload: Record<string, unknown>; // Raw webhook payload
  readonly receivedAt: string;    // ISO 8601 timestamp of webhook receipt
}

// ── Queue Definition ──────────────────────────────────────────────────────────

export const paymentEventsQueue = new Queue<PaymentEventJobData>(
  "payment-events",
  {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      // Retry failed jobs 3 times before marking as permanently failed
      attempts: 3,
      backoff: {
        // Exponential: 2s → 4s → 8s. Prevents hammering a struggling DB.
        type: "exponential",
        delay: 2000,
      },
      // Keep completed jobs in Redis for observability (last 1000)
      // These are viewable in Bull Board / Redis Commander
      removeOnComplete: { count: 1000, age: 24 * 3600 }, // 24h
      // Keep failed jobs longer for incident investigation
      removeOnFail: { count: 5000, age: 7 * 24 * 3600 }, // 7 days
    },
  }
);

// Log queue-level events (not job-level — those are in the worker)
paymentEventsQueue.on("error", (err: Error) => {
  console.error("[Queue:payment-events] ❌ Queue error:", err.message);
});

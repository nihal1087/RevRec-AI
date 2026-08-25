/**
 * services/idempotency.service.ts — Webhook Idempotency Guard
 *
 * PURPOSE:
 * Razorpay (and all major payment gateways) use at-least-once delivery
 * for webhooks. This means the SAME event can arrive 2, 3, or more times
 * due to network retries, Razorpay's internal retry logic, or our own
 * 5xx responses. Without idempotency protection:
 *   - One payment.failed → creates TWO recovery workflows
 *   - Customer gets contacted TWICE → regulatory violation
 *   - In the worst case, a payment gets retried TWICE → double charge
 *
 * IMPLEMENTATION — Redis SET NX (Set if Not eXists):
 * `SET key value EX 86400 NX`
 * - NX: Only set if key doesn't already exist (atomic operation)
 * - EX: Expire after 24 hours (Razorpay retries stop within minutes,
 *   so 24h is more than sufficient and prevents unbounded Redis growth)
 * - Returns "OK" if key was newly set (FIRST time seeing this event)
 * - Returns null if key already existed (DUPLICATE event — skip processing)
 *
 * WHY REDIS, NOT POSTGRESQL FOR IDEMPOTENCY:
 * The idempotency check happens BEFORE we enqueue the job — it's in the
 * HTTP request path. PostgreSQL would require a full DB round-trip with
 * transaction overhead. Redis SET NX is an atomic O(1) operation that
 * completes in <1ms, keeping our webhook response time under 10ms.
 * PostgreSQL remains the SECOND idempotency layer (unique constraint on
 * paymentId in RecoveryWorkflow) as a backup for race conditions.
 */

import { getRedisClient } from "../config/redis";

const IDEMPOTENCY_KEY_TTL_SECONDS = 86_400; // 24 hours
const KEY_PREFIX = "revrec:webhook:idempotency:";

/**
 * Atomically checks and sets an idempotency key for a webhook event.
 *
 * @param eventId - A unique identifier for the webhook event.
 *   Constructed as: `{eventType}_{entityId}` for maximum uniqueness.
 *
 * @returns {Promise<boolean>}
 *   - `true`  → This is a NEW event. Caller should process it.
 *   - `false` → This is a DUPLICATE event. Caller should skip processing
 *               and return 200 to prevent Razorpay from retrying.
 *
 * @throws {Error} If Redis is unavailable. Caller should handle this:
 *   in that case, it's safer to process the event (and rely on the
 *   PostgreSQL unique constraint as fallback) than to drop it entirely.
 */
export async function checkAndSetIdempotency(
  eventId: string
): Promise<boolean> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${eventId}`;

  // This SET NX is atomic — no race condition possible between two workers
  // both checking the same key at the same millisecond.
  const result = await redis.set(
    key,
    new Date().toISOString(), // Store timestamp for debugging, not just "1"
    "EX",
    IDEMPOTENCY_KEY_TTL_SECONDS,
    "NX"
  );

  // "OK" = key was set = this is a new event
  // null  = key already existed = this is a duplicate
  return result === "OK";
}

/**
 * Marks a webhook event as "processing failed" by deleting its idempotency key.
 * This allows Razorpay to retry delivery.
 *
 * Call this ONLY when the failure is transient (e.g., DB temporarily down).
 * Do NOT call for permanent failures (e.g., invalid payload).
 */
export async function releaseIdempotencyKey(eventId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${eventId}`;
  await redis.del(key);
}

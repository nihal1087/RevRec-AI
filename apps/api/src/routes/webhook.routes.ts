/**
 * routes/webhook.routes.ts — Payment Gateway Webhook Ingestion Endpoint
 *
 * This is the entry point for ALL external payment events (Razorpay, Stripe, etc.)
 * The handler's only jobs are:
 *   1. Validate payload structure (Zod)
 *   2. Check idempotency (Redis SET NX)
 *   3. Enqueue job for async processing (BullMQ)
 *   4. Return 200 in < 50ms
 *
 * It intentionally does ZERO database operations. The heavy lifting
 * (DB writes, RCA classification, agent decisions) is all in the worker.
 *
 * WHY RETURN 200 FOR DUPLICATE EVENTS:
 * If we return 4xx for a duplicate, Razorpay interprets it as "delivery failed"
 * and schedules a retry. This would cause an infinite retry loop for events
 * we've already successfully processed. Always return 200 for idempotent re-delivery.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { validateWebhookSignature } from "../middleware/validateWebhookSignature";
import {
  checkAndSetIdempotency,
  releaseIdempotencyKey,
} from "../services/idempotency.service";
import { paymentEventsQueue } from "../queues/paymentEvents.queue";

// ── Zod Schema for Razorpay Webhook Payload ───────────────────────────────────

/**
 * Razorpay webhook structure:
 * {
 *   "entity": "event",
 *   "event": "payment.failed",
 *   "account_id": "acc_xxxxx",
 *   "contains": ["payment"],
 *   "payload": {
 *     "payment": { "entity": { "id": "pay_xxxxx", "amount": 50000, ... } }
 *   },
 *   "created_at": 1234567890
 * }
 */
const RazorpayEntitySchema = z.object({
  entity: z.record(z.string(), z.unknown()),
});

const RazorpayWebhookSchema = z.object({
  entity: z.literal("event"),
  event: z.string().min(1),
  // account_id may be absent in test mode webhooks
  account_id: z.string().optional(),
  contains: z.array(z.string()),
  payload: z.record(z.string(), RazorpayEntitySchema),
  created_at: z.number().int().positive(),
});

type RazorpayWebhook = z.infer<typeof RazorpayWebhookSchema>;

// ── Helper: Extract a stable entity ID for idempotency ───────────────────────

/**
 * Constructs a deterministic idempotency key from the webhook payload.
 * We derive it from the primary entity's ID (e.g., pay_xxxxx, sub_xxxxx)
 * plus the event type. This is stable across retries of the same event.
 *
 * Razorpay doesn't always send an X-Razorpay-Event-Id header, so we
 * construct our own from stable content.
 */
function buildIdempotencyKey(webhook: RazorpayWebhook): string {
  const primaryEntity = webhook.contains[0]; // e.g., "payment", "subscription"

  if (primaryEntity && webhook.payload[primaryEntity]) {
    const entityData = webhook.payload[primaryEntity]?.entity;
    const entityId = entityData?.["id"] as string | undefined;
    if (entityId) {
      return `${webhook.event}:${entityId}`;
    }
  }

  // Fallback: use event type + timestamp (less ideal but still unique per delivery window)
  return `${webhook.event}:${webhook.created_at}:${webhook.account_id ?? "unknown"}`;
}

// ── Supported Event Types ─────────────────────────────────────────────────────

const SUPPORTED_EVENT_TYPES = new Set([
  "payment.failed",
  "subscription.charged.failed",
  "invoice.payment_failed",
  "checkout.dropoff", // Phase 3
]);

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/webhooks
 *
 * Flow:
 * validateWebhookSignature (HMAC) → Zod parse → Idempotency check → BullMQ enqueue → 200
 *
 * Note: express.raw() is applied at this router level in index.ts,
 * NOT express.json(). This is what allows validateWebhookSignature
 * to access the raw bytes for HMAC computation.
 */
router.post(
  "/",
  validateWebhookSignature,
  async (req: Request, res: Response): Promise<void> => {
    // ── Parse & Validate ────────────────────────────────────────────────────
    const parseResult = RazorpayWebhookSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(422).json({
        error: "Invalid webhook payload structure",
        details: parseResult.error.flatten(),
      });
      return;
    }

    const webhook = parseResult.data;

    // ── Log unsupported but valid events ───────────────────────────────────
    if (!SUPPORTED_EVENT_TYPES.has(webhook.event)) {
      console.log(
        `[Webhook] Unsupported event type received: ${webhook.event} — acknowledging without processing`
      );
      res.status(200).json({
        status: "acknowledged",
        message: `Event type '${webhook.event}' is not handled by RevRec`,
      });
      return;
    }

    // ── Idempotency Check ──────────────────────────────────────────────────
    const idempotencyKey = buildIdempotencyKey(webhook);

    let isNewEvent: boolean;
    try {
      isNewEvent = await checkAndSetIdempotency(idempotencyKey);
    } catch (redisError) {
      // Redis is down — we can't reliably deduplicate.
      // Log the error and ALLOW processing (relying on PostgreSQL unique constraint).
      // Dropping events is worse than occasional duplicates (second layer catches them).
      console.error(
        "[Webhook] ⚠️  Redis unavailable for idempotency check — proceeding without it:",
        redisError
      );
      isNewEvent = true;
    }

    if (!isNewEvent) {
      console.log(
        `[Webhook] ⏭️  Duplicate event skipped: ${idempotencyKey}`
      );
      // Return 200 — NOT 4xx. If we return 4xx, Razorpay retries the event.
      res.status(200).json({
        status: "already_processed",
        eventId: idempotencyKey,
      });
      return;
    }

    // ── Enqueue for Async Processing ───────────────────────────────────────
    try {
      await paymentEventsQueue.add(
        webhook.event, // Job name = event type (visible in Bull Board)
        {
          eventId: idempotencyKey,
          eventType: webhook.event,
          gateway: "razorpay",
          rawPayload: webhook.payload,
          receivedAt: new Date().toISOString(),
        },
        {
          // Using eventId as jobId prevents BullMQ from queueing duplicate
          // jobs even if Redis SET NX somehow races (belt-and-suspenders approach)
          jobId: idempotencyKey,
        }
      );
    } catch (queueError) {
      // BullMQ enqueue failed — release the idempotency lock so Razorpay can retry
      await releaseIdempotencyKey(idempotencyKey).catch(() => {
        // Best-effort release — if this also fails, the event may be dropped
        console.error("[Webhook] Failed to release idempotency key after queue error");
      });
      throw queueError; // Let Express global error handler return 500 → Razorpay retries
    }

    console.log(
      `[Webhook] ✅ Queued: ${webhook.event} | eventId: ${idempotencyKey}`
    );

    // Respond immediately — don't wait for the worker to process
    res.status(200).json({
      status: "queued",
      eventId: idempotencyKey,
    });
  }
);

export { router as webhookRouter };

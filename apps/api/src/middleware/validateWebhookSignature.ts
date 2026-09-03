/**
 * middleware/validateWebhookSignature.ts — HMAC-SHA256 Webhook Verifier
 *
 * SECURITY CRITICAL — This middleware is the only thing standing between
 * the public internet and our payment recovery engine.
 *
 * THE ATTACK THIS PREVENTS:
 * Without signature verification, anyone who discovers our webhook URL
 * can POST fake payment.failed events, causing us to:
 * - Initiate recovery workflows for real customers who actually paid
 * - Send dunning messages to paying customers → legal liability
 * - Exhaust LLM API budget on fake events
 *
 * HOW HMAC VERIFICATION WORKS:
 * Razorpay signs every webhook payload with our WEBHOOK_SECRET using
 * HMAC-SHA256. We compute the same signature on our end and compare.
 * If they match, the payload is authentic and unmodified.
 *
 * CRITICAL: express.raw() MUST parse this route's body, NOT express.json().
 * HMAC is computed over the raw bytes. Even a single whitespace change
 * in JSON (pretty-print vs compact) would invalidate the signature.
 * Parsing with express.json() discards the raw bytes — we'd have no way
 * to verify the signature. This middleware assumes req.body is a Buffer.
 *
 * WHY timingSafeEqual (NOT === OR ==):
 * String comparison in most languages short-circuits on first mismatch.
 * An attacker can measure response latency:
 *   - "AA..." → 1μs response (mismatch at byte 1)
 *   - "XA..." → 2μs response (mismatch at byte 2)
 * By varying characters and measuring time, they learn the correct signature
 * byte by byte. crypto.timingSafeEqual() ALWAYS takes the same time
 * regardless of how many bytes match.
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../config/logger";

// Header name used by Razorpay to send the signature
const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";

/**
 * Express middleware that:
 * 1. Extracts the X-Razorpay-Signature header
 * 2. Computes HMAC-SHA256(rawBody, WEBHOOK_SECRET)
 * 3. Compares with timingSafeEqual (constant-time comparison)
 * 4. On success: parses the raw buffer into req.body as JSON
 * 5. On failure: returns 401 without leaking why it failed
 */
export function validateWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ── Step 1: Check signature header exists ──────────────────────────────────
  const receivedSignature = req.headers[RAZORPAY_SIGNATURE_HEADER];

  if (typeof receivedSignature !== "string" || !receivedSignature) {
    res.status(401).json({
      error: "Unauthorized",
      // Deliberately vague — don't tell attackers what's missing
      message: "Invalid webhook request",
    });
    return;
  }

  // ── Step 2: Ensure we have the raw body as a Buffer ───────────────────────
  // This ONLY works if this route was mounted with express.raw() middleware.
  if (!Buffer.isBuffer(req.body)) {
    logger.error(
      "[Webhook] FATAL: req.body is not a Buffer. " +
        "Is this route using express.raw() instead of express.json()?"
    );
    res.status(500).json({ error: "Internal server configuration error" });
    return;
  }

  const rawBodyBuffer = req.body;

  // ── Step 3: Compute expected HMAC-SHA256 signature ────────────────────────
  const webhookSecret = process.env["WEBHOOK_SECRET"];
  if (!webhookSecret) {
    // This should have been caught at startup, but guard defensively
    logger.error("[Webhook] FATAL: WEBHOOK_SECRET environment variable is not set");
    res.status(500).json({ error: "Internal server configuration error" });
    return;
  }

  const computedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBodyBuffer)
    .digest("hex");

  // ── Step 4: Constant-time comparison ─────────────────────────────────────
  // Convert both signatures to Buffers of equal length for timingSafeEqual.
  // If lengths differ, they can't be equal — but we still do a dummy comparison
  // to avoid leaking length information via fast rejection timing.
  const receivedBuffer = Buffer.from(receivedSignature, "hex");
  const computedBuffer = Buffer.from(computedSignature, "hex");

  let signaturesMatch = false;
  if (receivedBuffer.length === computedBuffer.length) {
    signaturesMatch = crypto.timingSafeEqual(receivedBuffer, computedBuffer);
  } else {
    // M8 fix: run a dummy constant-time comparison when lengths differ so that
    // fast rejection doesn't reveal signature length via timing side-channel.
    crypto.timingSafeEqual(computedBuffer, computedBuffer);
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    logger.warn(
      "[Webhook] ⚠️  Signature mismatch — rejected forged/tampered webhook"
    );
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid webhook request",
    });
    return;
  }

  // ── Step 5: Signature is valid — parse body from Buffer → JSON ───────────
  try {
    req.body = JSON.parse(rawBodyBuffer.toString("utf8")) as unknown;
  } catch {
    res.status(400).json({ error: "Invalid JSON in webhook payload" });
    return;
  }

  // Signature verified, body parsed — proceed to route handler
  next();
}

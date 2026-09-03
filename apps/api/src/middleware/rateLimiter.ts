/**
 * middleware/rateLimiter.ts — Redis-backed Distributed Rate Limiter
 *
 * WHY RATE LIMITING IS CRITICAL:
 * Endpoints that trigger LLM calls (e.g. /api/agent/bot/chat, /api/agent/decide)
 * or resource-heavy batch jobs (e.g. /api/simulate/batch) must be bounded.
 * Without rate limiting:
 *   - A burst or loop can exhaust the LLM provider API budget
 *   - Attackers can cause Denial of Service (DoS) by saturating BullMQ
 *
 * IMPLEMENTATION:
 * Atomic Redis INCR with TTL expiration per IP / identifier.
 * Gracefully falls back to an in-memory Map if Redis is temporarily unreachable.
 * Bypassed in automated test environment (NODE_ENV === 'test') to prevent test flakiness.
 */

import { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../config/redis";
import { logger } from "../config/logger";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  prefix?: string;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

// In-memory fallback bucket store for offline / dev mode
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(options: RateLimitOptions) {
  const {
    windowSeconds,
    maxRequests,
    prefix = "general",
    message = "Too many requests. Please slow down and try again later.",
    keyGenerator = (req: Request) =>
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown_ip",
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Bypass in test suites
    if (process.env["NODE_ENV"] === "test") {
      next();
      return;
    }

    const identifier = keyGenerator(req);
    const key = `revrec:ratelimit:${prefix}:${identifier}`;

    try {
      const redis = getRedisClient();
      const current = await redis.incr(key);

      if (current === 1) {
        // First request in this window — set expiry
        await redis.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : windowSeconds;

        logger.warn(`[RateLimiter] ⚠️  Rate limit exceeded for ${prefix}:${identifier} (${current}/${maxRequests})`);

        res.set("Retry-After", String(retryAfter));
        res.status(429).json({
          error: "Too Many Requests",
          message,
          retryAfterSeconds: retryAfter,
        });
        return;
      }

      // Add rate limit headers
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", String(Math.max(0, maxRequests - current)));

      next();
    } catch {
      // Fallback to in-memory rate limiting if Redis connection drops
      const now = Date.now();
      const bucket = memoryBuckets.get(key);

      if (!bucket || now > bucket.resetAt) {
        memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        next();
        return;
      }

      bucket.count += 1;
      if (bucket.count > maxRequests) {
        const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
        res.set("Retry-After", String(retryAfter));
        res.status(429).json({
          error: "Too Many Requests",
          message,
          retryAfterSeconds: retryAfter,
        });
        return;
      }

      next();
    }
  };
}

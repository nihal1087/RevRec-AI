/**
 * config/redis.ts — IORedis Singleton
 *
 * WHY IOREDIS (NOT THE BUILT-IN redis PACKAGE):
 * BullMQ REQUIRES ioredis. It uses ioredis-specific features like
 * blocking commands (BRPOP) and multi-exec pipelines that the
 * standard redis package doesn't support.
 *
 * WHY A SINGLETON:
 * Each Redis connection is a persistent TCP socket. Opening a new
 * connection per-request would exhaust Redis's connection limit
 * (default: 10,000) and add ~50-100ms latency per operation.
 * The singleton is created once and reused across all modules.
 *
 * WHY maxRetriesPerRequest: null and enableReadyCheck: false:
 * These are REQUIRED by BullMQ. Without them, BullMQ's internal
 * command pipelines will throw "Connection is closed" errors during
 * reconnect cycles. BullMQ handles its own reconnect logic.
 */

import Redis from "ioredis";
import { logger } from "./logger";

// We need two separate Redis connections:
// 1. A general-purpose client for idempotency keys, rate limiting, caching
// 2. A BullMQ-dedicated client (BullMQ requires exclusive ownership of its connection)
// Using the same connection for both causes command conflicts.

let generalRedisInstance: Redis | null = null;
let bullmqRedisInstance: Redis | null = null;

function createRedisConnection(
  clientName: string,
  bullmqMode: boolean = false
): Redis {
  const commonOptions = {
    // BullMQ REQUIRES these two options — do not remove them
    maxRetriesPerRequest: bullmqMode ? null : 3,
    enableReadyCheck: false,
    // Connection name helps identify clients in Redis MONITOR output
    connectionName: `revrec-${clientName}`,
    // Reconnect strategy: exponential backoff capped at 30 seconds
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 500, 30000);
      logger.warn(
        `[Redis:${clientName}] Reconnect attempt ${times}, waiting ${delay}ms`
      );
      return delay;
    },
  };

  const redisUrl = process.env["REDIS_URL"];
  const client = redisUrl
    ? new Redis(redisUrl, {
        ...commonOptions,
        ...(process.env["REDIS_PASSWORD"] ? { password: process.env["REDIS_PASSWORD"] } : {}),
      })
    : new Redis({
        host: process.env["REDIS_HOST"] ?? "localhost",
        port: parseInt(process.env["REDIS_PORT"] ?? "6379", 10),
        // Only set password if it's a non-empty string
        ...(process.env["REDIS_PASSWORD"]
          ? { password: process.env["REDIS_PASSWORD"] }
          : {}),
        ...commonOptions,
      });

  client.on("connect", () => {
    logger.info(`[Redis:${clientName}] ✅ Connected to Redis`);
  });

  client.on("ready", () => {
    logger.info(`[Redis:${clientName}] ✅ Ready to accept commands`);
  });

  client.on("error", (err: Error) => {
    // Log but don't crash — ioredis will auto-reconnect
    logger.error(`[Redis:${clientName}] ❌ Error:`, err.message);
  });

  client.on("close", () => {
    logger.warn(`[Redis:${clientName}] ⚠️  Connection closed`);
  });

  return client;
}

/**
 * General-purpose Redis client.
 * Use for: idempotency keys, rate limiting, caching, distributed locks.
 */
export function getRedisClient(): Redis {
  if (!generalRedisInstance) {
    generalRedisInstance = createRedisConnection("general", false);
  }
  return generalRedisInstance;
}

/**
 * BullMQ-dedicated Redis client.
 * Use ONLY for: passing to BullMQ Queue and Worker constructors.
 * Do NOT use this for general key-value operations.
 */
export function getBullMQRedisClient(): Redis {
  if (!bullmqRedisInstance) {
    bullmqRedisInstance = createRedisConnection("bullmq", true);
  }
  return bullmqRedisInstance;
}

/**
 * Gracefully close all Redis connections.
 * Called during process shutdown to allow in-flight commands to complete.
 * L3 fix: wrap each quit() in a 3-second timeout that falls back to disconnect()
 * so a hung Redis connection doesn't block the process from exiting.
 */
export async function closeAllRedisConnections(): Promise<void> {
  const gracefulQuit = (client: Redis, name: string): Promise<void> =>
    Promise.race([
      client.quit().then(() => undefined),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          logger.warn(`[Redis:${name}] quit() timed out — forcing disconnect()`);
          client.disconnect();
          resolve();
        }, 3000)
      ),
    ]);

  const closePromises: Promise<void>[] = [];
  if (generalRedisInstance) closePromises.push(gracefulQuit(generalRedisInstance, "general"));
  if (bullmqRedisInstance)  closePromises.push(gracefulQuit(bullmqRedisInstance, "bullmq"));
  await Promise.all(closePromises);
  logger.info("[Redis] All connections closed gracefully");
}

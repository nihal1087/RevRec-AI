/**
 * index.ts — RevRec API Server Entry Point (Phase 1 update)
 *
 * MIDDLEWARE ORDER IS CRITICAL:
 * The webhook route MUST be mounted with express.raw() BEFORE the global
 * express.json() middleware. If express.json() runs first, it consumes
 * the request body stream — the raw bytes needed for HMAC verification
 * are gone forever. The webhook handler would then fail with "body already parsed".
 *
 * Mount order:
 * 1. /api/webhooks — express.raw() + signature verification
 * 2. express.json() — for all other routes
 * 3. /health, /api/* — normal JSON routes
 */

import "dotenv/config"; // Must be absolute first — loads .env before any env var reads
import express, { Request, Response, NextFunction } from "express";
import { webhookRouter } from "./routes/webhook.routes";
import { recoveryRouter } from "./routes/recovery.routes";
import { agentRouter } from "./routes/agent.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { simulationRouter } from "./routes/simulation.routes";
import { startPaymentEventWorker } from "./workers/paymentEvent.worker";
import { startRetryExecutionWorker } from "./workers/retryExecution.worker";
import { closeAllRedisConnections, getRedisClient } from "./config/redis";
import { logger } from "./config/logger";
import { prisma } from "@revrec/db";

// ── Environment Validation ────────────────────────────────────────────────────
// Crash loudly at startup if critical config is missing.
// This surfaces misconfigurations in CI/staging, not in production under load.
const requiredEnvVars = [
  "DATABASE_URL",
  "REDIS_HOST",
  "WEBHOOK_SECRET",
] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`[FATAL] Missing required environment variable: ${envVar}`);
    logger.error("[FATAL] Copy .env.example to apps/api/.env and fill in all values.");
    process.exit(1);
  }
}

const app = express();

// ── STEP 1: Mount Webhook Route with express.raw() FIRST ─────────────────────
// express.raw() reads the body as a raw Buffer and stops.
// It does NOT parse JSON. The validateWebhookSignature middleware does
// the HMAC check on the Buffer, THEN manually calls JSON.parse().
//
// type: 'application/json' ensures we only buffer bodies with this content type.
// Without it, express.raw() would buffer ALL request bodies (even file uploads).
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json", limit: "100kb" }),
  webhookRouter
);

// ── STEP 2: Global JSON Middleware for all other routes ───────────────────────
// This runs AFTER the webhook route, so webhooks are unaffected.
app.use(express.json({ limit: "10kb" }));

// ── STEP 3: Health Check ──────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    server: "ok",
    database: "unknown",
    redis: "unknown",
  };

  // Check PostgreSQL connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks["database"] = "ok";
  } catch {
    checks["database"] = "error";
  }

  // Check Redis connectivity with PING command
  try {
    const pong = await getRedisClient().ping();
    checks["redis"] = pong === "PONG" ? "ok" : "error";
  } catch {
    checks["redis"] = "error";
  }

  const allHealthy = Object.values(checks).every((v) => v === "ok");

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ok" : "degraded",
    service: "revrec-api",
    timestamp: new Date().toISOString(),
    version: process.env["npm_package_version"] ?? "unknown",
    checks,
  });
});

// ── STEP 4: Application Routes ────────────────────────────────────────────────
app.use("/api/recovery", recoveryRouter);
app.use("/api/agent", agentRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/simulate", simulationRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// 4-argument signature is required for Express to recognize as error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("[API Error]", {
    message: err.message,
    stack: process.env["NODE_ENV"] === "development" ? err.stack : undefined,
  });
  res.status(500).json({
    error: "Internal server error",
    ...(process.env["NODE_ENV"] === "development" && { detail: err.message }),
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

// Store worker references so they can be properly closed on shutdown
let paymentEventWorker: ReturnType<typeof startPaymentEventWorker> | null = null;
let retryExecutionWorker: ReturnType<typeof startRetryExecutionWorker> | null = null;

const server = app.listen(PORT, () => {
  logger.info(`[RevRec API] Server running on http://localhost:${PORT}`);
  logger.info(`[RevRec API] Environment: ${process.env["NODE_ENV"] ?? "development"}`);
  logger.info(`[RevRec API] Health: http://localhost:${PORT}/health`);
  logger.info(`[RevRec API] Webhook: POST http://localhost:${PORT}/api/webhooks`);
  logger.info(`[RevRec API] Recovery: GET/POST http://localhost:${PORT}/api/recovery`);
  logger.info(`[RevRec API] Agent & Bot: POST http://localhost:${PORT}/api/agent`);
  logger.info(`[RevRec API] Analytics: GET http://localhost:${PORT}/api/analytics/summary`);
  logger.info(`[RevRec API] Simulation: POST http://localhost:${PORT}/api/simulate/batch`);

  // Start BullMQ workers
  try {
    paymentEventWorker = startPaymentEventWorker();
    retryExecutionWorker = startRetryExecutionWorker();
    logger.info(`[RevRec API] BullMQ payment event and retry execution workers started`);
  } catch (err) {
    logger.error("[RevRec API] Failed to start BullMQ workers — shutting down", { err });
    process.exit(1);
  }
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
// Handle SIGTERM (Docker stop, Kubernetes pod termination) and SIGINT (Ctrl+C).
// This allows in-flight requests and jobs to complete before the process exits.
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[RevRec API] Received ${signal} — shutting down gracefully...`);

  server.close(async () => {
    logger.info("[RevRec API] HTTP server closed — no new requests accepted");

    // Close BullMQ workers first (stops accepting new jobs, awaits in-flight jobs)
    if (paymentEventWorker) await paymentEventWorker.close();
    if (retryExecutionWorker) await retryExecutionWorker.close();
    logger.info("[RevRec API] BullMQ workers closed");

    // Close database connections
    await prisma.$disconnect();
    logger.info("[RevRec API] Prisma disconnected");

    // Close Redis connections
    await closeAllRedisConnections();
    logger.info("[RevRec API] Redis connections closed");

    logger.info("[RevRec API] Graceful shutdown complete");
    process.exit(0);
  });

  // Force exit after 15 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error("[RevRec API] Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

// ── Safety Net: Catch Unhandled Async Errors ──────────────────────────────────
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[RevRec API] Unhandled promise rejection", { reason });
});
process.on("uncaughtException", (err: Error) => {
  logger.error("[RevRec API] Uncaught exception — shutting down", { err: err.message, stack: err.stack });
  process.exit(1);
});

// Export for Supertest integration tests
export { app };

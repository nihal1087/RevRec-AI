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
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { webhookRouter } from "./routes/webhook.routes";
import { recoveryRouter } from "./routes/recovery.routes";
import { agentRouter } from "./routes/agent.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { simulationRouter } from "./routes/simulation.routes";
import { checkoutRouter } from "./routes/checkout.routes";
import { communicationsRouter } from "./routes/communications.routes";
import { startPaymentEventWorker } from "./workers/paymentEvent.worker";
import { startRetryExecutionWorker } from "./workers/retryExecution.worker";
import { closeAllRedisConnections, getRedisClient } from "./config/redis";
import { logger } from "./config/logger";
import { prisma } from "@revrec/db";
import { requireApiKey } from "./middleware/requireApiKey";
import { correlationIdMiddleware } from "./middleware/correlationId";
import { paymentEventsQueue } from "./queues/paymentEvents.queue";
import { retryExecutionQueue } from "./queues/retryExecution.queue";

// ── Environment Validation ────────────────────────────────────────────────────
if (!process.env["DATABASE_URL"]) {
  logger.error("[FATAL] Missing required environment variable: DATABASE_URL");
  process.exit(1);
}
if (!process.env["REDIS_URL"] && !process.env["REDIS_HOST"]) {
  logger.error("[FATAL] Missing required environment variable: REDIS_URL or REDIS_HOST");
  process.exit(1);
}
if (!process.env["WEBHOOK_SECRET"]) {
  logger.error("[FATAL] Missing required environment variable: WEBHOOK_SECRET");
  process.exit(1);
}

const app = express();

// ── Bull Board — Queue Monitoring UI ─────────────────────────────────────────
// Available at /admin/queues (protected by requireApiKey — only accessible with
// a valid DASHBOARD_API_KEY header). Never expose this without auth in production.
const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [
    new BullMQAdapter(paymentEventsQueue),
    new BullMQAdapter(retryExecutionQueue),
  ],
  serverAdapter: bullBoardAdapter,
});

// ── Global CORS Middleware ───────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigin = process.env["CORS_ALLOWED_ORIGIN"] || (process.env["NODE_ENV"] === "production" ? "" : "*");
  const origin = req.headers.origin;

  if (allowedOrigin === "*") {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (allowedOrigin && origin && (allowedOrigin === origin || allowedOrigin.split(",").map((o) => o.trim()).includes(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  } else if (!allowedOrigin && process.env["NODE_ENV"] !== "production") {
    res.header("Access-Control-Allow-Origin", "*");
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Razorpay-Signature, X-API-Key");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});


// ── STEP 1: Mount Webhook Route with express.raw() FIRST ─────────────────────
// express.raw() reads the body as a raw Buffer and stops.
// It does NOT parse JSON. The validateWebhookSignature middleware does
// the HMAC check on the Buffer, THEN manually calls JSON.parse().
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json", limit: "100kb" }),
  webhookRouter
);

// ── STEP 2: Global JSON Middleware for all other routes ───────────────────────
// This runs AFTER the webhook route, so webhooks are unaffected.
app.use(express.json({ limit: "10kb" }));

// ── STEP 2b: Correlation ID — thread traceId through every request ────────────
app.use(correlationIdMiddleware);

// BigInt JSON Serializer — Prisma returns BigInt for monetary paise fields.
// JSON.stringify(42n) throws TypeError by default. This replacer converts
// BigInt to Number for JSON transport. Paise values fit safely in a JS Number
// (Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991 paise = ₹90 trillion).
app.set("json replacer", (_key: string, value: unknown) =>
  typeof value === "bigint" ? Number(value) : value
);

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
// requireApiKey is applied to all dashboard routes.
// /api/webhooks is excluded — it uses HMAC signature verification instead.
// /health is excluded — load balancers and uptime monitors need unauthenticated access.
app.use("/admin/queues", requireApiKey, bullBoardAdapter.getRouter());
app.use("/api/recovery", requireApiKey, recoveryRouter);
app.use("/api/agent", requireApiKey, agentRouter);
app.use("/api/analytics", requireApiKey, analyticsRouter);
app.use("/api/simulate", requireApiKey, simulationRouter);
app.use("/api/checkout", requireApiKey, checkoutRouter);
app.use("/api/communications", requireApiKey, communicationsRouter);

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

let server: ReturnType<typeof app.listen> | null = null;

if (process.env["NODE_ENV"] !== "test") {
  server = app.listen(PORT, () => {
    logger.info(`[RevRec API] Server running on http://localhost:${PORT}`);
    logger.info(`[RevRec API] Environment: ${process.env["NODE_ENV"] ?? "development"}`);
    logger.info(`[RevRec API] Health: http://localhost:${PORT}/health`);
    logger.info(`[RevRec API] Webhook: POST http://localhost:${PORT}/api/webhooks`);
    logger.info(`[RevRec API] Recovery: GET/POST http://localhost:${PORT}/api/recovery`);
    logger.info(`[RevRec API] Agent & Bot: POST http://localhost:${PORT}/api/agent`);
    logger.info(`[RevRec API] Analytics: GET http://localhost:${PORT}/api/analytics/summary`);
    logger.info(`[RevRec API] Simulation: POST http://localhost:${PORT}/api/simulate/batch`);
    logger.info(`[RevRec API] Checkout: POST http://localhost:${PORT}/api/checkout/order`);

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
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
// Handle SIGTERM (Docker stop, Kubernetes pod termination) and SIGINT (Ctrl+C).
// This allows in-flight requests and jobs to complete before the process exits.
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[RevRec API] Received ${signal} — shutting down gracefully...`);

  const cleanup = async () => {
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
  };

  if (server) {
    server.close(async () => {
      logger.info("[RevRec API] HTTP server closed — no new requests accepted");
      await cleanup();
    });
  } else {
    await cleanup();
  }

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

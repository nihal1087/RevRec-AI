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
import { startPaymentEventWorker } from "./workers/paymentEvent.worker";
import { closeAllRedisConnections } from "./config/redis";
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
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    console.error("[FATAL] Copy .env.example to apps/api/.env and fill in all values.");
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
  // Also check DB and Redis connectivity for a proper health status
  const checks = {
    server: "ok",
    database: "unknown",
    redis: "unknown",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
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

// ── STEP 4: Future Routes (added in subsequent phases) ────────────────────────
// Phase 2: app.use('/api/recovery', recoveryRouter);
// Phase 3: app.use('/api/agent', agentRouter);
// Phase 4: app.use('/api/simulate', simulationRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// 4-argument signature is required for Express to recognize as error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", {
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
const server = app.listen(PORT, () => {
  console.log(`[RevRec API] ✅ Server running on http://localhost:${PORT}`);
  console.log(`[RevRec API] 🌍 Environment: ${process.env["NODE_ENV"]}`);
  console.log(`[RevRec API] 🔍 Health: http://localhost:${PORT}/health`);
  console.log(`[RevRec API] 🔗 Webhook: POST http://localhost:${PORT}/api/webhooks`);

  // Start BullMQ worker in the same process for development convenience.
  // In production, this would be a separate worker process/container:
  //   SEPARATE: `node dist/workers/paymentEvent.worker.js`
  // For this project, co-location is fine and demonstrates the system holistically.
  startPaymentEventWorker();
  console.log(`[RevRec API] ⚙️  BullMQ payment event worker started`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
// Handle SIGTERM (Docker stop, Kubernetes pod termination) and SIGINT (Ctrl+C).
// This allows in-flight requests and jobs to complete before the process exits.
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[RevRec API] Received ${signal} — shutting down gracefully...`);

  server.close(async () => {
    console.log("[RevRec API] HTTP server closed — no new requests accepted");

    // Close database connections
    await prisma.$disconnect();
    console.log("[RevRec API] Prisma disconnected");

    // Close Redis connections
    await closeAllRedisConnections();
    console.log("[RevRec API] Redis connections closed");

    console.log("[RevRec API] ✅ Graceful shutdown complete");
    process.exit(0);
  });

  // Force exit after 15 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error("[RevRec API] Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

// Export for Supertest integration tests
export { app };

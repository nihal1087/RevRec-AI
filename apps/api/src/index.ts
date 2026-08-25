/**
 * index.ts — RevRec API Server Entry Point
 *
 * This is the bootstrap file. Its only jobs are:
 * 1. Load environment variables
 * 2. Create the Express app
 * 3. Attach middleware and routes
 * 4. Start listening on the configured port
 *
 * WHY SEPARATE app CREATION FROM listen():
 * Supertest (our integration test library) can import the app without
 * calling listen(). This allows tests to bind to a random port and
 * avoid port conflicts. This is a standard Node.js testing pattern.
 */

import "dotenv/config"; // Must be first — loads .env before anything else reads process.env
import express, { Request, Response, NextFunction } from "express";

// ── Validate required environment variables at startup ─────────────────────
// If a critical env var is missing, crash LOUDLY at startup rather than failing
// silently later when the first request tries to use it.
const requiredEnvVars = ["DATABASE_URL", "REDIS_HOST", "WEBHOOK_SECRET"] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    console.error(`[FATAL] Copy .env.example to .env and fill in all values.`);
    process.exit(1); // Non-zero exit code signals failure to process managers
  }
}

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
// Parse JSON bodies. The 10kb limit prevents memory exhaustion from huge payloads.
app.use(express.json({ limit: "10kb" }));

// ── Health Check ───────────────────────────────────────────────────────────
// A simple health endpoint is critical for:
// - Docker HEALTHCHECK directives
// - Load balancer liveness probes
// - CI/CD deployment verification
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "revrec-api",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
  });
});

// ── Routes will be added here in subsequent phases ────────────────────────
// Phase 1: /api/webhooks
// Phase 2: /api/recovery
// Phase 3: /api/agent
// Phase 4: /api/simulate

// ── 404 Handler ───────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ───────────────────────────────────────────────────
// Express requires a 4-argument signature to recognize this as an error handler.
// This catches any error thrown or passed to next(err) in any route.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", err.message, err.stack);
  res.status(500).json({
    error: "Internal server error",
    // Never expose error.message to clients in production — it may leak internals
    ...(process.env.NODE_ENV === "development" && { detail: err.message }),
  });
});

// ── Start Server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.listen(PORT, () => {
  console.log(`[RevRec API] ✅ Server running on http://localhost:${PORT}`);
  console.log(`[RevRec API] 🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`[RevRec API] 🔍 Health check: http://localhost:${PORT}/health`);
});

// Export for Supertest in integration tests
export { app };

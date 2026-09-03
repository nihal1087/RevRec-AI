/**
 * middleware/requireApiKey.ts — API Key Authentication Guard
 *
 * WHAT THIS PROTECTS:
 * All REST API endpoints (analytics, recovery, agent, simulate, communications)
 * are sensitive financial data and must not be publicly accessible.
 * Without auth, any person with the server URL can:
 *   - Read all customer financial data and recovery KPIs
 *   - Trigger manual agent decisions
 *   - Reset the demo database
 *   - Run batch simulations that consume LLM API budget
 *
 * HOW IT WORKS:
 * Clients must send the API key in one of two places (checked in order):
 *   1. Authorization header: "Bearer <key>" or "ApiKey <key>"
 *   2. X-API-Key header: "<key>"
 *
 * The expected key is read from the DASHBOARD_API_KEY environment variable.
 * If the env var is not set, auth is BYPASSED (allows demo/dev usage without config).
 * In production, DASHBOARD_API_KEY MUST be set.
 *
 * WHY NOT JWT:
 * There's no user management system. A single shared API key is appropriate
 * for a merchant dashboard accessed by a small, known set of operators.
 * For multi-tenant or user-level auth, migrate to JWT + RBAC.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

/**
 * Express middleware that validates the DASHBOARD_API_KEY.
 *
 * Reads from:
 *   - Authorization: Bearer <key>
 *   - Authorization: ApiKey <key>
 *   - X-API-Key: <key>
 *
 * Pass-through behavior when DASHBOARD_API_KEY is not set (dev/demo mode).
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env["DASHBOARD_API_KEY"];

  // If no key is configured, bypass auth (allows zero-config demo mode)
  // Log a warning in non-test environments so operators know auth is open
  if (!expectedKey) {
    if (process.env["NODE_ENV"] === "production") {
      logger.warn("[Auth] DASHBOARD_API_KEY is not set — API is OPEN in production. Set this env var immediately.");
    }
    next();
    return;
  }

  // Extract key from Authorization header or X-API-Key header
  let providedKey: string | undefined;

  const authHeader = req.headers["authorization"];
  if (authHeader) {
    // Supports "Bearer <key>" and "ApiKey <key>"
    const match = /^(?:Bearer|ApiKey)\s+(.+)$/i.exec(authHeader);
    if (match?.[1]) {
      providedKey = match[1];
    }
  }

  if (!providedKey) {
    const xApiKey = req.headers["x-api-key"];
    if (typeof xApiKey === "string" && xApiKey) {
      providedKey = xApiKey;
    }
  }

  if (!providedKey) {
    res.status(401).json({
      error: "Unauthorized",
      message: "API key required. Pass it via 'Authorization: Bearer <key>' or 'X-API-Key: <key>' header.",
    });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  // Both strings must be the same length for timingSafeEqual, so we compare
  // Buffer representations. If lengths differ we still do a dummy compare.
  const { timingSafeEqual } = require("crypto") as typeof import("crypto");
  const provided = Buffer.from(providedKey, "utf8");
  const expected = Buffer.from(expectedKey, "utf8");

  let keysMatch = false;
  if (provided.length === expected.length) {
    keysMatch = timingSafeEqual(provided, expected);
  } else {
    timingSafeEqual(expected, expected); // dummy compare for constant-time
  }

  if (!keysMatch) {
    logger.warn(`[Auth] Invalid API key attempt from ${req.ip} | path: ${req.path}`);
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API key.",
    });
    return;
  }

  next();
}

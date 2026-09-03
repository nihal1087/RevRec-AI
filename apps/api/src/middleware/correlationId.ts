/**
 * middleware/correlationId.ts — Distributed Tracing Correlation ID
 *
 * Threads a unique X-Correlation-ID header through every HTTP request.
 * Attached to res.locals.traceId so route handlers and audit entries
 * can include it for end-to-end observability across webhook ? worker ? DB.
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      traceId: string;
    }
  }
}

/**
 * Mount early in the middleware chain (before rate-limiters and route handlers).
 * Accepts X-Correlation-ID or X-Request-ID from upstream callers; generates a
 * fresh UUID v4 when neither is present. Always echoes the final ID back.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming =
    (req.headers["x-correlation-id"] as string | undefined) ||
    (req.headers["x-request-id"] as string | undefined);

  const traceId = incoming && incoming.length <= 128 ? incoming : randomUUID();

  res.locals["traceId"] = traceId;
  res.setHeader("X-Correlation-ID", traceId);
  next();
}

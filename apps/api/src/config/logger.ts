/**
 * config/logger.ts — Structured Logger (Winston)
 *
 * WHY STRUCTURED LOGGING OVER console.log:
 * In production, logs go to centralized systems (Datadog, CloudWatch, Loki).
 * Plain console.log outputs unstructured strings — searching for "all payment.failed
 * events from customer X in the last hour" is impossible.
 *
 * Winston logs in JSON format with consistent fields:
 *   { "level": "error", "message": "...", "service": "revrec-api",
 *     "timestamp": "...", "workflowId": "...", "customerId": "..." }
 *
 * These JSON fields are indexed by log aggregators, making alerts,
 * dashboards, and forensic analysis fast and reliable.
 *
 * WHY NOT PINO:
 * Pino is faster but Winston is more widely understood in interviews
 * and has richer transport support. For this scale, Winston is sufficient.
 */

import winston from "winston";

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const isDevelopment = process.env["NODE_ENV"] !== "production";

export const logger = winston.createLogger({
  // Log level from env: defaults to "info" in production, "debug" in development
  level: process.env["LOG_LEVEL"] ?? (isDevelopment ? "debug" : "info"),

  // Include stack traces in error logs
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    json()
  ),

  // Consistent metadata on every log line
  defaultMeta: {
    service: "revrec-api",
    environment: process.env["NODE_ENV"] ?? "development",
  },

  transports: [
    isDevelopment
      ? // Human-readable colored output in development
        new winston.transports.Console({
          format: combine(
            colorize(),
            simple()
          ),
        })
      : // Structured JSON to stdout in production (collected by Docker/K8s log drivers)
        new winston.transports.Console({
          format: combine(timestamp(), json()),
        }),
  ],
});

/**
 * Child logger factory — creates a logger scoped to a specific context.
 * Use this to add workflowId, paymentId, etc. to all logs within a handler.
 *
 * @example
 * const log = createContextLogger({ workflowId: 'wf_123', customerId: 'cust_456' });
 * log.info('Recovery workflow stage changed', { from: 'PENDING', to: 'RETRYING' });
 * // Outputs: { workflowId: 'wf_123', customerId: 'cust_456', message: '...', ... }
 */
export function createContextLogger(
  context: Record<string, string | number | boolean>
): winston.Logger {
  return logger.child(context);
}

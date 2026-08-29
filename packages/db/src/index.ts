/**
 * packages/db/src/index.ts — Prisma Client Singleton
 *
 * WHY A SINGLETON:
 * PrismaClient opens a connection pool to PostgreSQL. Each instance
 * holds multiple open connections (default: 10). In development,
 * ts-node-dev hot-reloads modules on file changes — WITHOUT this
 * singleton pattern, every reload creates a NEW PrismaClient,
 * quickly exhausting PostgreSQL's max_connections (100 by default).
 *
 * The globalThis trick stores the instance across hot reloads.
 * In production (single process start), globalThis is never populated,
 * so a fresh client is created exactly once.
 */

import { PrismaClient } from "@prisma/client";

// Extend globalThis in a type-safe way to hold our singleton
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
    // errorFormat: "pretty" gives readable errors in dev, "minimal" in prod
    errorFormat:
      process.env["NODE_ENV"] === "development" ? "pretty" : "minimal",
  });

// Only cache the instance on globalThis in non-production environments
if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types so consumers can import enums from @revrec/db
// without needing to add @prisma/client as their own dependency.
export { Prisma } from "@prisma/client";
export type {
  Payment,
  Customer,
  Subscription,
  Invoice,
  RecoveryWorkflow,
  DunningContact,
  PromiseToPay,
  AuditLog,
  AgentExecution,
} from "@prisma/client";
export {
  PaymentStatus,
  DeclineCategory,
  RecoveryStage,
  DunningChannel,
  RecoveryMethod,
  InvoiceStatus,
  SubscriptionStatus,
  MandateType,
  PromiseStatus,
  AuditEventType,
} from "@prisma/client";

export { seedDatabase, clearDatabase } from "./seed";

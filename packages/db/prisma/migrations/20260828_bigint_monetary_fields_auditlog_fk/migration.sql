-- Migration: bigint_monetary_fields_auditlog_fk
-- Converts all monetary paise fields from Int to BigInt across all tables.
-- Adds formal FK relation on AuditLog.customerId.
-- Removes redundant indexes on @unique columns.
-- Fixes AgentExecution.estimatedCostInPaise from Int to Float (Double Precision).

-- Customer
ALTER TABLE "Customer" ALTER COLUMN "ltvInPaise" TYPE BIGINT;

-- Payment
ALTER TABLE "Payment" ALTER COLUMN "amountInPaise" TYPE BIGINT;

-- Subscription
ALTER TABLE "Subscription" ALTER COLUMN "amountInPaise" TYPE BIGINT;

-- Invoice
ALTER TABLE "Invoice" ALTER COLUMN "amountInPaise" TYPE BIGINT;
ALTER TABLE "Invoice" ALTER COLUMN "paidAmountInPaise" TYPE BIGINT;

-- RecoveryWorkflow
ALTER TABLE "RecoveryWorkflow" ALTER COLUMN "amountAtRiskInPaise" TYPE BIGINT;
ALTER TABLE "RecoveryWorkflow" ALTER COLUMN "amountRecoveredInPaise" TYPE BIGINT;

-- PromiseToPay
ALTER TABLE "PromiseToPay" ALTER COLUMN "promisedAmountInPaise" TYPE BIGINT;

-- AuditLog
ALTER TABLE "AuditLog" ALTER COLUMN "amountInPaise" TYPE BIGINT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AgentExecution
ALTER TABLE "AgentExecution" ALTER COLUMN "estimatedCostInPaise" TYPE DOUBLE PRECISION;
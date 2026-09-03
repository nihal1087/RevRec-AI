-- Migration: add missing columns to match schema.prisma
-- Adds columns that exist in schema.prisma but were never included in a committed migration.
-- Safe to run on both fresh CI DB and existing local DB (uses IF NOT EXISTS guard).

-- Customer: riskTier (was missing from all prior migrations)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "riskTier" TEXT NOT NULL DEFAULT 'LOW';

-- Customer: paymentHistoryScore (was missing from all prior migrations)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "paymentHistoryScore" INTEGER NOT NULL DEFAULT 85;

-- AgentExecution: executionStatus was TEXT in initial migration, but schema defines
-- it as AgentExecutionStatus enum. Create the enum and migrate the column.
DO $$ BEGIN
  CREATE TYPE "AgentExecutionStatus" AS ENUM (
    'EXECUTED',
    'REJECTED_BY_POLICY',
    'EXECUTION_FAILED',
    'SKIPPED_TERMINAL_STAGE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Migrate executionStatus column from TEXT to AgentExecutionStatus enum
-- (Only needed if column is still TEXT — safe to skip if already enum)
DO $$ BEGIN
  ALTER TABLE "AgentExecution"
    ALTER COLUMN "executionStatus" TYPE "AgentExecutionStatus"
    USING "executionStatus"::"AgentExecutionStatus";
EXCEPTION
  WHEN others THEN NULL;
END $$;

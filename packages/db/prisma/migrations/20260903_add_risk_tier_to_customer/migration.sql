-- Migration: add_risk_tier_to_customer
-- Adds the riskTier computed column to the Customer table.
-- This column was present in schema.prisma but missing from committed migrations.

ALTER TABLE "Customer" ADD COLUMN "riskTier" TEXT NOT NULL DEFAULT 'LOW';

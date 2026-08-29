-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "DeclineCategory" AS ENUM ('SOFT', 'HARD', 'NETWORK', 'INTENT_DROP', 'MANDATE_FAILURE');

-- CreateEnum
CREATE TYPE "RecoveryStage" AS ENUM ('PENDING', 'ANALYZING', 'RETRYING', 'OUTREACH_SENT', 'PROMISE_RECEIVED', 'RECOVERED', 'ESCALATED', 'HALTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "DunningChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'HINGLISH_VOICE', 'HUMAN_AGENT');

-- CreateEnum
CREATE TYPE "RecoveryMethod" AS ENUM ('AUTO_RETRY', 'CUSTOMER_LINK_CLICK', 'PROMISE_TO_PAY_FULFILLED', 'PARTIAL_SETTLEMENT', 'MANUAL_HUMAN');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MandateType" AS ENUM ('ENACH', 'UPI_AUTOPAY', 'CARD');

-- CreateEnum
CREATE TYPE "PromiseStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'BREACHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'PAYMENT_RETRY_SCHEDULED', 'PAYMENT_RETRY_SUCCEEDED', 'PAYMENT_RETRY_FAILED', 'WORKFLOW_CREATED', 'WORKFLOW_STAGE_CHANGED', 'WORKFLOW_RECOVERED', 'WORKFLOW_ABANDONED', 'WORKFLOW_HALTED', 'WORKFLOW_ESCALATED', 'RCA_CLASSIFIED', 'AGENT_DECISION_MADE', 'AGENT_TOOL_EXECUTED', 'AGENT_REJECTED_BY_POLICY', 'OUTREACH_SENT', 'OUTREACH_DELIVERED', 'CUSTOMER_RESPONDED', 'PROMISE_TO_PAY_CREATED', 'PROMISE_TO_PAY_FULFILLED', 'PROMISE_TO_PAY_BREACHED', 'COMPLIANCE_CHECK_PASSED', 'COMPLIANCE_CHECK_FAILED', 'MAX_ATTEMPTS_REACHED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "ltvInPaise" INTEGER NOT NULL DEFAULT 0,
    "preferredChannel" "DunningChannel" NOT NULL DEFAULT 'WHATSAPP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceId" TEXT,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT NOT NULL,
    "gatewayErrorCode" TEXT,
    "declineCategory" "DeclineCategory",
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "mandateType" "MandateType" NOT NULL,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "paidAmountInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryWorkflow" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountAtRiskInPaise" INTEGER NOT NULL,
    "amountRecoveredInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "stage" "RecoveryStage" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "outreachCount" INTEGER NOT NULL DEFAULT 0,
    "recoveryMethod" "RecoveryMethod",
    "haltReason" TEXT,
    "escalationReason" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningContact" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "DunningChannel" NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "customerResponse" TEXT,

    CONSTRAINT "DunningContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseToPay" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "promisedAmountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "promisedByDate" TIMESTAMP(3) NOT NULL,
    "status" "PromiseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByChannel" "DunningChannel" NOT NULL,
    "reminderScheduledAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "workflowId" TEXT,
    "paymentId" TEXT,
    "customerId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previousStage" TEXT,
    "newStage" TEXT,
    "amountInPaise" INTEGER,
    "outcome" TEXT NOT NULL,
    "errorMessage" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "selectedTool" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "policyCheckPassed" BOOLEAN NOT NULL,
    "policyCheckDetails" TEXT NOT NULL,
    "executionStatus" TEXT NOT NULL,
    "executionError" TEXT,
    "llmLatencyMs" INTEGER NOT NULL,
    "llmTokensUsed" INTEGER NOT NULL,
    "estimatedCostInPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_externalId_key" ON "Customer"("externalId");

-- CreateIndex
CREATE INDEX "Customer_externalId_idx" ON "Customer"("externalId");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_externalId_idx" ON "Payment"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_externalId_key" ON "Subscription"("externalId");

-- CreateIndex
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_nextBillingDate_idx" ON "Subscription"("nextBillingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalId_key" ON "Invoice"("externalId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryWorkflow_paymentId_key" ON "RecoveryWorkflow"("paymentId");

-- CreateIndex
CREATE INDEX "RecoveryWorkflow_customerId_idx" ON "RecoveryWorkflow"("customerId");

-- CreateIndex
CREATE INDEX "RecoveryWorkflow_stage_idx" ON "RecoveryWorkflow"("stage");

-- CreateIndex
CREATE INDEX "RecoveryWorkflow_nextActionAt_idx" ON "RecoveryWorkflow"("nextActionAt");

-- CreateIndex
CREATE INDEX "RecoveryWorkflow_expiresAt_idx" ON "RecoveryWorkflow"("expiresAt");

-- CreateIndex
CREATE INDEX "DunningContact_workflowId_idx" ON "DunningContact"("workflowId");

-- CreateIndex
CREATE INDEX "DunningContact_customerId_idx" ON "DunningContact"("customerId");

-- CreateIndex
CREATE INDEX "DunningContact_customerId_sentAt_idx" ON "DunningContact"("customerId", "sentAt");

-- CreateIndex
CREATE INDEX "PromiseToPay_workflowId_idx" ON "PromiseToPay"("workflowId");

-- CreateIndex
CREATE INDEX "PromiseToPay_status_idx" ON "PromiseToPay"("status");

-- CreateIndex
CREATE INDEX "PromiseToPay_promisedByDate_status_idx" ON "PromiseToPay"("promisedByDate", "status");

-- CreateIndex
CREATE INDEX "AuditLog_workflowId_idx" ON "AuditLog"("workflowId");

-- CreateIndex
CREATE INDEX "AuditLog_paymentId_idx" ON "AuditLog"("paymentId");

-- CreateIndex
CREATE INDEX "AuditLog_customerId_idx" ON "AuditLog"("customerId");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentExecution_workflowId_idx" ON "AgentExecution"("workflowId");

-- CreateIndex
CREATE INDEX "AgentExecution_createdAt_idx" ON "AgentExecution"("createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryWorkflow" ADD CONSTRAINT "RecoveryWorkflow_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryWorkflow" ADD CONSTRAINT "RecoveryWorkflow_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningContact" ADD CONSTRAINT "DunningContact_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "RecoveryWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningContact" ADD CONSTRAINT "DunningContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "RecoveryWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "RecoveryWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "RecoveryWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

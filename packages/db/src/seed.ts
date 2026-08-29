/**
 * seed.ts — RevRec Database Seeder
 *
 * Populates PostgreSQL with realistic Indian customer profiles,
 * failed payment transactions, recovery workflows, and immutable audit logs.
 */

import { PrismaClient, PaymentStatus, DeclineCategory, RecoveryStage, RecoveryMethod, DunningChannel, PromiseStatus, AuditEventType } from "@prisma/client";
import { AgentToolName } from "@revrec/types";

const prisma = new PrismaClient();

async function main() {
  console.log("[Seed] Starting RevRec database seeding...");

  // Clean existing data (H8 fix: delete in FK-safe order — subscriptions and invoices
  // must be deleted before customers to avoid foreign key constraint violations on re-seed)
  await prisma.auditLog.deleteMany();
  await prisma.agentExecution.deleteMany();
  await prisma.promiseToPay.deleteMany();
  await prisma.dunningContact.deleteMany();
  await prisma.recoveryWorkflow.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();

  // 1. Create Realistic Indian Customers
  const customerData = [
    { externalId: "cust_in_001", name: "Aarav Sharma", email: "aarav.sharma@gmail.com", phone: "+919876543210", riskScore: 18, ltv: 4500000 },
    { externalId: "cust_in_002", name: "Priya Patel", email: "priya.patel@outlook.com", phone: "+919823456789", riskScore: 25, ltv: 8200000 },
    { externalId: "cust_in_003", name: "Rohan Verma", email: "rohan.verma@yahoo.in", phone: "+919765432100", riskScore: 72, ltv: 1200000 },
    { externalId: "cust_in_004", name: "Ananya Iyer", email: "ananya.iyer@gmail.com", phone: "+919654321098", riskScore: 12, ltv: 15000000 },
    { externalId: "cust_in_005", name: "Vikram Malhotra", email: "vikram.m@techcorp.in", phone: "+919543210987", riskScore: 40, ltv: 6700000 },
    { externalId: "cust_in_006", name: "Neha Gupta", email: "neha.gupta@rediffmail.com", phone: "+919432109876", riskScore: 65, ltv: 950000 },
    { externalId: "cust_in_007", name: "Kavita Nair", email: "kavita.nair@corp.in", phone: "+919321098765", riskScore: 22, ltv: 5400000 },
    { externalId: "cust_in_008", name: "Rajesh Kumar", email: "rajesh.k@freelance.in", phone: "+919210987654", riskScore: 85, ltv: 400000 },
  ];

  const customers = [];
  for (const c of customerData) {
    const cust = await prisma.customer.create({
      data: {
        externalId: c.externalId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        riskScore: c.riskScore,
        ltvInPaise: BigInt(c.ltv),
        preferredChannel: DunningChannel.WHATSAPP,
      },
    });
    customers.push(cust);
  }

  console.log(`[Seed] Created ${customers.length} Indian customer profiles`);

  // 2. Create Failed Payments and Recovery Workflows
  const scenarios = [
    // Scenario 1: Soft decline (Insufficient Funds) -> Recovered via Salary Cycle Smart Retry
    {
      custIdx: 0,
      amountPaise: 499900,
      code: "INSUFFICIENT_FUNDS",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 499900,
      method: RecoveryMethod.AUTO_RETRY,
      retries: 2,
      outreach: 0,
    },
    // Scenario 2: Network / Switch drop -> Fast Jitter Retry Recovered
    {
      custIdx: 1,
      amountPaise: 1250000,
      code: "UPI_SWITCH_DOWN",
      cat: DeclineCategory.NETWORK,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 1250000,
      method: RecoveryMethod.AUTO_RETRY,
      retries: 1,
      outreach: 0,
    },
    // Scenario 3: Intent Drop (OTP timed out) -> WhatsApp Recovery Link Generated
    {
      custIdx: 2,
      amountPaise: 199900,
      code: "OTP_TIMED_OUT",
      cat: DeclineCategory.INTENT_DROP,
      stage: RecoveryStage.OUTREACH_SENT,
      recoveredPaise: 0,
      method: null,
      retries: 0,
      outreach: 1,
    },
    // Scenario 4: Mandate failure -> Promise Received in Hinglish Bot
    {
      custIdx: 3,
      amountPaise: 2999900,
      code: "MANDATE_EXECUTION_FAILED",
      cat: DeclineCategory.MANDATE_FAILURE,
      stage: RecoveryStage.PROMISE_RECEIVED,
      recoveredPaise: 0,
      method: null,
      retries: 1,
      outreach: 1,
    },
    // Scenario 5: Hard decline (Card expired) -> Halted compliantly
    {
      custIdx: 4,
      amountPaise: 350000,
      code: "CARD_EXPIRED",
      cat: DeclineCategory.HARD,
      stage: RecoveryStage.HALTED,
      recoveredPaise: 0,
      method: null,
      retries: 0,
      outreach: 0,
      haltReason: "Hard decline detected — card expired.",
    },
    // Scenario 6: High Risk Customer -> Escalated to Human Agent
    {
      custIdx: 7,
      amountPaise: 899900,
      code: "EXCEEDS_BALANCE",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.ESCALATED,
      recoveredPaise: 0,
      method: null,
      retries: 3,
      outreach: 2,
      escalationReason: "Exceeded max contact frequency without recovery.",
    },
    // Scenario 7: Active Retrying workflow in-flight
    {
      custIdx: 5,
      amountPaise: 750000,
      code: "GATEWAY_TIMEOUT",
      cat: DeclineCategory.NETWORK,
      stage: RecoveryStage.RETRYING,
      recoveredPaise: 0,
      method: null,
      retries: 1,
      outreach: 0,
    },
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i]!;
    const cust = customers[s.custIdx]!;
    const extPayId = `pay_seed_${Date.now().toString(36)}_${i}`;
    const pastDate = new Date(Date.now() - (i + 1) * 3600 * 1000);
    const futureExpiry = new Date(Date.now() + 30 * 86400 * 1000);

    const payment = await prisma.payment.create({
      data: {
        customerId: cust.id,
        externalId: extPayId,
        idempotencyKey: `idem_seed_${extPayId}`,
        amountInPaise: s.amountPaise,
        currency: "INR",
        status: s.stage === RecoveryStage.RECOVERED ? PaymentStatus.CAPTURED : PaymentStatus.FAILED,
        gateway: "razorpay",
        gatewayErrorCode: s.code,
        declineCategory: s.cat,
        createdAt: pastDate,
      },
    });

    const workflow = await prisma.recoveryWorkflow.create({
      data: {
        paymentId: payment.id,
        customerId: cust.id,
        amountAtRiskInPaise: s.amountPaise,
        amountRecoveredInPaise: s.recoveredPaise,
        stage: s.stage,
        retryCount: s.retries,
        outreachCount: s.outreach,
        recoveryMethod: s.method,
        haltReason: s.haltReason ?? null,
        escalationReason: s.escalationReason ?? null,
        expiresAt: futureExpiry,
        createdAt: pastDate,
      },
    });

    // Create Agent Execution record
    await prisma.agentExecution.create({
      data: {
        workflowId: workflow.id,
        reasoning: `Autonomous RCA categorized failure as ${s.cat} (${s.code}). Selected optimal bounded recovery tool.`,
        selectedTool: s.stage === RecoveryStage.HALTED ? AgentToolName.HALT_DUNNING : AgentToolName.RETRY_PAYMENT,
        toolInput: { tool: s.stage === RecoveryStage.HALTED ? AgentToolName.HALT_DUNNING : AgentToolName.RETRY_PAYMENT },
        confidenceScore: 0.94,
        policyCheckPassed: true,
        policyCheckDetails: "Passed all RBI and TRAI regulatory compliance bounds.",
        executionStatus: "EXECUTED",
        llmLatencyMs: 220 + (i * 15),
        llmTokensUsed: 310,
        estimatedCostInPaise: 0.23,
      },
    });

    // Create Audit Log entries
    await prisma.auditLog.create({
      data: {
        eventType: AuditEventType.PAYMENT_FAILED,
        workflowId: workflow.id,
        paymentId: payment.id,
        customerId: cust.id,
        actorType: "WEBHOOK_PROCESSOR", // M14 fix: correct enum value (was "WEBHOOK_INGESTION")
        actorId: "razorpay-webhook-receiver",
        outcome: "SUCCESS",
        amountInPaise: s.amountPaise,
        newStage: RecoveryStage.PENDING,
        payload: { errorCode: s.code, declineCategory: s.cat },
      },
    });

    if (s.stage === RecoveryStage.RECOVERED) {
      await prisma.auditLog.create({
        data: {
          eventType: AuditEventType.PAYMENT_RETRY_SUCCEEDED,
          workflowId: workflow.id,
          paymentId: payment.id,
          customerId: cust.id,
          actorType: "RETRY_SEQUENCER",
          actorId: "delayed-bullmq-worker",
          outcome: "SUCCESS",
          amountInPaise: s.amountPaise,
          previousStage: RecoveryStage.RETRYING,
          newStage: RecoveryStage.RECOVERED,
          payload: { recoveredVia: s.method },
        },
      });
    } else if (s.stage === RecoveryStage.PROMISE_RECEIVED) {
      const promiseDate = new Date(Date.now() + 5 * 86400 * 1000);
      await prisma.promiseToPay.create({
        data: {
          workflowId: workflow.id,
          customerId: cust.id,
          promisedAmountInPaise: s.amountPaise,
          promisedByDate: promiseDate,
          status: PromiseStatus.ACTIVE,
          createdByChannel: DunningChannel.WHATSAPP,
          reminderScheduledAt: new Date(promiseDate.getTime() - 24 * 3600 * 1000),
        },
      });
    }
  }

  console.log(`[Seed] Successfully populated ${scenarios.length} realistic workflows and audit records`);
}

main()
  .catch((e) => {
    console.error("[Seed Error]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * seed.ts — RevRec Database Seeder
 *
 * Populates PostgreSQL with 20 realistic Indian customer profiles,
 * failed payment transactions, recovery workflows, multi-channel dunning contacts, and audit logs.
 */

import {
  PrismaClient,
  PaymentStatus,
  DeclineCategory,
  RecoveryStage,
  RecoveryMethod,
  DunningChannel,
  PromiseStatus,
  AuditEventType,
} from "@prisma/client";
import { AgentToolName } from "@revrec/types";

const defaultPrisma = new PrismaClient();

export async function clearDatabase(client?: PrismaClient) {
  const db = client ?? defaultPrisma;
  await db.auditLog.deleteMany();
  await db.agentExecution.deleteMany();
  await db.promiseToPay.deleteMany();
  await db.dunningContact.deleteMany();
  await db.recoveryWorkflow.deleteMany();
  await db.payment.deleteMany();
  await db.subscription.deleteMany();
  await db.invoice.deleteMany();
  await db.customer.deleteMany();
}

export async function seedDatabase(client?: PrismaClient) {
  const db = client ?? defaultPrisma;
  console.log("[Seed] Starting RevRec database seeding with 20 full production records...");

  // Clean existing data in foreign-key safe order
  await clearDatabase(db);

  // 1. Define 20 Authentic Indian Customers & Business Entities
  const customerData = [
    { externalId: "cust_in_101", name: "Tanishka Sharma", email: "tanishka@techcorp.in", phone: "+919812345678", riskScore: 25, ltv: 8500000 },
    { externalId: "cust_in_102", name: "Mohammad Nihal", email: "nihal@nexuslabs.in", phone: "+918789600276", riskScore: 18, ltv: 9200000 },
    { externalId: "cust_in_103", name: "Akash Singh", email: "akash@singhdigital.in", phone: "+919823456789", riskScore: 32, ltv: 6400000 },
    { externalId: "cust_in_104", name: "Moon Light", email: "moonlight.studio@gmail.com", phone: "+919834567890", riskScore: 20, ltv: 4800000 },
    { externalId: "cust_in_105", name: "Disha Mehra", email: "disha.mehra@gmail.com", phone: "+919845678901", riskScore: 15, ltv: 12000000 },
    { externalId: "cust_in_106", name: "Nakul Mahajan", email: "nakul.mahajan@gmail.com", phone: "+919856789012", riskScore: 28, ltv: 7500000 },
    { externalId: "cust_in_107", name: "Goyal Trading Co", email: "admin@goyaltrading.in", phone: "+919867890123", riskScore: 35, ltv: 14500000 },
    { externalId: "cust_in_108", name: "Sharma Exports", email: "exports@sharmaexports.com", phone: "+919878901234", riskScore: 22, ltv: 18000000 },
    { externalId: "cust_in_109", name: "Dikshu Kaushik", email: "dikshu.kaushik@corp.in", phone: "+919889012345", riskScore: 28, ltv: 5200000 },
    { externalId: "cust_in_110", name: "Arzoo Lilar", email: "arzoo.lilar@gmail.com", phone: "+919890123456", riskScore: 24, ltv: 4200000 },
    { externalId: "cust_in_111", name: "Kaushik Logistics AP", email: "ap@kaushiklogistics.com", phone: "+919801234567", riskScore: 40, ltv: 16500000 },
    { externalId: "cust_in_112", name: "Lilar Fashions", email: "support@lilarfashions.in", phone: "+919812345098", riskScore: 30, ltv: 6800000 },
    { externalId: "cust_in_113", name: "Nikhil Singhal", email: "nikhil.s@fintech.io", phone: "+919823456109", riskScore: 19, ltv: 9400000 },
    { externalId: "cust_in_114", name: "Mahajan Infotech", email: "billing@mahajaninfotech.com", phone: "+919834567210", riskScore: 15, ltv: 25000000 },
    { externalId: "cust_in_115", name: "Singh Digital Media", email: "finance@singhdigital.in", phone: "+919845678321", riskScore: 35, ltv: 18500000 },
    { externalId: "cust_in_116", name: "Mehra Enterprise Solutions", email: "accounts@mehraenterprise.com", phone: "+919856789432", riskScore: 28, ltv: 22000000 },
    { externalId: "cust_in_117", name: "Ananya Deshmukh", email: "ananya.d@deshmukh.in", phone: "+919867890543", riskScore: 16, ltv: 11000000 },
    { externalId: "cust_in_118", name: "Prashant Goyal", email: "prashant.goyal@freelance.in", phone: "+919878901654", riskScore: 45, ltv: 3800000 },
    { externalId: "cust_in_119", name: "Rohan Verma", email: "rohan.verma@yahoo.in", phone: "+919889012765", riskScore: 38, ltv: 4500000 },
    { externalId: "cust_in_120", name: "Vikram Malhotra", email: "vikram.m@techcorp.in", phone: "+919890123876", riskScore: 30, ltv: 13500000 },
  ];

  const customers = [];
  for (const c of customerData) {
    const tier = c.riskScore > 60 ? "HIGH" : c.riskScore > 30 ? "MEDIUM" : "LOW";
    const cust = await db.customer.create({
      data: {
        externalId: c.externalId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        riskScore: c.riskScore,
        riskTier: tier,
        paymentHistoryScore: 100 - c.riskScore,
        ltvInPaise: BigInt(c.ltv),
        preferredChannel: DunningChannel.WHATSAPP,
      },
    });
    customers.push(cust);
  }

  console.log(`[Seed] Created ${customers.length} Indian customer profiles`);

  // 2. Define 20 Specific Omnichannel Communications
  const dunningScenarios = [
    // ── WhatsApp (8) ──
    {
      custIdx: 0,
      channel: DunningChannel.WHATSAPP,
      template: "salary_delay_recovery_v2",
      amountPaise: 249900,
      code: "INSUFFICIENT_FUNDS",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.PROMISE_RECEIVED,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Namaste Tanishka ji, aapka ₹2,499 ka Business Plan renewal aaj process nahi ho paya — bank se insufficient funds signal aaya. Koi tension nahi, hum samajhte hain. Salary date pe auto-retry set kar diya hai. Tab tak chahein toh khud bhi yahan se settle kar sakti hain: https://revrec.pay/r/tanishka-2499",
      customerResponse: "Bhai salary 5th ko aayegi tab pakka kar dungi, remind kar dena",
      status: "READ",
      hoursAgo: 2,
    },
    {
      custIdx: 1,
      channel: DunningChannel.WHATSAPP,
      template: "upi_timeout_instant_link",
      amountPaise: 129900,
      code: "UPI_SWITCH_DOWN",
      cat: DeclineCategory.NETWORK,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 129900,
      method: RecoveryMethod.CUSTOMER_LINK_CLICK,
      messagePayload: "Hi Nihal, aapka ₹1,299 UPI payment incomplete raha — NPCI switch momentarily busy tha, aapki galti bilkul nahi. Iss link se direct retry karo, 10 seconds mein ho jaayega: https://revrec.pay/r/nihal-1299",
      customerResponse: "haan UPI hang tha yaar, link se abhi pay kiya",
      status: "CLICKED",
      hoursAgo: 4,
    },
    {
      custIdx: 2,
      channel: DunningChannel.WHATSAPP,
      template: "mandate_autopay_retry_alert",
      amountPaise: 499900,
      code: "MANDATE_EXECUTION_FAILED",
      cat: DeclineCategory.MANDATE_FAILURE,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 499900,
      method: RecoveryMethod.AUTO_RETRY,
      messagePayload: "Namaste Akash ji, aapka ₹4,999 ka e-NACH debit aaj process nahi ho paya. Humne alternate gateway se 24 ghante mein auto-retry schedule kiya hai — aapko kuch karne ki zaroorat nahi. Agar naya card add karna ho toh: https://revrec.pay/r/akash-mandate",
      customerResponse: "Naya card add kar diya hai usse try karo",
      status: "READ",
      hoursAgo: 8,
    },
    {
      custIdx: 3,
      channel: DunningChannel.WHATSAPP,
      template: "invoice_overdue_1click_pay",
      amountPaise: 89900,
      code: "PAYMENT_CANCELLED_BY_USER",
      cat: DeclineCategory.INTENT_DROP,
      stage: RecoveryStage.OUTREACH_SENT,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Hey Moon Light Studio, your ₹899 Pro plan renewal is still pending from yesterday. We've kept your subscription active for now — just tap below to complete in one go, no OTP needed: https://revrec.pay/r/moonlight-899",
      customerResponse: null,
      status: "DELIVERED",
      hoursAgo: 14,
    },
    {
      custIdx: 4,
      channel: DunningChannel.WHATSAPP,
      template: "salary_delay_recovery_v2",
      amountPaise: 399900,
      code: "INSUFFICIENT_FUNDS",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.PROMISE_RECEIVED,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Namaste Disha ji, ₹3,999 ka Enterprise renewal aaj bank se process nahi ho paya. Apni salary date ke hisaab se humne 1st ko auto-retry set kar diya hai. Pehle karna ho toh: https://revrec.pay/r/disha-3999",
      customerResponse: "Bank server down tha kya, kal subah clear kar dungi 10 baje tak",
      status: "READ",
      hoursAgo: 22,
    },
    {
      custIdx: 5,
      channel: DunningChannel.WHATSAPP,
      template: "card_retry_scheduled_v1",
      amountPaise: 149900,
      code: "EXCEEDS_BALANCE",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.RETRYING,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Namaste Nakul ji, ₹1,499 ka payment aaj balance short hone ki wajah se nahi ho paya. Koi issue nahi — 2nd ko smart retry queue mein hai. Pehle karna ho toh yahan click karein: https://revrec.pay/r/nakul-1499",
      customerResponse: null,
      status: "SENT",
      hoursAgo: 30,
    },
    {
      custIdx: 6,
      channel: DunningChannel.WHATSAPP,
      template: "b2b_quarterly_invoice_notice",
      amountPaise: 849900,
      code: "MANDATE_NOT_ACTIVE",
      cat: DeclineCategory.MANDATE_FAILURE,
      stage: RecoveryStage.OUTREACH_SENT,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Hi Goyal Trading Co, your Q3 API access mandate of ₹8,499 was not executed — the existing mandate has lapsed. Please re-authorize via your NetBanking portal or click here to set up a fresh mandate in 2 minutes: https://revrec.pay/r/goyal-8499",
      customerResponse: null,
      status: "READ",
      hoursAgo: 48,
    },
    {
      custIdx: 7,
      channel: DunningChannel.WHATSAPP,
      template: "high_priority_mandate_alert",
      amountPaise: 1250000,
      code: "GATEWAY_TIMEOUT",
      cat: DeclineCategory.NETWORK,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 1250000,
      method: RecoveryMethod.CUSTOMER_LINK_CLICK,
      messagePayload: "Hi Sharma Exports team, ₹12,500 bank gateway timeout ki wajah se stuck tha — aapka amount deduct nahi hua hai. Iss secure link se directly settle kar sakte hain: https://revrec.pay/r/sharma-12500",
      customerResponse: "Done kar diya, transaction ID bhi aaya hai — receipt bhej dena",
      status: "CLICKED",
      hoursAgo: 60,
    },

    // ── SMS (5) ──
    {
      custIdx: 8,
      channel: DunningChannel.SMS,
      template: "dlt_payment_link_v3",
      amountPaise: 189900,
      code: "CARD_SECURITY_ERROR",
      cat: DeclineCategory.INTENT_DROP,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 189900,
      method: RecoveryMethod.CUSTOMER_LINK_CLICK,
      messagePayload: "Hi Deepak, your INR 1,899 plan payment failed (card security check). Retry via UPI in 1 tap — no OTP: https://revrec.pay/s/dk89 - Team RevRec",
      customerResponse: null,
      status: "CLICKED",
      hoursAgo: 16,
    },
    {
      custIdx: 9,
      channel: DunningChannel.SMS,
      template: "dlt_card_pre_dunning_v1",
      amountPaise: 49900,
      code: "OTP_TIMED_OUT",
      cat: DeclineCategory.INTENT_DROP,
      stage: RecoveryStage.OUTREACH_SENT,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Arjun, your INR 499 payment timed out at OTP step. Your slot is reserved — complete here: https://revrec.pay/s/al49 - Team RevRec",
      customerResponse: null,
      status: "DELIVERED",
      hoursAgo: 28,
    },
    {
      custIdx: 10,
      channel: DunningChannel.SMS,
      template: "dlt_enterprise_sms_v2",
      amountPaise: 999900,
      code: "BANK_UNAVAILABLE",
      cat: DeclineCategory.NETWORK,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 999900,
      method: RecoveryMethod.AUTO_RETRY,
      messagePayload: "Kaushik Logistics: INR 9,999 invoice auto-retry scheduled after ICICI core banking recovery window. No action needed. - Team RevRec",
      customerResponse: null,
      status: "READ",
      hoursAgo: 40,
    },
    {
      custIdx: 11,
      channel: DunningChannel.SMS,
      template: "dlt_mandate_failed_v2",
      amountPaise: 349900,
      code: "PRE_DEBIT_NOTIFICATION_FAILED",
      cat: DeclineCategory.MANDATE_FAILURE,
      stage: RecoveryStage.RETRYING,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Lilar Fashions: e-Mandate pre-debit notice for INR 3,499 could not be delivered. Retrying debit in 12 hrs. Contact support if issue persists. - Team RevRec",
      customerResponse: null,
      status: "SENT",
      hoursAgo: 72,
    },
    {
      custIdx: 12,
      channel: DunningChannel.SMS,
      template: "dlt_payment_link_v3",
      amountPaise: 129900,
      code: "SESSION_EXPIRED",
      cat: DeclineCategory.INTENT_DROP,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 129900,
      method: RecoveryMethod.CUSTOMER_LINK_CLICK,
      messagePayload: "Nikhil, your checkout session for INR 1,299 expired. Resume right where you left off: https://revrec.pay/s/ns12 - Team RevRec",
      customerResponse: null,
      status: "CLICKED",
      hoursAgo: 90,
    },

    // ── Email (4) ──
    {
      custIdx: 13,
      channel: DunningChannel.EMAIL,
      template: "enterprise_dunning_statement_v1",
      amountPaise: 2500000,
      code: "CORPORATE_CARD_LIMIT",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 2500000,
      method: RecoveryMethod.PROMISE_TO_PAY_FULFILLED,
      messagePayload: "Subject: [Action Required] Enterprise Core License Renewal — Mahajan Infotech\n\nDear Accounts Team,\n\nYour monthly SaaS license payment of ₹25,000 was declined on 28 Aug 2026 (corporate card daily limit). We've kept your environment active for 5 business days.\n\nKindly arrange payment via NEFT or update your card limit and retry here:\nhttps://revrec.pay/inv/mahajan-25k\n\nFor any queries, reply to this email or call your dedicated account manager.\n\nWarm regards,\nRevRec Enterprise Team",
      customerResponse: null,
      status: "DELIVERED",
      hoursAgo: 36,
    },
    {
      custIdx: 14,
      channel: DunningChannel.EMAIL,
      template: "growth_tier_renewal_failure",
      amountPaise: 1850000,
      code: "DAILY_LIMIT_EXCEEDED",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.OUTREACH_SENT,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Subject: Payment Update Required — Singh Digital Media Growth Tier\n\nHi Finance Team,\n\nThe ₹18,500 auto-debit for your Growth Tier plan on 27 Aug could not be processed — bank daily limit was exceeded.\n\nTo avoid any service interruption, please update your payment method or temporarily raise your limit and retry here:\nhttps://revrec.pay/inv/singh-18500\n\nYour current billing cycle ends 31 Aug. Let us know if you need an extension.\n\nThanks,\nRevRec Billing",
      customerResponse: null,
      status: "READ",
      hoursAgo: 54,
    },
    {
      custIdx: 15,
      channel: DunningChannel.EMAIL,
      template: "escalation_notice_cfo_v1",
      amountPaise: 2200000,
      code: "GATEWAY_TIMEOUT",
      cat: DeclineCategory.NETWORK,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 2200000,
      method: RecoveryMethod.CUSTOMER_LINK_CLICK,
      messagePayload: "Subject: Payment Processing Update — Mehra Enterprise Solutions\n\nHi Team,\n\nYour ₹22,000 subscription renewal hit a transient bank gateway timeout on 26 Aug — no amount was deducted.\n\nWe've queued an automatic retry, but you can also settle directly to avoid any delay:\nhttps://revrec.pay/inv/mehra-22k\n\nApologies for the inconvenience — this was entirely on the gateway end.\n\nRegards,\nRevRec Payments Desk",
      customerResponse: null,
      status: "CLICKED",
      hoursAgo: 110,
    },
    {
      custIdx: 16,
      channel: DunningChannel.EMAIL,
      template: "annual_pro_dunning_v2",
      amountPaise: 1100000,
      code: "INSUFFICIENT_FUNDS",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.RETRYING,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Subject: Annual Subscription Notice — Action Needed\n\nHi Ananya,\n\nYour ₹11,000 annual Cloud Subscription renewal didn't go through on 24 Aug — looks like a temporary bank balance issue.\n\nWe've scheduled a smart retry for 1st Sep. If you'd like to sort it sooner:\nhttps://revrec.pay/inv/ananya-11k\n\nYour data and settings are fully preserved — nothing changes until the retry window closes.\n\nCheers,\nRevRec Team",
      customerResponse: null,
      status: "DELIVERED",
      hoursAgo: 140,
    },

    // ── AI Voice (3) ──
    {
      custIdx: 17,
      channel: DunningChannel.HINGLISH_VOICE,
      template: "hinglish_voice_concierge_v1",
      amountPaise: 380000,
      code: "INSUFFICIENT_FUNDS",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.PROMISE_RECEIVED,
      recoveredPaise: 0,
      method: null,
      messagePayload: "Agent: \"Namaste Prashant ji, main RevRec ka AI assistant bol raha hoon. Aapka ₹3,800 ka invoice pending hai — bank side pe ek chota issue tha.\"\nCustomer: \"Haan haan, pata hai. Aaj shaam 7 baje tak UPI se kar dunga.\"\nAgent: \"Bilkul sir. 7 PM ka reminder set kar diya hai. Koi issue ho toh isi number pe call back kar sakte hain. Shukriya!\"",
      customerResponse: "Haan haan, pata hai. Aaj shaam 7 baje tak UPI se kar dunga.",
      status: "READ",
      hoursAgo: 12,
    },
    {
      custIdx: 18,
      channel: DunningChannel.HINGLISH_VOICE,
      template: "hinglish_voice_concierge_v1",
      amountPaise: 450000,
      code: "EXCEEDS_BALANCE",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 450000,
      method: RecoveryMethod.PROMISE_TO_PAY_FULFILLED,
      messagePayload: "Agent: \"Good morning Rohan ji. Calling from RevRec regarding your ₹4,500 SaaS subscription — payment bounce hua tha kal.\"\nCustomer: \"Ohhh haan, salary credit ho gayi aaj subah. Link pe abhi pay karta hoon.\"\nAgent: \"Perfect. WhatsApp pe link bhej raha hoon — 5 minute mein confirm mil jaayega. Thank you Rohan ji!\"",
      customerResponse: "Salary credit ho gayi hai, abhi link pe pay karta hoon.",
      status: "DELIVERED",
      hoursAgo: 70,
    },
    {
      custIdx: 19,
      channel: DunningChannel.HINGLISH_VOICE,
      template: "executive_escalation_voice_v2",
      amountPaise: 1350000,
      code: "CORPORATE_CARD_LIMIT",
      cat: DeclineCategory.SOFT,
      stage: RecoveryStage.RECOVERED,
      recoveredPaise: 1350000,
      method: RecoveryMethod.CUSTOMER_LINK_CLICK,
      messagePayload: "Agent: \"Hello Vikram sir, good afternoon. Calling from RevRec enterprise billing regarding ₹13,500 license renewal — corporate card pe limit issue aaya tha.\"\nCustomer: \"Hmm, accounts team ko forward kar diya hai. NEFT se settle karte hain abhi.\"\nAgent: \"Thank you sir. Accounts ki taraf se confirm milte hi receipt email pe bhej denge.\"",
      customerResponse: "Meri accounts team ko email forward kar diya hai, NEFT se settling.",
      status: "CLICKED",
      hoursAgo: 120,
    },
  ];

  // 3. Insert Payments, RecoveryWorkflows, DunningContacts, AgentExecutions, AuditLogs
  for (let i = 0; i < dunningScenarios.length; i++) {
    const s = dunningScenarios[i]!;
    const cust = customers[s.custIdx]!;
    const extPayId = `pay_seed_${cust.externalId}_${i + 1}`;
    const sentAt = new Date(Date.now() - (s.hoursAgo ?? 12) * 3600 * 1000);
    const deliveredAt = s.status !== "SENT" ? new Date(sentAt.getTime() + 12 * 1000) : null;
    const openedAt = (s.status === "READ" || s.status === "OPENED" || s.status === "CLICKED") ? new Date(sentAt.getTime() + 180 * 1000) : null;
    const clickedAt = s.status === "CLICKED" ? new Date(sentAt.getTime() + 600 * 1000) : null;
    const futureExpiry = new Date(Date.now() + 30 * 86400 * 1000);

    const payment = await db.payment.create({
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
        createdAt: sentAt,
      },
    });

    const workflow = await db.recoveryWorkflow.create({
      data: {
        paymentId: payment.id,
        customerId: cust.id,
        amountAtRiskInPaise: s.amountPaise,
        amountRecoveredInPaise: s.recoveredPaise,
        stage: s.stage,
        retryCount: s.stage === RecoveryStage.RECOVERED ? 1 : 0,
        outreachCount: 1,
        recoveryMethod: s.method,
        expiresAt: futureExpiry,
        createdAt: sentAt,
      },
    });

    // Create Dunning Contact Record
    await db.dunningContact.create({
      data: {
        workflowId: workflow.id,
        customerId: cust.id,
        channel: s.channel,
        messageTemplate: `${s.template}:::${s.messagePayload}`,
        customerResponse: s.customerResponse,
        sentAt,
        deliveredAt,
        openedAt,
        clickedAt,
      },
    });

    // Create Agent Execution record
    await db.agentExecution.create({
      data: {
        workflowId: workflow.id,
        reasoning: `Autonomous RCA categorized failure as ${s.cat} (${s.code}). Dispatched bounded outreach on ${s.channel}.`,
        selectedTool: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK,
        toolInput: { channel: s.channel, template: s.template },
        confidenceScore: 0.95,
        policyCheckPassed: true,
        policyCheckDetails: "Complies with RBI 2026 digital payment communication guidelines.",
        executionStatus: "EXECUTED",
        llmLatencyMs: 180 + (i * 10),
        llmTokensUsed: 290,
        estimatedCostInPaise: 0.21,
        createdAt: sentAt,
      },
    });

    // Create Audit Log entries
    await db.auditLog.create({
      data: {
        eventType: AuditEventType.PAYMENT_FAILED,
        workflowId: workflow.id,
        paymentId: payment.id,
        customerId: cust.id,
        actorType: "WEBHOOK_PROCESSOR",
        actorId: "razorpay-webhook-receiver",
        outcome: "SUCCESS",
        amountInPaise: s.amountPaise,
        newStage: RecoveryStage.PENDING,
        payload: { errorCode: s.code, declineCategory: s.cat },
        createdAt: sentAt,
      },
    });

    if (s.stage === RecoveryStage.RECOVERED) {
      await db.auditLog.create({
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
          payload: { recoveredVia: s.method ?? "AUTO_RETRY" },
          createdAt: new Date(sentAt.getTime() + 1800 * 1000),
        },
      });
    } else if (s.stage === RecoveryStage.PROMISE_RECEIVED && s.customerResponse) {
      const promiseDate = new Date(Date.now() + 5 * 86400 * 1000);
      await db.promiseToPay.create({
        data: {
          workflowId: workflow.id,
          customerId: cust.id,
          promisedAmountInPaise: s.amountPaise,
          promisedByDate: promiseDate,
          status: PromiseStatus.ACTIVE,
          createdByChannel: s.channel,
          reminderScheduledAt: new Date(promiseDate.getTime() - 24 * 3600 * 1000),
          createdAt: sentAt,
        },
      });
    }
  }

  console.log(`[Seed] Successfully populated ${dunningScenarios.length} realistic omnichannel workflows and database dispatches`);
}

// Execute standalone when run via `npm run db:seed` or CLI
if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error("[Seed Error]", e);
      process.exit(1);
    })
    .finally(async () => {
      await defaultPrisma.$disconnect();
    });
}

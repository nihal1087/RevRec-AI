/**
 * enums.ts — RevRec State Machine Enums
 *
 * WHY ENUMS OVER STRINGS:
 * Financial state machines must make illegal states unrepresentable.
 * Using raw strings like status = "done" means any typo silently
 * creates an invalid state. TypeScript enums + exhaustive switch
 * checks (never type) make the compiler enforce correctness.
 *
 * These enums are the single source of truth for every state
 * transition across the API, workers, agent, and frontend.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle states of a payment transaction.
 * A payment can only move forward — no going back from FAILED to PENDING.
 */
export enum PaymentStatus {
  PENDING = "PENDING",
  AUTHORIZED = "AUTHORIZED",
  CAPTURED = "CAPTURED",       // Money settled successfully
  FAILED = "FAILED",           // Terminal failure — requires recovery
  REFUNDED = "REFUNDED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
}

/**
 * RCA Taxonomy — The single most important classification in the entire system.
 *
 * WHY THIS MATTERS:
 * - Soft declines CAN recover with a retry at the right time.
 * - Hard declines CANNOT recover by retrying — you'll just waste money
 *   and annoy the bank/customer. The action needed is different (update card).
 * - Getting this wrong = double charging customers or burning retry budget.
 */
export enum DeclineCategory {
  SOFT = "SOFT",               // Retryable: insufficient funds, daily limit, bank timeout
  HARD = "HARD",               // Non-retryable: expired card, account closed, fraud block
  NETWORK = "NETWORK",         // Transient: gateway timeout, bank unreachable
  INTENT_DROP = "INTENT_DROP", // Customer abandoned: OTP not entered, checkout exit
  MANDATE_FAILURE = "MANDATE_FAILURE", // Auth failure: e-NACH rejected, UPI AutoPay cancelled
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOVERY WORKFLOW DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * States of the RevRec Recovery Workflow state machine.
 *
 * State transition rules (enforced in the workflow service):
 * PENDING → ANALYZING → RETRYING | OUTREACH_SENT | ESCALATED
 * RETRYING → OUTREACH_SENT | ESCALATED | RECOVERED | ABANDONED
 * OUTREACH_SENT → PROMISE_RECEIVED | RECOVERED | ESCALATED | HALTED | ABANDONED
 * PROMISE_RECEIVED → RECOVERED | PROMISE_BROKEN → OUTREACH_SENT | ESCALATED
 */
export enum RecoveryStage {
  PENDING = "PENDING",               // Event received, not yet analyzed
  ANALYZING = "ANALYZING",           // RCA engine is classifying the failure
  RETRYING = "RETRYING",             // Smart Retry Sequencer is scheduling retries
  OUTREACH_SENT = "OUTREACH_SENT",   // Customer contacted via WhatsApp/SMS/Email
  PROMISE_RECEIVED = "PROMISE_RECEIVED", // Customer promised to pay by a date
  RECOVERED = "RECOVERED",           // Payment successfully collected ✅
  ESCALATED = "ESCALATED",           // Sent to human agent queue
  HALTED = "HALTED",                 // Stopped: customer disputed / opted out
  ABANDONED = "ABANDONED",           // Max attempts reached, gave up
}

/**
 * Which channel was used to contact the customer.
 * Ranked by conversion effectiveness (WhatsApp > SMS > Email for India).
 */
export enum DunningChannel {
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  EMAIL = "EMAIL",
  HINGLISH_VOICE = "HINGLISH_VOICE", // Future: voice call with Hinglish bot
  HUMAN_AGENT = "HUMAN_AGENT",
}

/**
 * Recovery methods — what action actually recovered the money.
 * Critical for the ROI dashboard: we measure which method is most cost-effective.
 */
export enum RecoveryMethod {
  AUTO_RETRY = "AUTO_RETRY",                   // Smart Retry Sequencer succeeded
  CUSTOMER_LINK_CLICK = "CUSTOMER_LINK_CLICK", // Customer paid via recovery link
  PROMISE_TO_PAY_FULFILLED = "PROMISE_TO_PAY_FULFILLED",
  PARTIAL_SETTLEMENT = "PARTIAL_SETTLEMENT",   // Settled at a discount
  MANUAL_HUMAN = "MANUAL_HUMAN",               // Human agent collected
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bounded set of tools the AI Recovery Agent is allowed to invoke.
 *
 * WHY BOUNDED:
 * An LLM with unlimited tool access in a financial system is a liability.
 * By limiting to these 6 tools and validating every output with Zod schemas,
 * we guarantee the agent cannot hallucinate a new action that moves money.
 */
export enum AgentToolName {
  RETRY_PAYMENT = "retry_payment",
  SEND_WHATSAPP_RECOVERY_LINK = "send_whatsapp_recovery_link",
  APPLY_PARTIAL_SETTLEMENT = "apply_partial_settlement_discount",
  SCHEDULE_PROMISE_TO_PAY = "schedule_promise_to_pay",
  ESCALATE_TO_HUMAN = "escalate_to_human_agent",
  HALT_DUNNING = "halt_dunning",
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE / B2B DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  WRITTEN_OFF = "WRITTEN_OFF",
}

// ─────────────────────────────────────────────────────────────────────────────
// HINGLISH BOT INTENT DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed intent categories from the Hinglish Recovery Bot.
 * The LLM classifies every customer message into one of these intents.
 * The downstream action is determined DETERMINISTICALLY based on intent,
 * not by the LLM itself — this is the bounded agency principle in action.
 */
export enum HinglishIntent {
  PROMISE_TO_PAY = "PROMISE_TO_PAY",       // "Kal tak pay kar deta hoon"
  HARDSHIP = "HARDSHIP",                   // "Abhi paisa nahi hai"
  DISPUTE = "DISPUTE",                     // "Maine toh pay kiya tha"
  CONFIRMED_REFUSAL = "CONFIRMED_REFUSAL", // "Nahi karunga payment"
  PAYMENT_INTENT = "PAYMENT_INTENT",       // "Link bhejo, abhi pay karta hoon"
  NEEDS_CLARIFICATION = "NEEDS_CLARIFICATION",
}

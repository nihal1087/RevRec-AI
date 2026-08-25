/**
 * audit.types.ts — Immutable Audit Ledger Interfaces
 *
 * WHY AN AUDIT LEDGER:
 * In regulated financial systems (and especially for Razorpay's compliance),
 * every action taken on a customer's payment must be traceable.
 * "Who decided to retry? When? Why? What was the result?"
 * must have a permanent, tamper-evident answer.
 *
 * Our audit log is append-only (no UPDATEs, no DELETEs in application code).
 * PostgreSQL row-level security will enforce this in Phase 5.
 */

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT EVENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export enum AuditEventType {
  // Payment Events
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PAYMENT_RETRY_SCHEDULED = "PAYMENT_RETRY_SCHEDULED",
  PAYMENT_RETRY_SUCCEEDED = "PAYMENT_RETRY_SUCCEEDED",
  PAYMENT_RETRY_FAILED = "PAYMENT_RETRY_FAILED",

  // Recovery Workflow Events
  WORKFLOW_CREATED = "WORKFLOW_CREATED",
  WORKFLOW_STAGE_CHANGED = "WORKFLOW_STAGE_CHANGED",
  WORKFLOW_RECOVERED = "WORKFLOW_RECOVERED",
  WORKFLOW_ABANDONED = "WORKFLOW_ABANDONED",
  WORKFLOW_HALTED = "WORKFLOW_HALTED",
  WORKFLOW_ESCALATED = "WORKFLOW_ESCALATED",

  // RCA Events
  RCA_CLASSIFIED = "RCA_CLASSIFIED",

  // AI Agent Events
  AGENT_DECISION_MADE = "AGENT_DECISION_MADE",
  AGENT_TOOL_EXECUTED = "AGENT_TOOL_EXECUTED",
  AGENT_REJECTED_BY_POLICY = "AGENT_REJECTED_BY_POLICY",

  // Dunning Events
  OUTREACH_SENT = "OUTREACH_SENT",
  OUTREACH_DELIVERED = "OUTREACH_DELIVERED",
  CUSTOMER_RESPONDED = "CUSTOMER_RESPONDED",
  PROMISE_TO_PAY_CREATED = "PROMISE_TO_PAY_CREATED",
  PROMISE_TO_PAY_FULFILLED = "PROMISE_TO_PAY_FULFILLED",
  PROMISE_TO_PAY_BREACHED = "PROMISE_TO_PAY_BREACHED",

  // Compliance Events
  COMPLIANCE_CHECK_PASSED = "COMPLIANCE_CHECK_PASSED",
  COMPLIANCE_CHECK_FAILED = "COMPLIANCE_CHECK_FAILED",
  MAX_ATTEMPTS_REACHED = "MAX_ATTEMPTS_REACHED",
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT ENTRY (Core Immutable Record)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuditEntry is WRITE-ONCE. Never updated after creation.
 * All fields are readonly to enforce this at the type level.
 *
 * The `checksum` field will be a SHA-256 hash of the entry content
 * for tamper detection (implemented in Phase 5).
 */
export interface AuditEntry {
  readonly id: string;                  // UUID v4
  readonly eventType: AuditEventType;
  readonly workflowId?: string;         // Linked recovery workflow
  readonly paymentId?: string;          // Linked payment
  readonly customerId?: string;         // Linked customer
  readonly actorType: AuditActorType;
  readonly actorId: string;             // ID of the actor (worker ID, agent ID, user ID)
  readonly payload: Record<string, unknown>; // Event-specific data (flexible JSONB)
  readonly previousStage?: string;      // For state transition events
  readonly newStage?: string;
  readonly amountInPaise?: number;      // Monetary amounts when relevant
  readonly outcome: "SUCCESS" | "FAILURE" | "PENDING" | "REJECTED";
  readonly errorMessage?: string;
  readonly checksum?: string;           // SHA-256 hash for tamper detection (Phase 5)
  readonly createdAt: Date;             // Immutable timestamp — never updated
}

export enum AuditActorType {
  SYSTEM = "SYSTEM",                   // Automated background worker
  AI_AGENT = "AI_AGENT",              // AI Recovery Agent
  DUNNING_RULE_ENGINE = "DUNNING_RULE_ENGINE",
  RETRY_SEQUENCER = "RETRY_SEQUENCER",
  WEBHOOK_PROCESSOR = "WEBHOOK_PROCESSOR",
  HUMAN_AGENT = "HUMAN_AGENT",        // Human support agent
  CUSTOMER = "CUSTOMER",              // Customer action (e.g., clicking payment link)
  API = "API",                        // Direct API call (e.g., batch simulator)
}

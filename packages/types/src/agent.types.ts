/**
 * agent.types.ts — AI Recovery Agent Tool Contracts
 *
 * These interfaces define the strict JSON schemas for every tool the AI agent
 * can call. They are the contract between the LLM's output and our
 * deterministic execution layer.
 *
 * WHY STRICT SCHEMAS HERE:
 * The LLM produces text. We need structured actions. By defining these
 * interfaces and validating LLM output against them with Zod at runtime,
 * we create a hard wall between "AI reasoning" and "financial execution".
 * If the LLM hallucinates a field or produces wrong types, Zod rejects it
 * before any money moves. This is the bounded agency principle.
 */

import { AgentToolName, DeclineCategory } from "./enums";
import { MoneyAmount } from "./payment.types";

// ─────────────────────────────────────────────────────────────────────────────
// AGENT INPUT (What the agent receives to analyze)
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentRecoveryInput {
  readonly workflowId: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly amountAtRisk: MoneyAmount;
  readonly declineCategory: DeclineCategory;
  readonly gatewayErrorCode: string;
  readonly retryCount: number;
  readonly outreachCount: number;
  readonly customerRiskScore: number;       // 0-100
  readonly customerLtvInPaise: number;      // Used to decide recovery effort investment
  readonly daysSinceFailure: number;
  readonly isWithinSalaryWindow: boolean;   // Key signal for retry timing
  readonly previousAttemptHistory: string;  // Summarized history for context
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT TOOL CALL OUTPUTS (What the agent decides to do)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The top-level structured output of the AI agent.
 * This is the ONLY thing the agent is allowed to return.
 * Any response not matching this schema is rejected by the Zod validator.
 */
export interface AgentDecision {
  readonly workflowId: string;
  readonly reasoning: string;              // Agent's chain-of-thought (for audit log)
  readonly selectedTool: AgentToolName;
  readonly toolInput: AgentToolInput;
  readonly confidenceScore: number;        // 0-1: agent's self-reported confidence
  readonly alternativeConsidered?: AgentToolName; // What else was considered
}

/**
 * Discriminated union of all possible tool inputs.
 * TypeScript narrows the type based on `tool` field — type-safe exhaustive handling.
 */
export type AgentToolInput =
  | RetryPaymentInput
  | SendWhatsappRecoveryLinkInput
  | ApplyPartialSettlementInput
  | SchedulePromiseToPayInput
  | EscalateToHumanInput
  | HaltDunningInput;

export interface RetryPaymentInput {
  readonly tool: AgentToolName.RETRY_PAYMENT;
  readonly delayMinutes: number;     // How long to wait before retrying
  readonly reason: string;           // Why now is the right time
}

export interface SendWhatsappRecoveryLinkInput {
  readonly tool: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK;
  readonly messageTemplateKey: string; // Pre-approved template ID
  readonly includeDiscount: boolean;
  readonly discountPercent?: number;   // Only if includeDiscount = true
}

export interface ApplyPartialSettlementInput {
  readonly tool: AgentToolName.APPLY_PARTIAL_SETTLEMENT;
  readonly settlementAmountInPaise: number;
  readonly discountPercent: number;
  readonly validForHours: number;       // Settlement offer expiry
  readonly justification: string;       // Business reason logged in audit
}

export interface SchedulePromiseToPayInput {
  readonly tool: AgentToolName.SCHEDULE_PROMISE_TO_PAY;
  readonly promisedByDate: string;      // ISO 8601 date string
  readonly promisedAmountInPaise: number;
  readonly reminderHoursBefore: number; // When to send reminder before promise date
}

export interface EscalateToHumanInput {
  readonly tool: AgentToolName.ESCALATE_TO_HUMAN;
  readonly priority: "LOW" | "MEDIUM" | "HIGH";
  readonly escalationReason: string;
  readonly suggestedAction: string;    // Agent's recommendation to the human
}

export interface HaltDunningInput {
  readonly tool: AgentToolName.HALT_DUNNING;
  readonly reason: string;
  readonly writeOff: boolean;          // Should amount be written off in ledger?
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT RECORD FOR AGENT CALLS
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentExecutionRecord {
  readonly id: string;
  readonly workflowId: string;
  readonly decision: AgentDecision;
  readonly policyCheckPassed: boolean;      // Did DunningRuleEngine approve this?
  readonly policyCheckDetails: string;      // Which rules were checked
  readonly executionStatus: "EXECUTED" | "REJECTED_BY_POLICY" | "EXECUTION_FAILED";
  readonly executionError?: string;
  readonly llmLatencyMs: number;
  readonly llmTokensUsed: number;
  readonly estimatedCostInPaise: number;    // Cost of this LLM call
  readonly createdAt: Date;
}

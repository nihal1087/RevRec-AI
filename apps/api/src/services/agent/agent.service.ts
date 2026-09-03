/**
 * services/agent/agent.service.ts — Bounded AI Revenue Recovery Agent
 *
 * Orchestrates autonomous decision making:
 * 1. Aggregates multi-dimensional financial context (Customer LTV, RCA category, history)
 * 2. Prompts LLM (openai/gpt-oss-120b) with strict JSON schema constraints
 * 3. Enforces compliance boundary checks via DunningRuleEngine before execution
 * 4. Dispatches approved tools transactionally
 * 5. Records immutable audit trails and decision traces for merchant visibility
 */

import { z } from "zod";
import { AgentDecision, AgentToolInput, AgentToolName, DeclineCategory, AgentExecutionStatus } from "@revrec/types";
import { prisma, AuditEventType, Prisma } from "@revrec/db";
import { callGroqStructured } from "./llmClient";
import { validateAgentAction } from "./dunningRules";
import { executeAgentTool, ToolExecutionResult } from "./tools";
import { logger } from "../../config/logger";

// ── Zod Validation Schema for Agent Decision ─────────────────────────────────

export const AgentDecisionSchema = z.object({
  workflowId: z.string().optional(),
  reasoning: z.string().min(10),
  confidenceScore: z.number().min(0).max(1),
  selectedTool: z.nativeEnum(AgentToolName),
  toolInput: z.discriminatedUnion("tool", [
    z.object({
      tool: z.literal(AgentToolName.RETRY_PAYMENT),
      delayMinutes: z.number().int().nonnegative(), // M5 fix: 0 = immediate retry (was .positive() which rejected 0)
      reason: z.string(),
    }),
    z.object({
      tool: z.literal(AgentToolName.SEND_WHATSAPP_RECOVERY_LINK),
      messageTemplateKey: z.string(),
      includeDiscount: z.boolean(),
      discountPercent: z.number().int().nonnegative().optional(),
    }),
    z.object({
      tool: z.literal(AgentToolName.APPLY_PARTIAL_SETTLEMENT),
      settlementAmountInPaise: z.number().int().positive(),
      discountPercent: z.number().int().min(1).max(30),
      validForHours: z.number().int().positive(),
      justification: z.string(),
    }),
    z.object({
      tool: z.literal(AgentToolName.SCHEDULE_PROMISE_TO_PAY),
      promisedByDate: z.string(),
      promisedAmountInPaise: z.number().int().positive(),
      reminderHoursBefore: z.number().int().positive().default(24),
    }),
    z.object({
      tool: z.literal(AgentToolName.ESCALATE_TO_HUMAN),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      escalationReason: z.string(),
      suggestedAction: z.string(),
    }),
    z.object({
      tool: z.literal(AgentToolName.HALT_DUNNING),
      reason: z.string(),
      writeOff: z.boolean().default(false),
    }),
  ]),
});

export interface AgentRunResult {
  readonly workflowId: string;
  readonly decision: AgentDecision;
  readonly policyPassed: boolean;
  readonly policyDetails: string;
  readonly toolResult?: ToolExecutionResult | undefined;
  readonly agentExecutionId: string;
}

const SYSTEM_PROMPT = `
You are the RevRec Autonomous Financial Recovery Agent for high-throughput Indian fintech (Razorpay/Stripe caliber).
Your objective: Recover at-risk payments while minimizing customer churn, preserving merchant brand trust, and strictly obeying Indian financial regulations (RBI Fair Practices Code, TRAI DND rules).

BOUNDED AGENCY RULES:
1. You can ONLY select from the 6 predefined tools:
   - retry_payment
   - send_whatsapp_recovery_link
   - apply_partial_settlement_discount
   - schedule_promise_to_pay
   - escalate_to_human_agent
   - halt_dunning
2. NEVER schedule automated retries for HARD declines (e.g., stolen or expired cards).
3. For INTENT_DROP / OTP timeouts, prefer sending a low-friction 1-click payment link via WHATSAPP using the "send_whatsapp_recovery_link" tool.
4. For high-value customers (LTV > ₹50,000 or enterprise), prioritize white-glove communication or human escalation.
5. Max concession/discount allowed is 10% of total amount at risk (or ₹500 max).
6. Always return a valid JSON object matching the requested schema.
`;

/**
 * Runs the autonomous agent evaluation loop on a single recovery workflow.
 */
export async function runAgentDecision(workflowId: string): Promise<AgentRunResult> {
  // 1. Gather all financial and contextual entities
  const workflow = await prisma.recoveryWorkflow.findUnique({
    where: { id: workflowId },
    include: {
      payment: true,
      customer: true,
      dunningContacts: { orderBy: { sentAt: "desc" }, take: 5 },
      promiseToPays: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!workflow) {
    throw new Error(`RecoveryWorkflow ${workflowId} not found`);
  }

  // Short-circuit if the case is already fully resolved to prevent hallucinated fallback actions
  if (workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.stage === "ABANDONED" || workflow.stage === "ESCALATED") {
    return {
      workflowId: workflow.id,
      agentExecutionId: `exec_skipped_${workflow.stage.toLowerCase()}`,
      decision: {
        workflowId: workflow.id,
        reasoning: `Action bypassed: Workflow is currently in terminal stage '${workflow.stage}'.`,
        confidenceScore: 1.0,
        selectedTool: AgentToolName.HALT_DUNNING,
        toolInput: {
          tool: AgentToolName.HALT_DUNNING,
          reason: `Workflow is ${workflow.stage}`,
          writeOff: false
        },
      },
      policyPassed: false,
      policyDetails: `Action bypassed: Workflow is in ${workflow.stage} stage.`,
    };
  }

  const category = (workflow.payment.declineCategory as DeclineCategory | null) ?? DeclineCategory.SOFT;

  // 2. Build structured contextual prompt
  const userPrompt = `
EVALUATE THIS RECOVERY CASE:
- Workflow ID: ${workflow.id}
- Amount At Risk: ₹${Number(workflow.amountAtRiskInPaise) / 100} (${workflow.amountAtRiskInPaise} paise)
- Current Stage: ${workflow.stage}
- Retry Count So Far: ${workflow.retryCount}
- Outreach Count So Far: ${workflow.outreachCount}

CUSTOMER CONTEXT:
- Name: ${workflow.customer.name}
- Risk Score: ${workflow.customer.riskScore}/100 (Higher = Higher Risk)
- Lifetime Value (LTV): ₹${Number(workflow.customer.ltvInPaise) / 100}
- Preferred Channel: ${workflow.customer.preferredChannel}

FAILURE CONTEXT:
- Gateway: ${workflow.payment.gateway}
- Gateway Error Code: ${workflow.payment.gatewayErrorCode}
- RCA Classification: ${category}

RECENT OUTREACH HISTORY:
${workflow.dunningContacts.map((c) => `- Channel: ${c.channel}, Sent: ${c.sentAt.toISOString()}`).join("\n") || "No prior outreach"}

ACTIVE COMMITMENTS:
${workflow.promiseToPays.length > 0 ? `Active Promise to Pay: ${workflow.promiseToPays[0]?.status} until ${workflow.promiseToPays[0]?.promisedByDate.toISOString()}` : "No active promise"}

Determine the single best, compliant action to recover this revenue. Return structured JSON with exactly the following schema:
{
  "reasoning": "string",
  "confidenceScore": 0.0 to 1.0,
  "selectedTool": "send_whatsapp_recovery_link" (or other tool name),
  "toolInput": {
    "tool": "send_whatsapp_recovery_link",
    "messageTemplateKey": "intent_drop_recovery_v1",
    "includeDiscount": false
  }
}
Note: toolInput schema varies by tool. For send_whatsapp_recovery_link, include 'messageTemplateKey' and 'includeDiscount' as shown above.
`;

  // 3. Invoke LLM via Groq LPU
  const llmResult = await callGroqStructured(userPrompt, SYSTEM_PROMPT);

  // 4. Validate output with Zod
  const parseResult = AgentDecisionSchema.safeParse(llmResult.structuredJson);
  let decision: AgentDecision;

  if (parseResult.success) {
    decision = {
      workflowId: workflow.id,
      reasoning: parseResult.data.reasoning,
      confidenceScore: parseResult.data.confidenceScore,
      selectedTool: parseResult.data.selectedTool,
      toolInput: parseResult.data.toolInput as AgentToolInput,
    };
  } else {
    logger.warn(`[Agent] LLM output failed schema validation (${parseResult.error.message}) — using safe fallback. Raw output: ${JSON.stringify(llmResult.structuredJson)}`);
    decision = {
      workflowId: workflow.id,
      reasoning: "Safe fallback applied due to schema validation constraint.",
      confidenceScore: 0.20,
      selectedTool: AgentToolName.RETRY_PAYMENT,
      toolInput: {
        tool: AgentToolName.RETRY_PAYMENT,
        delayMinutes: 2880,
        reason: "Standard 48h liquidity delay.",
      },
    };
  }

  // 5. Evaluate against Dunning Compliance & Policy Guard
  const policyCheck = await validateAgentAction(decision.toolInput, {
    customerId: workflow.customerId,
    workflowId: workflow.id,
    // Cast BigInt → number: DunningContext interface uses number; safe since paise fit in MAX_SAFE_INTEGER
    amountAtRiskInPaise: Number(workflow.amountAtRiskInPaise),
    declineCategory: category,
  });

  let toolToExecute: AgentToolInput = decision.toolInput;
  let executionStatus: AgentExecutionStatus = AgentExecutionStatus.EXECUTED;
  let executionError: string | undefined;
  let toolResult: ToolExecutionResult | undefined;

  if (policyCheck.allowed) {
    logger.info(`[Agent] ✅ Policy Check Passed (${policyCheck.ruleName}) for workflow ${workflow.id}`);
    try {
      toolResult = await executeAgentTool(toolToExecute, workflow.id);
    } catch (err) {
      executionStatus = AgentExecutionStatus.EXECUTION_FAILED;
      executionError = (err as Error).message;
      logger.error(`[Agent] Tool execution failed: ${executionError}`);
    }
  } else {
    logger.warn(`[Agent] ⚠️ Policy Check REJECTED: ${policyCheck.ruleName} — ${policyCheck.violationReason}`);
    executionStatus = AgentExecutionStatus.REJECTED_BY_POLICY;

    // Write audit log for policy rejection
    await prisma.auditLog.create({
      data: {
        eventType: AuditEventType.AGENT_REJECTED_BY_POLICY,
        workflowId: workflow.id,
        paymentId: workflow.paymentId,
        customerId: workflow.customerId,
        actorType: "DUNNING_RULE_ENGINE",
        actorId: "compliance-policy-guard",
        payload: {
          attemptedTool: decision.selectedTool,
          violatedRule: policyCheck.ruleName,
          reason: policyCheck.violationReason,
        },
        outcome: "REJECTED",
        errorMessage: policyCheck.violationReason ?? null,
      },
    });

    // If policy recommended a compliant alternative, execute the alternative
    if (policyCheck.recommendedAlternative) {
      logger.info(`[Agent] Executing compliant fallback alternative: ${policyCheck.recommendedAlternative.tool}`);
      toolToExecute = policyCheck.recommendedAlternative;
      try {
        toolResult = await executeAgentTool(toolToExecute, workflow.id);
        executionStatus = AgentExecutionStatus.EXECUTED;
      } catch (err) {
        executionError = (err as Error).message;
        executionStatus = AgentExecutionStatus.EXECUTION_FAILED;
      }
    }
  }

  // 6. Record immutable AgentExecution record
  const agentExecution = await prisma.agentExecution.create({
    data: {
      workflowId: workflow.id,
      reasoning: decision.reasoning,
      selectedTool: decision.selectedTool,
      toolInput: JSON.parse(JSON.stringify(toolToExecute)) as Prisma.InputJsonValue,
      confidenceScore: decision.confidenceScore,
      policyCheckPassed: policyCheck.allowed,
      policyCheckDetails: policyCheck.allowed
        ? "Policy validation passed: all regulatory and business bounds satisfied."
        : `Policy validation failed: ${policyCheck.ruleName} (${policyCheck.violationReason})`,
      executionStatus,
      executionError: executionError ?? null,
      llmLatencyMs: llmResult.latencyMs,
      llmTokensUsed: llmResult.tokensUsed,
      estimatedCostInPaise: llmResult.estimatedCostInPaise,
    },
  });

  // 7. Write Audit: Agent Decision Made
  await prisma.auditLog.create({
    data: {
      eventType: AuditEventType.AGENT_DECISION_MADE,
      workflowId: workflow.id,
      paymentId: workflow.paymentId,
      customerId: workflow.customerId,
      actorType: "AI_AGENT",
      actorId: "revenue-recovery-agent",
      payload: {
        agentExecutionId: agentExecution.id,
        reasoning: decision.reasoning,
        selectedTool: decision.selectedTool,
        confidence: decision.confidenceScore,
        policyPassed: policyCheck.allowed,
        costInPaise: llmResult.estimatedCostInPaise,
        latencyMs: llmResult.latencyMs,
      },
      outcome: executionStatus,
    },
  });

  const runResult: AgentRunResult = {
    workflowId: workflow.id,
    decision,
    policyPassed: policyCheck.allowed,
    policyDetails: policyCheck.violationReason ?? "Passed all compliance rules",
    ...(toolResult ? { toolResult } : {}),
    agentExecutionId: agentExecution.id,
  };

  return runResult;
}

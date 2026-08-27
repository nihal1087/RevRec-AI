/**
 * services/agent/tools.ts — Bounded Tool Implementations
 *
 * Executes the 6 strictly-typed autonomous recovery tools matching @revrec/types contracts
 * with transactional safety, state machine updates, and immutable audit logs.
 */

import { AgentToolInput, AgentToolName, DunningChannel, RecoveryStage } from "@revrec/types";
import { prisma, AuditEventType, PromiseStatus, Prisma } from "@revrec/db";
import { retryExecutionQueue } from "../../queues/retryExecution.queue";
import { logger } from "../../config/logger";

export interface ToolExecutionResult {
  readonly success: boolean;
  readonly toolExecuted: AgentToolName;
  readonly details: Record<string, unknown>;
  readonly errorMessage?: string;
}

/**
 * Dispatches and executes an approved agent tool.
 */
export async function executeAgentTool(
  toolInput: AgentToolInput,
  workflowId: string
): Promise<ToolExecutionResult> {
  const workflow = await prisma.recoveryWorkflow.findUnique({
    where: { id: workflowId },
    include: { payment: true, customer: true },
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found for tool execution`);
  }

  logger.info(`[ToolDispatcher] Executing tool ${toolInput.tool} on workflow ${workflowId}`);

  switch (toolInput.tool) {
    case AgentToolName.RETRY_PAYMENT: {
      const scheduledDate = new Date(Date.now() + toolInput.delayMinutes * 60 * 1000);
      const delayMs = Math.max(1000, toolInput.delayMinutes * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.RETRYING,
            nextActionAt: scheduledDate,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.PAYMENT_RETRY_SCHEDULED,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "AI_AGENT",
            actorId: "revenue-recovery-agent",
            payload: {
              delayMinutes: toolInput.delayMinutes,
              reason: toolInput.reason,
              scheduledAt: scheduledDate.toISOString(),
            },
            previousStage: workflow.stage,
            newStage: RecoveryStage.RETRYING,
            amountInPaise: workflow.amountAtRiskInPaise,
            outcome: "SUCCESS",
          },
        });
      });

      await retryExecutionQueue.add(
        "execute-retry",
        {
          workflowId: workflow.id,
          paymentId: workflow.paymentId,
          customerId: workflow.customerId,
          attemptNumber: workflow.retryCount + 1,
          scheduledFor: scheduledDate.toISOString(),
          strategyUsed: "AI_AGENT_RETRY_PAYMENT",
        },
        {
          delay: delayMs,
          jobId: `agent_retry_${workflow.id}_${Date.now()}`,
        }
      );

      return {
        success: true,
        toolExecuted: AgentToolName.RETRY_PAYMENT,
        details: { scheduledAt: scheduledDate.toISOString(), reason: toolInput.reason },
      };
    }

    case AgentToolName.SEND_WHATSAPP_RECOVERY_LINK: {
      const linkId = `plink_wa_${Date.now().toString(36)}`;
      const paymentUrl = `https://rzp.io/i/${linkId}`;

      await prisma.$transaction(async (tx) => {
        await tx.dunningContact.create({
          data: {
            workflowId: workflow.id,
            customerId: workflow.customerId,
            channel: DunningChannel.WHATSAPP,
            messageTemplate: toolInput.messageTemplateKey,
            sentAt: new Date(),
            deliveredAt: new Date(Date.now() + 2000),
            customerResponse: `Payment link: ${paymentUrl}`,
          },
        });

        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.OUTREACH_SENT,
            outreachCount: { increment: 1 },
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.OUTREACH_SENT,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "AI_AGENT",
            actorId: "revenue-recovery-agent",
            payload: {
              channel: DunningChannel.WHATSAPP,
              templateKey: toolInput.messageTemplateKey,
              includeDiscount: toolInput.includeDiscount,
              discountPercent: toolInput.discountPercent ?? 0,
              paymentUrl,
            },
            previousStage: workflow.stage,
            newStage: RecoveryStage.OUTREACH_SENT,
            amountInPaise: workflow.amountAtRiskInPaise,
            outcome: "SUCCESS",
          },
        });
      });

      return {
        success: true,
        toolExecuted: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK,
        details: {
          channel: "WHATSAPP",
          template: toolInput.messageTemplateKey,
          paymentUrl,
          recipientPhone: workflow.customer.phone,
        },
      };
    }

    case AgentToolName.APPLY_PARTIAL_SETTLEMENT: {
      const linkId = `plink_settle_${Date.now().toString(36)}`;
      const paymentUrl = `https://rzp.io/i/${linkId}`;

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.AGENT_TOOL_EXECUTED,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "AI_AGENT",
            actorId: "revenue-recovery-agent",
            payload: {
              tool: "APPLY_PARTIAL_SETTLEMENT",
              settlementAmountInPaise: toolInput.settlementAmountInPaise,
              discountPercent: toolInput.discountPercent,
              validForHours: toolInput.validForHours,
              justification: toolInput.justification,
              paymentUrl,
            },
            amountInPaise: toolInput.settlementAmountInPaise,
            outcome: "SUCCESS",
          },
        });

        await tx.dunningContact.create({
          data: {
            workflowId: workflow.id,
            customerId: workflow.customerId,
            channel: DunningChannel.WHATSAPP,
            messageTemplate: "partial_settlement_offer_v1",
            customerResponse: `Settlement offer sent for ₹${toolInput.settlementAmountInPaise / 100} (Discount: ${toolInput.discountPercent}%): ${paymentUrl}`,
          },
        });

        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.OUTREACH_SENT,
            outreachCount: { increment: 1 },
            version: { increment: 1 },
          },
        });
      });

      return {
        success: true,
        toolExecuted: AgentToolName.APPLY_PARTIAL_SETTLEMENT,
        details: {
          settlementAmountInPaise: toolInput.settlementAmountInPaise,
          discountPercent: toolInput.discountPercent,
          paymentUrl,
        },
      };
    }

    case AgentToolName.SCHEDULE_PROMISE_TO_PAY: {
      const promisedDate = new Date(toolInput.promisedByDate);
      const reminderDate = new Date(promisedDate.getTime() - toolInput.reminderHoursBefore * 3600 * 1000);

      await prisma.$transaction(async (tx) => {
        const ptp = await tx.promiseToPay.create({
          data: {
            workflowId: workflow.id,
            customerId: workflow.customerId,
            promisedAmountInPaise: toolInput.promisedAmountInPaise,
            promisedByDate: promisedDate,
            status: PromiseStatus.ACTIVE,
            createdByChannel: DunningChannel.WHATSAPP,
            reminderScheduledAt: reminderDate,
          },
        });

        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.PROMISE_RECEIVED,
            nextActionAt: promisedDate,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.PROMISE_TO_PAY_CREATED,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "AI_AGENT",
            actorId: "revenue-recovery-agent",
            payload: {
              ptpId: ptp.id,
              promisedByDate: toolInput.promisedByDate,
              promisedAmountInPaise: toolInput.promisedAmountInPaise,
              reminderHoursBefore: toolInput.reminderHoursBefore,
            },
            previousStage: workflow.stage,
            newStage: RecoveryStage.PROMISE_RECEIVED,
            amountInPaise: toolInput.promisedAmountInPaise,
            outcome: "SUCCESS",
          },
        });
      });

      return {
        success: true,
        toolExecuted: AgentToolName.SCHEDULE_PROMISE_TO_PAY,
        details: { promisedByDate: toolInput.promisedByDate, amountInPaise: toolInput.promisedAmountInPaise },
      };
    }

    case AgentToolName.ESCALATE_TO_HUMAN: {
      await prisma.$transaction(async (tx) => {
        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.ESCALATED,
            escalationReason: `${toolInput.escalationReason} | Suggested Action: ${toolInput.suggestedAction}`,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.WORKFLOW_ESCALATED,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "AI_AGENT",
            actorId: "revenue-recovery-agent",
            payload: {
              priority: toolInput.priority,
              escalationReason: toolInput.escalationReason,
              suggestedAction: toolInput.suggestedAction,
            } as Prisma.InputJsonValue,
            previousStage: workflow.stage,
            newStage: RecoveryStage.ESCALATED,
            amountInPaise: workflow.amountAtRiskInPaise,
            outcome: "ESCALATED",
          },
        });
      });

      return {
        success: true,
        toolExecuted: AgentToolName.ESCALATE_TO_HUMAN,
        details: {
          priority: toolInput.priority,
          reason: toolInput.escalationReason,
          action: toolInput.suggestedAction,
        },
      };
    }

    case AgentToolName.HALT_DUNNING: {
      await prisma.$transaction(async (tx) => {
        await tx.recoveryWorkflow.update({
          where: { id: workflow.id },
          data: {
            stage: RecoveryStage.HALTED,
            haltReason: toolInput.reason,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.WORKFLOW_HALTED,
            workflowId: workflow.id,
            paymentId: workflow.paymentId,
            customerId: workflow.customerId,
            actorType: "AI_AGENT",
            actorId: "revenue-recovery-agent",
            payload: {
              reason: toolInput.reason,
              writeOff: toolInput.writeOff,
            } as Prisma.InputJsonValue,
            previousStage: workflow.stage,
            newStage: RecoveryStage.HALTED,
            amountInPaise: workflow.amountAtRiskInPaise,
            outcome: "HALTED",
          },
        });
      });

      return {
        success: true,
        toolExecuted: AgentToolName.HALT_DUNNING,
        details: { reason: toolInput.reason, writeOff: toolInput.writeOff },
      };
    }
  }
}

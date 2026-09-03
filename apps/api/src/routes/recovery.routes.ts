/**
 * routes/recovery.routes.ts — Recovery Workflow Management Endpoints
 *
 * Provides REST APIs for inspecting workflows, viewing audit trails,
 * triggering on-demand RCA analysis, and manual retry overrides.
 */

import { Router, Request, Response } from "express";
import { prisma, RecoveryStage, AuditEventType } from "@revrec/db";
import { classifyPaymentFailure } from "../services/rca.service";
import { calculateNextRetrySchedule } from "../services/retrySequencer.service";
import { retryExecutionQueue } from "../queues/retryExecution.queue";
import { logger } from "../config/logger";

const router = Router();

/**
 * GET /api/recovery
 * List workflows with optional filtering by stage, customerId, or pagination.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const stageParam = req.query["stage"] as string | undefined;
    const customerId = req.query["customerId"] as string | undefined;
    const rawLimit = parseInt((req.query["limit"] as string) ?? "50", 10);
    const rawPage = parseInt((req.query["page"] as string) ?? "1", 10);
    const limit = Math.min(500, Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit));
    const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
    const skip = (page - 1) * limit;

    // "IN_FLIGHT" is a frontend pseudo-filter that maps to all actively-running stages.
    // A single stage enum value like "ACTIVE" does not exist in RecoveryStage, so we
    // translate it into a Prisma `in` filter across the 5 non-terminal active stages.
    const IN_FLIGHT_STAGES: RecoveryStage[] = [
      RecoveryStage.PENDING,
      RecoveryStage.ANALYZING,
      RecoveryStage.RETRYING,
      RecoveryStage.OUTREACH_SENT,
      RecoveryStage.PROMISE_RECEIVED,
    ];

    const stageFilter =
      stageParam === "IN_FLIGHT"
        ? { stage: { in: IN_FLIGHT_STAGES } }
        : stageParam
        ? { stage: stageParam as RecoveryStage }
        : {};

    const where = {
      ...stageFilter,
      ...(customerId ? { customerId } : {}),
    };

    const [total, workflows] = await Promise.all([
      prisma.recoveryWorkflow.count({ where }),
      prisma.recoveryWorkflow.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: {
              id: true,
              externalId: true,
              name: true,
              email: true,
              phone: true,
              riskScore: true,
            },
          },
          payment: {
            select: { id: true, externalId: true, status: true, gatewayErrorCode: true, declineCategory: true },
          },
        },
      }),
    ]);

    res.json({
      data: workflows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("[RecoveryRoutes] Error listing workflows:", error);
    res.status(500).json({ error: "Failed to list recovery workflows" });
  }
});

/**
 * GET /api/recovery/:id
 * Retrieve a single recovery workflow with its full audit trail and customer context.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const workflow = await prisma.recoveryWorkflow.findUnique({
      where: { id },
      include: {
        customer: true,
        payment: true,
        auditEntries: {
          orderBy: { createdAt: "desc" },
        },
        dunningContacts: {
          orderBy: { sentAt: "desc" },
        },
        promiseToPays: {
          orderBy: { createdAt: "desc" },
        },
        agentExecutions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!workflow) {
      res.status(404).json({ error: "Recovery workflow not found" });
      return;
    }

    const formattedWorkflow = {
      ...workflow,
      dunningContacts: workflow.dunningContacts.map((c) => {
        let templateName = c.messageTemplate;
        let messagePayload = c.messageTemplate;
        if (c.messageTemplate.includes(":::")) {
          const parts = c.messageTemplate.split(":::");
          templateName = parts[0] || "recovery_template";
          messagePayload = parts.slice(1).join(":::") || templateName;
        } else if (c.messageTemplate.includes(" ") || c.messageTemplate.length > 40) {
          templateName = c.channel === "WHATSAPP"
            ? "wa_smart_recovery_v2"
            : c.channel === "SMS"
            ? "sms_retry_alert_v1"
            : c.channel === "EMAIL"
            ? "email_dunning_v1"
            : "hinglish_voice_concierge_v1";
          messagePayload = c.messageTemplate;
        }
        const status = c.clickedAt ? "CLICKED" : c.openedAt ? "READ" : c.deliveredAt ? "DELIVERED" : "SENT";
        return {
          ...c,
          templateName,
          messagePayload,
          status,
        };
      }),
    };

    res.json({ data: formattedWorkflow });
  } catch (error) {
    logger.error("[RecoveryRoutes] Error retrieving workflow:", error);
    res.status(500).json({ error: "Failed to fetch recovery workflow" });
  }
});

/**
 * POST /api/recovery/:id/analyze
 * Manually triggers or refreshes RCA classification on an existing workflow.
 */
router.post("/:id/analyze", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const workflow = await prisma.recoveryWorkflow.findUnique({
      where: { id },
      include: { payment: true, customer: true },
    });

    if (!workflow) {
      res.status(404).json({ error: "Recovery workflow not found" });
      return;
    }

    const rcaResult = classifyPaymentFailure(
      workflow.payment.gatewayErrorCode ?? "UNKNOWN",
      undefined,
      workflow.payment.gateway
    );

    const retrySchedule = rcaResult.isRetryable
      ? calculateNextRetrySchedule({
          category: rcaResult.category,
          currentAttemptCount: workflow.retryCount,
          customerRiskScore: workflow.customer.riskScore,
        })
      : null;

    res.json({
      status: "analyzed",
      rca: rcaResult,
      retrySchedule,
    });
  } catch (error) {
    logger.error("[RecoveryRoutes] Error analyzing workflow:", error);
    res.status(500).json({ error: "Failed to analyze recovery workflow" });
  }
});

/**
 * POST /api/recovery/:id/retry-now
 * Merchant override: forces an immediate retry attempt (0 delay).
 */
router.post("/:id/retry-now", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const workflow = await prisma.recoveryWorkflow.findUnique({
      where: { id },
      include: { payment: true },
    });

    if (!workflow) {
      res.status(404).json({ error: "Recovery workflow not found" });
      return;
    }

    if (workflow.stage === RecoveryStage.RECOVERED || workflow.stage === RecoveryStage.HALTED) {
      res.status(400).json({
        error: `Cannot retry workflow in terminal stage '${workflow.stage}'`,
      });
      return;
    }

    const nextAttempt = workflow.retryCount + 1;

    // Enqueue immediate BullMQ retry job
    await retryExecutionQueue.add(
      "execute-retry",
      {
        workflowId: workflow.id,
        paymentId: workflow.paymentId,
        customerId: workflow.customerId,
        attemptNumber: nextAttempt,
        scheduledFor: new Date().toISOString(),
        strategyUsed: "MANUAL_MERCHANT_OVERRIDE",
      },
      {
        delay: 0,
        jobId: `manual_retry_${workflow.id}_${Date.now()}`,
      }
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        eventType: AuditEventType.PAYMENT_RETRY_SCHEDULED,
        workflowId: workflow.id,
        paymentId: workflow.paymentId,
        customerId: workflow.customerId,
        actorType: "MERCHANT_USER",
        actorId: "dashboard-operator",
        payload: { attemptNumber: nextAttempt, strategy: "MANUAL_MERCHANT_OVERRIDE" },
        previousStage: workflow.stage,
        newStage: RecoveryStage.RETRYING,
        amountInPaise: workflow.amountAtRiskInPaise,
        outcome: "SUCCESS",
      },
    });

    await prisma.recoveryWorkflow.update({
      where: { id: workflow.id },
      data: {
        stage: RecoveryStage.RETRYING,
        version: { increment: 1 },
      },
    });

    res.json({
      status: "retry_dispatched",
      workflowId: workflow.id,
      attemptNumber: nextAttempt,
    });
  } catch (error) {
    logger.error("[RecoveryRoutes] Error dispatching manual retry:", error);
    res.status(500).json({ error: "Failed to dispatch manual retry" });
  }
});

export { router as recoveryRouter };

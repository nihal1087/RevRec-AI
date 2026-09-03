/**
 * routes/communications.routes.ts — Global Multi-Channel Communications Center API
 *
 * Provides endpoints to list, filter, and inspect automated customer outreach messages
 * across WhatsApp, SMS, Email, and Hinglish Voice channels directly from PostgreSQL.
 */

import { Router, Request, Response } from "express";
import { prisma } from "@revrec/db";
import { DeclineCategory } from "@revrec/types";
import { recordAutomaticFailureOutreach } from "../services/outreach.service";
import { logger } from "../config/logger";

const router = Router();

/**
 * GET /api/communications
 * Returns all multi-channel outreach dispatches and conversion metrics directly from PostgreSQL.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const channelParam = req.query["channel"] as string | undefined;
    const search = req.query["search"] as string | undefined;

    // Build database WHERE clause
    const channelFilter =
      channelParam && channelParam !== "ALL"
        ? { channel: channelParam.toUpperCase() as any }
        : {};

    const searchFilter = search
      ? {
          OR: [
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
            { customer: { email: { contains: search, mode: "insensitive" as const } } },
            { customer: { phone: { contains: search } } },
            { messageTemplate: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const where = {
      ...channelFilter,
      ...searchFilter,
    };

    // Self-healing synchronization: ensure any active workflows lacking a dunningContact
    // have their initial failure communication recorded so they appear in Communications Hub
    try {
      const unsyncedWorkflows = await prisma.recoveryWorkflow.findMany({
        where: {
          dunningContacts: { none: {} },
        },
        take: 15,
        include: {
          customer: true,
          payment: true,
        },
      });

      for (const wf of unsyncedWorkflows) {
        const rawCat = wf.payment?.declineCategory ?? "SOFT";
        const category = (DeclineCategory[rawCat as keyof typeof DeclineCategory] ?? DeclineCategory.SOFT) as DeclineCategory;
        await recordAutomaticFailureOutreach({
          workflowId: wf.id,
          paymentId: wf.paymentId,
          customerId: wf.customerId,
          customerName: wf.customer?.name,
          customerPhone: wf.customer?.phone,
          amountInPaise: wf.amountAtRiskInPaise,
          category,
          errorCode: wf.payment?.gatewayErrorCode ?? undefined,
        });
      }
    } catch (syncErr) {
      logger.warn(`[Communications] Sync check warning: ${(syncErr as Error).message}`);
    }

    // Query directly from PostgreSQL database with filtering applied at the DB layer
    const dbDispatches = await prisma.dunningContact.findMany({
      where,
      take: 100,
      orderBy: { sentAt: "desc" },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true, riskScore: true, riskTier: true },
        },
        workflow: {
          select: { id: true, stage: true, amountAtRiskInPaise: true, recoveryMethod: true },
        },
      },
    });

    const formatted = dbDispatches.map((d) => {
      const status = d.clickedAt ? "CLICKED" : d.openedAt ? "READ" : d.deliveredAt ? "DELIVERED" : "SENT";

      let templateName = d.messageTemplate;
      let messagePayload = d.messageTemplate;

      if (d.messageTemplate.includes(":::")) {
        const parts = d.messageTemplate.split(":::");
        templateName = parts[0] || "recovery_template_v1";
        messagePayload = parts.slice(1).join(":::") || templateName;
      } else if (d.messageTemplate.includes(" ") || d.messageTemplate.length > 40) {
        templateName = d.channel === "WHATSAPP"
          ? "wa_smart_recovery_v2"
          : d.channel === "SMS"
          ? "sms_retry_alert_v1"
          : d.channel === "EMAIL"
          ? "email_dunning_v1"
          : "hinglish_voice_concierge_v1";
        messagePayload = d.messageTemplate;
      } else {
        templateName = d.messageTemplate;
        messagePayload = `Payment recovery outreach dispatched via ${d.channel} (${d.messageTemplate})`;
      }

      return {
        id: d.id,
        channel: d.channel,
        templateName,
        messagePayload,
        status,
        sentAt: d.sentAt.toISOString(),
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        openedAt: d.openedAt?.toISOString() ?? null,
        clickedAt: d.clickedAt?.toISOString() ?? null,
        customerResponse: d.customerResponse,
        customer: d.customer
          ? {
              ...d.customer,
              riskTier: d.customer.riskTier || (d.customer.riskScore > 60 ? "HIGH" : d.customer.riskScore > 30 ? "MEDIUM" : "LOW"),
            }
          : { id: "", externalId: "", name: "Unknown", email: "", phone: "", riskScore: 50, riskTier: "MEDIUM" },
        workflow: d.workflow
          ? {
              id: d.workflow.id,
              stage: d.workflow.stage,
              amountAtRiskInPaise: Number(d.workflow.amountAtRiskInPaise),
            }
          : null,
      };
    });

    // Compute channel counts and metrics in a single O(N) pass for optimal performance
    const counts = { all: formatted.length, whatsapp: 0, sms: 0, email: 0, hinglish_voice: 0 };
    let whatsappReadCount = 0;
    let smsDeliveredCount = 0;
    let emailClickedCount = 0;
    let totalRecoveredViaOutreachPaise = 0;

    for (const c of formatted) {
      if (c.channel === "WHATSAPP") {
        counts.whatsapp += 1;
        if (c.status === "READ" || c.status === "CLICKED") whatsappReadCount += 1;
      } else if (c.channel === "SMS") {
        counts.sms += 1;
        if (c.status === "DELIVERED" || c.status === "READ" || c.status === "CLICKED") smsDeliveredCount += 1;
      } else if (c.channel === "EMAIL") {
        counts.email += 1;
        if (c.status === "CLICKED") emailClickedCount += 1;
      } else if (c.channel === "HINGLISH_VOICE") {
        counts.hinglish_voice += 1;
      }

      if (c.workflow?.stage === "RECOVERED") {
        totalRecoveredViaOutreachPaise += c.workflow.amountAtRiskInPaise ?? 0;
      }
    }

    const whatsappReadRatePercent = counts.whatsapp > 0 ? Math.round((whatsappReadCount / counts.whatsapp) * 1000) / 10 : null;
    const smsDeliveryRatePercent = counts.sms > 0 ? Math.round((smsDeliveredCount / counts.sms) * 1000) / 10 : null;
    const emailClickRatePercent = counts.email > 0 ? Math.round((emailClickedCount / counts.email) * 1000) / 10 : null;

    res.json({
      success: true,
      data: formatted,
      counts,
      metrics: {
        totalDispatches: formatted.length,
        whatsappReadRatePercent,
        smsDeliveryRatePercent,
        emailClickRatePercent,
        totalRecoveredViaOutreachInPaise: totalRecoveredViaOutreachPaise,
      },
    });
  } catch (error) {
    logger.error("[Communications] Error fetching dispatches:", error);
    res.status(500).json({ error: "Failed to fetch communication records" });
  }
});

export { router as communicationsRouter };

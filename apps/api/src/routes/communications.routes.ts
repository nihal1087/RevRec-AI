/**
 * routes/communications.routes.ts — Global Multi-Channel Communications Center API
 *
 * Provides endpoints to list, filter, and inspect automated customer outreach messages
 * across WhatsApp, SMS, Email, and Hinglish Voice channels directly from PostgreSQL.
 */

import { Router, Request, Response } from "express";
import { prisma } from "@revrec/db";
import { logger } from "../config/logger";

const router = Router();

/**
 * GET /api/communications
 * Returns all multi-channel outreach dispatches and conversion metrics directly from PostgreSQL.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const channel = req.query["channel"] as string | undefined;
    const search = (req.query["search"] as string | undefined)?.toLowerCase();

    // Query directly from PostgreSQL database (100% single source of truth)
    const dbDispatches = await prisma.dunningContact.findMany({
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
        // Full text stored directly
        templateName = d.channel === "WHATSAPP"
          ? "wa_smart_recovery_v2"
          : d.channel === "SMS"
          ? "sms_retry_alert_v1"
          : d.channel === "EMAIL"
          ? "email_dunning_v1"
          : "hinglish_voice_concierge_v1";
        messagePayload = d.messageTemplate;
      } else {
        // Short template key stored directly
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

    // Filter by channel and search
    let filtered = formatted;
    if (channel && channel !== "ALL") {
      filtered = filtered.filter((d) => d.channel.toUpperCase() === channel.toUpperCase());
    }
    if (search) {
      filtered = filtered.filter(
        (d) =>
          d.customer?.name?.toLowerCase().includes(search) ||
          d.customer?.email?.toLowerCase().includes(search) ||
          d.customer?.phone?.includes(search) ||
          d.messagePayload.toLowerCase().includes(search) ||
          d.templateName.toLowerCase().includes(search)
      );
    }

    // Compute channel counts (single-pass for performance)
    const counts = {
      all: formatted.length,
      whatsapp: formatted.filter((c) => c.channel === "WHATSAPP").length,
      sms: formatted.filter((c) => c.channel === "SMS").length,
      email: formatted.filter((c) => c.channel === "EMAIL").length,
      hinglish_voice: formatted.filter((c) => c.channel === "HINGLISH_VOICE").length,
    };

    // Compute live channel metrics
    const totalDispatches = formatted.length;
    const whatsappCount = formatted.filter((c) => c.channel === "WHATSAPP").length;
    const whatsappReadCount = formatted.filter((c) => c.channel === "WHATSAPP" && (c.status === "READ" || c.status === "CLICKED")).length;
    const whatsappReadRatePercent = whatsappCount > 0 ? Math.round((whatsappReadCount / whatsappCount) * 1000) / 10 : null;

    const smsCount = formatted.filter((c) => c.channel === "SMS").length;
    const smsDeliveredCount = formatted.filter((c) => c.channel === "SMS" && (c.status === "DELIVERED" || c.status === "READ" || c.status === "CLICKED")).length;
    const smsDeliveryRatePercent = smsCount > 0 ? Math.round((smsDeliveredCount / smsCount) * 1000) / 10 : null;

    const emailCount = formatted.filter((c) => c.channel === "EMAIL").length;
    const emailClickedCount = formatted.filter((c) => c.channel === "EMAIL" && c.status === "CLICKED").length;
    const emailClickRatePercent = emailCount > 0 ? Math.round((emailClickedCount / emailCount) * 1000) / 10 : null;

    const totalRecoveredViaOutreachPaise = formatted
      .filter((c) => c.workflow?.stage === "RECOVERED")
      .reduce((acc, c) => acc + (c.workflow?.amountAtRiskInPaise ?? 0), 0);

    res.json({
      success: true,
      data: filtered,
      counts,
      metrics: {
        totalDispatches,
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

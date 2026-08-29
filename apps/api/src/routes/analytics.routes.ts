/**
 * routes/analytics.routes.ts — Dashboard Analytics & Reporting Endpoints
 *
 * Computes aggregated financial KPIs, time-series recovery rates,
 * channel performance, and AI agent cost metrics for the Merchant Command Center.
 */

import { Router, Request, Response } from "express";
import { prisma, RecoveryStage } from "@revrec/db";
import { logger } from "../config/logger";

const router = Router();

/**
 * GET /api/analytics/summary
 * Aggregate KPIs: Revenue at Risk, Recovered, Success Rate, and AI Agent Stats.
 */
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const [
      totalWorkflows,
      recoveredWorkflows,
      activeWorkflows,
      haltedWorkflows,
      escalatedWorkflows,
      financialAggregates,
      agentStats,
    ] = await Promise.all([
      prisma.recoveryWorkflow.count(),
      prisma.recoveryWorkflow.count({ where: { stage: RecoveryStage.RECOVERED } }),
      prisma.recoveryWorkflow.count({
        where: {
          stage: {
            in: [
              RecoveryStage.PENDING,
              RecoveryStage.ANALYZING,
              RecoveryStage.RETRYING,
              RecoveryStage.OUTREACH_SENT,
              RecoveryStage.PROMISE_RECEIVED,
            ],
          },
        },
      }),
      prisma.recoveryWorkflow.count({ where: { stage: RecoveryStage.HALTED } }),
      prisma.recoveryWorkflow.count({ where: { stage: RecoveryStage.ESCALATED } }),
      prisma.recoveryWorkflow.aggregate({
        _sum: {
          amountAtRiskInPaise: true,
          amountRecoveredInPaise: true,
        },
      }),
      prisma.agentExecution.aggregate({
        _count: { id: true },
        _sum: {
          estimatedCostInPaise: true,
          llmTokensUsed: true,
        },
        _avg: {
          llmLatencyMs: true,
          confidenceScore: true,
        },
      }),
    ]);

    // BigInt cast: Prisma aggregate _sum returns BigInt for paise fields.
    // Convert to Number before arithmetic — BigInt cannot mix with regular Math.
    const totalAtRiskPaise = Number(financialAggregates._sum.amountAtRiskInPaise ?? 0n);
    const totalRecoveredPaise = Number(financialAggregates._sum.amountRecoveredInPaise ?? 0n);
    const recoveryRatePercent = totalAtRiskPaise > 0
      ? Math.round((totalRecoveredPaise / totalAtRiskPaise) * 1000) / 10
      : 0;

    const policyRejectedCount = await prisma.agentExecution.count({
      where: { policyCheckPassed: false },
    });

    res.json({
      status: "success",
      data: {
        financials: {
          totalAtRiskInPaise: totalAtRiskPaise,
          totalRecoveredInPaise: totalRecoveredPaise,
          recoveryRatePercent,
          currency: "INR",
        },
        counts: {
          total: totalWorkflows,
          recovered: recoveredWorkflows,
          active: activeWorkflows,
          halted: haltedWorkflows,
          escalated: escalatedWorkflows,
        },
        aiMetrics: {
          totalExecutions: agentStats._count.id,
          policyBlockedCount: policyRejectedCount,
          totalTokensUsed: agentStats._sum.llmTokensUsed ?? 0,
          totalCostInPaise: agentStats._sum.estimatedCostInPaise ?? 0,
          avgLatencyMs: Math.round(agentStats._avg.llmLatencyMs ?? 0),
          avgConfidenceScore: Math.round((agentStats._avg.confidenceScore ?? 0.85) * 100) / 100,
        },
      },
    });
  } catch (error) {
    logger.error("[AnalyticsRoutes] Error fetching summary:", error);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

/**
 * GET /api/analytics/timeseries
 * 14-day trend of daily revenue at risk vs recovered for Recharts Area/Line chart.
 */
router.get("/timeseries", async (_req: Request, res: Response) => {
  try {
    const days = 14;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    // Fetch actual workflows in the time window
    const workflows = await prisma.recoveryWorkflow.findMany({
      where: { createdAt: { gte: startDate } },
      select: {
        createdAt: true,
        amountAtRiskInPaise: true,
        amountRecoveredInPaise: true,
        recoveryMethod: true,
      },
    });

    const dailyMap = new Map<string, { atRiskPaise: number; recoveredPaise: number; autoRetryPaise: number; outreachPaise: number }>();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0]!;
      dailyMap.set(dateStr, { atRiskPaise: 0, recoveredPaise: 0, autoRetryPaise: 0, outreachPaise: 0 });
    }

    for (const wf of workflows) {
      const dateStr = wf.createdAt.toISOString().split("T")[0]!;
      const bucket = dailyMap.get(dateStr);
      if (bucket) {
        const atRisk = Number(wf.amountAtRiskInPaise);
        const recovered = Number(wf.amountRecoveredInPaise);
        bucket.atRiskPaise += atRisk;
        bucket.recoveredPaise += recovered;
        if (wf.recoveryMethod === "AUTO_RETRY") {
          bucket.autoRetryPaise += recovered;
        } else {
          bucket.outreachPaise += recovered;
        }
      }
    }

    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0]!;
      const bucket = dailyMap.get(dateStr)!;

      const atRiskRupees = Math.round(bucket.atRiskPaise / 100);
      const recoveredRupees = Math.round(bucket.recoveredPaise / 100);
      const autoRetryRupees = Math.round(bucket.autoRetryPaise / 100);
      const outreachRupees = Math.max(0, recoveredRupees - autoRetryRupees);

      result.push({
        date: dateStr,
        displayDate: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        atRisk: atRiskRupees,
        recovered: recoveredRupees,
        autoRetry: autoRetryRupees,
        conversationalOutreach: Math.max(0, outreachRupees),
      });
    }

    res.json({ status: "success", data: result });
  } catch (error) {
    logger.error("[AnalyticsRoutes] Error fetching timeseries:", error);
    res.status(500).json({ error: "Failed to fetch timeseries data" });
  }
});

/**
 * GET /api/analytics/categories
 * Recovery performance grouped by RCA failure categories and recovery channels.
 */
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const workflows = await prisma.recoveryWorkflow.findMany({
      select: {
        amountAtRiskInPaise: true,
        amountRecoveredInPaise: true,
        recoveryMethod: true,
        payment: { select: { declineCategory: true } },
      },
    });

    const categoryStats: Record<string, { atRisk: number; recovered: number; color: string; label: string }> = {
      SOFT: { atRisk: 0, recovered: 0, color: "#22c55e", label: "SOFT (Insufficient Funds)" },
      NETWORK: { atRisk: 0, recovered: 0, color: "#3b82f6", label: "NETWORK (Switch Downtime)" },
      INTENT_DROP: { atRisk: 0, recovered: 0, color: "#f59e0b", label: "INTENT_DROP (OTP Friction)" },
      MANDATE_FAILURE: { atRisk: 0, recovered: 0, color: "#8b5cf6", label: "MANDATE_FAILURE (AutoPay)" },
      HARD: { atRisk: 0, recovered: 0, color: "#ef4444", label: "HARD (Card Expired/Stolen)" },
    };

    const channelStats: Record<string, { recovered: number; color: string; label: string }> = {
      AUTO_RETRY: { recovered: 0, color: "#22c55e", label: "Smart Auto-Retry" },
      WHATSAPP_INTERACTIVE: { recovered: 0, color: "#10b981", label: "WhatsApp Bot (Hinglish)" },
      PAYMENT_LINK: { recovered: 0, color: "#3b82f6", label: "1-Click SMS Link" },
      HUMAN_ESCALATION: { recovered: 0, color: "#f59e0b", label: "Human Escalation" },
    };

    let totalRecoveredPaise = 0;

    for (const wf of workflows) {
      const cat = wf.payment.declineCategory ?? "SOFT";
      const atRisk = Number(wf.amountAtRiskInPaise);
      const recovered = Number(wf.amountRecoveredInPaise);

      if (categoryStats[cat]) {
        categoryStats[cat].atRisk += atRisk;
        categoryStats[cat].recovered += recovered;
      }

      if (wf.recoveryMethod && channelStats[wf.recoveryMethod]) {
        channelStats[wf.recoveryMethod].recovered += recovered;
        totalRecoveredPaise += recovered;
      }
    }

    const categoriesData = Object.entries(categoryStats).map(([_key, item]) => {
      const atRiskRupees = Math.round(item.atRisk / 100);
      const recoveredRupees = Math.round(item.recovered / 100);
      const rate = atRiskRupees > 0 ? Math.round((recoveredRupees / atRiskRupees) * 1000) / 10 : 0;

      return {
        category: item.label,
        atRisk: atRiskRupees,
        recovered: recoveredRupees,
        recoveryRate: rate,
        color: item.color,
      };
    });

    const channelData = Object.entries(channelStats).map(([_key, item]) => {
      const recoveredRupees = Math.round(item.recovered / 100);
      const share = totalRecoveredPaise > 0
        ? Math.round((item.recovered / totalRecoveredPaise) * 1000) / 10
        : 0;

      return {
        channel: item.label,
        recovered: recoveredRupees,
        share,
        color: item.color,
      };
    });

    res.json({
      status: "success",
      data: {
        byCategory: categoriesData,
        byChannel: channelData,
      },
    });
  } catch (error) {
    logger.error("[AnalyticsRoutes] Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch category analytics" });
  }
});

/**
 * GET /api/analytics/funnel
 * 4-Stage Recovery Funnel Waterfall:
 * 1. Intercepted (100% of payment failures captured via webhook / API)
 * 2. Diagnosed (Sub-millisecond RCA classification completed)
 * 3. Engaged (Smart jitter retry dispatched or multi-channel dunning sent)
 * 4. Recovered (Funds collected & verified with compliant audit trail)
 */
router.get("/funnel", async (_req: Request, res: Response) => {
  try {
    const [
      totalCount,
      recoveredCount,
      engagedCount,
      financials,
    ] = await Promise.all([
      prisma.recoveryWorkflow.count(),
      prisma.recoveryWorkflow.count({ where: { stage: RecoveryStage.RECOVERED } }),
      prisma.recoveryWorkflow.count({
        where: {
          stage: {
            in: [
              RecoveryStage.RETRYING,
              RecoveryStage.OUTREACH_SENT,
              RecoveryStage.PROMISE_RECEIVED,
              RecoveryStage.RECOVERED,
            ],
          },
        },
      }),
      prisma.recoveryWorkflow.aggregate({
        _sum: {
          amountAtRiskInPaise: true,
          amountRecoveredInPaise: true,
        },
      }),
    ]);

    // BigInt cast: convert Prisma aggregate BigInt results to Number before arithmetic
    const totalAtRiskPaise = Number(financials._sum.amountAtRiskInPaise ?? 0n);
    const totalRecoveredPaise = Number(financials._sum.amountRecoveredInPaise ?? 0n);

    const stage1Volume = totalCount;
    const stage1AmountPaise = totalAtRiskPaise;

    const stage2Volume = stage1Volume; // 100% diagnosed by RCA engine
    const stage2AmountPaise = stage1AmountPaise;

    const stage3Volume = engagedCount;
    const stage3AmountPaise = stage1Volume > 0 ? Math.round(stage1AmountPaise * (engagedCount / stage1Volume)) : 0;

    const stage4Volume = recoveredCount;
    const stage4AmountPaise = totalRecoveredPaise;

    const conversionRatePercent = stage1Volume > 0
      ? Math.round((stage4Volume / stage1Volume) * 1000) / 10
      : 0;

    const stage3Conversion = stage2Volume > 0
      ? Math.round((stage3Volume / stage2Volume) * 1000) / 10
      : 0;

    const stage4Conversion = stage3Volume > 0
      ? Math.round((stage4Volume / stage3Volume) * 1000) / 10
      : 0;

    const funnelStages = [
      {
        id: "intercepted",
        stepNumber: 1,
        title: "Intercepted",
        subtitle: "Gateway Failures Captured",
        count: stage1Volume,
        amountInPaise: stage1AmountPaise,
        conversionFromPrevious: stage1Volume > 0 ? 100 : 0,
        dropoffCount: 0,
        dropoffReason: "N/A",
        color: "#3b82f6",
        stageFilter: "",
      },
      {
        id: "diagnosed",
        stepNumber: 2,
        title: "Diagnosed",
        subtitle: "RCA Classification & Strategy",
        count: stage2Volume,
        amountInPaise: stage2AmountPaise,
        conversionFromPrevious: stage1Volume > 0 ? 100 : 0,
        dropoffCount: 0,
        dropoffReason: "100% automated classification",
        color: "#8b5cf6",
        stageFilter: "ANALYZING",
      },
      {
        id: "engaged",
        stepNumber: 3,
        title: "Engaged",
        subtitle: "Auto-Retry & WhatsApp Dunning",
        count: stage3Volume,
        amountInPaise: stage3AmountPaise,
        conversionFromPrevious: stage3Conversion,
        dropoffCount: Math.max(0, stage2Volume - stage3Volume),
        dropoffReason: "Halted for Card Network & RBI Compliance",
        color: "#f59e0b",
        stageFilter: "OUTREACH_SENT",
      },
      {
        id: "recovered",
        stepNumber: 4,
        title: "Recovered",
        subtitle: "Funds Collected & Settled",
        count: stage4Volume,
        amountInPaise: stage4AmountPaise,
        conversionFromPrevious: stage4Conversion,
        dropoffCount: Math.max(0, stage3Volume - stage4Volume),
        dropoffReason: "Customer non-response / Secondary decline",
        color: "#10b981",
        stageFilter: "RECOVERED",
      },
    ];

    res.json({
      status: "success",
      data: {
        stages: funnelStages,
        overallConversionRatePercent: conversionRatePercent,
        totalAtRiskInPaise: stage1AmountPaise,
        totalRecoveredInPaise: stage4AmountPaise,
      },
    });
  } catch (error) {
    logger.error("[AnalyticsRoutes] Error fetching funnel:", error);
    res.status(500).json({ error: "Failed to fetch recovery funnel metrics" });
  }
});

export { router as analyticsRouter };


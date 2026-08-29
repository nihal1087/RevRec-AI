/**
 * routes/agent.routes.ts — Autonomous Agent & Hinglish Bot Endpoints
 *
 * Exposes endpoints for executing agent decisions, multi-turn conversational chat,
 * and inspecting AI audit traces & cost metrics.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { DunningChannel } from "@revrec/types";
import { runAgentDecision } from "../services/agent/agent.service";
import { processCustomerMessage } from "../services/agent/hinglishBot.service";
import { prisma } from "@revrec/db";
import { logger } from "../config/logger";

const router = Router();

const ChatRequestSchema = z.object({
  customerId: z.string().min(1),
  workflowId: z.string().optional(),
  userMessage: z.string().min(1),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "HINGLISH_VOICE"]).optional(),
});

/**
 * POST /api/agent/decide/:workflowId
 * Triggers the full autonomous bounded agent evaluation loop on a workflow.
 */
router.post("/decide/:workflowId", async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;
    if (!workflowId) {
      res.status(400).json({ error: "workflowId parameter is required" });
      return;
    }

    const result = await runAgentDecision(workflowId);

    res.json({
      status: "success",
      workflowId: result.workflowId,
      agentExecutionId: result.agentExecutionId,
      decision: result.decision,
      policyPassed: result.policyPassed,
      policyDetails: result.policyDetails,
      toolResult: result.toolResult,
    });
  } catch (error) {
    const msg = (error as Error).message ?? "";
    // M9 fix: return 404 when the workflow simply doesn't exist instead of 500
    if (msg.includes("not found") || msg.includes("No Recovery")) {
      res.status(404).json({ error: "Workflow not found", detail: msg });
    } else {
      logger.error("[AgentRoutes] Error in agent decide endpoint:", error);
      res.status(500).json({ error: msg });
    }
  }
});

/**
 * POST /api/agent/bot/chat
 * Multi-turn conversational endpoint for customer WhatsApp / SMS responses in Hinglish.
 */
router.post("/bot/chat", async (req: Request, res: Response) => {
  try {
    const parseResult = ChatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(422).json({
        error: "Invalid chat payload",
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { customerId, userMessage, workflowId, channel } = parseResult.data;
    const chatResponse = await processCustomerMessage({
      customerId,
      userMessage,
      ...(workflowId ? { workflowId } : {}),
      ...(channel ? { channel: channel as unknown as DunningChannel } : {}),
    });

    res.json({
      status: "success",
      ...chatResponse,
    });
  } catch (error) {
    logger.error("[AgentRoutes] Error in bot chat endpoint:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/agent/executions/:workflowId
 * Fetches all AI agent execution records, reasoning chains, and token/cost analytics.
 */
router.get("/executions/:workflowId", async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;

    const executions = await prisma.agentExecution.findMany({
      where: { workflowId },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      workflowId,
      count: executions.length,
      data: executions,
    });
  } catch (error) {
    logger.error("[AgentRoutes] Error fetching agent executions:", error);
    res.status(500).json({ error: "Failed to fetch agent execution traces" });
  }
});

export { router as agentRouter };

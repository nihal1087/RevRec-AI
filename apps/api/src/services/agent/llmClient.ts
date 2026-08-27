/**
 * services/agent/llmClient.ts — Google Gemini LLM Client with Structured JSON Outputs
 *
 * Interacts with Google Gemini (gemini-2.5-flash / gemini-1.5-flash) models.
 * Enforces structured schema outputs, tracks token metrics, latency, and estimated cost.
 * Includes a deterministic offline fallback for CI/CD and mock environments.
 */

import { GoogleGenAI } from "@google/genai";
import { AgentToolName } from "@revrec/types";
import { logger } from "../../config/logger";

export interface LlmGenerationResult {
  readonly content: string;
  readonly structuredJson: Record<string, unknown>;
  readonly latencyMs: number;
  readonly tokensUsed: number;
  readonly estimatedCostInPaise: number;
  readonly modelUsed: string;
}

// Cost calculation constants: ~ $0.15 per 1M input tokens, ~ $0.60 per 1M output tokens (Gemini Flash)
// In INR paise (~ 85 INR/USD): ~ 0.003 paise per token average
const ESTIMATED_PAISE_PER_TOKEN = 0.003;

let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (
    !apiKey ||
    apiKey === "change_me_to_your_gemini_api_key" ||
    process.env["NODE_ENV"] === "test"
  ) {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

/**
 * Calls Gemini with strict JSON output enforcement and system instructions.
 */
export async function callGeminiStructured(
  prompt: string,
  systemInstruction: string,
  responseSchema?: Record<string, unknown>
): Promise<LlmGenerationResult> {
  const startTime = Date.now();
  const ai = getGenAI();
  const modelName = process.env["GEMINI_MODEL"] ?? "gemini-1.5-flash";

  if (!ai) {
    logger.info("[LLMClient] No live GEMINI_API_KEY configured — using deterministic rule-based AI engine fallback");
    return generateDeterministicFallback(prompt, startTime);
  }

  try {
    const config: Record<string, unknown> = {
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.2, // Low temperature for high consistency and policy adherence
    };

    if (responseSchema) {
      config["responseSchema"] = responseSchema;
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config,
    });

    const latencyMs = Date.now() - startTime;
    const rawText = response.text || "{}";
    let structuredJson: Record<string, unknown>;

    try {
      structuredJson = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      // Handle potential markdown backticks in raw response
      const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
      structuredJson = JSON.parse(cleaned) as Record<string, unknown>;
    }

    const totalTokens = (response.usageMetadata?.totalTokenCount) ?? Math.round((prompt.length + rawText.length) / 4);
    const estimatedCostInPaise = Math.max(1, Math.round(totalTokens * ESTIMATED_PAISE_PER_TOKEN));

    return {
      content: rawText,
      structuredJson,
      latencyMs,
      tokensUsed: totalTokens,
      estimatedCostInPaise,
      modelUsed: modelName,
    };
  } catch (error) {
    logger.warn(`[LLMClient] Gemini API call failed (${(error as Error).message}) — falling back to deterministic agent reasoning`);
    return generateDeterministicFallback(prompt, startTime);
  }
}

/**
 * Deterministic fallback engine when offline or if Gemini API is unreachable.
 * Ensures the platform remains 100% operational in isolated test environments.
 */
function generateDeterministicFallback(prompt: string, startTime: number): LlmGenerationResult {
  const promptLower = prompt.toLowerCase();
  const latencyMs = Date.now() - startTime + 45;

  let fallbackDecision: Record<string, unknown>;

  if (promptLower.includes("intent_drop") || promptLower.includes("otp") || promptLower.includes("drop-off")) {
    fallbackDecision = {
      reasoning: "Customer drop-off during checkout. Sending 1-click WhatsApp recovery link.",
      confidenceScore: 0.92,
      selectedTool: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK,
      toolInput: {
        tool: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK,
        messageTemplateKey: "intent_drop_recovery_v1",
        includeDiscount: false,
      },
    };
  } else if (promptLower.includes("stolen") || promptLower.includes("expired") || promptLower.includes("hard")) {
    fallbackDecision = {
      reasoning: "Payment instrument is permanently invalid (Hard Decline). Halting automated dunning.",
      confidenceScore: 0.98,
      selectedTool: AgentToolName.HALT_DUNNING,
      toolInput: {
        tool: AgentToolName.HALT_DUNNING,
        reason: "Hard decline detected — payment instrument permanently unusable.",
        writeOff: false,
      },
    };
  } else if (promptLower.includes("high ltv") || promptLower.includes("enterprise") || promptLower.includes("risk")) {
    fallbackDecision = {
      reasoning: "High-value enterprise customer payment failure. Escalating to human relationship manager.",
      confidenceScore: 0.95,
      selectedTool: AgentToolName.ESCALATE_TO_HUMAN,
      toolInput: {
        tool: AgentToolName.ESCALATE_TO_HUMAN,
        priority: "HIGH",
        escalationReason: "High LTV account payment failure requiring dedicated touchpoint.",
        suggestedAction: "Direct account manager call with customized invoice schedule.",
      },
    };
  } else {
    fallbackDecision = {
      reasoning: "Soft balance decline detected. Scheduling retry after optimal liquidity delay.",
      confidenceScore: 0.88,
      selectedTool: AgentToolName.RETRY_PAYMENT,
      toolInput: {
        tool: AgentToolName.RETRY_PAYMENT,
        delayMinutes: 2880, // 48 hours
        reason: "Liquidity gap retry scheduled after salary alignment calculation.",
      },
    };
  }

  return {
    content: JSON.stringify(fallbackDecision),
    structuredJson: fallbackDecision,
    latencyMs,
    tokensUsed: 320,
    estimatedCostInPaise: 1,
    modelUsed: "deterministic-heuristic-v1",
  };
}

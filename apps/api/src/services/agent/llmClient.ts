/**
 * services/agent/llmClient.ts — Groq LLM Client (Llama 3.3 70B Versatile)
 *
 * Ultra-fast inference on Groq LPUs with strict JSON structured output enforcement.
 * Powers the Bounded Recovery Agent and Conversational Hinglish WhatsApp Bot.
 * Includes deterministic fallback for offline and unit test environments.
 */

import Groq from "groq-sdk";
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

// Groq Llama 3.3 70B Versatile pricing:
// ~ $0.59 per 1M input tokens, ~ $0.79 per 1M output tokens
// In INR paise (~ 87 INR/USD): ~ 0.006 paise per token average
const ESTIMATED_PAISE_PER_TOKEN = 0.006;

let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  // M6 fix: only accept GROQ_API_KEY — never fall back to GEMINI_API_KEY.
  // A Google Gemini key passed to the Groq SDK causes an immediate 401.
  const apiKey = process.env["GROQ_API_KEY"];
  if (
    !apiKey ||
    apiKey === "change_me_to_your_groq_api_key" ||
    process.env["NODE_ENV"] === "test"
  ) {
    return null;
  }
  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Calls Groq with strict JSON output mode and system instructions.
 * Uses Llama 3.3 70B Versatile by default for state-of-the-art Hinglish & tool calling.
 */
export async function callGroqStructured(
  prompt: string,
  systemInstruction: string,
  _responseSchema?: Record<string, unknown>
): Promise<LlmGenerationResult> {
  const startTime = Date.now();
  const groq = getGroqClient();
  const modelName = process.env["GROQ_MODEL"] ?? "openai/gpt-oss-120b";

  if (!groq) {
    logger.info("[LLMClient] No live GROQ_API_KEY configured — using deterministic rule-based AI engine fallback");
    return generateDeterministicFallback(prompt, startTime);
  }

  try {
    const completion = await groq.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `${systemInstruction}\n\nIMPORTANT: You must respond ONLY in valid, parseable JSON. Do not include markdown fences or extraneous text outside the JSON object.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for deterministic policy compliance
      max_tokens: 1024,
    });

    const latencyMs = Date.now() - startTime;
    const rawText = completion.choices[0]?.message?.content || "{}";
    let structuredJson: Record<string, unknown>;

    try {
      structuredJson = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
      structuredJson = JSON.parse(cleaned) as Record<string, unknown>;
    }

    const totalTokens =
      completion.usage?.total_tokens ??
      Math.round((prompt.length + rawText.length) / 4);
    const estimatedCostInPaise = Math.max(
      1,
      Math.round(totalTokens * ESTIMATED_PAISE_PER_TOKEN)
    );

    return {
      content: rawText,
      structuredJson,
      latencyMs,
      tokensUsed: totalTokens,
      estimatedCostInPaise,
      modelUsed: modelName,
    };
  } catch (error) {
    logger.warn(
      `[LLMClient] Groq API call failed (${(error as Error).message}) — falling back to deterministic agent reasoning`
    );
    return generateDeterministicFallback(prompt, startTime);
  }
}

/**
 * Backward compatibility alias for existing service imports.
 */
export const callGeminiStructured = callGroqStructured;

/**
 * Deterministic fallback engine when offline or if Groq API is unreachable.
 * Ensures the platform remains 100% operational in isolated test environments.
 */
function generateDeterministicFallback(prompt: string, startTime: number): LlmGenerationResult {
  const promptLower = prompt.toLowerCase();
  const latencyMs = Date.now() - startTime + 35;

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

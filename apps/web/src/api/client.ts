/**
 * api/client.ts — Frontend API Client for RevRec Backend
 */

export interface AnalyticsSummary {
  financials: {
    totalAtRiskInPaise: number;
    totalRecoveredInPaise: number;
    recoveryRatePercent: number;
    currency: string;
  };
  counts: {
    total: number;
    recovered: number;
    active: number;
    halted: number;
    escalated: number;
  };
  aiMetrics: {
    totalExecutions: number;
    policyBlockedCount: number;
    totalTokensUsed: number;
    totalCostInPaise: number;
    avgLatencyMs: number;
    avgConfidenceScore: number;
  };
}

export interface TimeseriesPoint {
  date: string;
  displayDate: string;
  atRisk: number;
  recovered: number;
  autoRetry: number;
  conversationalOutreach: number;
}

export interface CategoryAnalytics {
  byCategory: Array<{
    category: string;
    atRisk: number;
    recovered: number;
    recoveryRate: number;
    color: string;
  }>;
  byChannel: Array<{
    channel: string;
    recovered: number;
    share: number;
    color: string;
  }>;
}

export interface WorkflowItem {
  id: string;
  paymentId: string;
  customerId: string;
  amountAtRiskInPaise: number;
  amountRecoveredInPaise: number;
  stage: string;
  retryCount: number;
  outreachCount: number;
  nextActionAt?: string | null;
  haltReason?: string | null;
  escalationReason?: string | null;
  createdAt: string;
  customer: {
    id: string;
    externalId: string;
    name: string;
    email: string;
    phone: string;
    riskScore: number;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | string;
    paymentHistoryScore?: number;
  };
  payment: {
    id: string;
    externalId: string;
    status: string;
    gatewayErrorCode: string | null;
    declineCategory: string | null;
  };
  auditEntries?: Array<{
    id: string;
    eventType: string;
    actorType: string;
    actorId: string;
    outcome: string;
    amountInPaise?: number | null;
    createdAt: string;
    payload?: Record<string, unknown>;
  }>;
  dunningContacts?: Array<{
    id: string;
    channel: string;
    templateName: string;
    messagePayload: string;
    status: string;
    sentAt: string;
    deliveredAt?: string | null;
  }>;
  promiseToPays?: Array<{
    id: string;
    promisedAmountInPaise: number;
    promisedByDate: string;
    promisedAt?: string;
    status: string;
    confidenceScore: number;
    createdAt: string;
  }>;
  agentExecutions?: Array<{
    id: string;
    reasoning: string;
    selectedTool: string;
    confidenceScore: number;
    policyCheckPassed: boolean;
    policyCheckDetails: string;
    llmLatencyMs: number;
    estimatedCostInPaise: number;
    createdAt: string;
  }>;
}

const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/+$/, "") : "";

// API key for dashboard endpoints — set VITE_API_KEY in .env to match DASHBOARD_API_KEY on the backend.
// When not set, requests go through unauthenticated (dev/demo mode where backend bypasses auth).
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

/** Returns default headers for all API requests, including auth if configured. */
function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    ...extra,
  };
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_BASE}/api/analytics/summary`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch summary analytics");
  const json = await res.json();
  return json.data;
}

export async function fetchTimeseries(): Promise<TimeseriesPoint[]> {
  const res = await fetch(`${API_BASE}/api/analytics/timeseries`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch timeseries");
  const json = await res.json();
  return json.data;
}

export async function fetchCategoryAnalytics(): Promise<CategoryAnalytics> {
  const res = await fetch(`${API_BASE}/api/analytics/categories`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch category analytics");
  const json = await res.json();
  return json.data;
}

export async function fetchWorkflows(stage?: string): Promise<WorkflowItem[]> {
  const url = stage ? `${API_BASE}/api/recovery?stage=${stage}&limit=500` : `${API_BASE}/api/recovery?limit=500`;
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch workflows");
  const json = await res.json();
  return json.data;
}

export async function fetchWorkflowDetails(id: string): Promise<WorkflowItem> {
  const res = await fetch(`${API_BASE}/api/recovery/${id}`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch workflow details");
  const json = await res.json();
  return json.data;
}

export async function triggerManualRetry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recovery/${id}/retry-now`, { method: "POST", headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to trigger retry");
}

export interface AgentDecisionResponse {
  status: string;
  workflowId: string;
  agentExecutionId: string;
  decision: {
    reasoning: string;
    confidenceScore: number;
    selectedTool: string;
    toolInput: Record<string, unknown>;
  };
  policyPassed: boolean;
  policyDetails?: string;
  toolResult?: {
    success: boolean;
    toolExecuted: string;
    details: Record<string, unknown>;
  };
}

export async function triggerAgentDecision(id: string): Promise<AgentDecisionResponse> {
  const res = await fetch(`${API_BASE}/api/agent/decide/${id}`, { method: "POST", headers: apiHeaders() });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || "Failed to run agent decision");
  }
  return res.json();
}

export async function sendChatMessage(
  customerId?: string,
  userMessage: string = "",
  workflowId?: string
): Promise<{
  replyText: string;
  intent: string;
  sentiment: string;
  actionTaken: string;
  workflowId?: string;
  customerId?: string;
  customerName?: string;
  paymentUrl?: string;
  promiseToPayId?: string;
}> {
  const res = await fetch(`${API_BASE}/api/agent/bot/chat`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      ...(customerId ? { customerId } : {}),
      userMessage,
      channel: "WHATSAPP",
      ...(workflowId ? { workflowId } : {}),
    }),
  });
  if (!res.ok) throw new Error("Chat request failed");
  // NOTE: bot/chat responds with { status, replyText, intent, ... } spread at top-level
  // (not wrapped in { data: ... } like other endpoints) — intentional design difference
  return res.json();
}

export interface BenchmarkReport {
  summary: {
    totalTransactionsAnalyzed: number;
    recoveredTransactions: number;
    totalRevenueAtRiskInPaise: number;
    totalRevenueRecoveredInPaise: number;
  };
  comparison: {
    naiveBaseline: {
      strategyName: string;
      recoveryRatePercent: number;
      revenueRecoveredInPaise: number;
      complianceViolationsReported: number;
      downtimeCollisions: number;
    };
    revRecEngine: {
      strategyName: string;
      recoveryRatePercent: number;
      revenueRecoveredInPaise: number;
      complianceViolationsReported: number;
      downtimeCollisions: number;
    };
    businessImpact: {
      recoveryRateLiftPercent: number;
      netAdditionalRevenueInPaise: number;
      roiMultiple: string;
    };
  };
}

export async function triggerBatchSimulation(count: number = 25): Promise<{
  batchSize: number;
  totalAtRiskInPaise: number;
  totalRecoveredInPaise: number;
  recoveryRatePercent: number;
  liftPercent: number;
}> {
  const res = await fetch(`${API_BASE}/api/simulate/batch`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    let detail = "Batch simulation failed";
    try {
      const errJson = await res.json();
      if (errJson?.error) detail = errJson.error;
    } catch { /* ignore parse errors */ }
    throw new Error(detail);
  }
  const json = await res.json();
  return json.data;
}

export async function fetchBenchmarkReport(): Promise<BenchmarkReport> {
  const res = await fetch(`${API_BASE}/api/simulate/benchmark`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch benchmark report");
  const json = await res.json();
  return json.data;
}

export async function resetDemoData(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/simulate/reset`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ confirm: true }),
  });
  if (!res.ok) throw new Error("Reset demo data failed");
}

export interface CommunicationItem {
  id: string;
  channel: string;
  templateName: string;
  messagePayload: string;
  status: "SENT" | "DELIVERED" | "READ" | "CLICKED" | "FAILED";
  sentAt: string;
  deliveredAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  customerResponse?: string | null;
  customer: {
    id: string;
    externalId?: string;
    name: string;
    email: string;
    phone: string;
    riskScore: number;
    riskTier?: string;
  };
  workflow?: {
    id: string;
    stage: string;
    amountAtRiskInPaise: number;
  };
}

export interface CommunicationsResponse {
  success: boolean;
  data: CommunicationItem[];
  counts?: {
    all: number;
    whatsapp: number;
    sms: number;
    email: number;
    hinglish_voice: number;
  };
  metrics: {
    totalDispatches: number;
    whatsappReadRatePercent: number | null;
    smsDeliveryRatePercent: number | null;
    emailClickRatePercent: number | null;
    totalRecoveredViaOutreachInPaise: number;
  };
}

export async function fetchCommunications(channel?: string, search?: string): Promise<CommunicationsResponse> {
  const params = new URLSearchParams();
  if (channel && channel !== "ALL") params.append("channel", channel);
  if (search) params.append("search", search);
  const res = await fetch(`${API_BASE}/api/communications?${params.toString()}`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch communications");
  return res.json();
}

export interface FunnelStageItem {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  count: number;
  amountInPaise: number;
  conversionFromPrevious: number;
  dropoffCount: number;
  dropoffReason: string;
  color: string;
  stageFilter: string;
}

export interface RecoveryFunnelData {
  stages: FunnelStageItem[];
  overallConversionRatePercent: number;
  totalAtRiskInPaise: number;
  totalRecoveredInPaise: number;
}

export async function fetchRecoveryFunnel(): Promise<RecoveryFunnelData> {
  const res = await fetch(`${API_BASE}/api/analytics/funnel`, { headers: apiHeaders() });
  if (!res.ok) throw new Error("Failed to fetch recovery funnel");
  const json = await res.json();
  return json.data;
}



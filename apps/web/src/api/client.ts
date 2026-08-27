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

const API_BASE = ""; // Uses Vite proxy configured in vite.config.ts

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_BASE}/api/analytics/summary`);
  if (!res.ok) throw new Error("Failed to fetch summary analytics");
  const json = await res.json();
  return json.data;
}

export async function fetchTimeseries(): Promise<TimeseriesPoint[]> {
  const res = await fetch(`${API_BASE}/api/analytics/timeseries`);
  if (!res.ok) throw new Error("Failed to fetch timeseries");
  const json = await res.json();
  return json.data;
}

export async function fetchCategoryAnalytics(): Promise<CategoryAnalytics> {
  const res = await fetch(`${API_BASE}/api/analytics/categories`);
  if (!res.ok) throw new Error("Failed to fetch category analytics");
  const json = await res.json();
  return json.data;
}

export async function fetchWorkflows(stage?: string): Promise<WorkflowItem[]> {
  const url = stage ? `${API_BASE}/api/recovery?stage=${stage}&limit=50` : `${API_BASE}/api/recovery?limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch workflows");
  const json = await res.json();
  return json.data;
}

export async function fetchWorkflowDetails(id: string): Promise<WorkflowItem> {
  const res = await fetch(`${API_BASE}/api/recovery/${id}`);
  if (!res.ok) throw new Error("Failed to fetch workflow details");
  const json = await res.json();
  return json.data;
}

export async function triggerManualRetry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recovery/${id}/retry-now`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger retry");
}

export async function triggerAgentDecision(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agent/decide/${id}`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to run agent decision");
}

export async function sendChatMessage(
  customerId: string,
  userMessage: string,
  workflowId?: string
): Promise<{
  replyText: string;
  intent: string;
  sentiment: string;
  actionTaken: string;
  paymentUrl?: string;
  promiseToPayId?: string;
}> {
  const res = await fetch(`${API_BASE}/api/agent/bot/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId,
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) throw new Error("Batch simulation failed");
  const json = await res.json();
  return json.data;
}

export async function fetchBenchmarkReport(): Promise<BenchmarkReport> {
  const res = await fetch(`${API_BASE}/api/simulate/benchmark`);
  if (!res.ok) throw new Error("Failed to fetch benchmark report");
  const json = await res.json();
  return json.data;
}

export async function resetDemoData(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/simulate/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Reset demo data failed");
}

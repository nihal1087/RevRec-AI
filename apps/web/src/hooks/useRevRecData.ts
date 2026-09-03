import { useState, useEffect, useCallback } from "react";
import {
  AnalyticsSummary,
  TimeseriesPoint,
  CategoryAnalytics,
  WorkflowItem,
  RecoveryFunnelData,
  fetchAnalyticsSummary,
  fetchTimeseries,
  fetchCategoryAnalytics,
  fetchWorkflows,
  fetchWorkflowDetails,
  fetchRecoveryFunnel,
} from "../api/client";

const INITIAL_SUMMARY: AnalyticsSummary = {
  financials: {
    totalAtRiskInPaise: 0,
    totalRecoveredInPaise: 0,
    recoveryRatePercent: 0,
    currency: "INR",
  },
  counts: {
    total: 0,
    recovered: 0,
    active: 0,
    halted: 0,
    escalated: 0,
  },
  aiMetrics: {
    totalExecutions: 0,
    policyBlockedCount: 0,
    totalTokensUsed: 0,
    totalCostInPaise: 0,
    avgLatencyMs: 0,
    avgConfidenceScore: 0,
  },
};

export function useRevRecData(selectedStage: string | null) {
  const [summary, setSummary] = useState<AnalyticsSummary>(INITIAL_SUMMARY);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [categoryAnalytics, setCategoryAnalytics] = useState<CategoryAnalytics | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [funnelData, setFunnelData] = useState<RecoveryFunnelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const refresh = useCallback(async (stage?: string | null) => {
    const stageFilter = stage !== undefined ? stage : selectedStage;
    const results = await Promise.allSettled([
      fetchAnalyticsSummary(),
      fetchTimeseries(),
      fetchCategoryAnalytics(),
      fetchWorkflows(stageFilter ?? undefined),
      fetchRecoveryFunnel(),
    ]);

    const allFailed = results.every((r) => r.status === "rejected");
    setHasError(allFailed);
    setIsLoading(false);

    if (results[0].status === "fulfilled") setSummary(results[0].value);
    if (results[1].status === "fulfilled") setTimeseries(results[1].value);
    if (results[2].status === "fulfilled") setCategoryAnalytics(results[2].value);
    if (results[3].status === "fulfilled") setWorkflows(results[3].value);
    if (results[4].status === "fulfilled") setFunnelData(results[4].value);
  }, [selectedStage]);

  const openWorkflow = useCallback(async (id: string) => {
    try {
      const detail = await fetchWorkflowDetails(id);
      setSelectedWorkflow(detail);
      setIsDrawerOpen(true);
    } catch {
      const found = workflows.find((w) => w.id === id) ?? null;
      setSelectedWorkflow(found);
      setIsDrawerOpen(true);
    }
  }, [workflows]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedWorkflow(null);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    summary, timeseries, categoryAnalytics, workflows, funnelData,
    isLoading, hasError,
    selectedWorkflow, isDrawerOpen,
    openWorkflow, closeDrawer,
    refresh,
  };
}

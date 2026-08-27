import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { MetricCard } from "./components/MetricCard";
import { RecoveryCharts } from "./components/RecoveryCharts";
import { WorkflowTable } from "./components/WorkflowTable";
import { WorkflowDrawer } from "./components/WorkflowDrawer";
import { HinglishBotSimulator } from "./components/HinglishBotSimulator";
import {
  AnalyticsSummary,
  TimeseriesPoint,
  CategoryAnalytics,
  WorkflowItem,
  fetchAnalyticsSummary,
  fetchTimeseries,
  fetchCategoryAnalytics,
  fetchWorkflows,
  fetchWorkflowDetails,
} from "./api/client";
import {
  DollarSign,
  Activity,
  Bot,
  ShieldAlert,
} from "lucide-react";

// Synthetic initial defaults so dashboard looks rich even before database has 500 events
const DEFAULT_SUMMARY: AnalyticsSummary = {
  financials: {
    totalAtRiskInPaise: 38450000, // ₹3,84,500
    totalRecoveredInPaise: 26146000, // ₹2,61,460
    recoveryRatePercent: 68.0,
    currency: "INR",
  },
  counts: {
    total: 142,
    recovered: 96,
    active: 32,
    halted: 9,
    escalated: 5,
  },
  aiMetrics: {
    totalExecutions: 84,
    policyBlockedCount: 6,
    totalTokensUsed: 28400,
    totalCostInPaise: 85, // ₹0.85
    avgLatencyMs: 240,
    avgConfidenceScore: 0.94,
  },
};

export function App(): React.JSX.Element {
  const [summary, setSummary] = useState<AnalyticsSummary>(DEFAULT_SUMMARY);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [categories, setCategories] = useState<CategoryAnalytics | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem | null>(null);
  const [isBotOpen, setIsBotOpen] = useState(false);
  const [botCustomerId, setBotCustomerId] = useState("cust_demo_101");
  const [botWorkflowId, setBotWorkflowId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sum, time, cat, wf] = await Promise.allSettled([
        fetchAnalyticsSummary(),
        fetchTimeseries(),
        fetchCategoryAnalytics(),
        fetchWorkflows(selectedStage),
      ]);

      if (sum.status === "fulfilled") setSummary(sum.value);
      if (time.status === "fulfilled") setTimeseries(time.value);
      if (cat.status === "fulfilled") setCategories(cat.value);
      if (wf.status === "fulfilled") setWorkflows(wf.value);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStage]);

  useEffect(() => {
    loadData();
    // 15-second polling for real-time merchant monitoring
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleInspectWorkflow = async (workflow: WorkflowItem) => {
    try {
      const fullDetails = await fetchWorkflowDetails(workflow.id);
      setSelectedWorkflow(fullDetails);
    } catch {
      setSelectedWorkflow(workflow);
    }
  };

  const handleOpenBot = (customerId: string = "cust_demo_101", workflowId?: string) => {
    setBotCustomerId(customerId);
    setBotWorkflowId(workflowId);
    setIsBotOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans">
      {/* ── 1. Top Header ─────────────────────────────────────────────────── */}
      <Header
        onRefresh={loadData}
        isLoading={isLoading}
        onOpenBot={() => handleOpenBot()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* ── 2. Top KPI Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricCard
            title="Total Revenue At Risk"
            value={`₹${(summary.financials.totalAtRiskInPaise / 100).toLocaleString("en-IN")}`}
            subtitle={`${summary.counts.total} failed payment transactions`}
            icon={ShieldAlert}
            variant="danger"
          />

          <MetricCard
            title="Recovered Revenue"
            value={`₹${(summary.financials.totalRecoveredInPaise / 100).toLocaleString("en-IN")}`}
            subtitle={`${summary.counts.recovered} successful recoveries`}
            icon={DollarSign}
            variant="emerald"
            trend="+68.0% Recov"
          />

          <MetricCard
            title="Active Recovery In-Flight"
            value={summary.counts.active}
            subtitle={`${summary.counts.halted} halted • ${summary.counts.escalated} escalated`}
            icon={Activity}
            variant="blue"
          />

          <MetricCard
            title="AI Agent Cost Efficiency"
            value={`₹${(summary.aiMetrics.totalCostInPaise / 100).toFixed(2)}`}
            subtitle={`${summary.aiMetrics.totalExecutions} decisions • ${summary.aiMetrics.policyBlockedCount} blocked`}
            icon={Bot}
            variant="purple"
            trend={`${summary.aiMetrics.avgLatencyMs}ms avg`}
          />
        </div>

        {/* ── 3. Visual Charts (Recharts) ─────────────────────────────────── */}
        <RecoveryCharts timeseries={timeseries} categories={categories} />

        {/* ── 4. Workflows Table ───────────────────────────────────────────── */}
        <WorkflowTable
          workflows={workflows}
          selectedStage={selectedStage}
          onSelectStage={setSelectedStage}
          onInspectWorkflow={handleInspectWorkflow}
        />
      </main>

      {/* ── 5. Slide-Over Workflow Inspector Drawer ───────────────────────── */}
      <WorkflowDrawer
        workflow={selectedWorkflow}
        onClose={() => setSelectedWorkflow(null)}
        onRefresh={loadData}
        onOpenBotForCustomer={handleOpenBot}
      />

      {/* ── 6. Hinglish Bot WhatsApp Simulator Modal ──────────────────────── */}
      <HinglishBotSimulator
        isOpen={isBotOpen}
        onClose={() => setIsBotOpen(false)}
        initialCustomerId={botCustomerId}
        {...(botWorkflowId ? { initialWorkflowId: botWorkflowId } : {})}
      />

      {/* ── 7. Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-900 py-6 text-center text-xs text-gray-500 font-mono">
        RevRec Autonomous Revenue Recovery Engine • Razorpay AI Track Project • Built with Node.js, Prisma, BullMQ, Redis, React 18, Tailwind CSS, Recharts
      </footer>
    </div>
  );
}

export default App;

import React, { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import MetricCard from "./components/MetricCard";
import { SimulationControls } from "./components/SimulationControls";
import { RecoveryCharts } from "./components/RecoveryCharts";
import { WorkflowTable } from "./components/WorkflowTable";
import { WorkflowDrawer } from "./components/WorkflowDrawer";
import { HinglishBotSimulator } from "./components/HinglishBotSimulator";
import { DemoStore } from "./components/DemoStore";
import { CaseDetailPage } from "./components/CaseDetailPage";
import { CommunicationsHub } from "./components/CommunicationsHub";
import { RecoveryFunnel } from "./components/RecoveryFunnel";
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
} from "./api/client";
import { DollarSign, Activity, ShieldAlert } from "lucide-react";

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

function parseRouteFromUrl(): { tab: string; caseId?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("case/")) {
    const caseId = hash.replace("case/", "").trim();
    if (caseId) return { tab: "case-detail", caseId };
  }
  if (hash.startsWith("case-detail")) {
    const query = hash.split("?")[1] || "";
    const params = new URLSearchParams(query);
    const caseId = params.get("id");
    if (caseId) return { tab: "case-detail", caseId };
  }
  if (["communications", "demo", "workflows", "simulation", "overview"].includes(hash)) {
    return { tab: hash };
  }

  // Fallback to localStorage if no hash in URL
  const savedTab = localStorage.getItem("revrec_active_nav_tab");
  const savedCaseId = localStorage.getItem("revrec_case_id");
  if (savedTab === "case-detail" && savedCaseId) {
    return { tab: "case-detail", caseId: savedCaseId };
  }
  if (savedTab && ["communications", "demo", "workflows", "simulation", "overview"].includes(savedTab)) {
    return { tab: savedTab };
  }

  return { tab: "overview" };
}

export function App(): React.JSX.Element {
  const initialRoute = parseRouteFromUrl();
  const [summary, setSummary] = useState<AnalyticsSummary>(INITIAL_SUMMARY);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [categories, setCategories] = useState<CategoryAnalytics | null>(null);
  const [funnelData, setFunnelData] = useState<RecoveryFunnelData | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [drawerWorkflow, setDrawerWorkflow] = useState<WorkflowItem | null>(null);
  const [caseDetailWorkflow, setCaseDetailWorkflow] = useState<WorkflowItem | null>(null);
  const [isBotOpen, setIsBotOpen] = useState(false);
  const [isBotMinimized, setIsBotMinimized] = useState(false);
  const [botCustomerId, setBotCustomerId] = useState("cust_demo_101");
  const [botWorkflowId, setBotWorkflowId] = useState<string | undefined>(undefined);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // M16: isLoading = manual refresh (shows full spinner in header button)
  //      isPolling = silent background interval (tiny dot, no spinner)
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  // M15: track top-level API failure so the UI degrades gracefully
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<string>(initialRoute.tab);
  const [activeKpiTile, setActiveKpiTile] = useState<"at_risk" | "recovered" | "in_flight" | null>(null);

  // M16: accepts a `silent` flag — background polls don't trigger the full loading spinner
  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setIsPolling(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);
    try {
      const [sum, time, cat, wf, fun] = await Promise.allSettled([
        fetchAnalyticsSummary(),
        fetchTimeseries(),
        fetchCategoryAnalytics(),
        fetchWorkflows(selectedStage),
        fetchRecoveryFunnel(),
      ]);
      // M15: if ALL calls failed, show a degraded banner instead of silently showing stale data
      if (
        sum.status === "rejected" &&
        time.status === "rejected" &&
        cat.status === "rejected" &&
        wf.status === "rejected" &&
        fun.status === "rejected"
      ) {
        setFetchError("API Server unreachable — showing offline fallback state.");
        return;
      }
      if (sum.status === "fulfilled") setSummary(sum.value);
      if (time.status === "fulfilled") setTimeseries(time.value);
      if (cat.status === "fulfilled") setCategories(cat.value);
      if (wf.status === "fulfilled") setWorkflows(wf.value);
      if (fun.status === "fulfilled") setFunnelData(fun.value);
    } catch {
      setFetchError("Failed to fetch dashboard data. Please try again.");
    } finally {
      setIsLoading(false);
      setIsPolling(false);
    }
  }, [selectedStage]);

  // Synchronize route changes to URL hash and localStorage
  const navigateTo = useCallback((tab: string, caseId?: string) => {
    setActiveNavTab(tab);
    localStorage.setItem("revrec_active_nav_tab", tab);
    if (tab === "case-detail" && caseId) {
      localStorage.setItem("revrec_case_id", caseId);
      window.location.hash = `#/case/${caseId}`;
    } else {
      localStorage.removeItem("revrec_case_id");
      if (tab !== "case-detail") {
        setCaseDetailWorkflow(null);
      }
      window.location.hash = `#/${tab}`;
    }

    if (tab === "overview") {
      setSelectedStage("");
      loadData(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tab === "workflows") {
      loadData(true);
      setTimeout(() => {
        document.getElementById("workflow-ledger-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } else if (tab === "simulation") {
      setTimeout(() => {
        document.getElementById("simulation-cockpit-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [loadData]);

  // Listen to browser hash changes (Back/Forward buttons or direct URL change)
  useEffect(() => {
    const handleHashSync = async () => {
      const route = parseRouteFromUrl();
      setActiveNavTab(route.tab);
      if (route.tab === "case-detail" && route.caseId) {
        try {
          const fullDetails = await fetchWorkflowDetails(route.caseId);
          setCaseDetailWorkflow(fullDetails);
        } catch {
          // If fetch fails, keep optimistic fallback
        }
      } else if (route.tab !== "case-detail") {
        setCaseDetailWorkflow(null);
        if (route.tab === "workflows") {
          setTimeout(() => {
            document.getElementById("workflow-ledger-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        } else if (route.tab === "simulation") {
          setTimeout(() => {
            document.getElementById("simulation-cockpit-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }
      }
    };

    window.addEventListener("hashchange", handleHashSync);
    // Initial mount sync (e.g. if loaded with #/case/id or #/communications)
    handleHashSync();

    return () => window.removeEventListener("hashchange", handleHashSync);
  }, []);

  // Initial load + refresh on stage filter change
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Auto-polling interval every 10 seconds — silent background poll
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Unselect KPI tile and Funnel stages on clicking blank space
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const isInteractiveZone =
        target?.closest("#kpi-cards-grid") ||
        target?.closest("#funnel-stages-grid") ||
        target?.closest("#workflow-ledger-section");

      if (!isInteractiveZone) {
        setActiveKpiTile(null);
        setSelectedStage("");
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  const handleInspectWorkflow = async (workflow: WorkflowItem) => {
    setDrawerWorkflow(workflow);
    try {
      const fullDetails = await fetchWorkflowDetails(workflow.id);
      setDrawerWorkflow(fullDetails);
    } catch {
      setDrawerWorkflow(workflow);
    }
  };

  const handleOpenFullCase = async (workflow: WorkflowItem) => {
    setDrawerWorkflow(null);
    setCaseDetailWorkflow(workflow);
    navigateTo("case-detail", workflow.id);
    try {
      const fullDetails = await fetchWorkflowDetails(workflow.id);
      setCaseDetailWorkflow(fullDetails);
    } catch {
      // Keep optimistic workflow
    }
  };

  const handleOpenBot = (customerId: string = "cust_demo_101", workflowId?: string) => {
    // If bot is already open and expanded for this customer, clicking the action button toggles / minimizes it
    if (isBotOpen && !isBotMinimized && botCustomerId === customerId && botWorkflowId === workflowId) {
      setIsBotMinimized(true);
      return;
    }

    // Otherwise, open/expand bot with the target customer context
    setBotCustomerId(customerId);
    setBotWorkflowId(workflowId);
    setIsBotOpen(true);
    setIsBotMinimized(false);
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-page)]">
      {/* ── Left Sidebar Navigation (240px Fixed on Desktop, Drawer on Mobile) ── */}
      <Sidebar
        activeTab={activeNavTab}
        onSelectTab={(tab) => {
          navigateTo(tab);
        }}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* ── Main Application Workspace ── */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-300">
        <Header
          activeTab={activeNavTab}
          caseDetailWorkflow={caseDetailWorkflow}
          onNavigateTab={(tab) => {
            navigateTo(tab);
          }}
          onOpenBot={() => handleOpenBot()}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
        />

        {/* M15: Degraded connection banner — only shown when ALL API calls fail */}
        {fetchError && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "9px 20px",
              backgroundColor: "#fef3c7",
              borderBottom: "1px solid #fcd34d",
              fontSize: 13,
              color: "#92400e",
              flexShrink: 0,
            }}
          >
            <span>⚠️ {fetchError}</span>
            <button
              onClick={() => loadData()}
              style={{
                padding: "3px 12px", borderRadius: 6, border: "1px solid #fcd34d",
                backgroundColor: "transparent", color: "#92400e", fontSize: 12,
                fontWeight: 600, cursor: "pointer", flexShrink: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* M16: silent polling indicator — tiny amber dot in top-right, no spinner flash */}
        {isPolling && !isLoading && (
          <div
            aria-hidden="true"
            title="Syncing in background…"
            style={{
              position: "fixed", top: 10, right: 12, zIndex: 100,
              width: 7, height: 7, borderRadius: "50%",
              backgroundColor: "#f59e0b",
              animation: "ds-pulse 1.5s ease-in-out infinite",
            }}
          />
        )}

        {/* ── Dynamic Workspace Views ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {activeNavTab === "demo" ? (
            <DemoStore
              onRecoveryTriggered={() => {
                loadData();
                navigateTo("overview");
              }}
            />
          ) : activeNavTab === "communications" ? (
            <CommunicationsHub
              onOpenFullCase={handleOpenFullCase}
              onOpenBotForCustomer={handleOpenBot}
            />
          ) : activeNavTab === "case-detail" && caseDetailWorkflow ? (
            <CaseDetailPage
              workflow={caseDetailWorkflow}
              onBack={() => {
                navigateTo("overview");
              }}
              onRefresh={async () => {
                loadData();
                if (caseDetailWorkflow) {
                  try {
                    const updated = await fetchWorkflowDetails(caseDetailWorkflow.id);
                    setCaseDetailWorkflow(updated);
                  } catch {
                    // Keep existing
                  }
                }
              }}
              onOpenBotForCustomer={handleOpenBot}
            />
          ) : (
            <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-7 md:py-8">
            {/* ── Page Header: Compact & High Density ── */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span className="ds-label" style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "var(--text-faint)" }}>
                    REVENUE INTELLIGENCE
                  </span>
                  <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--text-strong)", margin: "2px 0 0" }}>
                    Merchant Command Center
                  </h1>
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                  Settlement cycle & autonomous payment failure recovery
                </span>
              </div>
            </div>

            {/* ── Compact Bento KPI Metric Grid ── */}
            <div id="kpi-cards-grid" className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                title="Revenue At Risk"
                value={`₹${Math.round(summary.financials.totalAtRiskInPaise / 100).toLocaleString("en-IN")}`}
                subtitle={`${summary.counts.total} failed payments`}
                icon={ShieldAlert}
                variant="danger"
                isActive={activeKpiTile === "at_risk"}
                onClick={() => {
                  if (activeKpiTile === "at_risk") {
                    setActiveKpiTile(null);
                    setSelectedStage("");
                  } else {
                    setActiveKpiTile("at_risk");
                    setSelectedStage("");
                    document.getElementById("workflow-ledger-section")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              />
              <MetricCard
                title="Revenue Recovered"
                value={`₹${Math.round(summary.financials.totalRecoveredInPaise / 100).toLocaleString("en-IN")}`}
                subtitle={`${summary.counts.recovered} recoveries`}
                icon={DollarSign}
                variant="emerald"
                trend={`+${summary.financials.recoveryRatePercent.toFixed(1)}%`}
                isActive={activeKpiTile === "recovered"}
                onClick={() => {
                  if (activeKpiTile === "recovered") {
                    setActiveKpiTile(null);
                    setSelectedStage("");
                  } else {
                    setActiveKpiTile("recovered");
                    setSelectedStage("RECOVERED");
                    document.getElementById("workflow-ledger-section")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              />
              <MetricCard
                title="Active In-Flight"
                value={summary.counts.active}
                subtitle={`${summary.counts.halted} halted · ${summary.counts.escalated} escalated`}
                icon={Activity}
                variant="blue"
                isActive={activeKpiTile === "in_flight"}
                onClick={() => {
                  if (activeKpiTile === "in_flight") {
                    setActiveKpiTile(null);
                    setSelectedStage("");
                  } else {
                    setActiveKpiTile("in_flight");
                    setSelectedStage("ACTIVE");
                    document.getElementById("workflow-ledger-section")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              />
            </div>

            {/* ── Integrated Simulation Control Ribbon ── */}
            <div id="simulation-cockpit-section" style={{ marginBottom: 16, scrollMarginTop: 84 }}>
              <SimulationControls onSimulationCompleted={loadData} />
            </div>

            {/* ── 4-Stage Recovery Funnel Waterfall ── */}
            <RecoveryFunnel
              funnelData={funnelData}
              selectedStage={selectedStage}
              onSelectStage={setSelectedStage}
            />

            {/* ── Visual Analytics Grid ── */}
            <div style={{ marginBottom: 16 }}>
              <RecoveryCharts timeseries={timeseries} categories={categories} />
            </div>

            {/* ── Bounded Workflow Ledger Table ── */}
            <div id="workflow-ledger-section" style={{ scrollMarginTop: 84 }}>
              <WorkflowTable
                workflows={workflows}
                selectedStage={selectedStage}
                onSelectStage={setSelectedStage}
                onInspectWorkflow={handleInspectWorkflow}
              />
            </div>
          </main>
        )}
        </div>

        {/* ── Footer ── */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "14px 28px",
            textAlign: "center",
            fontSize: 11.5,
            color: "var(--text-faint)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          RevRec Autonomous Revenue Recovery Engine · Razorpay AI Track
        </footer>
      </div>

      {/* ── Slide-Over Inspector Drawer & Modals ── */}
      {activeNavTab !== "case-detail" && (
        <WorkflowDrawer
          workflow={drawerWorkflow}
          onClose={() => setDrawerWorkflow(null)}
          onRefresh={loadData}
          onOpenBotForCustomer={handleOpenBot}
          onOpenFullCase={handleOpenFullCase}
        />
      )}
      <HinglishBotSimulator
        isOpen={isBotOpen}
        isMinimized={isBotMinimized}
        onMinimizeChange={setIsBotMinimized}
        onClose={() => {
          setIsBotOpen(false);
          setIsBotMinimized(false);
        }}
        initialCustomerId={botCustomerId}
        {...(botWorkflowId ? { initialWorkflowId: botWorkflowId } : {})}
        onRefresh={loadData}
      />
    </div>
  );
}

export default App;

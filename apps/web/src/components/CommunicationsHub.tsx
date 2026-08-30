import React, { useState, useEffect, useCallback } from "react";
import {
  CommunicationItem,
  CommunicationsResponse,
  fetchCommunications,
  WorkflowItem,
} from "../api/client";
import {
  Search,
  RefreshCw,
  ArrowRight,
  Bot,
  TrendingUp,
  Volume2,
  CheckCheck,
  Check,
  CheckCircle2,
  CreditCard,
  MousePointerClick,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PillBadge, RiskBadge } from "./PillBadge";

interface CommunicationsHubProps {
  onOpenFullCase: (workflow: WorkflowItem) => void;
  onOpenBotForCustomer: (customerId: string, workflowId?: string) => void;
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const initials = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : name.slice(0, 2);
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        backgroundColor: "var(--bg-subtle)",
        border: "1px solid var(--border)",
        color: "var(--text-strong)",
        fontSize: 11.5,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {initials}
    </div>
  );
}

const CHANNEL_TABS = [
  { id: "ALL", label: "All Channels", countKey: "all" },
  { id: "WHATSAPP", label: "WhatsApp", countKey: "whatsapp" },
  { id: "SMS", label: "SMS", countKey: "sms" },
  { id: "EMAIL", label: "Email", countKey: "email" },
  { id: "HINGLISH_VOICE", label: "AI Voice", countKey: "hinglish_voice" },
];

export function CommunicationsHub({
  onOpenFullCase,
  onOpenBotForCustomer,
}: CommunicationsHubProps): React.JSX.Element {
  const [selectedChannel, setSelectedChannel] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dispatches, setDispatches] = useState<CommunicationItem[]>([]);
  const [counts, setCounts] = useState<CommunicationsResponse["counts"] | null>(null);
  const [metrics, setMetrics] = useState<CommunicationsResponse["metrics"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [simulatingWorkflowId, setSimulatingWorkflowId] = useState<string | null>(null);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(dispatches.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedDispatches = dispatches.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const handleChannelSelect = (channel: string) => {
    setSelectedChannel(channel);
    setCurrentPage(1);
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setCurrentPage(1);
  };

  const loadCommunications = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetchCommunications(selectedChannel, searchTerm);
      setDispatches(res.data);
      setMetrics(res.metrics);
      if (res.counts) setCounts(res.counts);
      setLastRefreshedAt(new Date());
    } catch (err) {
      // M23 fix: surface network failures to the user instead of silently swallowing them
      setFetchError((err as Error).message ?? "Failed to load communications");
    } finally {
      setIsLoading(false);
    }
  }, [selectedChannel, searchTerm]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setFetchError(null);
    const start = Date.now();
    try {
      const res = await fetchCommunications(selectedChannel, searchTerm);
      // Guarantee smooth visual feedback duration (min 450ms)
      const elapsed = Date.now() - start;
      if (elapsed < 450) {
        await new Promise((r) => setTimeout(r, 450 - elapsed));
      }
      setDispatches(res.data);
      setMetrics(res.metrics);
      if (res.counts) setCounts(res.counts);
      setLastRefreshedAt(new Date());
      setToastMessage({ text: "Communications feed refreshed", type: "success" });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      const errMsg = (err as Error).message ?? "Failed to refresh feed";
      setFetchError(errMsg);
      setToastMessage({ text: `Failed to refresh feed: ${errMsg}`, type: "error" });
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCommunications();
  }, [loadCommunications]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "READ":
        return {
          variant: "green" as const,
          icon: <CheckCheck size={12} strokeWidth={2.4} />,
          label: "READ",
        };
      case "DELIVERED":
        return {
          variant: "blue" as const,
          icon: <CheckCheck size={12} strokeWidth={2.4} />,
          label: "DELIVERED",
        };
      case "CLICKED":
        return {
          variant: "teal" as const,
          icon: <MousePointerClick size={11} strokeWidth={2.4} />,
          label: "CLICKED",
        };
      case "SENT":
        return {
          variant: "neutral" as const,
          icon: <Check size={11} strokeWidth={2.4} />,
          label: "SENT",
        };
      default:
        return {
          variant: "red" as const,
          icon: <AlertCircle size={11} strokeWidth={2.4} />,
          label: "FAILED",
        };
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-4 py-5 pb-12 md:px-7 md:py-6">
      {/* ── Error Banner (M23 fix) ── */}
      {fetchError && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", marginBottom: 16, borderRadius: 8,
          background: "#fce8e6", border: "1px solid rgba(197,34,31,0.2)",
          color: "#c5221f", fontSize: 13,
        }}>
          <span>⚠ Failed to load communications: {fetchError}</span>
          <button onClick={() => loadCommunications()} style={{
            background: "none", border: "none", color: "#c5221f", cursor: "pointer", fontWeight: 600, fontSize: 12
          }}>Retry</button>
        </div>
      )}
      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-faint)",
              }}
            >
              COMMUNICATIONS & OUTREACH
            </span>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              color: "var(--text-strong)",
              margin: "2px 0 6px",
            }}
          >
            Communications Command Center
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-soft)", margin: 0 }}>
            Unified stream of automated dunning outreach, WhatsApp 1-click links, and customer conversation transcripts.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-faint)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            Updated {lastRefreshedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              width: 124,
              height: 36,
              boxSizing: "border-box",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-strong)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isRefreshing ? "wait" : "pointer",
              transition: "background-color 0.12s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isRefreshing) e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
            }}
            onMouseLeave={(e) => {
              if (!isRefreshing) e.currentTarget.style.backgroundColor = "var(--bg-surface)";
            }}
          >
            <RefreshCw
              size={13}
              className={isRefreshing ? "ds-spin" : ""}
              style={{
                color: "var(--text-strong)",
                flexShrink: 0,
              }}
            />
            <span style={{ whiteSpace: "nowrap" }}>Refresh Feed</span>
          </button>
        </div>
      </div>

      {/* ── Top Metric Bento Grid ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4" style={{ marginBottom: 20 }}>
        <div style={{ padding: "16px 18px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>Total Dispatches</span>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-strong)", marginTop: 4, letterSpacing: "-0.02em" }}>
            {counts?.all ?? metrics?.totalDispatches ?? dispatches.length}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 2, display: "block" }}>
            Across 4 automated channels
          </span>
        </div>

        <div style={{ padding: "16px 18px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>WhatsApp Read Rate</span>
            {metrics?.whatsappReadRatePercent != null ? (
              <PillBadge variant="green">
                +{metrics.whatsappReadRatePercent}%
              </PillBadge>
            ) : (
              <PillBadge variant="neutral">
                NO DATA
              </PillBadge>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: metrics?.whatsappReadRatePercent != null ? "#15803d" : "var(--text-faint)", marginTop: 4, letterSpacing: "-0.02em" }}>
            {metrics?.whatsappReadRatePercent != null ? `${metrics.whatsappReadRatePercent}%` : "—"}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 2, display: "block" }}>
            Highest conversion channel in India
          </span>
        </div>

        <div style={{ padding: "16px 18px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>SMS Delivery Rate</span>
            {metrics?.smsDeliveryRatePercent != null ? (
              <PillBadge variant="blue">
                +{metrics.smsDeliveryRatePercent}%
              </PillBadge>
            ) : (
              <PillBadge variant="neutral">
                NO DATA
              </PillBadge>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: metrics?.smsDeliveryRatePercent != null ? "#1d4ed8" : "var(--text-faint)", marginTop: 4, letterSpacing: "-0.02em" }}>
            {metrics?.smsDeliveryRatePercent != null ? `${metrics.smsDeliveryRatePercent}%` : "—"}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 2, display: "block" }}>
            DLT registered template pipeline
          </span>
        </div>

        <div style={{ padding: "16px 18px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>Outreach Recovery</span>
            <TrendingUp size={14} color="#059669" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-strong)", marginTop: 4, letterSpacing: "-0.02em" }}>
            ₹{Math.round((metrics?.totalRecoveredViaOutreachInPaise ?? 0) / 100).toLocaleString("en-IN")}
          </div>
          <span style={{ fontSize: 11.5, color: "#059669", fontWeight: 600, marginTop: 2, display: "block" }}>
            Attributed to communication links
          </span>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {/* Channel Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
          {CHANNEL_TABS.map((tab) => {
            const isSelected = selectedChannel === tab.id;
            const tabCount = counts ? (counts as any)[tab.countKey] : null;

            return (
              <button
                key={tab.id}
                onClick={() => handleChannelSelect(tab.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: isSelected
                    ? "1px solid rgba(15, 23, 42, 0.32)"
                    : "1px solid var(--border)",
                  backgroundColor: isSelected ? "var(--bg-subtle)" : "var(--bg-surface)",
                  color: isSelected ? "var(--text-strong)" : "var(--text-body)",
                  boxShadow: isSelected
                    ? "0 1px 3px -1px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.08)"
                    : "none",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.22)";
                    e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                  }
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: isSelected ? 600 : 500,
                  }}
                >
                  <span>{tab.label}</span>
                  {/* Invisible bold text pre-reserves exact width preventing horizontal layout shift */}
                  <span
                    style={{
                      fontWeight: 600,
                      height: 0,
                      overflow: "hidden",
                      visibility: "hidden",
                      userSelect: "none",
                    }}
                    aria-hidden="true"
                  >
                    {tab.label}
                  </span>
                </span>
                {tabCount !== null && tabCount !== undefined && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 10,
                      backgroundColor: isSelected ? "rgba(15, 23, 42, 0.10)" : "var(--bg-subtle)",
                      border: isSelected ? "1px solid rgba(15, 23, 42, 0.12)" : "1px solid var(--border)",
                      color: isSelected ? "var(--text-strong)" : "var(--text-soft)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {tabCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: "relative", minWidth: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-faint)" }} />
          <input
            type="text"
            placeholder="Search by customer, phone, or text..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              width: "100%",
              height: 34,
              paddingLeft: 32,
              paddingRight: 12,
              fontSize: 12.5,
              borderRadius: 6,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-strong)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* ── Communications Stream Feed ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isLoading && dispatches.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--text-faint)",
              fontSize: 13.5,
            }}
          >
            Loading communications feed...
          </div>
        ) : dispatches.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--text-faint)",
              fontSize: 13.5,
            }}
          >
            No communication dispatches found matching the filter criteria.
          </div>
        ) : (
          paginatedDispatches.map((item) => {
            const isVoice = item.channel === "HINGLISH_VOICE";
            const st = getStatusBadge(item.status);
            const amountInRupees = item.workflow?.amountAtRiskInPaise
              ? Math.round(item.workflow.amountAtRiskInPaise / 100).toLocaleString("en-IN")
              : null;
            const caseShortId = item.workflow?.id ? item.workflow.id.slice(0, 8) : "in_flight";
            const channelVariant =
              item.channel === "WHATSAPP"
                ? "green"
                : item.channel === "SMS"
                ? "blue"
                : isVoice
                ? "amber"
                : "purple";

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  transition: "border-color 0.12s ease, box-shadow 0.12s ease",
                }}
              >
                {/* 1. Card Header: Customer Identity + Channel + Status */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Initials name={item.customer.name} />

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-strong)" }}>
                          {item.customer.name}
                        </span>
                        <PillBadge variant={channelVariant}>
                          {isVoice ? "AI VOICE" : item.channel}
                        </PillBadge>
                        <RiskBadge tier={item.customer.riskTier ?? "LOW"} />
                      </div>

                      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{item.customer.email}</span>
                        <span>·</span>
                        <span>{item.customer.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PillBadge variant={st.variant}>
                      {st.icon}
                      <span>{st.label}</span>
                    </PillBadge>

                    <span style={{ fontSize: 11, color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
                      {new Date(item.sentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {/* 2. Message Body Area (Clean, single unified layout) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--text-body)",
                  }}
                >
                  {isVoice ? (
                    <div
                      style={{
                        backgroundColor: "var(--bg-subtle)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--text-faint)" }}>
                        <Volume2 size={12} />
                        <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Interactive Voice Call Transcript</span>
                      </div>
                      <div style={{ whiteSpace: "pre-line", fontSize: 12.5, color: "var(--text-strong)" }}>
                        {item.messagePayload}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ whiteSpace: "pre-line", color: "var(--text-strong)", fontSize: 13, lineHeight: 1.55 }}>
                        {item.messagePayload}
                      </div>

                      {item.customerResponse && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "9px 12px",
                            backgroundColor: "var(--bg-subtle)",
                            borderLeft: "2px solid var(--border-strong)",
                            borderRadius: "0 6px 6px 0",
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Customer Response
                          </span>
                          <span style={{ fontSize: 12.5, color: "var(--text-strong)" }}>
                            "{item.customerResponse}"
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Footer Strip: Case Context, Template & Actions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-faint)", flexWrap: "wrap" }}>
                    <span>Case <code style={{ fontFamily: "monospace", color: "var(--text-strong)" }}>#{caseShortId}</code></span>
                    {amountInRupees && (
                      <>
                        <span>·</span>
                        <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>₹{amountInRupees} at risk</span>
                      </>
                    )}
                    {item.workflow?.stage && (
                      <>
                        <span>·</span>
                        <span style={{ textTransform: "uppercase", fontWeight: 600, fontSize: 10.5, color: "var(--text-soft)" }}>
                          {item.workflow.stage.replace(/_/g, " ")}
                        </span>
                      </>
                    )}
                    {item.templateName && (
                      <>
                        <span>·</span>
                        <span>Template: <code style={{ fontFamily: "monospace", color: "var(--text-soft)" }}>{item.templateName}</code></span>
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      className="ds-btn ds-btn-ghost"
                      onClick={() => onOpenBotForCustomer(item.customer.id, item.workflow?.id)}
                      style={{
                        height: 28,
                        padding: "0 10px",
                        fontSize: 11.5,
                        gap: 5,
                      }}
                    >
                      <Bot size={12} />
                      <span>Hinglish Bot</span>
                    </button>

                    {item.channel === "WHATSAPP" && (
                      <button
                        className="ds-btn ds-btn-secondary"
                        disabled={item.workflow?.stage === "RECOVERED" || simulatingWorkflowId === item.workflow?.id}
                        title={item.workflow?.stage === "RECOVERED" ? "Payment has already been simulated and recovered" : "Simulate customer completing payment via link"}
                        onClick={async () => {
                          if (item.workflow?.stage === "RECOVERED" || !item.workflow?.id) return;
                          try {
                            setSimulatingWorkflowId(item.workflow.id);
                            const res = await fetch(`/api/checkout/simulate-recovery`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ workflowId: item.workflow.id })
                            });
                            if (!res.ok) throw new Error('Failed to simulate recovery');
                            setToastMessage({ type: 'success', text: 'Simulated customer payment via WhatsApp Link!' });
                            setTimeout(() => setToastMessage(null), 3000);
                            loadCommunications(); // refresh the list
                          } catch (err) {
                            console.error('[CommunicationsHub] Simulate payment error:', err);
                            setToastMessage({ type: 'error', text: 'Failed to simulate payment.' });
                            setTimeout(() => setToastMessage(null), 3000);
                          } finally {
                            setSimulatingWorkflowId(null);
                          }
                        }}
                        style={{
                          height: 28,
                          padding: "0 11px",
                          fontSize: 11.5,
                          fontWeight: 600,
                          borderRadius: 6,
                          gap: 5,
                          cursor: (item.workflow?.stage === "RECOVERED" || simulatingWorkflowId === item.workflow?.id) ? "not-allowed" : "pointer",
                          opacity: item.workflow?.stage === "RECOVERED" ? 0.5 : simulatingWorkflowId === item.workflow?.id ? 0.7 : 1,
                        }}
                      >
                        {simulatingWorkflowId === item.workflow?.id ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : item.workflow?.stage === "RECOVERED" ? (
                          <CheckCircle2 size={12} style={{ color: "var(--green)" }} />
                        ) : (
                          <CreditCard size={12} />
                        )}
                        <span>
                          {simulatingWorkflowId === item.workflow?.id
                            ? "Processing..."
                            : item.workflow?.stage === "RECOVERED"
                            ? "Payment Recovered"
                            : "Simulate Payment"}
                        </span>
                      </button>
                    )}

                    {item.workflow && (
                      <button
                        className="ds-btn ds-btn-ghost"
                        onClick={() => {
                          const workflowStub: WorkflowItem = {
                            id: item.workflow?.id ?? "wf_demo",
                            paymentId: "",
                            customerId: item.customer.id,
                            amountAtRiskInPaise: item.workflow?.amountAtRiskInPaise ?? 0,
                            amountRecoveredInPaise: 0,
                            stage: item.workflow?.stage ?? "OUTREACH_SENT",
                            retryCount: 0,
                            outreachCount: 0,
                            createdAt: item.sentAt,
                            customer: {
                              id: item.customer.id,
                              externalId: item.customer.id,
                              name: item.customer.name,
                              email: item.customer.email,
                              phone: item.customer.phone,
                              riskScore: item.customer.riskScore,
                              riskTier: item.customer.riskTier ?? "LOW",
                            },
                            payment: {
                              id: "",
                              externalId: "",
                              status: "FAILED",
                              gatewayErrorCode: null,
                              declineCategory: null,
                            },
                          };
                          onOpenFullCase(workflowStub);
                        }}
                        style={{
                          height: 28,
                          padding: "0 10px",
                          fontSize: 11.5,
                          gap: 4,
                        }}
                      >
                        <span>Inspect Case</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Bounded Pagination Controls (Industry Standard) ── */}
      {dispatches.length > PAGE_SIZE && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            marginTop: 14,
            borderRadius: 10,
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-surface)",
            fontSize: 12.5,
            color: "var(--text-soft)",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span>
            Showing {(activePage - 1) * PAGE_SIZE + 1}–
            {Math.min(activePage * PAGE_SIZE, dispatches.length)} of {dispatches.length} dispatches
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Page {activePage} of {totalPages}
            </span>
            <button
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 220, behavior: "smooth" });
              }}
              disabled={activePage <= 1}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-surface)",
                color: activePage <= 1 ? "var(--text-faint)" : "var(--text-strong)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: activePage <= 1 ? "not-allowed" : "pointer",
                opacity: activePage <= 1 ? 0.4 : 1,
                transition: "all 0.12s ease",
              }}
              aria-label="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 220, behavior: "smooth" });
              }}
              disabled={activePage >= totalPages}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-surface)",
                color: activePage >= totalPages ? "var(--text-faint)" : "var(--text-strong)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: activePage >= totalPages ? "not-allowed" : "pointer",
                opacity: activePage >= totalPages ? 0.4 : 1,
                transition: "all 0.12s ease",
              }}
              aria-label="Next Page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Action Toast Notification ── */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            backgroundColor: "var(--brand, #0f172a)",
            color: "#ffffff",
            borderRadius: 10,
            padding: "9px 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 12px 32px -4px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)",
            fontSize: 12.5,
            fontWeight: 500,
            animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {toastMessage.type === "success" ? (
            <Check size={14} strokeWidth={2.5} style={{ color: "#4ade80" }} />
          ) : (
            <AlertCircle size={14} strokeWidth={2.5} style={{ color: "#f87171" }} />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}

export default CommunicationsHub;

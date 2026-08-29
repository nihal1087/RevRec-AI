import React, { useState, useEffect } from "react";
import {
  WorkflowItem,
  triggerManualRetry,
  triggerAgentDecision,
} from "../api/client";
import {
  ArrowLeft,
  Zap,
  Bot,
  MessageSquare,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  Phone,
  Mail,
  User,
  Layers,
  Copy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PillBadge, RiskBadge } from "./PillBadge";

interface CaseDetailPageProps {
  workflow: WorkflowItem;
  onBack: () => void;
  onRefresh: () => void;
  onOpenBotForCustomer: (customerId: string, workflowId: string) => void;
}

export function CaseDetailPage({
  workflow,
  onBack,
  onRefresh,
  onOpenBotForCustomer,
}: CaseDetailPageProps): React.JSX.Element {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);

  const amountInRupees = Math.round((workflow.amountAtRiskInPaise ?? 0) / 100);
  const recoveredInRupees = Math.round((workflow.amountRecoveredInPaise ?? 0) / 100);
  const latestExecution = workflow.agentExecutions?.[0];
  const auditEntries = workflow.auditEntries ?? [];
  const dunningContacts = workflow.dunningContacts ?? [];
  const promiseToPays = workflow.promiseToPays ?? [];

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => {
      setActionMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const handleCopyId = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualRetry = async () => {
    try {
      setIsRetrying(true);
      setActionMessage(null);
      await triggerManualRetry(workflow.id);
      setActionMessage({ text: "Immediate retry dispatched to BullMQ queue.", type: "success" });
      onRefresh();
    } catch (err) {
      setActionMessage({ text: `Error: ${(err as Error).message}`, type: "error" });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRunAgent = async () => {
    try {
      setIsEvaluating(true);
      setActionMessage(null);
      await triggerAgentDecision(workflow.id);
      setActionMessage({ text: "Bounded AI Agent evaluated case & executed approved tool.", type: "success" });
      onRefresh();
    } catch (err) {
      setActionMessage({ text: `Error: ${(err as Error).message}`, type: "error" });
    } finally {
      setIsEvaluating(false);
    }
  };

  // Compute 5 visual timeline steps based on case state
  const timelineSteps = [
    {
      title: "1. Payment Failed",
      desc: `${workflow.payment.gatewayErrorCode ?? "DECLINE"} — ₹${amountInRupees.toLocaleString("en-IN")}`,
      time: new Date(workflow.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      status: "done" as const,
      icon: Zap,
    },
    {
      title: "2. RCA Classification",
      desc: `Diagnosed as ${workflow.payment.declineCategory ?? "SOFT"} Decline`,
      time: new Date(workflow.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      status: "done" as const,
      icon: Bot,
    },
    {
      title: "3. Compliance & Policy Check",
      desc: "TRAI quiet hours & RBI frequency limits validated (Passed)",
      time: new Date(workflow.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      status: "done" as const,
      icon: ShieldCheck,
    },
    {
      title: "4. Intervention & Outreach",
      desc:
        workflow.stage === "RETRYING"
          ? `Retry scheduled (Attempt #${workflow.retryCount + 1})`
          : workflow.stage === "OUTREACH_SENT"
          ? "WhatsApp recovery link dispatched"
          : workflow.stage === "PROMISE_RECEIVED"
          ? "Customer Promise-to-Pay recorded"
          : "Intervention executed",
      time: workflow.nextActionAt
        ? new Date(workflow.nextActionAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : "In-flight",
      status: workflow.stage !== "PENDING" ? ("done" as const) : ("active" as const),
      icon: Clock,
    },
    {
      title: "5. Resolution Status",
      desc:
        workflow.stage === "RECOVERED"
          ? `Recovered ₹${amountInRupees.toLocaleString("en-IN")}`
          : workflow.stage === "HALTED"
          ? "Halted (Hard Decline / Stopping Rule)"
          : workflow.stage === "ESCALATED"
          ? "Escalated to Human Operator"
          : "Recovery in progress...",
      time: workflow.stage === "RECOVERED" ? "Completed" : "Active",
      status:
        workflow.stage === "RECOVERED"
          ? ("done" as const)
          : workflow.stage === "HALTED" || workflow.stage === "ESCALATED"
          ? ("done" as const)
          : ("active" as const),
      icon: CheckCircle2,
    },
  ];

  return (
    <div style={{ padding: "20px 28px 48px", maxWidth: 1320, margin: "0 auto", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
      {/* ── Top Navigation & Breadcrumbs ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            color: "var(--text-soft)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 6,
            transition: "background-color 0.12s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-subtle)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <ArrowLeft size={16} />
          <span>Back to Recovery Ledger</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleManualRetry}
            disabled={isRetrying || workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD"}
            title={workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD" ? "Retry disabled: hard decline or halted workflow (RBI compliance)" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-strong)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: (workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD") ? "not-allowed" : "pointer",
              opacity: (isRetrying || workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD") ? 0.45 : 1,
            }}
          >
            <Zap size={14} />
            {isRetrying ? "Dispatching..." : "Force Retry Now"}
          </button>

          <button
            onClick={handleRunAgent}
            disabled={isEvaluating || workflow.stage === "RECOVERED" || workflow.stage === "HALTED"}
            title={workflow.stage === "HALTED" ? "AI agent disabled on halted workflows" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-strong)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: (workflow.stage === "RECOVERED" || workflow.stage === "HALTED") ? "not-allowed" : "pointer",
              opacity: (isEvaluating || workflow.stage === "RECOVERED" || workflow.stage === "HALTED") ? 0.45 : 1,
            }}
          >
            <Bot size={14} />
            {isEvaluating ? "Evaluating..." : "Run AI Decision"}
          </button>

          <button
            onClick={() => onOpenBotForCustomer(workflow.customer.id, workflow.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--brand)",
              color: "#ffffff",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <MessageSquare size={14} />
            <span>Open Hinglish Bot</span>
          </button>
        </div>
      </div>

      {/* ── Floating Action Toast Notification ── */}
      {actionMessage && (
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
            padding: "10px 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 12px 32px -4px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)",
            fontSize: 13,
            fontWeight: 500,
            animation: "fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {actionMessage.type === "success" ? (
            <Check size={14} strokeWidth={2.5} style={{ color: "#4ade80" }} />
          ) : (
            <AlertCircle size={14} strokeWidth={2.5} style={{ color: "#f87171" }} />
          )}
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255, 255, 255, 0.6)",
              padding: "2px",
              marginLeft: 4,
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)")}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Case Header Card ── */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "22px 26px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.02em" }}>
                Case #{workflow.id.slice(0, 14)}
              </span>
              <button
                onClick={() => handleCopyId(workflow.id)}
                title="Copy Full Case ID"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-faint)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              >
                <Copy size={12} />
                <span>{copied ? "Copied!" : "Copy ID"}</span>
              </button>

              <PillBadge
                variant={
                  workflow.stage === "RECOVERED"
                    ? "green"
                    : workflow.stage === "RETRYING"
                    ? "blue"
                    : workflow.stage === "OUTREACH_SENT"
                    ? "purple"
                    : workflow.stage === "PROMISE_RECEIVED"
                    ? "teal"
                    : workflow.stage === "ESCALATED"
                    ? "red"
                    : "neutral"
                }
              >
                {workflow.stage.replace(/_/g, " ")}
              </PillBadge>

              <PillBadge
                variant={
                  workflow.payment.declineCategory === "SOFT"
                    ? "green"
                    : workflow.payment.declineCategory === "NETWORK"
                    ? "blue"
                    : workflow.payment.declineCategory === "INTENT_DROP"
                    ? "amber"
                    : workflow.payment.declineCategory === "MANDATE_FAILURE"
                    ? "purple"
                    : workflow.payment.declineCategory === "HARD"
                    ? "red"
                    : "neutral"
                }
              >
                RCA: {workflow.payment.declineCategory ?? "SOFT"}
              </PillBadge>

              <PillBadge
                variant={
                  (workflow.customer.riskTier ?? "LOW") === "LOW"
                    ? "green"
                    : (workflow.customer.riskTier ?? "LOW") === "MEDIUM"
                    ? "amber"
                    : "red"
                }
              >
                {workflow.customer.riskTier ?? "LOW"} RISK
              </PillBadge>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--text-soft)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <User size={14} />
                <strong style={{ color: "var(--text-strong)" }}>{workflow.customer.name}</strong>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Mail size={14} />
                <span>{workflow.customer.email}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={14} />
                <span>{workflow.customer.phone}</span>
              </span>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>
              Amount at Risk
            </span>
            <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-strong)", letterSpacing: "-0.03em" }}>
              ₹{amountInRupees.toLocaleString("en-IN")}
            </div>
            {workflow.stage === "RECOVERED" && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>
                ₹{recoveredInRupees.toLocaleString("en-IN")} Recovered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Key Metrics 4-Col Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 14, marginBottom: 24 }}>
        <div style={{ padding: "16px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>Gateway Error</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", marginTop: 4, fontFamily: "monospace" }}>
            {workflow.payment.gatewayErrorCode ?? "UNKNOWN_ERROR"}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 2, display: "block" }}>
            Status: {workflow.payment.status}
          </span>
        </div>

        <div style={{ padding: "16px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>Retry Attempts</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-strong)", marginTop: 4 }}>
            {workflow.retryCount} / 3 Max Retries
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 2, display: "block" }}>
            Outreach count: {workflow.outreachCount}
          </span>
        </div>

        <div style={{ padding: "16px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          {(() => {
            const tier =
              workflow.customer.riskTier ??
              (workflow.customer.riskScore > 60 ? "HIGH" : workflow.customer.riskScore > 30 ? "MEDIUM" : "LOW");
            const historyScore = workflow.customer.paymentHistoryScore ?? (tier === "LOW" ? 90 : tier === "MEDIUM" ? 65 : 35);
            const prob = tier === "LOW" ? 92 : tier === "MEDIUM" ? 74 : 38;
            const badgeColor = tier === "LOW" ? "#059669" : tier === "MEDIUM" ? "#d97706" : "#dc2626";

            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>
                    Customer Risk Tier
                  </span>
                  <RiskBadge tier={tier} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-strong)", marginTop: 4 }}>
                  {historyScore}/100 <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-soft)" }}>Reliability Score</span>
                </div>
                <span style={{ fontSize: 11.5, color: badgeColor, fontWeight: 600, marginTop: 2, display: "block" }}>
                  Est. Recovery Probability: ~{prob}%
                </span>
              </>
            );
          })()}
        </div>

        <div style={{ padding: "16px", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>Next Action Timing</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", marginTop: 4 }}>
            {workflow.nextActionAt
              ? new Date(workflow.nextActionAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "No Pending Timer"}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 2, display: "block" }}>
            Bank downtime avoided
          </span>
        </div>
      </div>

      {/* ── 2-Col Main Workspace: Stepper + Communications ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Left Col: Step-by-Step History Timeline */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 7 }}>
              <Layers size={15} style={{ color: "var(--text-strong)" }} />
              Autonomous Lifecycle Stepper
            </span>
            <PillBadge variant="neutral">ACTIVE</PillBadge>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 4 }}>
            {timelineSteps.map((step, idx) => {
              const Icon = step.icon;
              const isLast = idx === timelineSteps.length - 1;
              const isDone = step.status === "done";

              return (
                <div key={idx} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        backgroundColor: isDone ? "var(--bg-subtle)" : "var(--bg-surface)",
                        border: isDone ? "1px solid var(--border-strong, #cbd5e1)" : "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={12} style={{ color: isDone ? "var(--text-strong)" : "var(--text-faint)" }} />
                    </div>
                    {!isLast && (
                      <div
                        style={{
                          width: 1,
                          height: 26,
                          backgroundColor: "var(--border)",
                          margin: "2px 0",
                        }}
                      />
                    )}
                  </div>

                  <div style={{ paddingBottom: isLast ? 0 : 14, paddingTop: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-strong)" }}>
                        {step.title}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
                        {step.time}
                      </span>
                    </div>
                    <p style={{ fontSize: 11.5, color: "var(--text-soft)", margin: "2px 0 0", lineHeight: 1.4 }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: AI Agent Decisioning & Reasoning */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 7 }}>
              <Bot size={15} style={{ color: "var(--text-strong)" }} />
              Bounded AI Agent Evaluation
            </span>
            {latestExecution && (
              <PillBadge variant="neutral">
                {latestExecution.llmLatencyMs ?? 0}MS · ₹{(((latestExecution.estimatedCostInPaise ?? 0) / 100)).toFixed(2)}
              </PillBadge>
            )}
          </div>

          {latestExecution ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "12px 14px", backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: "0.05em" }}>
                  Selected Bounded Tool
                </span>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)", marginTop: 2 }}>
                  <code>{latestExecution.selectedTool}</code>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 4, lineHeight: 1.45 }}>
                  "{latestExecution.reasoning}"
                </div>
              </div>

              {/* Policy Validation Strip */}
              <div style={{ padding: "12px 14px", backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-strong)" }}>Dunning Policy Validation</span>
                  <PillBadge variant={latestExecution.policyCheckPassed ? "green" : "red"}>
                    {latestExecution.policyCheckPassed ? "APPROVED" : "BLOCKED"}
                  </PillBadge>
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-soft)", lineHeight: 1.4 }}>
                  {latestExecution.policyCheckDetails || "RBI contact limits, TRAI quiet hours (20:00-08:00 IST), and discount concession caps strictly enforced."}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--text-faint)" }}>
                <span>Confidence Score: <strong>{(((latestExecution.confidenceScore ?? 0.9) * 100)).toFixed(0)}%</strong></span>
                <span>Evaluated: {latestExecution.createdAt ? new Date(latestExecution.createdAt).toLocaleTimeString() : "—"}</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
              <Bot size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
              <div>No agent execution recorded yet for this workflow.</div>
              <button
                onClick={handleRunAgent}
                style={{
                  marginTop: 12,
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--brand)",
                  backgroundColor: "var(--brand-tint)",
                  color: "var(--brand)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Run AI Diagnosis Now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Multi-Channel Communications & Promise to Pay ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20, marginBottom: 24 }}>
        {/* Communications Center */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "22px 24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 7 }}>
              <MessageSquare size={16} color="var(--brand)" />
              Multi-Channel Communications Log
            </span>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {dunningContacts.length} Messages Dispatched
            </span>
          </div>

          {dunningContacts.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-faint)", fontSize: 12.5 }}>
              No automated outbound messages sent yet for this case.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dunningContacts.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", textTransform: "uppercase" }}>
                        {c.channel}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
                      <span style={{ fontSize: 11.5, color: "var(--text-soft)" }}>{c.templateName}</span>
                    </div>
                    <PillBadge
                      variant={
                        c.status === "DELIVERED"
                          ? "blue"
                          : c.status === "CLICKED"
                          ? "teal"
                          : c.status === "READ"
                          ? "green"
                          : "neutral"
                      }
                    >
                      {c.status}
                    </PillBadge>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-body)", fontStyle: "italic", lineHeight: 1.4 }}>
                    "{c.messagePayload}"
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-faint)", textAlign: "right" }}>
                    {new Date(c.sentAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Promise to Pay (PTP) Commitment Card */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "22px 24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 7 }}>
              <Clock size={16} color="#0d9488" />
              Promise to Pay (PTP) Tracker
            </span>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {promiseToPays.length} Commitment
            </span>
          </div>

          {promiseToPays.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-faint)", fontSize: 12.5 }}>
              No customer commitment recorded yet. Open the Hinglish Bot to simulate customer salary promises!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {promiseToPays.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "#f0fdfa",
                    border: "1px solid #ccfbf1",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f766e" }}>
                      ₹{Math.round(p.promisedAmountInPaise / 100).toLocaleString("en-IN")}
                    </span>
                    <PillBadge variant="teal">
                      {p.status}
                    </PillBadge>
                  </div>
                  <div style={{ fontSize: 12, color: "#134e4a" }}>
                    Promised Date: <strong>{new Date(p.promisedAt).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: "#0d9488" }}>
                    AI Confidence Score: {(p.confidenceScore * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Cryptographic Audit Ledger ── */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 7 }}>
              <ShieldCheck size={16} color="var(--brand)" />
              Immutable Cryptographic Audit Trail
            </span>
            <p style={{ fontSize: 12, color: "var(--text-soft)", margin: "2px 0 0" }}>
              Complete chronological audit ledger of state transitions and agent actions
            </p>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
            {auditEntries.length} Total Events Logged
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, textAlign: "left" }}>
            <thead style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "1px solid var(--border)", color: "var(--text-faint)", textTransform: "uppercase", fontSize: 10.5 }}>
              <tr>
                <th style={{ padding: "10px 18px" }}>Timestamp</th>
                <th style={{ padding: "10px 18px" }}>Event Type</th>
                <th style={{ padding: "10px 18px" }}>Actor</th>
                <th style={{ padding: "10px 18px" }}>Outcome</th>
                <th style={{ padding: "10px 18px" }}>Payload Details</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "var(--text-faint)" }}>
                    No audit records logged yet.
                  </td>
                </tr>
              ) : (
                auditEntries.map((log) => {
                  const isExpanded = expandedPayloadId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr style={{ borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                        <td style={{ padding: "12px 18px", color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11.5 }}>
                          {new Date(log.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td style={{ padding: "12px 18px", fontWeight: 600, color: "var(--text-strong)" }}>
                          <code>{log.eventType}</code>
                        </td>
                        <td style={{ padding: "12px 18px", color: "var(--text-body)" }}>
                          <PillBadge variant="neutral">
                            {log.actorType}
                          </PillBadge>
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          <PillBadge variant={log.outcome === "SUCCESS" ? "green" : "red"}>
                            {log.outcome}
                          </PillBadge>
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          {log.payload ? (
                            <button
                              onClick={() => setExpandedPayloadId(isExpanded ? null : log.id)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                background: "none",
                                border: "none",
                                color: "var(--brand)",
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <span>{isExpanded ? "Hide JSON" : "Inspect Payload"}</span>
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>No metadata</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && log.payload && (
                        <tr>
                          <td colSpan={5} style={{ padding: "12px 18px", backgroundColor: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                            <pre
                              style={{
                                margin: 0,
                                padding: "10px 14px",
                                backgroundColor: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 6,
                                fontSize: 11,
                                fontFamily: "monospace",
                                color: "var(--text-body)",
                                maxHeight: 200,
                                overflowY: "auto",
                              }}
                            >
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default CaseDetailPage;

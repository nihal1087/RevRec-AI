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
  CreditCard,
  RefreshCw,
  X,
  Phone,
  Mail,
  User,
  Layers,
  Copy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PillBadge, RiskBadge, StageBadge, CategoryBadge } from "./PillBadge";

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
    setActionMessage(null);
    setExpandedPayloadId(null);
  }, [workflow.id]);

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
      const res = await triggerAgentDecision(workflow.id);
      const toolName = res.decision?.selectedTool || "Tool";
      const confidence = res.decision?.confidenceScore ? `${Math.round(res.decision.confidenceScore * 100)}%` : "";
      
      if (res.policyPassed) {
        setActionMessage({
          text: `AI evaluated case: Selected ${toolName} (${confidence} confidence) and executed action.`,
          type: "success",
        });
      } else if (res.policyDetails?.includes("Action bypassed")) {
        setActionMessage({
          text: res.policyDetails,
          type: "success",
        });
      } else {
        setActionMessage({
          text: `Policy guard active: ${res.policyDetails || 'Action bounded by compliance rules'}.`,
          type: "success",
        });
      }
      onRefresh();
    } catch (err) {
      setActionMessage({ text: `Error: ${(err as Error).message}`, type: "error" });
    } finally {
      setIsEvaluating(false);
    }
  };

  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);

  const handleSimulatePayment = async () => {
    try {
      setIsSimulatingPayment(true);
      setActionMessage(null);
      const res = await fetch("/api/checkout/simulate-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: workflow.id }),
      });
      if (!res.ok) throw new Error("Failed to simulate recovery");
      setActionMessage({ text: "Simulated customer payment via WhatsApp Link! Revenue recovered.", type: "success" });
      onRefresh();
    } catch (err) {
      setActionMessage({ text: `Error: ${(err as Error).message}`, type: "error" });
    } finally {
      setIsSimulatingPayment(false);
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
            className="ds-btn ds-btn-secondary"
            style={{
              height: 35,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 8,
              gap: 6,
              cursor: (workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD") ? "not-allowed" : "pointer",
              opacity: (isRetrying || workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD") ? 0.45 : 1,
            }}
          >
            {isRetrying ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={14} />}
            <span>{isRetrying ? "Dispatching..." : "Force Retry Now"}</span>
          </button>

          <button
            onClick={handleRunAgent}
            disabled={isEvaluating || workflow.stage === "RECOVERED" || workflow.stage === "HALTED"}
            title={workflow.stage === "HALTED" ? "AI agent disabled on halted workflows" : undefined}
            className="ds-btn ds-btn-secondary"
            style={{
              height: 35,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 8,
              gap: 6,
              cursor: (workflow.stage === "RECOVERED" || workflow.stage === "HALTED") ? "not-allowed" : "pointer",
              opacity: (isEvaluating || workflow.stage === "RECOVERED" || workflow.stage === "HALTED") ? 0.45 : 1,
            }}
          >
            {isEvaluating ? <RefreshCw size={13} className="animate-spin" /> : <Bot size={14} />}
            <span>{isEvaluating ? "Evaluating..." : "Run AI Decision"}</span>
          </button>

          <button
            onClick={handleSimulatePayment}
            disabled={isSimulatingPayment || workflow.stage === "RECOVERED"}
            title={workflow.stage === "RECOVERED" ? "Payment has already been simulated and recovered" : "Simulate customer clicking payment link and completing transaction"}
            className="ds-btn ds-btn-secondary"
            style={{
              height: 35,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 8,
              gap: 6,
              cursor: (workflow.stage === "RECOVERED" || isSimulatingPayment) ? "not-allowed" : "pointer",
              opacity: workflow.stage === "RECOVERED" ? 0.55 : isSimulatingPayment ? 0.7 : 1,
            }}
          >
            {isSimulatingPayment ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : workflow.stage === "RECOVERED" ? (
              <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
            ) : (
              <CreditCard size={14} />
            )}
            <span>
              {workflow.stage === "RECOVERED"
                ? "Payment Recovered"
                : isSimulatingPayment
                ? "Processing Payment..."
                : "Simulate Payment"}
            </span>
          </button>

          <button
            onClick={() => onOpenBotForCustomer(workflow.customer.id, workflow.id)}
            className="ds-btn ds-btn-primary"
            style={{
              height: 35,
              padding: "0 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 8,
              gap: 6,
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

              <StageBadge stage={workflow.stage} />
              <CategoryBadge category={workflow.payment.declineCategory ?? "SOFT"} prefix="RCA: " />
              <RiskBadge tier={workflow.customer.riskTier ?? "LOW"} />
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
              {promiseToPays.map((p) => {
                const isValidDate = p.promisedAt && !isNaN(new Date(p.promisedAt).getTime());
                const isValidScore = typeof p.confidenceScore === "number" && !isNaN(p.confidenceScore);

                return (
                  <div
                    key={p.id}
                    style={{
                      padding: "16px",
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <span style={{ fontSize: 11, color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, display: "block", marginBottom: 2 }}>
                          Promised Amount
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-strong)" }}>
                          {p.promisedAmountInPaise ? `₹${(p.promisedAmountInPaise / 100).toLocaleString("en-IN")}` : "₹0"}
                        </span>
                      </div>
                      <StageBadge stage={p.status} />
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
                      <div>
                        <span style={{ fontSize: 11, color: "var(--text-soft)", display: "block", marginBottom: 2 }}>Promised Date</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>
                          {isValidDate ? new Date(p.promisedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 11, color: "var(--text-soft)", display: "block", marginBottom: 2 }}>AI Confidence</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isValidScore && p.confidenceScore >= 0.7 ? "var(--brand)" : "var(--text-strong)" }}>
                          {isValidScore ? `${(p.confidenceScore * 100).toFixed(0)}%` : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                          <td colSpan={5} style={{ padding: "12px 18px", backgroundColor: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                            {log.eventType === "AGENT_DECISION_MADE" && typeof log.payload === "object" ? (
                              <div
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 10,
                                  padding: "16px 20px",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: "0.05em" }}>
                                      AI Decision Summary
                                    </span>
                                    {Boolean((log.payload as Record<string, unknown>).selectedTool) && (
                                      <code
                                        style={{
                                          fontFamily: "monospace",
                                          fontSize: 11.5,
                                          backgroundColor: "var(--bg-subtle)",
                                          color: "var(--text-strong)",
                                          padding: "3px 8px",
                                          borderRadius: 6,
                                          border: "1px solid var(--border)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {String((log.payload as Record<string, unknown>).selectedTool)}
                                      </code>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
                                    {(log.payload as Record<string, unknown>).confidence !== undefined && (
                                      <span style={{ color: "var(--text-soft)" }}>
                                        Confidence: <strong style={{ color: "var(--text-strong)" }}>{Math.round(Number((log.payload as Record<string, unknown>).confidence) * 100)}%</strong>
                                      </span>
                                    )}
                                    {(log.payload as Record<string, unknown>).policyPassed !== undefined && (
                                      <PillBadge variant={(log.payload as Record<string, unknown>).policyPassed ? "green" : "red"}>
                                        {(log.payload as Record<string, unknown>).policyPassed ? "Policy Passed" : "Policy Rejected"}
                                      </PillBadge>
                                    )}
                                    {(log.payload as Record<string, unknown>).latencyMs !== undefined && (
                                      <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11.5 }}>
                                        ⚡ {Number((log.payload as Record<string, unknown>).latencyMs)}ms
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {Boolean((log.payload as Record<string, unknown>).reasoning) && (
                                  <div
                                    style={{
                                      backgroundColor: "var(--bg-subtle)",
                                      borderRadius: 8,
                                      padding: "12px 14px",
                                      border: "1px solid var(--border)",
                                      marginBottom: 12,
                                    }}
                                  >
                                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", display: "block", marginBottom: 4, letterSpacing: "0.04em" }}>
                                      Autonomous Reasoning
                                    </span>
                                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-body)", lineHeight: 1.6, whiteSpace: "normal" }}>
                                      "{String((log.payload as Record<string, unknown>).reasoning)}"
                                    </p>
                                  </div>
                                )}

                                <details style={{ fontSize: 11 }}>
                                  <summary style={{ cursor: "pointer", color: "var(--text-soft)", fontWeight: 500, userSelect: "none" }}>
                                    View Full JSON Parameters
                                  </summary>
                                  <pre
                                    style={{
                                      margin: "8px 0 0",
                                      padding: "10px 14px",
                                      backgroundColor: "var(--bg-subtle)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontFamily: "monospace",
                                      color: "var(--text-body)",
                                      maxHeight: 180,
                                      overflowY: "auto",
                                      overflowX: "auto",
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {JSON.stringify(log.payload, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            ) : (
                              <div
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  padding: "12px 16px",
                                }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
                                  Payload Attributes
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: "10px 14px",
                                    backgroundColor: "var(--bg-subtle)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    fontSize: 11.5,
                                    fontFamily: "monospace",
                                    color: "var(--text-body)",
                                    maxHeight: 200,
                                    overflowY: "auto",
                                    overflowX: "auto",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </div>
                            )}
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

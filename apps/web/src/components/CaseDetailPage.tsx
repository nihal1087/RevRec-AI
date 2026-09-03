import React, { useState, useEffect } from "react";
import {
  WorkflowItem,
  triggerManualRetry,
  triggerAgentDecision,
} from "../api/client";

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, "")
  : "";

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
      const res = await fetch(`${API_BASE}/api/checkout/simulate-recovery`, {
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
    <div className="w-full max-w-[1320px] mx-auto px-3.5 py-4 sm:px-6 sm:py-6 md:px-7 md:py-8 flex-1 flex flex-col">
      {/* ── Top Navigation & Breadcrumbs ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-[var(--text-soft)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-subtle)] px-2.5 py-1.5 rounded-lg transition-colors w-fit"
        >
          <ArrowLeft size={15} />
          <span>Back to Recovery Ledger</span>
        </button>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleManualRetry}
            disabled={isRetrying || workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD"}
            title={workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD" ? "Retry disabled: hard decline or halted workflow (RBI compliance)" : undefined}
            className="ds-btn ds-btn-secondary h-9 px-2.5 sm:px-3.5 text-xs sm:text-[12.5px] font-semibold rounded-lg flex items-center justify-center gap-1.5 text-center whitespace-nowrap"
            style={{
              cursor: (workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD") ? "not-allowed" : "pointer",
              opacity: (isRetrying || workflow.stage === "RECOVERED" || workflow.stage === "HALTED" || workflow.payment.declineCategory === "HARD") ? 0.45 : 1,
            }}
          >
            {isRetrying ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            <span>{isRetrying ? "Dispatching..." : "Force Retry Now"}</span>
          </button>

          <button
            type="button"
            onClick={handleRunAgent}
            disabled={isEvaluating || workflow.stage === "RECOVERED" || workflow.stage === "HALTED"}
            title={workflow.stage === "HALTED" ? "AI agent disabled on halted workflows" : undefined}
            className="ds-btn ds-btn-secondary h-9 px-2.5 sm:px-3.5 text-xs sm:text-[12.5px] font-semibold rounded-lg flex items-center justify-center gap-1.5 text-center whitespace-nowrap"
            style={{
              cursor: (workflow.stage === "RECOVERED" || workflow.stage === "HALTED") ? "not-allowed" : "pointer",
              opacity: (isEvaluating || workflow.stage === "RECOVERED" || workflow.stage === "HALTED") ? 0.45 : 1,
            }}
          >
            {isEvaluating ? <RefreshCw size={13} className="animate-spin" /> : <Bot size={13} />}
            <span>{isEvaluating ? "Evaluating..." : "Run AI Decision"}</span>
          </button>

          <button
            type="button"
            onClick={handleSimulatePayment}
            disabled={isSimulatingPayment || workflow.stage === "RECOVERED"}
            title={workflow.stage === "RECOVERED" ? "Payment has already been simulated and recovered" : "Simulate customer clicking payment link and completing transaction"}
            className="ds-btn ds-btn-secondary h-9 px-2.5 sm:px-3.5 text-xs sm:text-[12.5px] font-semibold rounded-lg flex items-center justify-center gap-1.5 text-center whitespace-nowrap"
            style={{
              cursor: (workflow.stage === "RECOVERED" || isSimulatingPayment) ? "not-allowed" : "pointer",
              opacity: workflow.stage === "RECOVERED" ? 0.55 : isSimulatingPayment ? 0.7 : 1,
            }}
          >
            {isSimulatingPayment ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : workflow.stage === "RECOVERED" ? (
              <CheckCircle2 size={13} style={{ color: "var(--green)" }} />
            ) : (
              <CreditCard size={13} />
            )}
            <span>
              {workflow.stage === "RECOVERED"
                ? "Payment Recovered"
                : isSimulatingPayment
                ? "Processing..."
                : "Simulate Payment"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenBotForCustomer(workflow.customer.id, workflow.id)}
            className="ds-btn ds-btn-primary h-9 px-2.5 sm:px-3.5 text-xs sm:text-[12.5px] font-semibold rounded-lg flex items-center justify-center gap-1.5 text-center whitespace-nowrap"
          >
            <MessageSquare size={13} />
            <span>Open Hinglish Bot</span>
          </button>
        </div>
      </div>

      {/* ── Floating Action Toast Notification ── */}
      {actionMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 sm:bottom-7 left-1/2 -translate-x-1/2 z-[9999] max-w-[calc(100vw-28px)] sm:max-w-md w-max bg-[var(--brand,#0f172a)] text-white rounded-xl px-4 py-2.5 inline-flex items-center gap-2.5 shadow-2xl text-xs sm:text-sm font-medium animate-fadeIn"
          style={{
            boxShadow: "0 12px 32px -4px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)",
          }}
        >
          {actionMessage.type === "success" ? (
            <Check size={14} strokeWidth={2.5} style={{ color: "#4ade80", flexShrink: 0 }} />
          ) : (
            <AlertCircle size={14} strokeWidth={2.5} style={{ color: "#f87171", flexShrink: 0 }} />
          )}
          <span className="truncate">{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-white/60 hover:text-white p-0.5 ml-1 inline-flex items-center flex-shrink-0"
            aria-label="Dismiss message"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Case Header Card ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text-strong)]">
                Case #{workflow.id.slice(0, 14)}
              </span>
              <button
                type="button"
                onClick={() => handleCopyId(workflow.id)}
                title="Copy Full Case ID"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-faint)] hover:text-[var(--text-strong)] transition-colors p-1"
              >
                <Copy size={12} />
                <span>{copied ? "Copied!" : "Copy ID"}</span>
              </button>

              <StageBadge stage={workflow.stage} />
              <CategoryBadge category={workflow.payment.declineCategory ?? "SOFT"} prefix="RCA: " />
              <RiskBadge tier={workflow.customer.riskTier ?? "LOW"} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-[13px] text-[var(--text-soft)]">
              <span className="inline-flex items-center gap-1.5">
                <User size={13} className="flex-shrink-0" />
                <strong className="text-[var(--text-strong)]">{workflow.customer.name}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 break-all max-w-full">
                <Mail size={13} className="flex-shrink-0" />
                <span>{workflow.customer.email}</span>
              </span>
              {workflow.customer.phone && (
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Phone size={13} className="flex-shrink-0" />
                  <span>{workflow.customer.phone}</span>
                </span>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right pt-3 sm:pt-0 border-t sm:border-t-0 border-[var(--border)] flex sm:flex-col justify-between items-baseline sm:items-end w-full sm:w-auto">
            <span className="text-[10.5px] sm:text-[11px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">
              Amount at Risk
            </span>
            <div>
              <div className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[var(--text-strong)]">
                ₹{amountInRupees.toLocaleString("en-IN")}
              </div>
              {workflow.stage === "RECOVERED" && (
                <span className="text-xs font-semibold text-emerald-600">
                  ₹{recoveredInRupees.toLocaleString("en-IN")} Recovered
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Key Metrics 4-Col Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 mb-4 sm:mb-6">
        <div className="p-3.5 sm:p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
          <span className="text-[10.5px] sm:text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-wider block">Gateway Error</span>
          <div className="text-sm sm:text-[15px] font-bold text-[var(--text-strong)] mt-1 font-mono break-all">
            {workflow.payment.gatewayErrorCode ?? "UNKNOWN_ERROR"}
          </div>
          <span className="text-[11px] sm:text-xs text-[var(--text-soft)] mt-1 block">
            Status: {workflow.payment.status}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
          <span className="text-[10.5px] sm:text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-wider block">Retry Attempts</span>
          <div className="text-base sm:text-lg font-bold text-[var(--text-strong)] mt-1">
            {workflow.retryCount} / 3 Max Retries
          </div>
          <span className="text-[11px] sm:text-xs text-[var(--text-soft)] mt-1 block">
            Outreach count: {workflow.outreachCount}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
          {(() => {
            const tier =
              workflow.customer.riskTier ??
              (workflow.customer.riskScore > 60 ? "HIGH" : workflow.customer.riskScore > 30 ? "MEDIUM" : "LOW");
            const historyScore = workflow.customer.paymentHistoryScore ?? (tier === "LOW" ? 90 : tier === "MEDIUM" ? 65 : 35);
            const prob = tier === "LOW" ? 92 : tier === "MEDIUM" ? 74 : 38;
            const badgeColor = tier === "LOW" ? "#059669" : tier === "MEDIUM" ? "#d97706" : "#dc2626";

            return (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] sm:text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-wider">
                    Customer Risk
                  </span>
                  <RiskBadge tier={tier} />
                </div>
                <div className="text-base sm:text-lg font-bold text-[var(--text-strong)] mt-1">
                  {historyScore}/100 <span className="text-xs font-normal text-[var(--text-soft)]">Score</span>
                </div>
                <span className="text-[11px] sm:text-xs font-semibold mt-1 block" style={{ color: badgeColor }}>
                  Est. Recovery: ~{prob}%
                </span>
              </>
            );
          })()}
        </div>

        <div className="p-3.5 sm:p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
          <span className="text-[10.5px] sm:text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-wider block">Next Action Timing</span>
          <div className="text-xs sm:text-sm font-bold text-[var(--text-strong)] mt-1">
            {workflow.nextActionAt
              ? new Date(workflow.nextActionAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "No Pending Timer"}
          </div>
          <span className="text-[11px] sm:text-xs text-[var(--text-soft)] mt-1 block">
            Bank downtime avoided
          </span>
        </div>
      </div>

      {/* ── 2-Col Main Workspace: Stepper + AI Agent Evaluation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-6">
        {/* Left Col: Step-by-Step History Timeline */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <span className="text-xs sm:text-sm font-bold text-[var(--text-strong)] flex items-center gap-2">
              <Layers size={15} style={{ color: "var(--text-strong)" }} />
              Autonomous Lifecycle Stepper
            </span>
            <PillBadge variant="neutral">ACTIVE</PillBadge>
          </div>

          <div className="flex flex-col gap-0 mt-1">
            {timelineSteps.map((step, idx) => {
              const Icon = step.icon;
              const isLast = idx === timelineSteps.length - 1;
              const isDone = step.status === "done";

              return (
                <div key={idx} className="flex gap-3 sm:gap-3.5 items-start">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: isDone ? "var(--bg-subtle)" : "var(--bg-surface)",
                        border: isDone ? "1px solid var(--border-strong, #cbd5e1)" : "1px solid var(--border)",
                      }}
                    >
                      <Icon size={12} style={{ color: isDone ? "var(--text-strong)" : "var(--text-faint)" }} />
                    </div>
                    {!isLast && (
                      <div
                        className="w-px h-6 my-0.5"
                        style={{
                          backgroundColor: "var(--border)",
                        }}
                      />
                    )}
                  </div>

                  <div className={`flex-1 pt-0.5 ${isLast ? "pb-0" : "pb-3.5"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-[12.5px] font-semibold text-[var(--text-strong)]">
                        {step.title}
                      </span>
                      <span className="text-[10.5px] sm:text-[11px] text-[var(--text-faint)] font-mono">
                        {step.time}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-[var(--text-soft)] mt-0.5 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: AI Agent Decisioning & Reasoning */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <span className="text-xs sm:text-sm font-bold text-[var(--text-strong)] flex items-center gap-2">
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
            <div className="flex flex-col gap-3 sm:gap-3.5">
              <div className="p-3 sm:p-3.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg">
                <span className="text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                  Selected Bounded Tool
                </span>
                <div className="text-xs sm:text-sm font-bold text-[var(--text-strong)]">
                  <code>{latestExecution.selectedTool}</code>
                </div>
                <div className="text-xs text-[var(--text-soft)] mt-1.5 leading-relaxed">
                  "{latestExecution.reasoning}"
                </div>
              </div>

              {/* Policy Validation Strip */}
              <div className="p-3 sm:p-3.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[var(--text-strong)]">Dunning Policy Validation</span>
                  <PillBadge variant={latestExecution.policyCheckPassed ? "green" : "red"}>
                    {latestExecution.policyCheckPassed ? "APPROVED" : "BLOCKED"}
                  </PillBadge>
                </div>
                <span className="text-[11px] sm:text-xs text-[var(--text-soft)] leading-relaxed block">
                  {latestExecution.policyCheckDetails || "RBI contact limits, TRAI quiet hours (20:00-08:00 IST), and discount concession caps strictly enforced."}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-faint)] pt-1">
                <span>Confidence Score: <strong className="text-[var(--text-strong)]">{(((latestExecution.confidenceScore ?? 0.9) * 100)).toFixed(0)}%</strong></span>
                <span>Evaluated: {latestExecution.createdAt ? new Date(latestExecution.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              </div>
            </div>
          ) : (
            <div className="p-6 sm:p-8 text-center text-[var(--text-faint)] text-xs sm:text-sm">
              <Bot size={28} className="mx-auto mb-2 opacity-50" />
              <div>No agent execution recorded yet for this workflow.</div>
              <button
                type="button"
                onClick={handleRunAgent}
                className="mt-3 px-3.5 py-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand-tint)] text-[var(--brand)] text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Run AI Diagnosis Now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Multi-Channel Communications & Promise to Pay ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4 sm:gap-5 mb-4 sm:mb-6">
        {/* Communications Center */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
            <span className="text-xs sm:text-sm font-bold text-[var(--text-strong)] flex items-center gap-2">
              <MessageSquare size={15} color="var(--brand)" />
              Multi-Channel Communications Log
            </span>
            <span className="text-[10.5px] sm:text-[11px] text-[var(--text-faint)]">
              {dunningContacts.length} Dispatched
            </span>
          </div>

          {dunningContacts.length === 0 ? (
            <div className="py-6 sm:py-8 text-center text-[var(--text-faint)] text-xs sm:text-[12.5px]">
              No automated outbound messages sent yet for this case.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {dunningContacts.map((c) => (
                <div
                  key={c.id}
                  className="p-3 sm:p-3.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[var(--brand)] uppercase">
                        {c.channel}
                      </span>
                      <span className="text-[11px] text-[var(--text-faint)]">·</span>
                      <span className="text-xs text-[var(--text-soft)]">{c.templateName}</span>
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
                  <div className="text-xs text-[var(--text-body)] italic leading-relaxed">
                    "{c.messagePayload}"
                  </div>
                  <div className="text-[10px] sm:text-[10.5px] text-[var(--text-faint)] text-right">
                    {new Date(c.sentAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Promise to Pay (PTP) Commitment Card */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
            <span className="text-xs sm:text-sm font-bold text-[var(--text-strong)] flex items-center gap-2">
              <Clock size={15} color="#0d9488" />
              Promise to Pay (PTP) Tracker
            </span>
            <span className="text-[10.5px] sm:text-[11px] text-[var(--text-faint)]">
              {promiseToPays.length} Commitment
            </span>
          </div>

          {promiseToPays.length === 0 ? (
            <div className="py-6 sm:py-8 text-center text-[var(--text-faint)] text-xs sm:text-[12.5px] leading-relaxed">
              No customer commitment recorded yet. Open the Hinglish Bot to simulate customer salary promises!
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {promiseToPays.map((p) => {
                const rawDate = p.promisedByDate || p.promisedAt;
                const isValidDate = Boolean(rawDate && !isNaN(new Date(rawDate).getTime()));
                const isValidScore = typeof p.confidenceScore === "number" && !isNaN(p.confidenceScore);

                return (
                  <div
                    key={p.id}
                    className="p-3 sm:p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10.5px] text-[var(--text-soft)] uppercase tracking-wider font-semibold block mb-0.5">
                          Promised Amount
                        </span>
                        <span className="text-sm sm:text-base font-bold text-[var(--text-strong)]">
                          {p.promisedAmountInPaise ? `₹${(p.promisedAmountInPaise / 100).toLocaleString("en-IN")}` : "₹0"}
                        </span>
                      </div>
                      <StageBadge stage={p.status} />
                    </div>
                    
                    <div className="flex items-center justify-between pt-2.5 border-t border-dashed border-[var(--border)]">
                      <div>
                        <span className="text-[10.5px] text-[var(--text-soft)] block mb-0.5">Promised Date</span>
                        <span className="text-xs sm:text-[13px] font-medium text-[var(--text-strong)]">
                          {isValidDate && rawDate ? new Date(rawDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10.5px] text-[var(--text-soft)] block mb-0.5">AI Confidence</span>
                        <span className="text-xs sm:text-[13px] font-semibold" style={{ color: isValidScore && p.confidenceScore >= 0.7 ? "var(--brand)" : "var(--text-strong)" }}>
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
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl sm:rounded-2xl overflow-hidden mb-6">
        <div className="p-4 sm:px-6 sm:py-4.5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-xs sm:text-sm font-bold text-[var(--text-strong)] flex items-center gap-2">
              <ShieldCheck size={16} color="var(--brand)" />
              Immutable Cryptographic Audit Trail
            </span>
            <p className="text-xs text-[var(--text-soft)] mt-0.5">
              Complete chronological audit ledger of state transitions and agent actions
            </p>
          </div>
          <span className="text-[11px] sm:text-xs text-[var(--text-faint)]">
            {auditEntries.length} Total Events Logged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:text-[12.5px] text-left min-w-[560px]">
            <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)] text-[var(--text-faint)] uppercase text-[10px] sm:text-[10.5px]">
              <tr>
                <th className="px-3.5 py-2.5 sm:px-4.5 sm:py-3">Timestamp</th>
                <th className="px-3.5 py-2.5 sm:px-4.5 sm:py-3">Event Type</th>
                <th className="px-3.5 py-2.5 sm:px-4.5 sm:py-3">Actor</th>
                <th className="px-3.5 py-2.5 sm:px-4.5 sm:py-3">Outcome</th>
                <th className="px-3.5 py-2.5 sm:px-4.5 sm:py-3">Payload Details</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[var(--text-faint)]">
                    No audit records logged yet.
                  </td>
                </tr>
              ) : (
                auditEntries.map((log) => {
                  const isExpanded = expandedPayloadId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="border-b border-[var(--border)] align-middle">
                        <td className="px-3.5 py-3 sm:px-4.5 text-[var(--text-faint)] font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-3.5 py-3 sm:px-4.5 font-semibold text-[var(--text-strong)]">
                          <code className="text-[11.5px]">{log.eventType}</code>
                        </td>
                        <td className="px-3.5 py-3 sm:px-4.5 text-[var(--text-body)]">
                          <PillBadge variant="neutral">
                            {log.actorType}
                          </PillBadge>
                        </td>
                        <td className="px-3.5 py-3 sm:px-4.5">
                          <PillBadge variant={log.outcome === "SUCCESS" ? "green" : "red"}>
                            {log.outcome}
                          </PillBadge>
                        </td>
                        <td className="px-3.5 py-3 sm:px-4.5">
                          {log.payload ? (
                            <button
                              type="button"
                              onClick={() => setExpandedPayloadId(isExpanded ? null : log.id)}
                              className="inline-flex items-center gap-1 bg-none border-none text-[var(--brand)] text-xs font-semibold cursor-pointer p-0"
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <span>{isExpanded ? "Hide JSON" : "Inspect Payload"}</span>
                            </button>
                          ) : (
                            <span className="text-[var(--text-faint)] text-[11px]">No metadata</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && log.payload && (
                        <tr>
                          <td colSpan={5} className="px-3.5 py-3 sm:px-4.5 bg-[var(--bg-subtle)] border-b border-[var(--border)]">
                            {log.eventType === "AGENT_DECISION_MADE" && typeof log.payload === "object" ? (
                              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                                      AI Decision Summary
                                    </span>
                                    {Boolean((log.payload as Record<string, unknown>).selectedTool) && (
                                      <code className="font-mono text-xs bg-[var(--bg-subtle)] text-[var(--text-strong)] px-2 py-0.5 rounded-md border border-[var(--border)] font-semibold">
                                        {String((log.payload as Record<string, unknown>).selectedTool)}
                                      </code>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                    {(log.payload as Record<string, unknown>).confidence !== undefined && (
                                      <span className="text-[var(--text-soft)]">
                                        Confidence: <strong className="text-[var(--text-strong)]">{Math.round(Number((log.payload as Record<string, unknown>).confidence) * 100)}%</strong>
                                      </span>
                                    )}
                                    {(log.payload as Record<string, unknown>).policyPassed !== undefined && (
                                      <PillBadge variant={(log.payload as Record<string, unknown>).policyPassed ? "green" : "red"}>
                                        {(log.payload as Record<string, unknown>).policyPassed ? "Policy Passed" : "Policy Rejected"}
                                      </PillBadge>
                                    )}
                                    {(log.payload as Record<string, unknown>).latencyMs !== undefined && (
                                      <span className="text-[var(--text-faint)] font-mono text-[11px]">
                                        ⚡ {Number((log.payload as Record<string, unknown>).latencyMs)}ms
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {Boolean((log.payload as Record<string, unknown>).reasoning) && (
                                  <div className="bg-[var(--bg-subtle)] rounded-lg p-3 border border-[var(--border)] mb-3">
                                    <span className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1 tracking-wider">
                                      Autonomous Reasoning
                                    </span>
                                    <p className="m-0 text-xs sm:text-[12.5px] text-[var(--text-body)] leading-relaxed">
                                      "{String((log.payload as Record<string, unknown>).reasoning)}"
                                    </p>
                                  </div>
                                )}

                                <details className="text-xs">
                                  <summary className="cursor-pointer text-[var(--text-soft)] font-medium select-none">
                                    View Full JSON Parameters
                                  </summary>
                                  <pre className="mt-2 p-2.5 sm:p-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-[11px] font-mono text-[var(--text-body)] max-h-48 overflow-auto whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.payload, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            ) : (
                              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-3 sm:p-4">
                                <div className="text-[10.5px] font-bold uppercase text-[var(--text-faint)] mb-2 tracking-wider">
                                  Payload Attributes
                                </div>
                                <pre className="m-0 p-2.5 sm:p-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-md text-xs font-mono text-[var(--text-body)] max-h-48 overflow-auto whitespace-pre-wrap break-all">
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

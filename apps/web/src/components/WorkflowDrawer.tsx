import React, { useState, useEffect } from "react";
import { WorkflowItem, triggerManualRetry, triggerAgentDecision, fetchWorkflowDetails } from "../api/client";
import { X, Zap, Bot, PhoneCall, ArrowUpRight, CheckCircle2, CreditCard, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, "")
  : "";

// WorkflowItem fields (from client.ts):
//   auditEntries (not auditLogs), agentExecutions[].selectedTool, .estimatedCostInPaise
// WorkflowItem does NOT have a recoveryMethod field — infer from stage

interface WorkflowDrawerProps {
  workflow: WorkflowItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenBotForCustomer: (customerId: string, workflowId: string) => void;
  onOpenFullCase?: (workflow: WorkflowItem) => void;
}

import { RiskBadge, StageBadge as StagePill, CategoryBadge as CategoryPill } from "./PillBadge";
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-b-0">
      <span className="ds-label" style={{ fontSize: 11, margin: 0 }}>{label}</span>
      <div className="text-right flex flex-col items-end justify-center">{children}</div>
    </div>
  );
}

export function WorkflowDrawer({
  workflow: rawWorkflow,
  onClose,
  onRefresh,
  onOpenBotForCustomer,
  onOpenFullCase,
}: WorkflowDrawerProps): React.JSX.Element | null {
  const [internalWorkflow, setInternalWorkflow] = useState<WorkflowItem | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // ⚠️ Hooks must be called unconditionally — Rules of Hooks
  const [isRetrying, setIsRetrying] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Handle prop changes for entrance/exit animations
  useEffect(() => {
    if (rawWorkflow) {
      setInternalWorkflow(rawWorkflow);
      setActionMessage(null);
      setIsClosing(false);

      let isMounted = true;
      fetchWorkflowDetails(rawWorkflow.id)
        .then((full) => {
          if (isMounted) setInternalWorkflow(full);
        })
        .catch(() => {});

      return () => {
        isMounted = false;
      };
    } else {
      // rawWorkflow is null, meaning we should close.
      // Only start the closing process if we actually have an internal workflow to hide.
      if (internalWorkflow) {
        setIsClosing(true);
        const timer = setTimeout(() => {
          setInternalWorkflow(null);
          setActionMessage(null);
          setIsClosing(false);
        }, 200);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [rawWorkflow?.id]);

  // Use the internal state for rendering
  const workflow = internalWorkflow;

  // M28 fix: close drawer on Escape key for keyboard accessibility
  useEffect(() => {
    if (!workflow) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [workflow, onClose]);

  if (!workflow) return null;

  const handleManualRetry = async () => {
    try {
      setIsRetrying(true);
      setActionMessage(null);
      await triggerManualRetry(workflow.id);
      const updated = await fetchWorkflowDetails(workflow.id);
      setInternalWorkflow(updated);
      setActionMessage("Immediate retry job dispatched to BullMQ queue.");
      onRefresh();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRunAgent = async () => {
    try {
      setIsEvaluating(true);
      setActionMessage(null);
      const res = await triggerAgentDecision(workflow.id);
      const updated = await fetchWorkflowDetails(workflow.id);
      setInternalWorkflow(updated);

      const toolName = res.decision?.selectedTool || "Tool";
      const confidence = res.decision?.confidenceScore ? `${Math.round(res.decision.confidenceScore * 100)}%` : "";
      
      if (res.policyPassed) {
        setActionMessage(`AI executed: ${toolName} (${confidence} confidence)`);
      } else if (res.policyDetails?.includes("Action bypassed")) {
        setActionMessage(res.policyDetails);
      } else {
        setActionMessage(`Policy guard active: ${res.policyDetails || 'Action bounded by compliance rules'}`);
      }
      onRefresh();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSimulatePayment = async () => {
    try {
      setIsSimulating(true);
      setActionMessage(null);
      const res = await fetch(`${API_BASE}/api/checkout/simulate-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: workflow.id }),
      });
      if (!res.ok) throw new Error("Failed to simulate recovery");
      const updated = await fetchWorkflowDetails(workflow.id);
      setInternalWorkflow(updated);
      setActionMessage("Simulated customer payment via WhatsApp Link! Revenue recovered.");
      onRefresh();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const latestExecution = workflow.agentExecutions?.[0];

  return (
    <>
      {/* Overlay */}
      <div className={`ds-overlay ${isClosing ? "ds-closing" : ""}`} onClick={onClose} />

      {/* Sheet */}
      <div
        className={`ds-sheet ${isClosing ? "ds-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Workflow details — ${workflow.id}`}
      >
        {/* ── Sheet header ──────────────────────────────── */}
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
            padding: "16px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "var(--text-faint)",
                  background: "var(--bg-subtle)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  flexShrink: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 130,
                }}
                title={workflow.id}
              >
                {workflow.id}
              </span>
              <div style={{ flexShrink: 0 }}>
                <StagePill stage={workflow.stage} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {onOpenFullCase && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenFullCase(workflow);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-subtle)",
                    color: "var(--brand)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    height: 28,
                    lineHeight: 1,
                  }}
                  title="Open Full Case Details Page"
                >
                  <span>Full View</span>
                  <ArrowUpRight size={12} style={{ flexShrink: 0 }} />
                </button>
              )}
              <button
                type="button"
                className="ds-btn ds-btn-ghost ds-btn-icon"
                onClick={onClose}
                style={{ flexShrink: 0, width: 28, height: 28, padding: 0 }}
                aria-label="Close drawer"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              color: "var(--text-strong)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {workflow.customer.name}
          </h2>
        </div>

        {/* ── Sheet body ────────────────────────────────── */}
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Section 1 — Payment Details */}
          <div>
            <span className="ds-label" style={{ display: "block", marginBottom: 10 }}>Payment Details</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  background: "var(--bg-subtle)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span className="ds-label" style={{ fontSize: 10 }}>Amount at Risk</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "var(--text-strong)",
                  }}
                >
                  ₹{(workflow.amountAtRiskInPaise / 100).toLocaleString("en-IN")}
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-subtle)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span className="ds-label" style={{ fontSize: 10 }}>Recovery Method</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-body)", marginTop: 2 }}>
                  {workflow.stage.replace(/_/g, " ")}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <InfoRow label="Gateway Error Code">
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "2px 8px",
                    color: "var(--text-body)",
                  }}
                >
                  {workflow.payment.gatewayErrorCode ?? "UNSPECIFIED"}
                </span>
              </InfoRow>
              <InfoRow label="Decline Category">
                <CategoryPill category={workflow.payment.declineCategory} />
              </InfoRow>
              <InfoRow label="Attempts & Outreach">
                <div style={{ display: "flex", flexDirection: "column", gap: 2, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>
                    {workflow.retryCount} {workflow.retryCount === 1 ? "retry" : "retries"}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                    {workflow.outreachCount} {workflow.outreachCount === 1 ? "outreach contact" : "outreach contacts"}
                  </span>
                </div>
              </InfoRow>
            </div>
          </div>

          <div className="ds-divider" />

          {/* Section 2 — Customer Profile */}
          <div>
            <span className="ds-label" style={{ display: "block", marginBottom: 12 }}>Customer Profile</span>
            <div className="flex flex-col">
              <InfoRow label="Name">
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>
                  {workflow.customer.name}
                </span>
              </InfoRow>
              <InfoRow label="Email">
                <span style={{ fontSize: 13, color: "var(--text-body)" }}>
                  {workflow.customer.email}
                </span>
              </InfoRow>
              {workflow.customer.phone && (
                <InfoRow label="Phone">
                  <span style={{ fontSize: 13, color: "var(--text-body)", fontFamily: "monospace" }}>
                    {workflow.customer.phone}
                  </span>
                </InfoRow>
              )}
              <InfoRow label="Risk Tier">
                <RiskBadge
                  tier={
                    workflow.customer.riskTier ??
                    (workflow.customer.riskScore > 60 ? "HIGH" : workflow.customer.riskScore > 30 ? "MEDIUM" : "LOW")
                  }
                />
              </InfoRow>
              <InfoRow label="History Score">
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>
                  {workflow.customer.paymentHistoryScore ?? 85}
                  <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>/100</span>
                </span>
              </InfoRow>
            </div>
          </div>

          <div className="ds-divider" />

          {/* Section 3 — Actions */}
          <div>
            <span className="ds-label" style={{ display: "block", marginBottom: 12 }}>Actions</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                className="ds-btn ds-btn-primary"
                onClick={handleManualRetry}
                disabled={isRetrying}
                style={{ fontSize: 13, height: 36, padding: "0 14px", borderRadius: 8, gap: 6 }}
              >
                {isRetrying ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                <span>{isRetrying ? "Retrying…" : "Retry Now"}</span>
              </button>
              <button
                className="ds-btn ds-btn-secondary"
                onClick={handleRunAgent}
                disabled={isEvaluating}
                style={{ fontSize: 13, height: 36, padding: "0 14px", borderRadius: 8, gap: 6 }}
              >
                {isEvaluating ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={14} />}
                <span>{isEvaluating ? "Evaluating…" : "Run AI Agent"}</span>
              </button>
              <button
                className="ds-btn ds-btn-ghost"
                onClick={() => onOpenBotForCustomer(workflow.customer.id, workflow.id)}
                style={{ fontSize: 13, height: 36, padding: "0 14px", borderRadius: 8, gap: 6 }}
              >
                <PhoneCall size={14} />
                <span>Open Bot</span>
              </button>
              <button
                className="ds-btn ds-btn-secondary"
                onClick={handleSimulatePayment}
                disabled={isSimulating || workflow.stage === "RECOVERED"}
                title={workflow.stage === "RECOVERED" ? "Payment has already been simulated and recovered" : "Simulate customer completing payment via link"}
                style={{
                  fontSize: 13,
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 8,
                  gap: 6,
                  color: workflow.stage === "RECOVERED" ? "var(--text-faint)" : "var(--text-strong)",
                  backgroundColor: workflow.stage === "RECOVERED" ? "var(--bg-subtle)" : "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  cursor: workflow.stage === "RECOVERED" || isSimulating ? "not-allowed" : "pointer",
                  opacity: (workflow.stage === "RECOVERED" || isSimulating) ? 0.5 : 1,
                  boxShadow: workflow.stage === "RECOVERED" ? "none" : "var(--shadow-xs)",
                }}
              >
                {isSimulating ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : workflow.stage === "RECOVERED" ? (
                  <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
                ) : (
                  <CreditCard size={14} />
                )}
                <span>
                  {workflow.stage === "RECOVERED"
                    ? "Payment Recovered"
                    : isSimulating
                    ? "Processing..."
                    : "Simulate Payment"}
                </span>
              </button>
            </div>

            {actionMessage && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: actionMessage.startsWith("Error") ? "var(--red-text)" : "var(--text-body)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>{actionMessage}</span>
                <button
                  onClick={() => setActionMessage(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", padding: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

          {latestExecution && (
            <>
              <div className="ds-divider" />
              <div>
                <span className="ds-label" style={{ display: "block", marginBottom: 12 }}>Last AI Execution</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 11,
                        background: "var(--brand-tint)",
                        border: "1px solid var(--brand-border)",
                        color: "var(--blue-text)",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontWeight: 500,
                      }}
                    >
                      {latestExecution.selectedTool}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      Confidence: {(((latestExecution.confidenceScore ?? 0) * 100).toFixed(0))}%
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      {latestExecution.llmLatencyMs}ms
                    </span>
                  </div>
                  {latestExecution.reasoning && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-body)",
                        lineHeight: 1.6,
                        margin: 0,
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {latestExecution.reasoning}
                    </p>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>
                    ₹{((latestExecution.estimatedCostInPaise ?? 0) / 100).toFixed(4)} LLM cost
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Section 5 — Audit Trail */}
          {workflow.auditEntries && workflow.auditEntries.length > 0 && (
            <>
              <div className="ds-divider" />
              <div>
                <span className="ds-label" style={{ display: "block", marginBottom: 12 }}>Audit Trail</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {workflow.auditEntries.slice(0, 6).map((log) => (
                    <div
                      key={log.id}
                      style={{
                        paddingLeft: 12,
                        borderLeft: "2px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            color: "var(--text-faint)",
                          }}
                        >
                          {new Date(log.createdAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "1px 6px",
                            color: "var(--text-soft)",
                          }}
                        >
                          {log.eventType}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-body)" }}>
                        {log.actorId ?? "system"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}


        </div>
      </div>
    </>
  );
}

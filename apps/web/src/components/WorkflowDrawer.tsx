import React, { useState, useEffect } from "react";
import { WorkflowItem, triggerManualRetry, triggerAgentDecision } from "../api/client";
import { X, Zap, Bot, PhoneCall, ArrowUpRight } from "lucide-react";
import { PillBadge, RiskBadge, PillVariant } from "./PillBadge";

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

function StagePill({ stage }: { stage: string }) {
  const map: Record<string, PillVariant> = {
    RECOVERED: "green",
    RETRYING: "blue",
    OUTREACH_SENT: "purple",
    PROMISE_RECEIVED: "teal",
    HALTED: "neutral",
    ESCALATED: "red",
  };
  return (
    <PillBadge variant={map[stage] ?? "neutral"}>
      {stage.replace(/_/g, " ")}
    </PillBadge>
  );
}

function CategoryPill({ category }: { category: string | null }) {
  const map: Record<string, PillVariant> = {
    SOFT: "green",
    HARD: "red",
    NETWORK: "blue",
    INTENT_DROP: "amber",
    MANDATE_FAILURE: "purple",
  };
  return (
    <PillBadge variant={category ? map[category] ?? "neutral" : "neutral"}>
      {category ?? "UNKNOWN"}
    </PillBadge>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="ds-label" style={{ fontSize: 11 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function WorkflowDrawer({
  workflow,
  onClose,
  onRefresh,
  onOpenBotForCustomer,
  onOpenFullCase,
}: WorkflowDrawerProps): React.JSX.Element | null {
  // ⚠️ Hooks must be called unconditionally — Rules of Hooks
  const [isRetrying, setIsRetrying] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
      await triggerAgentDecision(workflow.id);
      setActionMessage("Bounded AI Agent evaluated the case and executed a compliant tool.");
      onRefresh();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const latestExecution = workflow.agentExecutions?.[0];

  return (
    <>
      {/* Overlay */}
      <div className="ds-overlay" onClick={onClose} />

      {/* Sheet */}
      <div
        className="ds-sheet"
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
            padding: "20px 24px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "var(--text-faint)",
                  background: "var(--bg-subtle)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  flexShrink: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 180,
                }}
              >
                {workflow.id}
              </span>
              <StagePill stage={workflow.stage} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {onOpenFullCase && (
                <button
                  onClick={() => {
                    onOpenFullCase(workflow);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--bg-subtle)",
                    color: "var(--brand)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <span>Full View</span>
                  <ArrowUpRight size={13} />
                </button>
              )}
              <button className="ds-btn ds-btn-ghost ds-btn-icon" onClick={onClose} style={{ flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>
          </div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              color: "var(--text-strong)",
              margin: 0,
            }}
          >
            {workflow.customer.name}
          </h2>
        </div>

        {/* ── Sheet body ────────────────────────────────── */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Section 1 — Payment Details */}
          <div>
            <span className="ds-label" style={{ display: "block", marginBottom: 12 }}>Payment Details</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)" }}>
                  {workflow.customer.name}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{workflow.customer.email}</span>
                {workflow.customer.phone && (
                  <span style={{ fontSize: 13, color: "var(--text-soft)", fontFamily: "monospace" }}>
                    {workflow.customer.phone}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                <RiskBadge
                  tier={
                    workflow.customer.riskTier ??
                    (workflow.customer.riskScore > 60 ? "HIGH" : workflow.customer.riskScore > 30 ? "MEDIUM" : "LOW")
                  }
                />
                <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
                  History Score: <strong>{workflow.customer.paymentHistoryScore ?? 85}</strong>/100
                </div>
              </div>
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
                style={{ fontSize: 13, height: 36, padding: "0 14px" }}
              >
                <Zap size={14} />
                {isRetrying ? "Retrying…" : "Retry Now"}
              </button>
              <button
                className="ds-btn ds-btn-secondary"
                onClick={handleRunAgent}
                disabled={isEvaluating}
                style={{ fontSize: 13, height: 36, padding: "0 14px" }}
              >
                <Bot size={14} />
                {isEvaluating ? "Evaluating…" : "Run AI Agent"}
              </button>
              <button
                className="ds-btn ds-btn-ghost"
                onClick={() => onOpenBotForCustomer(workflow.customer.id, workflow.id)}
                style={{ fontSize: 13, height: 36, padding: "0 14px" }}
              >
                <PhoneCall size={14} />
                Open Bot
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

          {/* Open in detail (external link) */}
          <div style={{ paddingTop: 4 }}>
            <button
              className="ds-btn ds-btn-ghost"
              onClick={() => onOpenBotForCustomer(workflow.customer.id, workflow.id)}
              style={{ fontSize: 12, height: 32, padding: "0 12px" }}
            >
              Open Hinglish Bot for this customer
              <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

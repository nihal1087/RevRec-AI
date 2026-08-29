import React, { useState, useEffect } from "react";
import {
  Zap,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Bot,
} from "lucide-react";
import { PillBadge } from "./PillBadge";

interface RcaHint {
  category: string;
  label: string;
  isRetryable: boolean;
  suggestedAction: string;
}

interface RecoveryActivatedBannerProps {
  paymentId: string;
  productName: string;
  amountInPaise: number;
  errorCode: string;
  rcaHint: RcaHint | null;
  onDismiss: () => void;
}

interface TimelineStep {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  status: "done" | "active" | "pending";
  delay: number; // ms after mount to become "done"
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecoveryActivatedBanner({
  paymentId,
  productName,
  amountInPaise,
  errorCode,
  rcaHint,
  onDismiss,
}: RecoveryActivatedBannerProps): React.JSX.Element {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);

  const amountDisplay = `₹${Math.round(amountInPaise / 100).toLocaleString("en-IN")}`;

  const steps: TimelineStep[] = [
    {
      id: "fail",
      label: "Payment Failed",
      sublabel: `${errorCode} · ${amountDisplay}`,
      icon: Zap,
      status: "done",
      delay: 0,
    },
    {
      id: "rca",
      label: "RCA Classification",
      sublabel: rcaHint?.label ?? "Analysing error code...",
      icon: Bot,
      status: "active",
      delay: 600,
    },
    {
      id: "compliance",
      label: "Compliance Check",
      sublabel: "RBI/TRAI dunning rules validated",
      icon: ShieldCheck,
      status: "pending",
      delay: 1400,
    },
    {
      id: "retry",
      label: rcaHint?.isRetryable ? "Retry Scheduled" : "Workflow Halted",
      sublabel: rcaHint?.suggestedAction ?? "Determining next action...",
      icon: Clock,
      status: "pending",
      delay: 2200,
    },
    {
      id: "audit",
      label: "Audit Logged",
      sublabel: "Immutable record written to ledger",
      icon: CheckCircle2,
      status: "pending",
      delay: 3000,
    },
  ];

  // Animate steps completing over time
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((step) => {
      if (step.delay > 0) {
        timers.push(
          setTimeout(() => {
            setCompletedSteps((prev) => new Set([...prev, step.id]));
          }, step.delay)
        );
      } else {
        setCompletedSteps((prev) => new Set([...prev, step.id]));
      }
    });
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(onDismiss, 200);
  };

  const allDone = steps.every((s) => completedSteps.has(s.id));

  return (
    <div
      style={{
        opacity: dismissed ? 0 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* ── Header beacon ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          backgroundColor: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#16a34a",
            flexShrink: 0,
            boxShadow: "0 0 0 3px #bbf7d0",
            animation: allDone ? "none" : "pulse-beacon 1.4s ease-in-out infinite",
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#14532d" }}>
            ⚡ Recovery Engine Activated
          </div>
          <div style={{ fontSize: 11.5, color: "#166534", marginTop: 1 }}>
            {productName} · {amountDisplay} · ID:{" "}
            <code style={{ fontFamily: "monospace" }}>{paymentId.slice(0, 16)}...</code>
          </div>
        </div>
      </div>

      {/* ── RCA Category chip ── */}
      {rcaHint && (
        <div style={{ marginBottom: 16 }}>
          <PillBadge
            variant={
              rcaHint.category === "SOFT"
                ? "amber"
                : rcaHint.category === "NETWORK"
                ? "blue"
                : rcaHint.category === "INTENT_DROP"
                ? "purple"
                : rcaHint.category === "HARD"
                ? "red"
                : "green"
            }
          >
            RCA: {rcaHint.label.toUpperCase()}
          </PillBadge>
        </div>
      )}

      {/* ── Live timeline ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((step, idx) => {
          const isDone = completedSteps.has(step.id);
          const Icon = step.icon;
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Left: icon + connector line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: isDone ? "#f0fdf4" : "var(--bg-subtle)",
                    border: `1.5px solid ${isDone ? "#86efac" : "var(--border)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s ease",
                  }}
                >
                  <Icon
                    size={13}
                    style={{
                      color: isDone ? "#059669" : "var(--text-faint)",
                      transition: "color 0.3s ease",
                    }}
                  />
                </div>
                {!isLast && (
                  <div
                    style={{
                      width: 1.5,
                      height: 22,
                      backgroundColor: isDone ? "#86efac" : "var(--border)",
                      transition: "background-color 0.4s ease",
                    }}
                  />
                )}
              </div>

              {/* Right: text */}
              <div style={{ paddingBottom: isLast ? 0 : 10, paddingTop: 4 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: isDone ? 600 : 400,
                    color: isDone ? "var(--text-strong)" : "var(--text-faint)",
                    transition: "all 0.3s ease",
                    lineHeight: 1.2,
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {step.sublabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        {allDone ? (
          <>
            <button
              onClick={handleDismiss}
              style={{
                flex: 1,
                padding: "9px",
                backgroundColor: "var(--brand)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              View in Recovery Ledger
              <ArrowRight size={13} />
            </button>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              padding: "9px",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-faint)",
              textAlign: "center",
            }}
          >
            Processing pipeline...
          </div>
        )}
      </div>
    </div>
  );
}

export default RecoveryActivatedBanner;

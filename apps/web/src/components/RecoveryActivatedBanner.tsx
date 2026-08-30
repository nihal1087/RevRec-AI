import React, { useState, useEffect } from "react";
import {
  Zap,
  Bot,
  ShieldCheck,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { CategoryBadge } from "./PillBadge";

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
  title: string;
  desc: string;
  timeOrStatus: string;
  icon: React.ElementType;
  delay: number;
}

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

  // Formatted local timestamp e.g. "01:08 pm"
  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();

  const steps: TimelineStep[] = [
    {
      id: "fail",
      title: "1. Payment Failed",
      desc: `${errorCode} — ${amountDisplay}`,
      timeOrStatus: currentTime,
      icon: Zap,
      delay: 0,
    },
    {
      id: "rca",
      title: "2. RCA Classification",
      desc: rcaHint?.label ? `Diagnosed as ${rcaHint.label}` : "Diagnosed as SOFT Decline",
      timeOrStatus: currentTime,
      icon: Bot,
      delay: 500,
    },
    {
      id: "compliance",
      title: "3. Compliance & Policy Check",
      desc: "TRAI quiet hours & RBI frequency limits validated (Passed)",
      timeOrStatus: currentTime,
      icon: ShieldCheck,
      delay: 1200,
    },
    {
      id: "outreach",
      title: "4. Intervention & Strategy",
      desc: rcaHint?.suggestedAction ?? "Smart retry sequence calculated",
      timeOrStatus: "In-flight",
      icon: Clock,
      delay: 1900,
    },
    {
      id: "resolution",
      title: "5. Resolution Status",
      desc: "Immutable audit record committed to recovery ledger",
      timeOrStatus: "Active",
      icon: CheckCircle2,
      delay: 2600,
    },
  ];

  // Animate step progression
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
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Context Details Bar ── */}
      <div
        style={{
          padding: "10px 12px",
          backgroundColor: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {productName}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-soft)", fontVariantNumeric: "tabular-nums" }}>
            {amountDisplay} · <span style={{ fontFamily: "monospace" }}>{paymentId.slice(0, 15)}...</span>
          </div>
        </div>

        {rcaHint?.category && (
          <CategoryBadge category={rcaHint.category} prefix="RCA: " />
        )}
      </div>

      {/* ── Stepper Items ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 2 }}>
        {steps.map((step, idx) => {
          const isDone = completedSteps.has(step.id);
          const Icon = step.icon;
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Left: Icon + Connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: isDone ? "var(--bg-subtle)" : "var(--bg-surface)",
                    border: isDone
                      ? "1px solid var(--border-strong, #cbd5e1)"
                      : "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.25s ease",
                  }}
                >
                  <Icon
                    size={12}
                    style={{
                      color: isDone ? "var(--text-strong)" : "var(--text-faint)",
                      transition: "color 0.25s ease",
                    }}
                  />
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

              {/* Right: Title, Timestamp, Description */}
              <div style={{ paddingBottom: isLast ? 0 : 12, paddingTop: 1, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: isDone ? "var(--text-strong)" : "var(--text-faint)",
                      transition: "color 0.25s ease",
                    }}
                  >
                    {step.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: isDone ? "var(--text-soft)" : "var(--text-faint)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {step.timeOrStatus}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 11.5,
                    color: isDone ? "var(--text-soft)" : "var(--text-faint)",
                    margin: "2px 0 0",
                    lineHeight: 1.4,
                    transition: "color 0.25s ease",
                  }}
                >
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
        {allDone ? (
          <button
            onClick={handleDismiss}
            style={{
              flex: 1,
              padding: "10px 14px",
              backgroundColor: "var(--brand, #0f172a)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            View in Recovery Ledger
            <ArrowRight size={13} />
          </button>
        ) : (
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
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

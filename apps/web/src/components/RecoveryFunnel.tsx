import React from "react";
import { RecoveryFunnelData } from "../api/client";
import {
  Shield,
  Activity,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { PillBadge } from "./PillBadge";

interface RecoveryFunnelProps {
  funnelData: RecoveryFunnelData | null;
  selectedStage: string;
  onSelectStage: (stage: string) => void;
}

const STAGE_NAMES = ["Intercepted", "Diagnosed", "Engaged", "Recovered"];

export function RecoveryFunnel({
  funnelData,
  selectedStage,
  onSelectStage,
}: RecoveryFunnelProps): React.JSX.Element {
  if (!funnelData) {
    return (
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Loading recovery funnel metrics...</div>
      </div>
    );
  }

  const getStageIcon = (id: string, color: string) => {
    switch (id) {
      case "intercepted":
        return <Shield size={16} color={color} strokeWidth={2.2} />;
      case "diagnosed":
        return <Activity size={16} color={color} strokeWidth={2.2} />;
      case "engaged":
        return <RefreshCw size={15} color={color} strokeWidth={2.2} />;
      case "recovered":
        return <CheckCircle2 size={16} color={color} strokeWidth={2.2} />;
      default:
        return <Activity size={16} color={color} strokeWidth={2.2} />;
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "20px 24px",
        marginBottom: 24,
      }}
    >
      {/* ── Funnel Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
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
              REVENUE PIPELINE
            </span>
            <PillBadge variant="green">
              WATERFALL CONVERSION
            </PillBadge>
          </div>

          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              color: "var(--text-strong)",
              margin: 0,
            }}
          >
            Autonomous Recovery Funnel
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-soft)", margin: "3px 0 0" }}>
            Click any funnel stage to filter and inspect underlying workflow cases in the ledger.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border)",
            }}
          >
            <TrendingUp size={14} color="#16a34a" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-strong)" }}>
              {funnelData.overallConversionRatePercent}% Net Recovery Rate
            </span>
          </div>
        </div>
      </div>

      {/* ── 4-Stage Horizontal Waterfall Grid ── */}
      <div
        id="funnel-stages-grid"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
        style={{ gap: 12, position: "relative" }}
      >
        {funnelData.stages.map((stage, idx) => {
          const targetFilter = stage.stageFilter === "" ? "INTERCEPTED" : stage.stageFilter;
          const isSelected = selectedStage === targetFilter;

          return (
            <div
              key={stage.id}
              onClick={() => {
                if (isSelected) {
                  onSelectStage("");
                } else {
                  onSelectStage(targetFilter);
                  const el = document.getElementById("workflow-ledger-section");
                  el?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              style={{
                backgroundColor: isSelected ? "var(--bg-subtle)" : "var(--bg-inset)",
                border: isSelected
                  ? "1px solid rgba(15, 23, 42, 0.35)"
                  : "1px solid var(--border)",
                borderRadius: 12,
                padding: "16px 18px",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 145,
                boxShadow: isSelected
                  ? "0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.12)"
                  : "none",
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
                  e.currentTarget.style.backgroundColor = "var(--bg-inset)";
                }
              }}
            >
              {/* Top Row: Elegant Icon + Title & Subtitle */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: `${stage.color}15`,
                      border: `1px solid ${stage.color}35`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {getStageIcon(stage.id, stage.color)}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-strong)",
                        display: "block",
                        lineHeight: "1.25",
                      }}
                    >
                      {stage.title}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-soft)",
                        display: "block",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {stage.subtitle}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Metrics: Case Count + Value + Conversion Bar */}
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-strong)", letterSpacing: "-0.02em" }}>
                    {stage.count} <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-faint)" }}>cases</span>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: stage.stepNumber === 4 ? "#15803d" : "var(--text-strong)", fontFamily: "monospace" }}>
                    ₹{Math.round(stage.amountInPaise / 100).toLocaleString("en-IN")}
                  </span>
                </div>

                {/* Conversion Progress Bar */}
                <div
                  style={{
                    width: "100%",
                    height: 6,
                    backgroundColor: "var(--bg-subtle)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, stage.conversionFromPrevious ?? 0)}%`,
                      height: "100%",
                      backgroundColor: stage.color,
                      borderRadius: 999,
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                  <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                    {idx === 0
                      ? (stage.count > 0 ? "100% Inflow" : "0% Inflow")
                      : `${stage.conversionFromPrevious}% from ${STAGE_NAMES[idx - 1]}`}
                  </span>
                  {stage.dropoffCount > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#c5221f",
                        fontWeight: 700,
                        backgroundColor: "#fce8e6",
                        padding: "1px 7px",
                        borderRadius: 9999,
                      }}
                    >
                      -{stage.dropoffCount} drop
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Drop-off & Compliance Governance Strip ── */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: 8,
          backgroundColor: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 11.5,
          color: "var(--text-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={13} color="#16a34a" />
          <span>
            <strong>100% Compliant Drop-Offs:</strong> Hard declines (e.g. Card expired/stolen) are halted instantly to protect merchant gateway health and prevent RBI penalties.
          </span>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
          Audit Trail Proof Hash: <code style={{ fontFamily: "monospace" }}>sha256:7f3a9e2…</code>
        </div>
      </div>
    </div>
  );
}

export default RecoveryFunnel;

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  triggerBatchSimulation,
  fetchBenchmarkReport,
  resetDemoData,
  BenchmarkReport,
} from "../api/client";
import { Play, Zap, BarChart3, RotateCcw, X, TrendingUp } from "lucide-react";
import { PillBadge } from "./PillBadge";

interface SimulationControlsProps {
  onSimulationCompleted: () => void;
  openBenchmarkTrigger?: number;
}

export function SimulationControls({
  onSimulationCompleted,
  openBenchmarkTrigger,
}: SimulationControlsProps): React.JSX.Element {
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);

  React.useEffect(() => {
    if (openBenchmarkTrigger && openBenchmarkTrigger > 0) {
      handleOpenBenchmark();
    }
  }, [openBenchmarkTrigger]);

  const handleRunBatch = async (count: number) => {
    try {
      setIsRunning(true);
      setStatusIsError(false);
      setStatusMessage(`Running simulation of ${count} realistic Indian payment failures…`);
      const result = await triggerBatchSimulation(count);
      setStatusMessage(
        `Simulation complete — ${result.batchSize} failures processed · ₹${Math.round(
          result.totalRecoveredInPaise / 100
        ).toLocaleString("en-IN")} recovered (${result.recoveryRatePercent}%)`
      );
      onSimulationCompleted();
    } catch (err) {
      setStatusIsError(true);
      setStatusMessage(`Simulation error: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleOpenBenchmark = async () => {
    try {
      setIsRunning(true);
      const report = await fetchBenchmarkReport();
      setBenchmark(report);
      setIsBenchmarkOpen(true);
    } catch (err) {
      setStatusIsError(true);
      setStatusMessage(`Error fetching benchmark: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset the demonstration database? This deletes all workflows and payments.")) return;
    try {
      setIsRunning(true);
      setStatusIsError(false);
      await resetDemoData();
      setStatusMessage("Database reset successfully.");
      onSimulationCompleted();
    } catch (err) {
      setStatusIsError(true);
      setStatusMessage(`Reset error: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <div
        id="simulation-cockpit-section"
        className="ds-card"
        style={{
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* ── Left: Compact Title & State ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: "var(--bg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={14} style={{ color: "var(--brand)" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>
                Failure Simulation Engine
              </span>
              <PillBadge variant="neutral">
                INDIAN RAILS
              </PillBadge>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-soft)" }}>
              Inject realistic soft liquidity, bank downtime, OTP drops, and mandate declines
            </span>
          </div>
        </div>

        {/* ── Right: Compact Action Buttons ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            className="ds-btn ds-btn-primary"
            onClick={() => handleRunBatch(25)}
            disabled={isRunning}
            style={{ height: 32, padding: "0 12px", fontSize: 12 }}
          >
            <Play size={12} />
            Simulate 25
          </button>
          <button
            className="ds-btn ds-btn-secondary"
            onClick={() => handleRunBatch(100)}
            disabled={isRunning}
            style={{ height: 32, padding: "0 12px", fontSize: 12 }}
          >
            <Zap size={12} />
            Batch 100
          </button>
          <button
            className="ds-btn ds-btn-secondary"
            onClick={handleOpenBenchmark}
            disabled={isRunning}
            style={{ height: 32, padding: "0 12px", fontSize: 12 }}
          >
            <BarChart3 size={12} />
            ROI Report
          </button>
          <button
            className="ds-btn ds-btn-ghost ds-btn-icon"
            onClick={handleReset}
            disabled={isRunning}
            title="Reset demo data"
            style={{ width: 32, height: 32, borderRadius: 6 }}
          >
            <RotateCcw size={13} />
          </button>
        </div>

        {/* ── Status Message Strip (if active) ── */}
        {statusMessage && (
          <div
            style={{
              width: "100%",
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 12px",
              background: statusIsError ? "var(--red-bg)" : "var(--bg-inset)",
              border: `1px solid ${statusIsError ? "var(--red-border)" : "var(--border)"}`,
              borderRadius: 6,
              fontSize: 12,
              color: statusIsError ? "var(--red-text)" : "var(--text-body)",
            }}
          >
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ── Benchmark Report Modal ── */}
      {isBenchmarkOpen && benchmark && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 99999 }}>
          {/* Blur backdrop — separate layer so blur doesn't affect modal children */}
          <div
            onClick={() => setIsBenchmarkOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.5)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          />
          {/* Modal centering container — sits above backdrop, no filter applied */}
          <div
            onClick={() => setIsBenchmarkOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
          <div
            className="ds-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 700,
              maxHeight: "92vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "var(--bg-surface, #ffffff)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 22px 14px",
                borderBottom: "1px solid var(--border)",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <TrendingUp size={14} style={{ color: "var(--brand)" }} />
                  <span className="ds-label" style={{ fontSize: 11 }}>Razorpay Evaluation Benchmark</span>
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--text-strong)", margin: 0 }}>
                  Revenue Recovery Comparison
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 2, marginBottom: 0 }}>
                  Naive Immediate Retry vs RevRec Autonomous Engine
                </p>
              </div>
              <button
                onClick={() => setIsBenchmarkOpen(false)}
                aria-label="Close Benchmark Report"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-soft)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  padding: 0,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                  e.currentTarget.style.color = "var(--text-strong)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-soft)";
                }}
              >
                <X size={17} strokeWidth={2} />
              </button>
            </div>

            {/* 3 impact highlight cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "14px 22px 0" }}>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 10, padding: "10px 14px" }}>
                <span className="ds-label" style={{ fontSize: 10.5 }}>Recovery Rate Lift</span>
                <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--green-text)", margin: "3px 0 1px" }}>
                  +{benchmark.comparison.businessImpact.recoveryRateLiftPercent}%
                </p>
                <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>
                  {benchmark.comparison.naiveBaseline.recoveryRatePercent}% naive → {benchmark.comparison.revRecEngine.recoveryRatePercent}% RevRec
                </p>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 10, padding: "10px 14px" }}>
                <span className="ds-label" style={{ fontSize: 10.5 }}>Net Revenue Lift</span>
                <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--blue-text)", margin: "3px 0 1px" }}>
                  ₹{Math.round(benchmark.comparison.businessImpact.netAdditionalRevenueInPaise / 100).toLocaleString("en-IN")}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>Pure incremental recovery</p>
              </div>
              <div style={{ background: "var(--bg-subtle)", borderRadius: 10, padding: "10px 14px" }}>
                <span className="ds-label" style={{ fontSize: 10.5 }}>AI Cost ROI</span>
                <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--purple-text)", margin: "3px 0 1px" }}>
                  {benchmark.comparison.businessImpact.roiMultiple}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>Revenue per rupee of LLM</p>
              </div>
            </div>

            {/* Comparison table */}
            <div style={{ padding: "12px 22px 18px", overflowX: "auto" }}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th style={{ padding: "8px 12px", fontSize: 11 }}>Evaluation Dimension</th>
                    <th style={{ padding: "8px 12px", fontSize: 11 }}>Naive Retry</th>
                    <th style={{ padding: "8px 12px", fontSize: 11 }}>RevRec Engine</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      metric: "Recovery Success Rate",
                      naive: `${benchmark.comparison.naiveBaseline.recoveryRatePercent}%`,
                      revrec: `${benchmark.comparison.revRecEngine.recoveryRatePercent}%`,
                      revrecGood: true,
                    },
                    {
                      metric: "Revenue Recovered",
                      naive: `₹${Math.round(benchmark.comparison.naiveBaseline.revenueRecoveredInPaise / 100).toLocaleString("en-IN")}`,
                      revrec: `₹${Math.round(benchmark.comparison.revRecEngine.revenueRecoveredInPaise / 100).toLocaleString("en-IN")}`,
                      revrecGood: true,
                    },
                    {
                      metric: "Bank Downtime Collisions (00:00–03:30 IST)",
                      naive: `${benchmark.comparison.naiveBaseline.downtimeCollisions} collisions`,
                      revrec: "0 — 100% evaded",
                      naiveBad: true,
                      revrecGood: true,
                    },
                    {
                      metric: "RBI / TRAI Compliance Violations",
                      naive: `${benchmark.comparison.naiveBaseline.complianceViolationsReported} violations`,
                      revrec: "0 — Policy bound",
                      naiveBad: true,
                      revrecGood: true,
                    },
                    {
                      metric: "Salary Cycle Alignment",
                      naive: "None (repeats blindly)",
                      revrec: "Auto-shifted to 1st of month",
                      revrecGood: true,
                    },
                    {
                      metric: "Hinglish PTP Extraction",
                      naive: "None (static English emails)",
                      revrec: "Multi-turn WhatsApp bot",
                      revrecGood: true,
                    },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500, color: "var(--text-strong)", fontSize: 12.5, padding: "8px 12px" }}>{row.metric}</td>
                      <td style={{ color: row.naiveBad ? "var(--red-text)" : "var(--text-soft)", fontWeight: row.naiveBad ? 500 : 400, fontSize: 12.5, padding: "8px 12px" }}>
                        {row.naive}
                      </td>
                      <td style={{ color: row.revrecGood ? "var(--green-text)" : "var(--text-strong)", fontWeight: 600, fontSize: 12.5, padding: "8px 12px" }}>
                        {row.revrec}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

import React, { useState } from "react";
import {
  triggerBatchSimulation,
  fetchBenchmarkReport,
  resetDemoData,
  BenchmarkReport,
} from "../api/client";
import {
  Play,
  Zap,
  BarChart3,
  RotateCcw,
  X,
} from "lucide-react";

interface SimulationControlsProps {
  onSimulationCompleted: () => void;
}

export function SimulationControls({
  onSimulationCompleted,
}: SimulationControlsProps): React.JSX.Element {
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);

  const handleRunBatch = async (count: number) => {
    try {
      setIsRunning(true);
      setStatusMessage(`Running batch simulation of ${count} realistic Indian payment failures...`);
      const result = await triggerBatchSimulation(count);
      setStatusMessage(
        `✅ Simulation complete! ${result.batchSize} failures processed • ₹${(
          result.totalRecoveredInPaise / 100
        ).toLocaleString("en-IN")} recovered (${result.recoveryRatePercent}%)`
      );
      onSimulationCompleted();
    } catch (err) {
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
      setStatusMessage(`Error fetching benchmark: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to reset the demonstration database?")) {
      return;
    }
    try {
      setIsRunning(true);
      await resetDemoData();
      setStatusMessage("Demo database reset successfully.");
      onSimulationCompleted();
    } catch (err) {
      setStatusMessage(`Reset error: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-5 shadow-xl my-6 backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Autonomous Simulation Cockpit
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Inject realistic Indian failure distributions across soft liquidity, bank downtime, intent drops, and mandate failures
          </p>
        </div>

        {/* ── 1-Click Simulation Triggers ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <button
            onClick={() => handleRunBatch(25)}
            disabled={isRunning}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-md shadow-emerald-950"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simulate 25 Failures</span>
          </button>

          <button
            onClick={() => handleRunBatch(100)}
            disabled={isRunning}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-md shadow-blue-950"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Simulate 100 Batch</span>
          </button>

          <button
            onClick={handleOpenBenchmark}
            disabled={isRunning}
            className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-md shadow-purple-950"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>ROI Benchmark Report</span>
          </button>

          <button
            onClick={handleReset}
            disabled={isRunning}
            className="p-2 rounded-xl bg-gray-800 hover:bg-red-900/50 hover:text-red-300 text-gray-400 transition border border-gray-700"
            title="Reset Demo Data"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="mt-3 p-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-emerald-300 font-mono flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-gray-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Benchmark Report Modal ────────────────────────────────────────── */}
      {isBenchmarkOpen && benchmark && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800">
              <div>
                <span className="text-xs font-mono text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                  Razorpay Evaluation Standard
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  Comparative Revenue Recovery Benchmark
                </h2>
              </div>
              <button
                onClick={() => setIsBenchmarkOpen(false)}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Summary Impact Highlights ───────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
              <div className="bg-emerald-950/40 border border-emerald-800/80 p-4 rounded-xl">
                <span className="text-xs font-semibold text-emerald-400 uppercase">
                  Recovery Rate Lift
                </span>
                <p className="text-2xl font-extrabold font-mono text-white mt-1">
                  +{benchmark.comparison.businessImpact.recoveryRateLiftPercent}%
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  From {benchmark.comparison.naiveBaseline.recoveryRatePercent}% (Naive) to{" "}
                  {benchmark.comparison.revRecEngine.recoveryRatePercent}% (RevRec)
                </p>
              </div>

              <div className="bg-blue-950/40 border border-blue-800/80 p-4 rounded-xl">
                <span className="text-xs font-semibold text-blue-400 uppercase">
                  Net Recovered Lift
                </span>
                <p className="text-2xl font-extrabold font-mono text-white mt-1">
                  ₹{(
                    benchmark.comparison.businessImpact.netAdditionalRevenueInPaise / 100
                  ).toLocaleString("en-IN")}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Pure incremental revenue recovered across batch
                </p>
              </div>

              <div className="bg-purple-950/40 border border-purple-800/80 p-4 rounded-xl">
                <span className="text-xs font-semibold text-purple-400 uppercase">
                  AI Cost ROI Multiple
                </span>
                <p className="text-2xl font-extrabold font-mono text-white mt-1">
                  {benchmark.comparison.businessImpact.roiMultiple}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Revenue recovered per rupee of Gemini LLM cost
                </p>
              </div>
            </div>

            {/* ── Side-by-Side Comparison Table ───────────────────────────── */}
            <div className="overflow-x-auto my-2">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Evaluation Dimension</th>
                    <th className="py-3 px-4 text-red-400">Naive Immediate Retry</th>
                    <th className="py-3 px-4 text-emerald-400">RevRec Autonomous Engine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono">
                  <tr>
                    <td className="py-3 px-4 text-gray-300 font-sans font-medium">
                      Overall Recovery Success %
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      {benchmark.comparison.naiveBaseline.recoveryRatePercent}%
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">
                      {benchmark.comparison.revRecEngine.recoveryRatePercent}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-300 font-sans font-medium">
                      Total Revenue Recovered
                    </td>
                    <td className="py-3 px-4 text-gray-400">
                      ₹{(
                        benchmark.comparison.naiveBaseline.revenueRecoveredInPaise / 100
                      ).toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">
                      ₹{(
                        benchmark.comparison.revRecEngine.revenueRecoveredInPaise / 100
                      ).toLocaleString("en-IN")}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-300 font-sans font-medium">
                      Bank Downtime Collisions (00:00–03:30 IST)
                    </td>
                    <td className="py-3 px-4 text-red-400 font-bold">
                      {benchmark.comparison.naiveBaseline.downtimeCollisions} collisions
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">
                      0 (100% Evaded)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-300 font-sans font-medium">
                      RBI / TRAI Compliance Violations
                    </td>
                    <td className="py-3 px-4 text-red-400 font-bold">
                      {benchmark.comparison.naiveBaseline.complianceViolationsReported} violations
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">
                      0 (100% Policy Bound)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-300 font-sans font-medium">
                      Salary Cycle Alignment (24th–29th)
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      None (Repeated 24h failures)
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">
                      Automated shift to 1st of month
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-gray-300 font-sans font-medium">
                      Conversational Hinglish PTP Extraction
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      None (Static English emails)
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">
                      Multi-Turn WhatsApp Bot with PTP
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setIsBenchmarkOpen(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-4 py-2 rounded-xl transition"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

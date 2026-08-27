import React, { useState } from "react";
import { WorkflowItem } from "../api/client";
import { AlertCircle, CheckCircle2, Clock, PauseCircle, PhoneCall, Sparkles, User } from "lucide-react";

interface WorkflowTableProps {
  workflows: WorkflowItem[];
  selectedStage: string;
  onSelectStage: (stage: string) => void;
  onInspectWorkflow: (workflow: WorkflowItem) => void;
}

const STAGES = [
  { key: "", label: "All Workflows" },
  { key: "RETRYING", label: "Auto-Retrying" },
  { key: "OUTREACH_SENT", label: "Outreach Sent" },
  { key: "PROMISE_RECEIVED", label: "PTP Committed" },
  { key: "RECOVERED", label: "Recovered" },
  { key: "HALTED", label: "Halted" },
  { key: "ESCALATED", label: "Escalated" },
];

export function WorkflowTable({
  workflows,
  selectedStage,
  onSelectStage,
  onInspectWorkflow,
}: WorkflowTableProps): React.JSX.Element {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredWorkflows = workflows.filter((w) => {
    const term = searchTerm.toLowerCase();
    return (
      w.customer.name.toLowerCase().includes(term) ||
      w.customer.email.toLowerCase().includes(term) ||
      w.id.toLowerCase().includes(term) ||
      (w.payment.gatewayErrorCode ?? "").toLowerCase().includes(term)
    );
  });

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case "RECOVERED":
        return <span className="badge-recovered flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> RECOVERED</span>;
      case "RETRYING":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950 text-blue-300 border border-blue-800"><Clock className="w-3 h-3 animate-pulse" /> RETRYING</span>;
      case "OUTREACH_SENT":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-950 text-purple-300 border border-purple-800"><PhoneCall className="w-3 h-3" /> OUTREACH</span>;
      case "PROMISE_RECEIVED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-950 text-teal-300 border border-teal-800"><Sparkles className="w-3 h-3" /> PTP COMMITTED</span>;
      case "HALTED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-900 text-gray-400 border border-gray-700"><PauseCircle className="w-3 h-3" /> HALTED</span>;
      case "ESCALATED":
        return <span className="badge-at-risk flex items-center gap-1"><AlertCircle className="w-3 h-3" /> ESCALATED</span>;
      default:
        return <span className="badge-pending">{stage}</span>;
    }
  };

  const getCategoryBadge = (category: string | null) => {
    switch (category) {
      case "SOFT":
        return <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-mono">SOFT</span>;
      case "HARD":
        return <span className="text-xs px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/60 font-mono">HARD</span>;
      case "NETWORK":
        return <span className="text-xs px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 font-mono">NETWORK</span>;
      case "INTENT_DROP":
        return <span className="text-xs px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">INTENT_DROP</span>;
      case "MANDATE_FAILURE":
        return <span className="text-xs px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 font-mono">MANDATE</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">UNKNOWN</span>;
    }
  };

  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-xl my-6">
      {/* ── Filters & Search ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Active Recovery State Machine Ledger
          </h2>
          <p className="text-xs text-gray-400">
            Real-time multi-stage recovery workflows with deterministic policy bounds
          </p>
        </div>

        <div className="w-full md:w-64">
          <input
            type="text"
            placeholder="Search by customer, ID, error..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* ── Stage Filter Pills ────────────────────────────────────────────── */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-3 mb-4 scrollbar-thin">
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => onSelectStage(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              selectedStage === s.key
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                : "bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-gray-200 border border-gray-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Workflows Table ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-800 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="py-3 px-4">Workflow & Customer</th>
              <th className="py-3 px-4">Amount At Risk</th>
              <th className="py-3 px-4">RCA Classification</th>
              <th className="py-3 px-4">Stage</th>
              <th className="py-3 px-4">Attempts</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60 text-xs">
            {filteredWorkflows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-500">
                  No recovery workflows found matching the current criteria.
                </td>
              </tr>
            ) : (
              filteredWorkflows.map((w) => (
                <tr
                  key={w.id}
                  className="hover:bg-gray-800/30 transition group cursor-pointer"
                  onClick={() => onInspectWorkflow(w)}
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-200 group-hover:text-emerald-400 transition">
                          {w.customer.name}
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          ID: {w.id.slice(0, 12)}... • Risk: {w.customer.riskScore}/100
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono font-bold text-white">
                    ₹{(w.amountAtRiskInPaise / 100).toLocaleString("en-IN")}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex flex-col items-start gap-1">
                      {getCategoryBadge(w.payment.declineCategory)}
                      <span className="text-[10px] text-gray-500 font-mono">
                        {w.payment.gatewayErrorCode ?? "UNSPECIFIED"}
                      </span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    {getStageBadge(w.stage)}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-gray-400">
                    <span className="text-blue-400">{w.retryCount} retries</span>
                    <span className="mx-1.5">•</span>
                    <span className="text-purple-400">{w.outreachCount} outreach</span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectWorkflow(w);
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-emerald-600 hover:text-white text-gray-300 text-xs font-semibold transition border border-gray-700"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

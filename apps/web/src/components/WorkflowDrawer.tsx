import React, { useState } from "react";
import { WorkflowItem, triggerManualRetry, triggerAgentDecision } from "../api/client";
import {
  X,
  Zap,
  Bot,
  ShieldCheck,
  History,
  PhoneCall,
} from "lucide-react";

interface WorkflowDrawerProps {
  workflow: WorkflowItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenBotForCustomer: (customerId: string, workflowId: string) => void;
}

export function WorkflowDrawer({
  workflow,
  onClose,
  onRefresh,
  onOpenBotForCustomer,
}: WorkflowDrawerProps): React.JSX.Element | null {
  if (!workflow) return null;

  const [isRetrying, setIsRetrying] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleManualRetry = async () => {
    try {
      setIsRetrying(true);
      setActionMessage(null);
      await triggerManualRetry(workflow.id);
      setActionMessage("⚡ Immediate retry job dispatched to BullMQ queue!");
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
      setActionMessage("🤖 Bounded AI Agent evaluated case and executed tool!");
      onRefresh();
    } catch (err) {
      setActionMessage(`Error: ${(err as Error).message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const latestExecution = workflow.agentExecutions?.[0];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-gray-950/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-gray-900 border-l border-gray-800 h-full overflow-y-auto shadow-2xl p-6 flex flex-col justify-between">
        <div>
          {/* ── Top Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-800">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                  {workflow.id}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                  Stage: {workflow.stage}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1">
                {workflow.customer.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {actionMessage && (
            <div className="my-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-medium">
              {actionMessage}
            </div>
          )}

          {/* ── Financial & Failure Overview ──────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-semibold">At Risk</span>
              <p className="text-base font-bold font-mono text-white">
                ₹{(workflow.amountAtRiskInPaise / 100).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Recovered</span>
              <p className="text-base font-bold font-mono text-emerald-400">
                ₹{(workflow.amountRecoveredInPaise / 100).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Customer Risk</span>
              <p className="text-base font-bold font-mono text-amber-400">
                {workflow.customer.riskScore} / 100
              </p>
            </div>
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase font-semibold">RCA Category</span>
              <p className="text-base font-bold font-mono text-blue-400 truncate">
                {workflow.payment.declineCategory ?? "UNKNOWN"}
              </p>
            </div>
          </div>

          {/* ── RCA Diagnostic Card ───────────────────────────────────────── */}
          <div className="bg-gray-950/90 border border-gray-800 rounded-xl p-4 my-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-gray-300 uppercase mb-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Root Cause Analysis (RCA)</span>
            </div>
            <p className="text-xs text-gray-300 mb-2">
              <span className="text-gray-500 font-mono">Gateway Code:</span>{" "}
              <code className="text-amber-400 font-mono font-semibold">
                {workflow.payment.gatewayErrorCode ?? "UNKNOWN"}
              </code>
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Standardized decline classification mapped to category{" "}
              <span className="text-blue-400 font-semibold">{workflow.payment.declineCategory}</span>.
              {workflow.haltReason && (
                <span className="block mt-1 text-red-400 font-medium">
                  Halt Reason: {workflow.haltReason}
                </span>
              )}
              {workflow.escalationReason && (
                <span className="block mt-1 text-amber-400 font-medium">
                  Escalation Reason: {workflow.escalationReason}
                </span>
              )}
            </p>
          </div>

          {/* ── AI Agent Reasoning Card ───────────────────────────────────── */}
          {latestExecution && (
            <div className="bg-gradient-to-br from-emerald-950/30 to-teal-950/20 border border-emerald-900/60 rounded-xl p-4 my-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase">
                  <Bot className="w-4 h-4" />
                  <span>AI Agent Decision & Reasoning Trace</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                  Confidence: {Math.round(latestExecution.confidenceScore * 100)}%
                </span>
              </div>

              <p className="text-xs text-gray-200 italic mb-3 leading-relaxed">
                "{latestExecution.reasoning}"
              </p>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 font-mono bg-gray-950/80 p-2.5 rounded-lg border border-gray-800">
                <div>
                  <span className="text-gray-500">Tool Selected:</span>{" "}
                  <span className="text-white font-semibold">{latestExecution.selectedTool}</span>
                </div>
                <div>
                  <span className="text-gray-500">Policy Guard:</span>{" "}
                  <span className={latestExecution.policyCheckPassed ? "text-emerald-400" : "text-red-400 font-semibold"}>
                    {latestExecution.policyCheckPassed ? "PASSED" : "REJECTED"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Inference Latency:</span>{" "}
                  <span className="text-gray-300">{latestExecution.llmLatencyMs} ms</span>
                </div>
                <div>
                  <span className="text-gray-500">Token Cost:</span>{" "}
                  <span className="text-gray-300">{latestExecution.estimatedCostInPaise} paise</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Immutable Audit Ledger ────────────────────────────────────── */}
          <div className="my-6">
            <div className="flex items-center space-x-2 text-xs font-bold text-gray-400 uppercase mb-3">
              <History className="w-4 h-4" />
              <span>Immutable Audit Ledger ({workflow.auditEntries?.length ?? 0} events)</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-1">
              {(workflow.auditEntries ?? []).map((audit) => (
                <div
                  key={audit.id}
                  className="bg-gray-950 p-3 rounded-lg border border-gray-800 flex items-start justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-200 font-mono">
                        {audit.eventType}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-gray-400 border border-gray-800">
                        {audit.actorType}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 font-mono">
                      {new Date(audit.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                      audit.outcome === "SUCCESS"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : audit.outcome === "FAILURE"
                        ? "bg-red-950 text-red-400 border border-red-800"
                        : "bg-gray-800 text-gray-300"
                    }`}
                  >
                    {audit.outcome}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom Action Toolbar ────────────────────────────────────────── */}
        <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleManualRetry}
            disabled={isRetrying || workflow.stage === "RECOVERED" || workflow.stage === "HALTED"}
            className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-lg shadow-blue-950"
          >
            <Zap className="w-4 h-4" />
            <span>{isRetrying ? "Dispatching..." : "⚡ Retry Now (Override)"}</span>
          </button>

          <button
            onClick={handleRunAgent}
            disabled={isEvaluating}
            className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-lg shadow-emerald-950"
          >
            <Bot className="w-4 h-4" />
            <span>{isEvaluating ? "Evaluating..." : "🤖 Run AI Evaluation"}</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenBotForCustomer(workflow.customerId, workflow.id);
            }}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-2.5 px-4 rounded-xl transition border border-gray-700"
          >
            <PhoneCall className="w-4 h-4 text-emerald-400" />
            <span>WhatsApp Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}

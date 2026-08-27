import React from "react";
import { ShieldCheck, RefreshCw, Zap, Bot } from "lucide-react";

interface HeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
  onOpenBot: () => void;
}

export function Header({ onRefresh, isLoading, onOpenBot }: HeaderProps): React.JSX.Element {
  return (
    <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand & Track */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white tracking-tight">RevRec</h1>
              <span className="bg-emerald-950 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full border border-emerald-800 font-mono">
                v1.0 • Autonomous Engine
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Razorpay AI Internship — AI Revenue Recovery Track
            </p>
          </div>
        </div>

        {/* Live System Beacon & Actions */}
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2 bg-gray-950 border border-gray-800 px-3 py-1.5 rounded-lg text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-300 font-medium">BullMQ & State Ledger Active</span>
          </div>

          <div className="hidden md:flex items-center space-x-2 bg-gray-950 border border-gray-800 px-3 py-1.5 rounded-lg text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-gray-300">RBI & TRAI Compliance Guard On</span>
          </div>

          <button
            onClick={onOpenBot}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md transition"
          >
            <Bot className="w-4 h-4" />
            <span>Hinglish Bot Simulator</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </header>
  );
}

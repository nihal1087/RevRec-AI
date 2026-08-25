import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css"; // Tailwind base styles

/**
 * React entry point — skeleton for Phases 0-3.
 * The full Merchant Command Center UI is built in Phase 4.
 */
function App(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">
          RevRec — AI Revenue Recovery Engine
        </h1>
        <p className="text-gray-400 mb-6">
          Autonomous payment recovery with bounded AI agents
        </p>
        <div className="stat-card mb-4">
          <h2 className="text-lg font-semibold text-green-400 mb-2">✅ Phase 0 + 1 Complete</h2>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Monorepo: apps/api, apps/web, packages/types, packages/db</li>
            <li>• PostgreSQL schema: 8 tables with optimistic locking</li>
            <li>• Redis + BullMQ event ingestion pipeline</li>
            <li>• HMAC-SHA256 webhook verification with idempotency guard</li>
            <li>• Immutable audit ledger</li>
          </ul>
        </div>
        <div className="stat-card">
          <h2 className="text-lg font-semibold text-amber-400 mb-2">🚧 In Progress</h2>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Phase 2: Root Cause Engine + Smart Retry Sequencer</li>
            <li>• Phase 3: Bounded AI Agent + Hinglish Recovery Bot</li>
            <li>• Phase 4: Merchant Command Center Dashboard ← This file</li>
          </ul>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          API Health:{" "}
          <a
            href="http://localhost:3001/health"
            className="text-blue-400 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            http://localhost:3001/health
          </a>
        </p>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("[RevRec Web] Root element #root not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

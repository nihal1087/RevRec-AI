import React from "react";
import { Bot, ChevronRight } from "lucide-react";
import { PillBadge } from "./PillBadge";
import { WorkflowItem } from "../api/client";

interface HeaderProps {
  onOpenBot: () => void;
  activeTab?: string;
  caseDetailWorkflow?: WorkflowItem | null;
  onNavigateTab?: (tab: string) => void;
}

export function Header({
  onOpenBot,
  activeTab = "overview",
  caseDetailWorkflow,
  onNavigateTab,
}: HeaderProps): React.JSX.Element {
  const handleGoOverview = () => {
    onNavigateTab?.("overview");
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        gap: 16,
      }}
    >
      {/* ── Left: Dynamic Interactive Breadcrumbs ── */}
      <nav
        aria-label="Breadcrumb"
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
      >
        <button
          type="button"
          onClick={handleGoOverview}
          style={{
            background: "none",
            border: "none",
            padding: "2px 6px",
            margin: "-2px -6px",
            borderRadius: 4,
            cursor: "pointer",
            color: "var(--text-soft)",
            fontWeight: 500,
            fontSize: 13,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-strong)";
            e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-soft)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          Merchant Workspace
        </button>

        <ChevronRight size={13} style={{ color: "var(--text-faint)", flexShrink: 0 }} />

        {activeTab === "overview" && (
          <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>Command Center</span>
        )}

        {activeTab === "workflows" && (
          <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>Recovery Ledger</span>
        )}

        {activeTab === "demo" && (
          <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>Live Demo Store</span>
        )}

        {activeTab === "communications" && (
          <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>Communications Hub</span>
        )}

        {activeTab === "simulation" && (
          <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>Simulation Cockpit</span>
        )}

        {activeTab === "case-detail" && (
          <>
            <button
              type="button"
              onClick={handleGoOverview}
              style={{
                background: "none",
                border: "none",
                padding: "2px 6px",
                margin: "-2px -6px",
                borderRadius: 4,
                cursor: "pointer",
                color: "var(--text-soft)",
                fontWeight: 500,
                fontSize: 13,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-strong)";
                e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-soft)";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Recovery Ledger
            </button>
            <ChevronRight size={13} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
            <span style={{ color: "var(--text-strong)", fontWeight: 600, fontFamily: "monospace" }}>
              Case #{caseDetailWorkflow?.id.slice(-8) ?? "Detail"}
            </span>
            {caseDetailWorkflow && (
              <PillBadge
                variant={
                  caseDetailWorkflow.stage === "RECOVERED"
                    ? "green"
                    : caseDetailWorkflow.stage === "HALTED"
                    ? "neutral"
                    : "blue"
                }
                style={{ marginLeft: 4 }}
              >
                {caseDetailWorkflow.stage}
              </PillBadge>
            )}
          </>
        )}
      </nav>

      {/* ── Right: Primary Quick Action ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          onClick={onOpenBot}
          style={{ height: 32, padding: "0 13px", fontSize: 12.5 }}
        >
          <Bot size={14} />
          <span>Hinglish AI Bot</span>
        </button>
      </div>
    </header>
  );
}

export default Header;

import React from "react";
import { Bot, ChevronRight, Menu } from "lucide-react";
import { WorkflowItem } from "../api/client";

interface HeaderProps {
  onOpenBot: () => void;
  activeTab?: string;
  caseDetailWorkflow?: WorkflowItem | null;
  onNavigateTab?: (tab: string) => void;
  onMenuToggle?: () => void;
}

export function Header({
  onOpenBot,
  activeTab = "overview",
  caseDetailWorkflow,
  onNavigateTab,
  onMenuToggle,
}: HeaderProps): React.JSX.Element {
  const handleGoOverview = () => {
    onNavigateTab?.("overview");
  };

  return (
    <header
      className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 md:px-7"
    >
      {/* ── Left: Dynamic Interactive Breadcrumbs ── */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-[13px] overflow-hidden whitespace-nowrap"
      >
        {/* Mobile Brand Logo (Visible only on mobile) */}
        <div
          className="flex flex-col cursor-pointer md:hidden mr-2"
          onClick={handleGoOverview}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-bold text-[var(--text-strong)] tracking-tight leading-none">
              RevRec
            </span>
            <span className="text-[10px] font-semibold px-[5px] py-[1px] rounded-[4px] bg-[var(--bg-subtle)] text-[var(--text-faint)] font-mono">
              v1.0
            </span>
          </div>
        </div>

        {/* Desktop Breadcrumbs (Hidden on Mobile) */}
        <div className="hidden items-center gap-2 md:flex">
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
            </>
          )}
        </div>
      </nav>

      {/* ── Right: Primary Quick Action & Mobile Menu ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {activeTab !== "case-detail" && (
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={onOpenBot}
            style={{ height: 32, padding: "0 13px", fontSize: 12.5 }}
          >
            <Bot size={14} />
            <span className="hidden sm:inline">Hinglish AI Bot</span>
            <span className="sm:hidden">Bot</span>
          </button>
        )}

        {/* Mobile Hamburger Button (Right Side) */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="ml-1 flex items-center justify-center rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-strong)] md:hidden"
          aria-label="Open sidebar"
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}

export default Header;

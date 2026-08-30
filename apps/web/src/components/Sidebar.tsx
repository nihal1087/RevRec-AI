import React from "react";
import {
  LayoutDashboard,
  Layers,
  Sparkles,
  ShoppingBag,
  MessageSquare,
  X,
} from "lucide-react";
import { PillBadge } from "./PillBadge";

interface SidebarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick?: () => void;
  badge?: string;
  statusColor?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

export function Sidebar({
  activeTab = "overview",
  onSelectTab,
  isOpen = false,
  onClose,
}: SidebarProps): React.JSX.Element {
  const navItems: NavGroup[] = [
    {
      group: "WORKSPACE",
      items: [
        {
          id: "overview",
          label: "Overview",
          icon: LayoutDashboard,
          onClick: () => {
            onSelectTab?.("overview");
            onClose?.();
          }
        },
        {
          id: "workflows",
          label: "Recovery Ledger",
          icon: Layers,
          onClick: () => {
            onSelectTab?.("workflows");
            onClose?.();
          }
        },
        {
          id: "communications",
          label: "Communications Hub",
          icon: MessageSquare,
          badge: "Live",
          onClick: () => {
            onSelectTab?.("communications");
            onClose?.();
          }
        },
      ],
    },
    {
      group: "SIMULATION & DEMO",
      items: [
        {
          id: "demo",
          label: "Live Demo Store",
          icon: ShoppingBag,
          badge: "New",
          onClick: () => {
            onSelectTab?.("demo");
            onClose?.();
          }
        },
        {
          id: "simulation",
          label: "Simulation Cockpit",
          icon: Sparkles,
          onClick: () => {
            onSelectTab?.("simulation");
            onClose?.();
          }
        },
      ],
    },
  ];

  return (
    <>
      {/* ── Mobile Overlay ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[240px] shrink-0 flex-col border-l transform transition-transform duration-300 ease-in-out md:left-0 md:right-auto md:border-l-0 md:border-r md:sticky md:top-0 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
      {/* ── Brand Header (Clickable Home / Overview) ── */}
      <div
        className="hidden md:flex h-[64px] px-[20px] items-center justify-between border-b border-[var(--border)] transition-colors"
      >
        <div
          className="flex flex-col flex-1 cursor-pointer"
          onClick={() => {
            onSelectTab?.("overview");
            window.scrollTo({ top: 0, behavior: "smooth" });
            onClose?.();
          }}
          title="Return to Overview"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-strong)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              RevRec
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-faint)",
                fontFamily: "monospace",
              }}
            >
              v1.0
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.2, marginTop: 1 }}>
            AI Revenue Recovery
          </span>
        </div>
      </div>

      {/* ── Navigation Tree ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          position: "relative",
        }}
      >
        {/* Mobile Close Button */}
        <div className="md:hidden flex justify-end mb-[-8px]">
          <button 
            onClick={onClose}
            className="flex items-center justify-center rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-strong)]"
          >
            <X size={18} />
          </button>
        </div>
        {navItems.map((group, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
                padding: "0 8px 4px",
              }}
            >
              {group.group}
            </span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: isActive ? "var(--brand-tint)" : "transparent",
                    color: isActive ? "var(--text-strong)" : "var(--text-body)",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "background-color 0.12s ease, color 0.12s ease",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Icon
                      size={16}
                      style={{
                        color: isActive ? "var(--text-strong)" : "var(--text-soft)",
                        flexShrink: 0,
                      }}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <PillBadge variant={item.badge.toLowerCase() === "live" ? "blue" : "green"}>
                      {item.badge}
                    </PillBadge>
                  )}

                  {item.statusColor && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: item.statusColor,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── System Telemetry & Merchant Footnote ── */}
      <div
        style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--bg-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ds-live-dot" />
            <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-strong)" }}>
              Engine Online
            </span>
          </div>
          <PillBadge variant="green" style={{ fontSize: 10, padding: "1px 6px" }}>
            ACTIVE
          </PillBadge>
        </div>

        <div
          style={{
            padding: "8px 10px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-strong)" }}>
            Razorpay Merchant
          </span>
          <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "monospace" }}>
            MID: rzp_live_94812
          </span>
        </div>
      </div>
    </aside>
    </>
  );
}

export default Sidebar;

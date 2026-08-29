import React from "react";
import {
  LayoutDashboard,
  Layers,
  Sparkles,
  ShoppingBag,
  MessageSquare,
} from "lucide-react";
import { PillBadge } from "./PillBadge";

interface SidebarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
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
            window.scrollTo({ top: 0, behavior: "smooth" });
          },
        },
        {
          id: "workflows",
          label: "Recovery Ledger",
          icon: Layers,
          onClick: () => {
            onSelectTab?.("workflows");
            setTimeout(() => {
              const el = document.getElementById("workflow-ledger-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }, 60);
          },
        },
        {
          id: "communications",
          label: "Communications Hub",
          icon: MessageSquare,
          badge: "Live",
          onClick: () => onSelectTab?.("communications"),
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
          onClick: () => onSelectTab?.("demo"),
        },
        {
          id: "simulation",
          label: "Simulation Cockpit",
          icon: Sparkles,
          onClick: () => {
            onSelectTab?.("simulation");
            setTimeout(() => {
              const el = document.getElementById("simulation-cockpit-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }, 60);
          },
        },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: 240,
        height: "100vh",
        position: "sticky",
        top: 0,
        backgroundColor: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      {/* ── Brand Header (Clickable Home / Overview) ── */}
      <div
        onClick={() => {
          onSelectTab?.("overview");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        title="Return to Overview"
        style={{
          height: 64,
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          userSelect: "none",
          transition: "background-color 0.12s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-subtle)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
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
        }}
      >
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
  );
}

export default Sidebar;

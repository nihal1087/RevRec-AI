import React from "react";
import { type LucideIcon } from "lucide-react";
import { PillBadge } from "./PillBadge";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "emerald" | "blue" | "amber" | "purple" | "danger";
  trend?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "blue",
  trend,
  onClick,
  isActive = false,
}) => {
  // Map MetricCard variant names to PillBadge variant names (L6 fix)
  const pillVariant =
    variant === "emerald" ? "green" :
    variant === "danger"  ? "red"   :
    variant;

  return (
    <div
      className="ds-card"
      onClick={onClick}
      style={{
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 112,
        position: "relative",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        border: isActive
          ? "1px solid rgba(15, 23, 42, 0.35)"
          : "1px solid var(--border)",
        boxShadow: isActive
          ? "0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.12)"
          : undefined,
        backgroundColor: isActive ? "var(--bg-subtle)" : "var(--bg-surface)",
      }}
      onMouseEnter={(e) => {
        if (onClick && !isActive) {
          e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.22)";
          e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick && !isActive) {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.backgroundColor = "var(--bg-surface)";
        }
      }}
    >
      {/* ── Top row: Label + subtle monochrome icon ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-faint)",
          }}
        >
          {title}
        </span>
        <Icon size={14} style={{ color: "var(--text-faint)", opacity: 0.8 }} />
      </div>

      {/* ── Middle: Tabular Metric Value ── */}
      <div style={{ margin: "6px 0 4px" }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text-strong)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
      </div>

      {/* ── Bottom row: Subtitle context + Trend indicator ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          fontSize: 12,
        }}
      >
        <span
          title={typeof subtitle === "string" ? subtitle : undefined}
          style={{ color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {subtitle}
        </span>

        {trend && (
          <PillBadge variant={pillVariant as "green" | "blue" | "amber" | "purple" | "teal" | "red" | "neutral"} size="sm">
            {trend}
          </PillBadge>
        )}
      </div>
    </div>
  );
};

export default MetricCard;



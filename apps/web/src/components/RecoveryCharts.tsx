import React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TimeseriesPoint, CategoryAnalytics } from "../api/client";

interface RecoveryChartsProps {
  timeseries: TimeseriesPoint[];
  categories: CategoryAnalytics | null;
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  color: "var(--text-strong)",
  padding: "8px 12px",
};

function formatCategoryLabel(raw: string): string {
  if (!raw) return "Unknown";
  const upper = raw.toUpperCase();
  if (upper.includes("SOFT")) return "Soft Delays";
  if (upper.includes("NETWORK")) return "Bank Network";
  if (upper.includes("INTENT")) return "Intent Drop";
  if (upper.includes("MANDATE")) return "Mandate Fail";
  if (upper.includes("HARD")) return "Hard Decline";
  return raw.split(" ")[0] || raw;
}

export function RecoveryCharts({
  timeseries,
  categories,
}: RecoveryChartsProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "20px",
      }}
      className="recovery-charts-grid"
    >
      <style>{`
        @media (min-width: 1024px) {
          .recovery-charts-grid { grid-template-columns: 1.6fr 1fr !important; }
        }
      `}</style>

      {/* ── 1. Area Chart: 14-Day Trajectory ── */}
      <div className="ds-card" style={{ padding: "18px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div>
            <span className="ds-section-title">14-Day Recovery Trajectory</span>
            <p style={{ fontSize: 12, color: "var(--text-soft)", margin: "2px 0 0" }}>
              Daily at-risk volume vs recovered revenue
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-soft)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#ef4444" }} />
              At Risk
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-soft)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#059669" }} />
              Recovered
            </span>
          </div>
        </div>

        <div style={{ height: "210px", width: "100%" }}>
          {timeseries.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", fontSize: 12 }}>
              No timeseries data available yet
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeseries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke="#d1d5db"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#eaedf0" }}
              />
              <YAxis
                stroke="#d1d5db"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#eaedf0" }}
                tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => {
                  const num = typeof value === "number" ? value : 0;
                  return [`₹${Math.round(num).toLocaleString("en-IN")}`, ""] as [string, string];
                }}
              />
              <Area
                type="monotone"
                dataKey="atRisk"
                stroke="#ef4444"
                strokeWidth={2}
                fill="rgba(239,68,68,0.05)"
                name="At Risk"
              />
              <Area
                type="monotone"
                dataKey="recovered"
                stroke="#059669"
                strokeWidth={2}
                fill="rgba(5,150,105,0.06)"
                name="Recovered"
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 2. Bar Chart: RCA Category Breakdown + Channels ── */}
      <div
        className="ds-card"
        style={{
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ marginBottom: "14px" }}>
            <span className="ds-section-title">Recovery by RCA Category</span>
            <p style={{ fontSize: 12, color: "var(--text-soft)", margin: "2px 0 0" }}>
              Algorithmic win-rate per failure type
            </p>
          </div>

          <div style={{ height: "140px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categories?.byCategory ?? []}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke="#d1d5db"
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#eaedf0" }}
                  unit="%"
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  stroke="#d1d5db"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  tickFormatter={formatCategoryLabel}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(val: number) => [`${val}%`, "Recovery Rate"]}
                />
                <Bar dataKey="recoveryRate" radius={[0, 4, 4, 0]} fill="#2563eb" barSize={12}>
                  {(categories?.byCategory ?? []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Channel Distribution ── */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "10px" }}>
          <span className="ds-label" style={{ fontSize: 10.5, marginBottom: "8px", display: "block" }}>
            RECOVERY CHANNELS
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {(categories?.byChannel ?? []).map((c) => (
              <div key={c.channel} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px" }}>
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: c.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--text-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                  {c.channel}
                </span>
                <span style={{ color: "var(--text-faint)", fontFamily: "monospace" }}>
                  {c.share}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RecoveryCharts;

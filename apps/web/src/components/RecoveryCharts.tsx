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

export function RecoveryCharts({ timeseries, categories }: RecoveryChartsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-8">
      {/* ── 1. Area Chart: 14-Day Recovery Trend ─────────────────────────────── */}
      <div className="lg:col-span-2 bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              14-Day Revenue Recovery Trajectory
            </h3>
            <p className="text-xs text-gray-400">
              Daily At-Risk vs Recovered (Auto-Retry + Conversational Outreach)
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> At Risk
            </span>
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Recovered
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAtRisk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="displayDate" stroke="#6b7280" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => `₹${val / 1000}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", borderRadius: "0.75rem", fontSize: "12px" }}
                formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, ""]}
              />
              <Area
                type="monotone"
                dataKey="atRisk"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAtRisk)"
                name="At Risk"
              />
              <Area
                type="monotone"
                dataKey="recovered"
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRecovered)"
                name="Recovered"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 2. Bar Chart: Recovery Rate by Decline Category ─────────────────── */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Recovery Rate by RCA Category
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Success % per standardized failure category
          </p>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categories?.byCategory ?? []}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#6b7280" fontSize={10} unit="%" />
                <YAxis
                  dataKey="category"
                  type="category"
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  width={110}
                  tickFormatter={(val) => val.split(" ")[0]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", borderRadius: "0.5rem", fontSize: "11px" }}
                  formatter={(val: number) => [`${val}%`, "Recovery Rate"]}
                />
                <Bar dataKey="recoveryRate" radius={[0, 4, 4, 0]}>
                  {(categories?.byCategory ?? []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── 3. Channel Split Donut / Legend ──────────────────────────────── */}
        <div className="border-t border-gray-800 pt-3 mt-2">
          <div className="text-xs font-semibold text-gray-300 mb-2">
            Top Recovery Channels
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(categories?.byChannel ?? []).map((c) => (
              <div key={c.channel} className="flex items-center space-x-2 bg-gray-950/60 p-2 rounded-lg border border-gray-800">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }}></span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-200 truncate">{c.channel}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{c.share}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

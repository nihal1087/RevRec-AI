import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "emerald" | "blue" | "amber" | "purple" | "danger";
  trend?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "emerald",
  trend,
}: MetricCardProps): React.JSX.Element {
  const variantStyles = {
    emerald: "from-emerald-500/10 to-teal-500/5 border-emerald-900/50 text-emerald-400",
    blue: "from-blue-500/10 to-indigo-500/5 border-blue-900/50 text-blue-400",
    amber: "from-amber-500/10 to-orange-500/5 border-amber-900/50 text-amber-400",
    purple: "from-purple-500/10 to-fuchsia-500/5 border-purple-900/50 text-purple-400",
    danger: "from-red-500/10 to-rose-500/5 border-red-900/50 text-red-400",
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 backdrop-blur-sm shadow-lg ${variantStyles[variant]}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </span>
        <div className="p-2 rounded-xl bg-gray-900/80 border border-gray-800">
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="flex items-baseline space-x-2">
        <span className="text-2xl lg:text-3xl font-extrabold text-white font-mono tracking-tight">
          {value}
        </span>
        {trend && (
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800">
            {trend}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}

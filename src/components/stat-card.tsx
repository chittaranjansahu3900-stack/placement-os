import React from "react";
import { OpsIcon, OpsIconName } from "./ops-icon";

interface StatCardProps {
  label: string;
  value: string | number;
  secondary?: string;
  trend?: string;
  icon?: OpsIconName;
  highlight?: "gold" | "emerald" | "amber" | "cobalt" | "default";
}

export function StatCard({
  label,
  value,
  secondary,
  trend,
  icon,
  highlight = "default",
}: StatCardProps) {
  const cardBorder = "border-slate-750/80 hover:border-slate-650";
  let topAccent = "";
  let iconContainer = "text-slate-300 bg-slate-800/80 border border-slate-700/60";
  let valueColor = "text-white";

  switch (highlight) {
    case "gold":
    case "amber":
      topAccent = "border-t-2 border-t-amber-500";
      iconContainer = "text-amber-300 bg-amber-950/80 border border-amber-800/70";
      valueColor = "text-amber-50";
      break;
    case "emerald":
      topAccent = "border-t-2 border-t-emerald-500";
      iconContainer = "text-emerald-300 bg-emerald-950/80 border border-emerald-800/70";
      valueColor = "text-emerald-50";
      break;
    case "cobalt":
      topAccent = "border-t-2 border-t-blue-500";
      iconContainer = "text-blue-300 bg-blue-950/80 border border-blue-800/70";
      valueColor = "text-blue-50";
      break;
    default:
      topAccent = "border-t border-t-slate-700";
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-slate-900/90 p-4 shadow-sm transition-all duration-150 hover:bg-slate-850/90 hover:shadow-md ${cardBorder} ${topAccent}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        {icon && (
          <div className={`flex size-7 items-center justify-center rounded-md transition-transform group-hover:scale-105 ${iconContainer}`}>
            <OpsIcon name={icon} size={14} />
          </div>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <p className={`font-mono text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
        {trend && (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800/80">
            <OpsIcon name="trending-up" size={10} />
            {trend}
          </span>
        )}
      </div>
      {secondary && <p className="mt-1 text-xs text-slate-400/90">{secondary}</p>}
    </div>
  );
}

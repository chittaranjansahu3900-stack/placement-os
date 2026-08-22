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
  let cardStyle = "border-slate-700 bg-slate-900";
  let iconColor = "text-slate-300 bg-slate-800";
  let valueColor = "text-white";

  switch (highlight) {
    case "gold":
      cardStyle = "border-slate-700 border-t-amber-500 bg-slate-900";
      iconColor = "text-amber-300 bg-amber-950 border border-amber-800";
      valueColor = "text-slate-100";
      break;
    case "emerald":
      cardStyle = "border-slate-700 border-t-emerald-500 bg-slate-900";
      iconColor = "text-emerald-300 bg-emerald-950 border border-emerald-800";
      valueColor = "text-slate-100";
      break;
    case "cobalt":
      cardStyle = "border-slate-700 border-t-blue-500 bg-slate-900";
      iconColor = "text-blue-300 bg-blue-950 border border-blue-800";
      valueColor = "text-slate-100";
      break;
    case "amber":
      cardStyle = "border-slate-700 border-t-amber-500 bg-slate-900";
      iconColor = "text-amber-300 bg-amber-950 border border-amber-800";
      valueColor = "text-slate-100";
      break;
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-t-2 p-4 ${cardStyle}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {icon && (
          <div className={`flex size-8 items-center justify-center rounded-md ${iconColor}`}>
            <OpsIcon name={icon} size={16} />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className={`font-mono text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
        {trend && (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-emerald-300 bg-emerald-950 border border-emerald-800">
            <OpsIcon name="trending-up" size={10} />
            {trend}
          </span>
        )}
      </div>
      {secondary && <p className="mt-1 text-xs text-slate-400">{secondary}</p>}
    </div>
  );
}

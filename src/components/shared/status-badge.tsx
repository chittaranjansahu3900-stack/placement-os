import React from "react";
import { OpsIcon, OpsIconName } from "./ops-icon";

export type StatusVariant =
  | "draft"
  | "published"
  | "applications_closed"
  | "shortlisting"
  | "closed"
  | "applied"
  | "under_review"
  | "shortlisted"
  | "interview"
  | "selected"
  | "waitlisted"
  | "rejected"
  | "placed"
  | "unplaced"
  | "stale"
  | "active"
  | "pending"
  | "pending_spc_review"
  | "deactivated"
  | "prospect"
  | "contacted"
  | "interested"
  | "committed"
  | "onboarded";

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, className = "", size = "md" }: StatusBadgeProps) {
  const normalized = (status || "").toLowerCase().replace(/[\s-]/g, "_") as StatusVariant;

  let iconName: OpsIconName = "check-shield";
  let label = status.replaceAll("_", " ");
  let colorStyles = "bg-slate-800/80 text-slate-300 border-slate-700/80";

  switch (normalized) {
    case "draft":
      iconName = "clock";
      colorStyles = "bg-slate-800/90 text-slate-300 border-slate-700";
      break;
    case "published":
    case "active":
    case "onboarded":
      iconName = "check-shield";
      colorStyles = "bg-emerald-950/70 text-emerald-300 border-emerald-700/60 shadow-[0_0_8px_rgba(16,185,129,0.1)]";
      break;
    case "shortlisted":
      iconName = "star";
      colorStyles = "bg-emerald-950/70 text-emerald-300 border-emerald-700/60 shadow-[0_0_8px_rgba(16,185,129,0.1)]";
      break;
    case "interview":
      iconName = "calendar";
      colorStyles = "bg-blue-950/70 text-blue-300 border-blue-700/60 shadow-[0_0_8px_rgba(59,130,246,0.1)]";
      break;
    case "selected":
    case "placed":
    case "committed":
      iconName = "award";
      colorStyles = "bg-emerald-950/80 text-emerald-200 border-emerald-600/70 font-semibold shadow-[0_0_10px_rgba(16,185,129,0.15)]";
      break;
    case "waitlisted":
      iconName = "clock";
      colorStyles = "bg-amber-950/70 text-amber-300 border-amber-700/60";
      break;
    case "rejected":
    case "deactivated":
      iconName = "x";
      colorStyles = "bg-red-950/70 text-red-300 border-red-800/60";
      break;
    case "stale":
      iconName = "alert-triangle";
      label = "Stale pipeline";
      colorStyles = "bg-amber-950/80 text-amber-200 border-amber-700 font-semibold";
      break;
    case "pending":
    case "pending_spc_review":
    case "under_review":
    case "contacted":
    case "interested":
      iconName = "clock";
      if (normalized === "pending_spc_review") label = "Pending SPC review";
      colorStyles = "bg-amber-950/80 text-amber-300 border-amber-700/70 shadow-[0_0_8px_rgba(245,158,11,0.1)]";
      break;
    case "applications_closed":
    case "shortlisting":
    case "closed":
      iconName = "layers";
      colorStyles = "bg-slate-850 text-slate-300 border-slate-700";
      break;
    default:
      iconName = "shield";
      colorStyles = "bg-slate-800/80 text-slate-300 border-slate-700";
  }

  const sizeStyles =
    size === "sm" ? "px-2 py-0.5 text-[11px] gap-1" : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium capitalize tracking-tight ${sizeStyles} ${colorStyles} ${className}`}
    >
      <OpsIcon name={iconName} size={size === "sm" ? 11 : 13} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}

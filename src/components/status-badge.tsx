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
  let colorStyles = "bg-command text-slate-300 border-slate-700";

  switch (normalized) {
    case "draft":
      iconName = "clock";
      colorStyles = "bg-command text-slate-400 border-slate-700";
      break;
    case "published":
    case "active":
    case "onboarded":
      iconName = "check-shield";
      colorStyles = "bg-clearance/10 text-emerald-300 border-emerald-700";
      break;
    case "shortlisted":
      iconName = "star";
      colorStyles = "bg-clearance/10 text-emerald-300 border-emerald-700";
      break;
    case "interview":
      iconName = "calendar";
      colorStyles = "bg-signal/10 text-blue-300 border-blue-700";
      break;
    case "selected":
    case "placed":
    case "committed":
      iconName = "award";
      colorStyles = "bg-clearance/10 text-emerald-300 border-emerald-700";
      break;
    case "waitlisted":
      iconName = "clock";
      colorStyles = "bg-escalation/10 text-amber-300 border-amber-700";
      break;
    case "rejected":
    case "deactivated":
      iconName = "x";
      colorStyles = "bg-breach/10 text-red-300 border-red-700";
      break;
    case "stale":
      iconName = "alert-triangle";
      label = "Stale pipeline";
      colorStyles = "bg-escalation/10 text-amber-200 border-amber-700 border-l-2";
      break;
    case "pending":
    case "pending_spc_review":
    case "under_review":
    case "contacted":
    case "interested":
      iconName = "clock";
      if (normalized === "pending_spc_review") label = "Pending SPC review";
      colorStyles = "bg-escalation/10 text-amber-300 border-amber-700";
      break;
    case "applications_closed":
    case "shortlisting":
    case "closed":
      iconName = "layers";
      colorStyles = "bg-command text-slate-300 border-slate-700";
      break;
    default:
      iconName = "shield";
      colorStyles = "bg-command text-slate-300 border-slate-700";
  }

  const sizeStyles =
    size === "sm" ? "px-2 py-0.5 text-[11px] gap-1" : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium capitalize ${sizeStyles} ${colorStyles} ${className}`}
    >
      <OpsIcon name={iconName} size={size === "sm" ? 12 : 14} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}

import React from "react";
import { OpsIcon, OpsIconName } from "@/components/shared/ops-icon";

// Light-theme companion to StatusBadge (components/shared/status-badge.tsx).
// StatusBadge's dark-chip-on-dark-page colors read as illegible or "ops
// tooling" on the light student pages, so this reuses the same status
// semantics with light backgrounds instead. StatusBadge itself stays
// untouched — it's shared with 50+ admin/recruiter dark-themed screens.
export type StudentStatus =
  | "applied"
  | "under_review"
  | "shortlisted"
  | "interview"
  | "selected"
  | "rejected"
  | "waitlisted"
  | "withdrawn"
  | "applications_closed"
  | "not_eligible";

const STYLES: Record<StudentStatus, { icon: OpsIconName; classes: string; label?: string }> = {
  applied: { icon: "check", classes: "bg-blue-50 text-blue-700" },
  under_review: { icon: "clock", classes: "bg-amber-50 text-amber-700" },
  shortlisted: { icon: "star", classes: "bg-emerald-50 text-emerald-700" },
  interview: { icon: "calendar", classes: "bg-blue-50 text-blue-700" },
  selected: { icon: "award", classes: "bg-emerald-100 text-emerald-800" },
  rejected: { icon: "x", classes: "bg-red-50 text-red-700" },
  waitlisted: { icon: "clock", classes: "bg-amber-50 text-amber-700" },
  withdrawn: { icon: "x", classes: "bg-slate-100 text-slate-500" },
  applications_closed: { icon: "layers", classes: "bg-slate-100 text-slate-500", label: "Closed" },
  not_eligible: { icon: "alert-triangle", classes: "bg-slate-100 text-slate-500", label: "Not eligible" },
};

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  const key = (status as StudentStatus) in STYLES ? (status as StudentStatus) : "withdrawn";
  const { icon, classes, label } = STYLES[key];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${classes} ${className}`}
    >
      <OpsIcon name={icon} size={12} />
      <span>{label ?? status.replaceAll("_", " ")}</span>
    </span>
  );
}

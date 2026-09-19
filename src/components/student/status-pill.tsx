import React from "react";
import { OpsIcon, OpsIconName } from "@/components/shared/ops-icon";

// Student-facing companion to StatusBadge (components/shared/status-badge.tsx):
// same dark theme and status semantics, rounder and slightly larger so it
// reads as a status on a card rather than a cell in an ops table. The whole
// app is one dark theme; there is no light variant.
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
  applied: { icon: "check", classes: "bg-blue-950/80 text-blue-300 border border-blue-800/60" },
  under_review: { icon: "clock", classes: "bg-amber-950/80 text-amber-300 border border-amber-800/60" },
  shortlisted: { icon: "star", classes: "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60" },
  interview: { icon: "calendar", classes: "bg-blue-950/80 text-blue-300 border border-blue-800/60" },
  selected: { icon: "award", classes: "bg-emerald-900/90 text-emerald-200 border border-emerald-600" },
  rejected: { icon: "x", classes: "bg-red-950/80 text-red-300 border border-red-800/60" },
  waitlisted: { icon: "clock", classes: "bg-amber-950/80 text-amber-300 border border-amber-800/60" },
  withdrawn: { icon: "x", classes: "bg-slate-800/80 text-slate-400 border border-slate-700/60" },
  applications_closed: { icon: "layers", classes: "bg-slate-800/80 text-slate-400 border border-slate-700/60", label: "Closed" },
  not_eligible: { icon: "alert-triangle", classes: "bg-slate-800/80 text-slate-400 border border-slate-700/60", label: "Not eligible" },
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

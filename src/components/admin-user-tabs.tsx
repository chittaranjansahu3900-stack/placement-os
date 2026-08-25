"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OpsIcon } from "@/components/ops-icon";

interface AdminUserTabsProps {
  pendingCount: number;
  totalUsersCount?: number;
}

export function AdminUserTabs({ pendingCount, totalUsersCount }: AdminUserTabsProps) {
  const pathname = usePathname();

  const isUsers = pathname === "/admin/users";
  const isVerifications = pathname.startsWith("/admin/verifications");

  return (
    <div className="flex border-b border-slate-800 gap-1 font-mono text-xs">
      <Link
        href="/admin/users"
        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-medium transition-colors ${
          isUsers
            ? "border-blue-500 text-blue-400 bg-blue-950/20"
            : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
        }`}
      >
        <OpsIcon name="users" size={14} />
        <span>All Accounts &amp; Access</span>
        {typeof totalUsersCount === "number" && (
          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
            {totalUsersCount}
          </span>
        )}
      </Link>

      <Link
        href="/admin/verifications"
        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-medium transition-colors ${
          isVerifications
            ? "border-amber-500 text-amber-300 bg-amber-950/20"
            : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
        }`}
      >
        <OpsIcon name="user-check" size={14} />
        <span>Verification Queue</span>
        {pendingCount > 0 ? (
          <span className="ml-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            {pendingCount} pending
          </span>
        ) : (
          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            0
          </span>
        )}
      </Link>
    </div>
  );
}

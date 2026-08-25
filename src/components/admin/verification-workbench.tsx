"use client";

import { useState, useTransition } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusBadge } from "@/components/shared/status-badge";
import { approveUser, rejectUser } from "@/app/actions/admin";

export interface VerificationUser {
  id: string;
  name: string;
  email: string;
  status: "pending" | "active" | "deactivated";
  created_at: string;
  updated_at: string;
  company_id: string | null;
  company?: {
    id: string;
    name: string;
    sector: string | null;
    pipeline_stage: string;
  } | null;
  roles?: {
    id: string;
    name: string;
  }[];
}

interface VerificationWorkbenchProps {
  users: VerificationUser[];
}

export function VerificationWorkbench({ users }: VerificationWorkbenchProps) {
  const [selectedUser, setSelectedUser] = useState<VerificationUser | null>(null);
  const [filter, setFilter] = useState<"pending" | "all" | "active" | "deactivated">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPendingAction, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const pendingUsers = users.filter((u) => u.status === "pending");
  const activeUsers = users.filter((u) => u.status === "active");
  const deactivatedUsers = users.filter((u) => u.status === "deactivated");

  const filteredUsers = users.filter((user) => {
    if (filter === "pending" && user.status !== "pending") return false;
    if (filter === "active" && user.status !== "active") return false;
    if (filter === "deactivated" && user.status !== "deactivated") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = user.name.toLowerCase().includes(q);
      const emailMatch = user.email.toLowerCase().includes(q);
      const companyMatch = user.company?.name.toLowerCase().includes(q);
      return nameMatch || emailMatch || companyMatch;
    }
    return true;
  });

  const handleApprove = (userId: string) => {
    setActionId(userId);
    startTransition(async () => {
      await approveUser(userId, "/admin/verifications");
      setSelectedUser(null);
      setActionId(null);
    });
  };

  const handleReject = (userId: string) => {
    if (!confirm("Are you sure you want to reject this account? It will be marked as deactivated.")) {
      return;
    }
    setActionId(userId);
    startTransition(async () => {
      await rejectUser(userId, "/admin/verifications");
      setSelectedUser(null);
      setActionId(null);
    });
  };

  // Helper to extract email domain and compare with company name
  const getDomainCheck = (user: VerificationUser) => {
    const emailParts = user.email.split("@");
    if (emailParts.length < 2) return { status: "unknown", text: "Invalid email" };
    const domain = emailParts[1].toLowerCase();
    const commonFreeDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];
    
    if (commonFreeDomains.includes(domain)) {
      return {
        status: "warning",
        text: `Public webmail (${domain}) - verification required`,
        badgeClass: "bg-amber-950/60 text-amber-300 border-amber-800/80",
      };
    }

    const companyNameClean = user.company?.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "";
    const domainClean = domain.split(".")[0];

    if (companyNameClean && domainClean.includes(companyNameClean.slice(0, 4))) {
      return {
        status: "pass",
        text: `Corporate domain verified (${domain})`,
        badgeClass: "bg-emerald-950/60 text-emerald-300 border-emerald-800/80",
      };
    }

    return {
      status: "neutral",
      text: `Custom corporate domain (@${domain})`,
      badgeClass: "bg-blue-950/60 text-blue-300 border-blue-800/80",
    };
  };

  return (
    <div className="space-y-6">
      {/* Metric summary banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase text-amber-300">
              Pending Queue
            </span>
            <span className="flex size-7 items-center justify-center rounded bg-amber-900/60 text-amber-300">
              <OpsIcon name="clock" size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {pendingUsers.length}
            </span>
            <span className="font-mono text-xs text-amber-400/90">Awaiting Verification</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase text-slate-400">
              Active Accounts
            </span>
            <span className="flex size-7 items-center justify-center rounded bg-slate-800 text-slate-300">
              <OpsIcon name="check-shield" size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {activeUsers.length}
            </span>
            <span className="font-mono text-xs text-slate-400">Verified &amp; Operational</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase text-slate-400">
              Deactivated / Rejected
            </span>
            <span className="flex size-7 items-center justify-center rounded bg-slate-800 text-slate-300">
              <OpsIcon name="lock" size={15} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {deactivatedUsers.length}
            </span>
            <span className="font-mono text-xs text-slate-400">Archived Records</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/90 p-3">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              filter === "pending"
                ? "bg-amber-900/80 text-amber-200 border border-amber-700 shadow-sm"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Pending Verification ({pendingUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              filter === "all"
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            All Accounts ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              filter === "active"
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Active ({activeUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("deactivated")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              filter === "deactivated"
                ? "bg-slate-800 text-white border border-slate-700"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Deactivated ({deactivatedUsers.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter applicant, email, company…"
            className="ops-input w-full pl-8 text-xs py-1.5"
          />
          <span className="absolute left-2.5 top-2 text-slate-500">
            <OpsIcon name="search" size={13} />
          </span>
        </div>
      </div>

      {/* Verification List / Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/90 shadow-sm overflow-hidden">
        <div className="border-b border-slate-800/80 px-4 py-3 bg-slate-950/50 flex items-center justify-between">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <OpsIcon name="user-check" size={14} className="text-amber-400" />
            <span>Verification Queue Entries</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Click any row to inspect verification dossier
          </span>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-800 text-slate-400 mb-3">
              <OpsIcon name="check" size={24} className="text-emerald-400" />
            </div>
            <h3 className="font-bold text-white text-sm">No verification requests found</h3>
            <p className="font-mono text-xs text-slate-400 mt-1">
              {filter === "pending"
                ? "All user registration requests have been reviewed and verified."
                : "No accounts match the current filter criteria."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {filteredUsers.map((user) => {
              const domainCheck = getDomainCheck(user);
              const isWorking = isPendingAction && actionId === user.id;

              return (
                <div
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`group flex flex-wrap items-center justify-between gap-4 p-4 transition-colors cursor-pointer hover:bg-slate-850/80 ${
                    user.status === "pending" ? "bg-amber-950/10" : ""
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 font-mono text-sm font-bold text-slate-200 group-hover:border-blue-500 group-hover:text-blue-300 transition-colors">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                          {user.name}
                        </span>
                        <StatusBadge status={user.status} size="sm" />
                        {user.company && (
                          <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-300">
                            {user.company.name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-400">
                        <span>{user.email}</span>
                        <span>·</span>
                        <span>Registered {new Date(user.created_at).toLocaleDateString()}</span>
                        <span>·</span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] ${domainCheck.badgeClass}`}
                        >
                          {domainCheck.text}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedUser(user)}
                      className="ops-button-secondary text-xs py-1.5 px-3"
                    >
                      <OpsIcon name="eye" size={13} />
                      <span>Inspect Details</span>
                    </button>

                    {user.status === "pending" && (
                      <>
                        <button
                          type="button"
                          disabled={isWorking}
                          onClick={() => handleApprove(user.id)}
                          className="ops-button-primary text-xs py-1.5 px-3"
                        >
                          <OpsIcon
                            name={isWorking ? "refresh" : "check"}
                            size={13}
                            className={isWorking ? "animate-spin" : ""}
                          />
                          <span>{isWorking ? "Creating User…" : "Approve & Create"}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isWorking}
                          onClick={() => handleReject(user.id)}
                          className="ops-button-destructive text-xs py-1.5 px-2.5"
                        >
                          <OpsIcon name="x" size={13} />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detailed Verification Modal / Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg border border-amber-600/40 bg-amber-950/60 text-amber-300">
                  <OpsIcon name="shield" size={16} />
                </span>
                <div>
                  <h3 className="font-bold text-white text-base">User Verification Dossier</h3>
                  <p className="font-mono text-xs text-slate-400">
                    Verify applicant identity, company affiliation, and access permissions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <OpsIcon name="x" size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Applicant Identity Card */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Applicant Identity
                  </span>
                  <StatusBadge status={selectedUser.status} size="sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Full Name</span>
                    <span className="text-white font-bold text-sm">{selectedUser.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Work Email</span>
                    <span className="text-blue-300 font-medium">{selectedUser.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Registered Date</span>
                    <span className="text-slate-300">
                      {new Date(selectedUser.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">User System ID</span>
                    <span className="text-slate-400 font-mono text-[11px] truncate block">
                      {selectedUser.id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Organization & Affiliation Card */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Company / Organization
                  </span>
                  {selectedUser.company ? (
                    <span className="font-mono text-[11px] text-emerald-400 flex items-center gap-1">
                      <OpsIcon name="building" size={12} />
                      <span>Affiliation Attached</span>
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-slate-500">Individual User</span>
                  )}
                </div>

                {selectedUser.company ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Company Name</span>
                      <span className="text-white font-semibold text-sm">
                        {selectedUser.company.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Pipeline Stage</span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 text-[11px] uppercase">
                        {selectedUser.company.pipeline_stage}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Industry / Sector</span>
                      <span className="text-slate-300">
                        {selectedUser.company.sector ?? "Not specified"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">CRM Record</span>
                      <span className="text-blue-400 font-mono text-[11px]">
                        Linked ({selectedUser.company.id.slice(0, 8)}…)
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="font-mono text-xs text-slate-400">
                    No corporate company linked. This user was registered without an organization profile.
                  </p>
                )}
              </div>

              {/* Security & Verification Checks */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400 block border-b border-slate-800/80 pb-2">
                  Security &amp; Domain Verification Checks
                </span>

                <div className="space-y-2 font-mono text-xs">
                  {(() => {
                    const check = getDomainCheck(selectedUser);
                    return (
                      <div className="flex items-center justify-between rounded bg-slate-900 p-2.5 border border-slate-800">
                        <div className="flex items-center gap-2">
                          <OpsIcon
                            name={check.status === "pass" ? "check" : "alert-circle"}
                            size={14}
                            className={check.status === "pass" ? "text-emerald-400" : "text-amber-400"}
                          />
                          <span className="text-slate-300">Domain Verification:</span>
                        </div>
                        <span className={`rounded border px-2 py-0.5 text-[11px] ${check.badgeClass}`}>
                          {check.text}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between rounded bg-slate-900 p-2.5 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <OpsIcon name="shield" size={14} className="text-blue-400" />
                      <span className="text-slate-300">Default Access Assignment:</span>
                    </div>
                    <span className="rounded border border-blue-800/80 bg-blue-950/60 px-2 py-0.5 text-[11px] text-blue-300">
                      {selectedUser.company ? "Corporate Recruiter Portal" : "Standard User"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded bg-slate-900 p-2.5 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <OpsIcon name="lock" size={14} className="text-emerald-400" />
                      <span className="text-slate-300">Account Creation State:</span>
                    </div>
                    <span className="text-slate-300">
                      {selectedUser.status === "active"
                        ? "Account Active & Ready"
                        : "Awaiting Admin Provisioning"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-6 py-4">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="ops-button-secondary text-xs"
              >
                Close Dossier
              </button>

              <div className="flex items-center gap-2">
                {selectedUser.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={isPendingAction}
                      onClick={() => handleReject(selectedUser.id)}
                      className="ops-button-destructive text-xs"
                    >
                      <OpsIcon name="x" size={13} />
                      <span>Reject &amp; Deactivate</span>
                    </button>
                    <button
                      type="button"
                      disabled={isPendingAction}
                      onClick={() => handleApprove(selectedUser.id)}
                      className="ops-button-primary text-xs"
                    >
                      <OpsIcon
                        name={isPendingAction ? "refresh" : "check-shield"}
                        size={14}
                        className={isPendingAction ? "animate-spin" : ""}
                      />
                      <span>{isPendingAction ? "Provisioning Account…" : "Approve & Create User"}</span>
                    </button>
                  </>
                ) : (
                  <span className="font-mono text-xs text-slate-400">
                    Account is already {selectedUser.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

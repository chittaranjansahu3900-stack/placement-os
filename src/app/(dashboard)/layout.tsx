import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import {
  DashboardNav,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/components/shared/dashboard-nav";
import { OpsIcon } from "@/components/shared/ops-icon";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getImpersonationStash } from "@/lib/auth/impersonation";
import { stopImpersonating } from "@/app/actions/impersonation";
import { createClient } from "@/lib/supabase/server";

function items(...values: Array<DashboardNavItem | false>): DashboardNavItem[] {
  return values.filter((value): value is DashboardNavItem => Boolean(value));
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const impersonation = await getImpersonationStash();

  const supabase = await createClient();
  const { data: activeBatches } = await supabase
    .from("batches")
    .select("id, name, starts_on, is_active, institute_id")
    .eq("institute_id", ctx.appUser.institute_id)
    .eq("is_active", true)
    .order("starts_on", { ascending: false });

  const activeBatch = activeBatches?.[0] ?? null;

  const canManageCompanies =
    ctx.permissionNames.has("CRM/Outreach") ||
    ctx.permissionNames.has("Shortlist Oversight") ||
    ctx.permissionNames.has("JD Management");
  const isAdmin = ctx.roleNames.includes("Admin");
  const isStudent = ctx.roleNames.includes("Student");
  const isRecruiter = ctx.roleNames.includes("Recruiter");
  const canPostJd = ctx.permissionNames.has("JD Management");
  const canSeeSpcDashboard = ctx.permissionNames.has("Shortlist Oversight");
  const canSeeReports =
    ctx.permissionNames.has("Reports & Export") || ctx.permissionNames.has("Reports - View Only");
  const canReviewCvs = ctx.permissionNames.has("Student Data - Full");
  const canManageUsers = ctx.permissionNames.has("User Management");
  const canManageRoles = ctx.permissionNames.has("Role & Permission Management");
  const canViewAuditLog = ctx.permissionNames.has("Audit Log View");
  const canImportRoster = isAdmin || ctx.permissionNames.has("Student Data - Full") || canManageUsers;
  const canSeeDefaultsAdmin = isAdmin || ctx.permissionNames.has("Student Data - Full");
  const primaryRole = ctx.roleNames[0] || "User";

  const groups: DashboardNavGroup[] = [
    {
      label: "Command",
      items: items(
        { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
        canSeeSpcDashboard && { href: "/spc", label: "SPC Pipeline", icon: "radar" },
        canSeeReports && { href: "/reports", label: "Reports & Analytics", icon: "chart" }
      ),
    },
    {
      label: "Pipelines & JDs",
      items: items(
        canManageCompanies && { href: "/companies", label: "Company CRM", icon: "building" },
        canPostJd && { href: "/jds/new", label: "Post a JD", icon: "plus", exact: true },
        (isRecruiter || isAdmin) && { href: "/jds", label: "Job Descriptions", icon: "briefcase" },
        isStudent && { href: "/jobs", label: "Browse Opportunities", icon: "briefcase" }
      ),
    },
    {
      label: "Candidate Center",
      items: items(
        isStudent && { href: "/applications", label: "My Applications", icon: "check-shield" },
        isStudent && { href: "/resume", label: "My Placement CV", icon: "file-text" },
        isStudent && { href: "/defaults", label: "Attendance & Defaults", icon: "alert-circle" },
        canReviewCvs && { href: "/resume/review", label: "CV Review Workbench", icon: "sparkles" }
      ),
    },
    {
      label: "Governance & Admin",
      items: items(
        canImportRoster && { href: "/admin/roster", label: "Roster & Batches", icon: "upload" },
        canSeeDefaultsAdmin && { href: "/admin/defaults", label: "Defaults Tracker", icon: "alert-triangle" },
        canManageUsers && { href: "/admin/verifications", label: "User Verification", icon: "user-check" },
        canManageUsers && { href: "/admin/users", label: "User Access", icon: "users" },
        canManageRoles && { href: "/admin/roles", label: "Roles & Permissions", icon: "shield" },
        canViewAuditLog && { href: "/admin/audit-log", label: "Security Audit Trail", icon: "terminal" },
        canViewAuditLog && { href: "/admin/deliverability", label: "Email Deliverability", icon: "mail" }
      ),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-night text-slate-100 selection:bg-blue-500/30 selection:text-white">
      {/* Refined Top Navigation Bar */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#0b121e] px-4 sm:px-6 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard" className="group flex min-w-0 items-center gap-2.5">
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-blue-500/60 bg-blue-950 font-display text-sm font-bold tracking-tight text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
              PO
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold tracking-tight text-white group-hover:text-blue-200 transition-colors">
                Placement<span className="text-blue-400">OS</span>
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-wider text-slate-400 sm:block">
                IIM Raipur · Placement Office
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-2 border-l border-slate-800 pl-4 font-mono text-[11px] text-slate-400 md:flex">
            {activeBatch ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400"></span>
                </span>
                <span className="text-slate-300 font-medium">{activeBatch.name} Placement Season</span>
              </>
            ) : (
              <>
                <span className="relative flex size-2 rounded-full bg-slate-600"></span>
                <span className="text-slate-400">No active placement season</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-900/90 px-3 py-1.5 shadow-sm">
            <span className="flex size-6 items-center justify-center rounded bg-slate-850 font-mono text-[11px] font-bold text-blue-300 border border-slate-700">
              {ctx.appUser.name.charAt(0).toUpperCase()}
            </span>
            <div className="max-w-44 leading-tight hidden sm:block">
              <span className="block truncate text-xs font-medium text-slate-200">{ctx.appUser.name}</span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-slate-400">
                {primaryRole}
              </span>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="flex size-8 items-center justify-center rounded-md border border-slate-800 bg-slate-900/90 text-slate-400 transition-all hover:border-red-800/80 hover:bg-red-950/80 hover:text-red-300"
            >
              <OpsIcon name="log-out" size={14} />
            </button>
          </form>
        </div>
      </header>

      {impersonation && (
        <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-800/80 bg-amber-950/40 px-4 py-2 sm:px-6">
          <span className="font-mono text-xs text-amber-200">
            Impersonating <span className="font-semibold text-white">{ctx.appUser.name}</span> as{" "}
            <span className="font-semibold">{impersonation.adminName}</span>
          </span>
          <form action={stopImpersonating}>
            <button
              type="submit"
              className="rounded border border-amber-700 bg-amber-900/60 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-800"
            >
              Return to Admin
            </button>
          </form>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <DashboardNav groups={groups} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-[#090d16] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

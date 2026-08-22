import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import {
  DashboardNav,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/components/dashboard-nav";
import { OpsIcon } from "@/components/ops-icon";
import { getCurrentUserContext } from "@/lib/auth/current-user";

function items(...values: Array<DashboardNavItem | false>): DashboardNavItem[] {
  return values.filter((value): value is DashboardNavItem => Boolean(value));
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

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
        canSeeReports && { href: "/reports", label: "Reports", icon: "chart" }
      ),
    },
    {
      label: "Pipelines & JDs",
      items: items(
        canManageCompanies && { href: "/companies", label: "Company CRM", icon: "building" },
        canPostJd && { href: "/jds/new", label: "Post a JD", icon: "plus", exact: true },
        (isRecruiter || isAdmin) && { href: "/jds", label: "Job Descriptions", icon: "briefcase" },
        isStudent && { href: "/jobs", label: "Browse JDs", icon: "briefcase" }
      ),
    },
    {
      label: "Candidate Center",
      items: items(
        isStudent && { href: "/applications", label: "My Applications", icon: "check-shield" },
        isStudent && { href: "/resume", label: "My Placement CV", icon: "file-text" },
        isStudent && { href: "/defaults", label: "Defaults", icon: "alert-circle" },
        canReviewCvs && { href: "/resume/review", label: "CV Review", icon: "sparkles" }
      ),
    },
    {
      label: "Governance",
      items: items(
        canImportRoster && { href: "/admin/roster", label: "Roster & Batches", icon: "upload" },
        canSeeDefaultsAdmin && { href: "/admin/defaults", label: "Defaults Tracker", icon: "alert-triangle" },
        canManageUsers && { href: "/admin/users", label: "User Access", icon: "users" },
        canManageRoles && { href: "/admin/roles", label: "Roles & Permissions", icon: "shield" },
        canViewAuditLog && { href: "/admin/audit-log", label: "Audit Trail", icon: "terminal" }
      ),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-night text-slate-100 selection:bg-blue-500/30 selection:text-white">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-[#0d1928] px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard" className="group flex min-w-0 items-center gap-2.5">
            <span className="relative flex size-8 shrink-0 items-center justify-center border border-blue-500 bg-blue-950 font-display text-base font-bold tracking-wide text-blue-200 before:absolute before:right-0 before:top-0 before:size-1.5 before:bg-blue-500">
              PO
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold tracking-wide text-white">
                Placement<span className="text-blue-400">OS</span>
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500 sm:block">
                IIM Raipur · Operations console
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-2 border-l border-slate-800 pl-4 font-mono text-[10px] text-slate-400 md:flex">
            <span className="size-1.5 bg-emerald-400" aria-hidden />
            <span>Active placement season</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 border border-slate-700 bg-slate-900 px-2.5 py-1.5 sm:flex">
            <span className="flex size-6 items-center justify-center bg-slate-800 font-mono text-[10px] font-semibold text-blue-300">
              {ctx.appUser.name.charAt(0).toUpperCase()}
            </span>
            <span className="max-w-40 leading-tight">
              <span className="block truncate text-[11px] font-medium text-slate-200">{ctx.appUser.name}</span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">
                {primaryRole}
              </span>
            </span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sign out"
              className="flex size-9 items-center justify-center border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-red-700 hover:bg-red-950 hover:text-red-300"
            >
              <OpsIcon name="log-out" size={15} />
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <DashboardNav groups={groups} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-night px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

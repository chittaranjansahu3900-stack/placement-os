import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  // Persona-identity nav sections (which workflow to show) stay role-name
  // based — Section 7.2 ties Student/Recruiter/Admin to a fairly fixed set
  // of pages, not a single narrow permission. The links below that each
  // correspond to one specific named Permission Set use permissionNames
  // instead, so a custom role (e.g. Senior SPC, cloned from SPC per
  // Section 7.1) sees exactly the links its actual grants unlock — not
  // whichever links happen to line up with a base role name it doesn't have.
  const canManageCompanies = ctx.roleNames.some((r) =>
    ["Admin", "SPC", "BD", "Recruiter"].includes(r),
  );
  const isAdmin = ctx.roleNames.includes("Admin");
  const isStudent = ctx.roleNames.includes("Student");
  const isRecruiter = ctx.roleNames.includes("Recruiter");

  const canPostJd = ctx.permissionNames.has("JD Management");
  const canSeeSpcDashboard = ctx.permissionNames.has("Shortlist Oversight");
  const canSeeReports =
    ctx.permissionNames.has("Reports & Export") || ctx.permissionNames.has("Reports - View Only");
  const canReviewCvs = ctx.permissionNames.has("Student Data - Full");

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <aside className="w-56 shrink-0 border-r border-neutral-800 p-4">
        <div className="mb-6">
          <p className="text-sm font-semibold text-white">Placement OS</p>
          <p className="mt-1 truncate text-xs text-neutral-500">{ctx.appUser.name}</p>
          <p className="text-xs text-neutral-600">{ctx.roleNames.join(", ") || "No role assigned"}</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link href="/dashboard" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
            Dashboard
          </Link>
          {canManageCompanies && (
            <Link href="/companies" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              Companies
            </Link>
          )}
          {canPostJd && (
            <Link href="/jds/new" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              Post a JD
            </Link>
          )}
          {isRecruiter && (
            <Link href="/jds" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              My JDs
            </Link>
          )}
          {canSeeSpcDashboard && (
            <Link href="/spc" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              SPC Dashboard
            </Link>
          )}
          {canSeeReports && (
            <Link href="/reports" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              Reports
            </Link>
          )}
          {isStudent && (
            <Link href="/defaults" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              My Defaults
            </Link>
          )}
          {isStudent && (
            <>
              <Link href="/jobs" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
                Browse JDs
              </Link>
              <Link
                href="/applications"
                className="block rounded-md px-2 py-1.5 hover:bg-neutral-900"
              >
                My Applications
              </Link>
              <Link href="/resume" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
                My CV
              </Link>
            </>
          )}
          {canReviewCvs && (
            <Link href="/resume/review" className="block rounded-md px-2 py-1.5 hover:bg-neutral-900">
              CV Reviews
            </Link>
          )}
          {isAdmin && (
            <>
              <Link
                href="/admin/roster"
                className="block rounded-md px-2 py-1.5 hover:bg-neutral-900"
              >
                Roster Import
              </Link>
              <Link
                href="/admin/defaults"
                className="block rounded-md px-2 py-1.5 hover:bg-neutral-900"
              >
                Defaults Tracker
              </Link>
              <Link
                href="/admin/users"
                className="block rounded-md px-2 py-1.5 hover:bg-neutral-900"
              >
                Users
              </Link>
              <Link
                href="/admin/roles"
                className="block rounded-md px-2 py-1.5 hover:bg-neutral-900"
              >
                Roles &amp; Permissions
              </Link>
              <Link
                href="/admin/audit-log"
                className="block rounded-md px-2 py-1.5 hover:bg-neutral-900"
              >
                Audit Log
              </Link>
            </>
          )}
        </nav>
        <form action={logout} className="mt-6">
          <button type="submit" className="text-xs text-neutral-500 hover:text-neutral-300">
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

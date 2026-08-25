import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  deactivateUser,
  reactivateUser,
  assignRole,
  removeRole,
  assignPermissionSet,
  removePermissionSet,
} from "@/app/actions/admin";
import { impersonateUser } from "@/app/actions/impersonation";
import { AdminActionButton, SubmitOnChangeSelect } from "@/components/admin-user-controls";
import { AdminUserTabs } from "@/components/admin-user-tabs";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import type { AppUser, PermissionSet, Role } from "@/types/domain";

const PAGE_SIZE = 20;
const DIRECTORY_STATUSES = ["all", "active", "deactivated"] as const;
type DirectoryStatus = (typeof DIRECTORY_STATUSES)[number];

type SearchParams = {
  error?: string;
  q?: string;
  status?: string;
  role?: string;
  page?: string;
};

type RoleJoinRow = {
  user_id: string;
  role_id: string;
  roles: { id: string; name: string } | null;
};

type PermissionJoinRow = {
  user_id: string;
  permission_set_id: string;
  permission_sets: { id: string; name: string } | null;
};

function accountHref(
  params: Pick<SearchParams, "q" | "status" | "role">,
  overrides: Partial<SearchParams> = {},
) {
  const next = new URLSearchParams();
  const values = { ...params, ...overrides };
  if (values.q) next.set("q", values.q);
  if (values.status && values.status !== "all") next.set("status", values.status);
  if (values.role) next.set("role", values.role);
  if (values.page && values.page !== "1") next.set("page", values.page);
  const query = next.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

function roleTone(roleName: string) {
  switch (roleName.toLowerCase()) {
    case "admin":
      return "border-amber-700/60 bg-amber-950/60 text-amber-300";
    case "recruiter":
      return "border-violet-700/60 bg-violet-950/60 text-violet-300";
    case "student":
      return "border-blue-700/60 bg-blue-950/60 text-blue-300";
    case "spc":
      return "border-emerald-700/60 bg-emerald-950/60 text-emerald-300";
    case "bd":
      return "border-cyan-700/60 bg-cyan-950/60 text-cyan-300";
    default:
      return "border-slate-700 bg-slate-800 text-slate-300";
  }
}

function identityTone(roleName: string) {
  switch (roleName.toLowerCase()) {
    case "admin":
      return "border-amber-700/70 bg-amber-950 text-amber-300";
    case "recruiter":
      return "border-violet-700/70 bg-violet-950 text-violet-300";
    case "student":
      return "border-blue-700/70 bg-blue-950 text-blue-300";
    case "spc":
      return "border-emerald-700/70 bg-emerald-950 text-emerald-300";
    case "bd":
      return "border-cyan-700/70 bg-cyan-950 text-cyan-300";
    default:
      return "border-slate-700 bg-slate-800 text-slate-300";
  }
}

function formatJoined(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("User Management")) redirect("/dashboard");

  const rawParams = await searchParams;
  const q = (rawParams.q ?? "").trim().slice(0, 80);
  const status: DirectoryStatus = DIRECTORY_STATUSES.includes(rawParams.status as DirectoryStatus)
    ? (rawParams.status as DirectoryStatus)
    : "all";
  const requestedPage = Math.max(1, Number.parseInt(rawParams.page ?? "1", 10) || 1);
  const canImpersonate = ctx.permissionNames.has("Impersonate Users");
  const supabase = await createClient();

  const [
    { data: roles },
    { data: permissionSets },
    { count: totalCount },
    { count: activeCount },
    { count: pendingCount },
    { count: deactivatedCount },
  ] = await Promise.all([
    supabase.from("roles").select("*").order("name"),
    supabase.from("permission_sets").select("*").order("name"),
    supabase.from("users").select("id", { count: "exact", head: true }).in("status", ["active", "deactivated"]),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("status", "deactivated"),
  ]);

  const roleRows = (roles ?? []) as Role[];
  const permissionSetRows = (permissionSets ?? []) as PermissionSet[];
  const selectedRole = roleRows.some((role) => role.id === rawParams.role) ? rawParams.role ?? "" : "";
  const safeSearch = q.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();

  let directoryQuery = supabase
    .from("users")
    .select(selectedRole ? "*, user_roles!inner(role_id)" : "*", { count: "exact" });

  if (status === "all") {
    directoryQuery = directoryQuery.in("status", ["active", "deactivated"]);
  } else {
    directoryQuery = directoryQuery.eq("status", status);
  }
  if (selectedRole) directoryQuery = directoryQuery.eq("user_roles.role_id", selectedRole);
  if (safeSearch) {
    directoryQuery = directoryQuery.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
  }

  const from = (requestedPage - 1) * PAGE_SIZE;
  const { data: directoryUsers, count: filteredCount, error: directoryError } = await directoryQuery
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const pageCount = Math.max(1, Math.ceil((filteredCount ?? 0) / PAGE_SIZE));
  if (requestedPage > pageCount) {
    redirect(accountHref({ q, status, role: selectedRole }, { page: String(pageCount) }));
  }
  const currentPage = Math.min(requestedPage, pageCount);
  const userRows = (directoryUsers ?? []) as unknown as AppUser[];
  const pageUserIds = userRows.map((user) => user.id);

  const [userRoleResult, directPermissionResult] = pageUserIds.length > 0
    ? await Promise.all([
        supabase.from("user_roles").select("user_id, role_id, roles(id, name)").in("user_id", pageUserIds),
        supabase.from("user_permission_sets").select("user_id, permission_set_id, permission_sets(id, name)").in("user_id", pageUserIds),
      ])
    : [{ data: [] }, { data: [] }];

  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of (userRoleResult.data ?? []) as unknown as RoleJoinRow[]) {
    if (!row.roles) continue;
    const assigned = rolesByUser.get(row.user_id) ?? [];
    assigned.push(row.roles);
    rolesByUser.set(row.user_id, assigned);
  }

  const directPermissionsByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of (directPermissionResult.data ?? []) as unknown as PermissionJoinRow[]) {
    if (!row.permission_sets) continue;
    const assigned = directPermissionsByUser.get(row.user_id) ?? [];
    assigned.push(row.permission_sets);
    directPermissionsByUser.set(row.user_id, assigned);
  }

  const error = rawParams.error ?? directoryError?.message;
  const persistentParams = { q, status, role: selectedRole };
  const resultStart = filteredCount ? from + 1 : 0;
  const resultEnd = Math.min(from + PAGE_SIZE, filteredCount ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-blue-400">
            <OpsIcon name="users" size={14} />
            <span>Identity &amp; Account Governance</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>User Management</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {(totalCount ?? 0).toLocaleString("en-IN")} accounts
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Find any account quickly, distinguish access profiles, and manage roles from one operational directory.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <AdminUserTabs pendingCount={pendingCount ?? 0} totalUsersCount={totalCount ?? 0} />

      <section aria-label="Account overview" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Managed accounts", value: totalCount ?? 0, detail: "Active and deactivated users", icon: "users" as const, tone: "text-blue-300", border: "border-l-blue-500" },
          { label: "Active", value: activeCount ?? 0, detail: "Can access PlacementOS", icon: "check-shield" as const, tone: "text-emerald-300", border: "border-l-emerald-500" },
          { label: "Deactivated", value: deactivatedCount ?? 0, detail: "Access currently blocked", icon: "lock" as const, tone: "text-red-300", border: "border-l-red-500" },
        ].map((metric) => (
          <div key={metric.label} className={`rounded-lg border border-slate-750 border-l-2 ${metric.border} bg-slate-900/90 p-4 shadow-sm`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{metric.value.toLocaleString("en-IN")}</p>
              </div>
              <OpsIcon name={metric.icon} size={17} className={metric.tone} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{metric.detail}</p>
          </div>
        ))}
      </section>

      <section id="account-directory" className="overflow-hidden rounded-lg border border-slate-750 bg-slate-900/90 shadow-sm">
        <div className="border-b border-slate-750 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-white"><OpsIcon name="layers" size={15} className="text-blue-400" />Account directory</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Compact rows keep high-volume access reviews scannable.</p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {resultStart.toLocaleString("en-IN")}–{resultEnd.toLocaleString("en-IN")} of {(filteredCount ?? 0).toLocaleString("en-IN")}
            </span>
          </div>

          <form method="get" className="grid gap-2 md:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]">
            <label className="relative block">
              <span className="sr-only">Search accounts</span>
              <OpsIcon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input name="q" defaultValue={q} placeholder="Search name or email…" className="ops-input w-full pl-9" />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <SubmitOnChangeSelect name="status" defaultValue={status} label="Filter accounts by status" className="ops-select w-full">
                <option value="all">All managed accounts</option><option value="active">Active</option><option value="deactivated">Deactivated</option>
              </SubmitOnChangeSelect>
            </label>
            <label>
              <span className="sr-only">Filter by role</span>
              <SubmitOnChangeSelect name="role" defaultValue={selectedRole} label="Filter accounts by role" className="ops-select w-full">
                <option value="">All roles</option>
                {roleRows.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </SubmitOnChangeSelect>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="ops-button-primary min-w-20 justify-center"><OpsIcon name="search" size={13} /> Search</button>
              {(q || status !== "all" || selectedRole) && <Link href="/admin/users#account-directory" className="ops-button-ghost justify-center">Clear</Link>}
            </div>
          </form>
        </div>

        <div className="hidden grid-cols-[minmax(15rem,1.5fr)_minmax(12rem,1fr)_7rem_8rem_minmax(13rem,auto)] gap-4 border-b border-slate-800 bg-slate-950/70 px-4 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 lg:grid">
          <span>Identity</span><span>Access profile</span><span>Status</span><span>Joined</span><span className="text-right">Quick actions</span>
        </div>

        <div className="divide-y divide-slate-800">
          {userRows.map((user) => {
            const userRoles = rolesByUser.get(user.id) ?? [];
            const availableRoles = roleRows.filter((role) => !userRoles.some((assigned) => assigned.id === role.id));
            const directPermissions = directPermissionsByUser.get(user.id) ?? [];
            const availablePermissions = permissionSetRows.filter((permission) => !directPermissions.some((assigned) => assigned.id === permission.id));
            const primaryRole = userRoles[0]?.name ?? "Unassigned";

            return (
              <article key={user.id} className="group px-4 py-3 transition-colors hover:bg-slate-800/35">
                <div className="grid items-center gap-3 lg:grid-cols-[minmax(15rem,1.5fr)_minmax(12rem,1fr)_7rem_8rem_minmax(13rem,auto)] lg:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold ${identityTone(primaryRole)}`}>{user.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{user.name}</p><p className="truncate font-mono text-[11px] text-slate-400">{user.email}</p></div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {userRoles.length > 0 ? userRoles.slice(0, 3).map((role) => <span key={role.id} className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${roleTone(role.name)}`}>{role.name}</span>) : <span className="font-mono text-[10px] text-red-300">No role assigned</span>}
                    {userRoles.length > 3 && <span className="font-mono text-[10px] text-slate-500">+{userRoles.length - 3}</span>}
                  </div>
                  <div><StatusBadge status={user.status} size="sm" /></div>
                  <time dateTime={user.created_at} className="font-mono text-[10px] text-slate-400">{formatJoined(user.created_at)}</time>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    {canImpersonate && user.status === "active" && user.id !== ctx.appUser.id && (
                      <form action={impersonateUser.bind(null, user.id)}>
                        <AdminActionButton title="View the app exactly as this user sees it" className="ops-button-secondary min-h-9 px-2.5 py-1 text-xs text-blue-300" pendingLabel="Opening" icon="eye">Impersonate</AdminActionButton>
                      </form>
                    )}
                    {user.status === "active" && user.id !== ctx.appUser.id && (
                      <form action={deactivateUser.bind(null, user.id)}>
                        <AdminActionButton className="ops-button-ghost min-h-9 px-2.5 py-1 text-xs" pendingLabel="Blocking" icon="lock">Deactivate</AdminActionButton>
                      </form>
                    )}
                    {user.status === "deactivated" && (
                      <form action={reactivateUser.bind(null, user.id)}>
                        <AdminActionButton className="ops-button-secondary min-h-9 px-2.5 py-1 text-xs text-emerald-300" pendingLabel="Restoring" icon="refresh">Reactivate</AdminActionButton>
                      </form>
                    )}
                    {user.id === ctx.appUser.id && <span className="font-mono text-[10px] text-slate-500">Current account</span>}
                  </div>
                </div>

                <details className="group/access mt-2 rounded-md border border-transparent open:border-slate-750 open:bg-slate-950/60">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded px-2 font-mono text-[10px] font-semibold text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-slate-300 [&::-webkit-details-marker]:hidden">
                    <OpsIcon name="chevron-right" size={12} className="transition-transform group-open/access:rotate-90" />
                    Edit access
                    <span className="font-normal text-slate-600">{userRoles.length} role{userRoles.length === 1 ? "" : "s"} · {directPermissions.length} direct grant{directPermissions.length === 1 ? "" : "s"}</span>
                  </summary>
                  <div className="grid gap-4 border-t border-slate-800 p-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-500">Assigned roles</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {userRoles.map((role) => (
                          <form key={role.id} action={removeRole.bind(null, user.id, role.id)}>
                            <AdminActionButton title={`Remove ${role.name} role`} className={`min-h-9 rounded border px-2.5 py-1 font-mono text-[10px] font-semibold hover:border-red-700 hover:text-red-300 ${roleTone(role.name)}`} pendingLabel="Removing" icon="x">{role.name}</AdminActionButton>
                          </form>
                        ))}
                        {availableRoles.length > 0 && (
                          <form action={assignRole.bind(null, user.id)}>
                            <SubmitOnChangeSelect name="role_id" label={`Assign a role to ${user.name}`} className="ops-select min-h-9 py-1 text-[11px]">
                              <option value="">+ Assign role…</option>{availableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </SubmitOnChangeSelect>
                          </form>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-500">Direct permission grants</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {directPermissions.map((permission) => (
                          <form key={permission.id} action={removePermissionSet.bind(null, user.id, permission.id)}>
                            <AdminActionButton title={`Remove ${permission.name} grant`} className="min-h-9 rounded border border-blue-800 bg-blue-950/70 px-2.5 py-1 font-mono text-[10px] text-blue-200 hover:border-red-700 hover:text-red-300" pendingLabel="Removing" icon="x">{permission.name}</AdminActionButton>
                          </form>
                        ))}
                        {availablePermissions.length > 0 && (
                          <form action={assignPermissionSet.bind(null, user.id)}>
                            <SubmitOnChangeSelect name="permission_set_id" label={`Grant a permission set to ${user.name}`} className="ops-select min-h-9 py-1 text-[11px]">
                              <option value="">+ Add direct grant…</option>{availablePermissions.map((permission) => <option key={permission.id} value={permission.id}>{permission.name}</option>)}
                            </SubmitOnChangeSelect>
                          </form>
                        )}
                      </div>
                      <p className="mt-2 text-[10px] text-slate-600">Direct grants remain independent of assigned roles.</p>
                    </div>
                  </div>
                </details>
              </article>
            );
          })}

          {userRows.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-slate-750 bg-slate-950 text-slate-500"><OpsIcon name="search" size={18} /></span>
              <h3 className="mt-3 text-base font-bold text-white">No accounts match</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">Try a different name, email, status, or role filter.</p>
              <Link href="/admin/users#account-directory" className="mt-4 ops-button-secondary">Clear filters</Link>
            </div>
          )}
        </div>

        {pageCount > 1 && (
          <nav aria-label="Account directory pagination" className="flex items-center justify-between gap-3 border-t border-slate-750 bg-slate-950/40 px-4 py-3">
            {currentPage > 1 ? <Link href={accountHref(persistentParams, { page: String(currentPage - 1) })} className="ops-button-secondary min-h-9 px-3 py-1 text-xs"><OpsIcon name="arrow-left" size={12} /> Previous</Link> : <span />}
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Page {currentPage} of {pageCount}</span>
            {currentPage < pageCount ? <Link href={accountHref(persistentParams, { page: String(currentPage + 1) })} className="ops-button-secondary min-h-9 px-3 py-1 text-xs">Next <OpsIcon name="arrow-right" size={12} /></Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}

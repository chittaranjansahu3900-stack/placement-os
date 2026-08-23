import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  approveUser,
  rejectUser,
  deactivateUser,
  reactivateUser,
  assignRole,
  removeRole,
  assignPermissionSet,
  removePermissionSet,
} from "@/app/actions/admin";
import { impersonateUser } from "@/app/actions/impersonation";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import type { AppUser, PermissionSet, Role } from "@/types/domain";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("User Management")) redirect("/dashboard");

  const { error } = await searchParams;
  const canImpersonate = ctx.permissionNames.has("Impersonate Users");
  const supabase = await createClient();

  const [{ data: users }, { data: userRoleRows }, { data: roles }, { data: permissionSets }, { data: directPermissionRows }] = await Promise.all([
    supabase.from("users").select("*").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role_id, roles(id, name)"),
    supabase.from("roles").select("*").order("name"),
    supabase.from("permission_sets").select("*").order("name"),
    supabase.from("user_permission_sets").select("user_id, permission_set_id, permission_sets(id, name)"),
  ]);

  const userRows = (users ?? []) as AppUser[];
  const roleRows = (roles ?? []) as Role[];
  const permissionSetRows = (permissionSets ?? []) as PermissionSet[];

  type RoleJoinRow = { user_id: string; role_id: string; roles: { id: string; name: string } | null };
  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const r of (userRoleRows ?? []) as unknown as RoleJoinRow[]) {
    if (!r.roles) continue;
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.roles);
    rolesByUser.set(r.user_id, list);
  }
  type PermissionJoinRow = { user_id: string; permission_set_id: string; permission_sets: { id: string; name: string } | null };
  const directPermissionsByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of (directPermissionRows ?? []) as unknown as PermissionJoinRow[]) {
    if (!row.permission_sets) continue;
    const list = directPermissionsByUser.get(row.user_id) ?? [];
    list.push(row.permission_sets);
    directPermissionsByUser.set(row.user_id, list);
  }

  const pending = userRows.filter((u) => u.status === "pending");
  const others = userRows.filter((u) => u.status !== "pending");

  return (
    <div className="max-w-4xl space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-blue-400">
            <OpsIcon name="users" size={14} />
            <span>Identity &amp; Account Governance</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>User Management</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {userRows.length} Accounts
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 6.7: Verification gate for recruiters, active status switches, and granular role assignments.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pending Approval Section */}
      {pending.length > 0 && (
        <section className="space-y-3 rounded-lg border border-amber-800/80 bg-amber-950/20 p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-300 font-mono flex items-center gap-2">
            <OpsIcon name="shield" size={14} className="text-amber-400" />
            <span>Pending Recruiter Verification Queue ({pending.length})</span>
          </h2>
          <div className="divide-y divide-amber-900/40">
            {pending.map((u) => (
              <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-white text-sm">{u.name}</p>
                  <p className="font-mono text-xs text-amber-300/80 mt-0.5">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={approveUser.bind(null, u.id)}>
                    <button
                      type="submit"
                      className="ops-button-primary text-xs"
                    >
                      <OpsIcon name="check" size={12} />
                      <span>Approve &amp; Unlock</span>
                    </button>
                  </form>
                  <form action={rejectUser.bind(null, u.id)}>
                    <button
                      type="submit"
                      className="ops-button-destructive text-xs"
                    >
                      <OpsIcon name="x" size={12} />
                      <span>Reject</span>
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Users Directory */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
          <OpsIcon name="users" size={14} className="text-blue-400" />
          <span>Active &amp; Deactivated Accounts</span>
        </h2>

        <div className="divide-y divide-slate-800">
          {others.map((u) => {
            const userRoles = rolesByUser.get(u.id) ?? [];
            const availableRoles = roleRows.filter((r) => !userRoles.some((ur) => ur.id === r.id));
            const directPermissions = directPermissionsByUser.get(u.id) ?? [];
            const availablePermissions = permissionSetRows.filter((permissionSet) => !directPermissions.some((assigned) => assigned.id === permissionSet.id));

            return (
              <div key={u.id} className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-white text-sm">{u.name}</p>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">
                      {u.email} · <span className="text-slate-300 font-semibold uppercase">{u.status}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={u.status} size="sm" />
                    {canImpersonate && u.status === "active" && u.id !== ctx.appUser.id && (
                      <form action={impersonateUser.bind(null, u.id)}>
                        <button
                          type="submit"
                          title="View the app exactly as this user sees it"
                          className="rounded border border-blue-800 bg-blue-950/60 px-2.5 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-900"
                        >
                          Impersonate
                        </button>
                      </form>
                    )}
                    {u.status === "active" && (
                      <form action={deactivateUser.bind(null, u.id)}>
                        <button
                          type="submit"
                          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:text-red-300 hover:border-red-800 transition-colors"
                        >
                          Deactivate
                        </button>
                      </form>
                    )}
                    {u.status === "deactivated" && (
                      <form action={reactivateUser.bind(null, u.id)}>
                        <button
                          type="submit"
                          className="rounded border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-900"
                        >
                          Reactivate
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Assigned Roles Chips */}
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="text-slate-400 font-semibold uppercase text-[10px]">Roles:</span>
                  {userRoles.map((r) => (
                    <form key={r.id} action={removeRole.bind(null, u.id, r.id)}>
                      <button
                        type="submit"
                        title="Click to remove role"
                        className="rounded bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs text-slate-200 hover:border-red-800 hover:text-red-300 transition-colors"
                      >
                        {r.name} ×
                      </button>
                    </form>
                  ))}
                  {availableRoles.length > 0 && (
                    <form action={assignRole.bind(null, u.id)} className="flex items-center gap-1">
                      <select
                        name="role_id"
                        defaultValue=""
                        required
                        className="ops-select text-xs py-1 text-slate-200"
                      >
                        <option value="" disabled>
                          Select role…
                        </option>
                        {availableRoles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <button type="submit" className="ops-button-primary text-xs py-1 px-2.5 min-h-0">
                        + Assign
                      </button>
                    </form>
                  )}
                </div>

                <details className="rounded border border-slate-800 bg-slate-950/70 p-3 shadow-inner">
                  <summary className="cursor-pointer font-mono text-[11px] font-semibold text-slate-300 hover:text-white transition-colors">
                    Direct permission grants ({directPermissions.length})
                  </summary>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {directPermissions.map((permissionSet) => (
                      <form
                        key={permissionSet.id}
                        action={removePermissionSet.bind(null, u.id, permissionSet.id)}
                      >
                        <button
                          type="submit"
                          title="Remove direct permission grant"
                          className="rounded border border-blue-800 bg-blue-950/80 px-2.5 py-0.5 text-[11px] text-blue-200 hover:border-red-700 hover:text-red-300"
                        >
                          {permissionSet.name} ×
                        </button>
                      </form>
                    ))}
                    {availablePermissions.length > 0 && (
                      <form action={assignPermissionSet.bind(null, u.id)} className="flex items-center gap-1">
                        <select
                          name="permission_set_id"
                          defaultValue=""
                          required
                          className="ops-select text-[11px] py-1 text-slate-200"
                        >
                          <option value="" disabled>
                            Select permission set…
                          </option>
                          {availablePermissions.map((permissionSet) => (
                            <option key={permissionSet.id} value={permissionSet.id}>
                              {permissionSet.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="ops-button-secondary text-xs py-1 px-2.5 min-h-0">
                          Add Grant
                        </button>
                      </form>
                    )}
                    {directPermissions.length === 0 && availablePermissions.length === 0 && (
                      <span className="text-[11px] text-slate-400 font-mono">No permission sets available.</span>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 font-mono">
                    Direct grants remain independent of assigned roles until explicitly removed.
                  </p>
                </details>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

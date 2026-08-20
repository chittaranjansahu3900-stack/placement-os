import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { approveUser, rejectUser, deactivateUser, reactivateUser, assignRole, removeRole, assignPermissionSet, removePermissionSet } from "@/app/actions/admin";
import type { AppUser, PermissionSet, Role } from "@/types/domain";

// Section 6.7 "User Management" — FR-9.2 (RBAC) admin surface: approve/
// reject pending accounts, assign/remove Roles. Section 7.2: "All Admin-role
// users are equal in permissions — there is no admin hierarchy," so no
// extra check beyond "is Admin" gates this page.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

  const { error } = await searchParams;
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
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">User Management</h1>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-amber-300">Pending Approval ({pending.length})</h2>
          <ul className="mt-3 divide-y divide-neutral-800">
            {pending.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="text-white">{u.name}</p>
                  <p className="text-xs text-neutral-500">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <form action={approveUser.bind(null, u.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectUser.bind(null, u.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-300 hover:border-red-700"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-white">All Users</h2>
        <ul className="mt-3 divide-y divide-neutral-800">
          {others.map((u) => {
            const userRoles = rolesByUser.get(u.id) ?? [];
            const availableRoles = roleRows.filter((r) => !userRoles.some((ur) => ur.id === r.id));
            const directPermissions = directPermissionsByUser.get(u.id) ?? [];
            const availablePermissions = permissionSetRows.filter((permissionSet) => !directPermissions.some((assigned) => assigned.id === permissionSet.id));
            return (
              <li key={u.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white">{u.name}</p>
                    <p className="text-xs text-neutral-500">
                      {u.email} · {u.status}
                    </p>
                  </div>
                  {u.status === "active" && (
                    <form action={deactivateUser.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500"
                      >
                        Deactivate
                      </button>
                    </form>
                  )}
                  {u.status === "deactivated" && (
                    <form action={reactivateUser.bind(null, u.id)}>
                      <button type="submit" className="rounded-md border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600">Reactivate</button>
                    </form>
                  )}
                </div>
                <details className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-neutral-300">Individual extra Permission Sets ({directPermissions.length})</summary>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {directPermissions.map((permissionSet) => (
                      <form key={permissionSet.id} action={removePermissionSet.bind(null, u.id, permissionSet.id)}>
                        <button type="submit" title="Remove direct grant" className="rounded-full border border-blue-900 px-2 py-0.5 text-xs text-blue-300 hover:border-red-700 hover:text-red-300">{permissionSet.name} ×</button>
                      </form>
                    ))}
                    {availablePermissions.length > 0 && (
                      <form action={assignPermissionSet.bind(null, u.id)} className="flex gap-1">
                        <select name="permission_set_id" className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-xs text-white outline-none focus:border-blue-600">
                          {availablePermissions.map((permissionSet) => <option key={permissionSet.id} value={permissionSet.id}>{permissionSet.name}</option>)}
                        </select>
                        <button type="submit" className="rounded-md border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300 hover:border-neutral-500">+ Add extra grant</button>
                      </form>
                    )}
                    {directPermissions.length === 0 && availablePermissions.length === 0 && <span className="text-xs text-neutral-600">No Permission Sets available.</span>}
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-600">These grants are independent of roles and remain until explicitly removed.</p>
                </details>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {userRoles.map((r) => (
                    <form key={r.id} action={removeRole.bind(null, u.id, r.id)}>
                      <button
                        type="submit"
                        className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:border-red-700 hover:text-red-300"
                        title="Click to remove"
                      >
                        {r.name} ×
                      </button>
                    </form>
                  ))}
                  {availableRoles.length > 0 && (
                    <form action={assignRole.bind(null, u.id)} className="flex gap-1">
                      <select
                        name="role_id"
                        className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-xs text-white outline-none focus:border-blue-600"
                      >
                        {availableRoles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300 hover:border-neutral-500"
                      >
                        + Add role
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
          {others.length === 0 && <p className="py-6 text-sm text-neutral-500">No other users yet.</p>}
        </ul>
      </div>
    </div>
  );
}

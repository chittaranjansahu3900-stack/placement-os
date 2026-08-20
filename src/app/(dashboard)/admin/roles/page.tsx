import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createCustomRole, updateCustomRole } from "@/app/actions/admin";
import type { Role, PermissionSet } from "@/types/domain";

// Section 6.8 "Role & Permission Management" — Section 7.1: a custom Role
// clones an existing Role's default Permission Set bundle, then
// adds/removes sets. The "clone from" select below reloads the page (GET)
// so the checkbox defaults can be pre-populated server-side from that
// role's actual current bundle — no client JS needed for that.
export default async function AdminRolesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; clone_from_role_id?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

  const { error, clone_from_role_id } = await searchParams;
  const supabase = await createClient();

  const [{ data: roles }, { data: permissionSets }, { data: bundleRows }] = await Promise.all([
    supabase.from("roles").select("*").order("is_base_role", { ascending: false }).order("name"),
    supabase.from("permission_sets").select("*").order("name"),
    supabase.from("role_permission_sets").select("role_id, permission_set_id"),
  ]);

  const roleRows = (roles ?? []) as Role[];
  const permissionSetRows = (permissionSets ?? []) as PermissionSet[];
  const bundles = new Map<string, Set<string>>();
  for (const b of bundleRows ?? []) {
    const set = bundles.get(b.role_id) ?? new Set<string>();
    set.add(b.permission_set_id);
    bundles.set(b.role_id, set);
  }

  const cloneFromDefaults: Set<string> = clone_from_role_id
    ? (bundles.get(clone_from_role_id) ?? new Set<string>())
    : new Set<string>();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Roles &amp; Permissions</h1>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div>
        <h2 className="text-sm font-semibold text-white">Existing Roles</h2>
        <ul className="mt-3 divide-y divide-neutral-800">
          {roleRows.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <p className="text-white">
                {r.name}{" "}
                <span className="text-xs text-neutral-500">
                  {r.is_base_role ? "(base role, locked)" : "(custom)"}
                </span>
              </p>
              <p className="text-xs text-neutral-500">
                {Array.from(bundles.get(r.id) ?? [])
                  .map((psId) => permissionSetRows.find((ps) => ps.id === psId)?.name)
                  .filter(Boolean)
                  .join(", ") || "No permission sets"}
              </p>
              {!r.is_base_role && (
                <details className="mt-2 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
                  <summary className="cursor-pointer text-xs text-blue-400">Edit custom role</summary>
                  <form action={updateCustomRole.bind(null, r.id)} className="mt-3 space-y-3">
                    <label className="block text-xs text-neutral-400">Role name<input name="name" required defaultValue={r.name} className="mt-1 block w-full max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600" /></label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {permissionSetRows.map((permissionSet) => (
                        <label key={permissionSet.id} className="flex items-start gap-2 text-xs text-neutral-300">
                          <input type="checkbox" name="permission_set_ids" value={permissionSet.id} defaultChecked={bundles.get(r.id)?.has(permissionSet.id)} className="mt-0.5" />
                          <span>{permissionSet.name}</span>
                        </label>
                      ))}
                    </div>
                    <button type="submit" className="rounded-md border border-blue-800 px-3 py-1.5 text-xs text-blue-300 hover:border-blue-600">Save role bundle</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white">New Role</h2>
        <form method="get" className="mt-3 flex gap-2">
          <select
            name="clone_from_role_id"
            defaultValue={clone_from_role_id ?? ""}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          >
            <option value="">Clone from…</option>
            {roleRows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
          >
            Load bundle
          </button>
        </form>

        <form action={createCustomRole} className="mt-4 space-y-3">
          <input type="hidden" name="clone_from_role_id" value={clone_from_role_id ?? ""} />
          <div>
            <label htmlFor="name" className="block text-sm text-neutral-300">
              Role name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Senior SPC"
              className="mt-1 w-full max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <p className="text-sm text-neutral-300">Permission sets</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {permissionSetRows.map((ps) => (
                <label key={ps.id} className="flex items-start gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    name="permission_set_ids"
                    value={ps.id}
                    defaultChecked={cloneFromDefaults.has(ps.id)}
                    className="mt-0.5"
                  />
                  <span>{ps.name}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Create Role
          </button>
        </form>
      </div>
    </div>
  );
}

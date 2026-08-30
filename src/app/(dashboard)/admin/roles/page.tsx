import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createCustomRole, updateCustomRole } from "@/app/actions/admin";
import { OpsIcon } from "@/components/shared/ops-icon";
import type { Role, PermissionSet } from "@/types/domain";

export default async function AdminRolesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; clone_from_role_id?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Role & Permission Management")) redirect("/dashboard");

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
    <div className="max-w-4xl space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-amber-400">
            <OpsIcon name="shield" size={14} />
            <span>Access Control Matrix</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Roles &amp; Permission Sets</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {roleRows.length} Roles
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 6.8: Base system roles and custom bundle definitions cloned with granular permission sets.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Existing Roles List */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
          <OpsIcon name="layers" size={14} className="text-amber-400" />
          <span>Defined Institute Roles</span>
        </h2>

        <div className="divide-y divide-slate-800">
          {roleRows.map((r) => {
            const rolePermissions = Array.from(bundles.get(r.id) ?? [])
              .map((psId) => permissionSetRows.find((ps) => ps.id === psId)?.name)
              .filter(Boolean);

            return (
              <div key={r.id} className="py-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-sm">{r.name}</span>
                    <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold border ${
                      r.is_base_role
                        ? "bg-slate-800 text-slate-300 border-slate-700"
                        : "bg-blue-950 text-blue-300 border-blue-800"
                    }`}>
                      {r.is_base_role ? "Base System Role" : "Custom Role"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {rolePermissions.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-slate-950 border border-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300"
                    >
                      {name}
                    </span>
                  ))}
                  {rolePermissions.length === 0 && (
                    <span className="text-xs text-slate-400 font-mono">No permission sets assigned</span>
                  )}
                </div>

                {!r.is_base_role && (
                  <details className="mt-3 rounded border border-slate-850 bg-slate-950/80 p-3.5 shadow-inner">
                    <summary className="cursor-pointer font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      Edit Custom Role Permissions
                    </summary>
                    <form action={updateCustomRole.bind(null, r.id)} className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-mono text-slate-400">Role Name</label>
                        <input
                          name="name"
                          required
                          defaultValue={r.name}
                          className="ops-input mt-1 w-full max-w-xs text-xs text-white"
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 pt-2">
                        {permissionSetRows.map((ps) => (
                          <label key={ps.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              name="permission_set_ids"
                              value={ps.id}
                              defaultChecked={bundles.get(r.id)?.has(ps.id)}
                              className="accent-blue-600 size-3.5"
                            />
                            <span>{ps.name}</span>
                          </label>
                        ))}
                      </div>
                      <button type="submit" className="ops-button-primary text-xs">
                        Save Bundle
                      </button>
                    </form>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Create Custom Role Section */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
          <OpsIcon name="plus" size={14} className="text-emerald-400" />
          <span>Create Custom Role Bundle</span>
        </h2>

        <form method="get" className="flex items-center gap-2">
          <select
            name="clone_from_role_id"
            key={`clone-${clone_from_role_id ?? ""}`}
            defaultValue={clone_from_role_id ?? ""}
            className="ops-select text-xs text-white"
          >
            <option value="">Clone Permissions From...</option>
            {roleRows.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button type="submit" className="ops-button-secondary text-xs py-1 px-3 min-h-0">
            Load Template
          </button>
        </form>

        <form action={createCustomRole} className="space-y-4 pt-2">
          <input type="hidden" name="clone_from_role_id" value={clone_from_role_id ?? ""} />
          <div>
            <label htmlFor="name" className="block text-xs font-medium text-slate-300">
              New Role Title *
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Senior SPC / Associate CDPO"
              className="ops-input mt-1.5 w-full max-w-sm text-xs text-white"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-300">Include Permission Sets</p>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {permissionSetRows.map((ps) => (
                <label key={ps.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-300 cursor-pointer shadow-inner">
                  <input
                    key={`role-perm-${clone_from_role_id ?? "empty"}-${ps.id}`}
                    type="checkbox"
                    name="permission_set_ids"
                    value={ps.id}
                    defaultChecked={cloneFromDefaults.has(ps.id)}
                    className="accent-blue-600 size-3.5"
                  />
                  <span>{ps.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="ops-button-primary text-xs"
          >
            Create Custom Role
          </button>
        </form>
      </section>
    </div>
  );
}

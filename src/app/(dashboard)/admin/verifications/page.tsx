import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { OpsIcon } from "@/components/ops-icon";
import { AdminUserTabs } from "@/components/admin-user-tabs";
import { VerificationWorkbench, type VerificationUser } from "@/components/verification-workbench";
import type { AppUser } from "@/types/domain";

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("User Management")) redirect("/dashboard");

  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: users }, { data: companies }, { data: userRoleRows }] = await Promise.all([
    supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("id, name, sector, pipeline_stage"),
    supabase.from("user_roles").select("user_id, role_id, roles(id, name)"),
  ]);

  const userRows = (users ?? []) as AppUser[];
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c]));

  type RoleJoinRow = { user_id: string; role_id: string; roles: { id: string; name: string } | null };
  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const r of (userRoleRows ?? []) as unknown as RoleJoinRow[]) {
    if (!r.roles) continue;
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.roles);
    rolesByUser.set(r.user_id, list);
  }

  const enrichedUsers: VerificationUser[] = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    created_at: u.created_at,
    updated_at: u.updated_at,
    company_id: u.company_id ?? null,
    company: u.company_id ? companyMap.get(u.company_id) ?? null : null,
    roles: rolesByUser.get(u.id) ?? [],
  }));

  const pendingCount = enrichedUsers.filter((u) => u.status === "pending").length;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-amber-400">
            <OpsIcon name="shield" size={14} />
            <span>Identity &amp; Account Verification Gate</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>User Verification Queue</span>
            {pendingCount > 0 ? (
              <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-300">
                {pendingCount} Awaiting Review
              </span>
            ) : (
              <span className="rounded bg-slate-800 border border-slate-700 px-2.5 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                Queue Clear
              </span>
            )}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 6.7: Review applicant dossiers, corporate credentials, and company domain integrity before provisioning active user accounts.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <AdminUserTabs pendingCount={pendingCount} totalUsersCount={userRows.length} />

      {/* Verification Workbench */}
      <VerificationWorkbench users={enrichedUsers} />
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { updateStalenessThreshold } from "@/app/actions/spc";
import type { SpcPipelineRow } from "@/types/domain";

// Section 3.3 "Keeping every pipeline moving" — FR-5.1 (active JDs, round,
// shortlist count) and FR-5.4 (staleness flag) off spc_pipeline_overview.
// Gated to whoever holds Shortlist Oversight (not role name) — the view's
// numbers are only correct for a caller who can actually see every
// application, see that view's own comment. Staleness now tracks the latest
// of the JD row or any application activity on it
// (0012_codex_audit_fixes.sql) — it previously only looked at the JD row
// itself, so round scheduling never kept a JD looking "fresh."
export default async function SpcDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Shortlist Oversight")) {
    redirect("/dashboard");
  }
  // institute_settings_write RLS literally checks has_role('Admin'), not a
  // Permission Set — Section 9 leaves "who can change staleness" unresolved,
  // and that RLS's own hardcoded role check is the actual boundary here, so
  // matching it with a role-name check (not permissionNames) is correct,
  // not a mismatch — unlike every other check on this page.
  const isAdmin = ctx.roleNames.includes("Admin");

  const supabase = await createClient();
  const [{ data: pipeline }, { data: settings }] = await Promise.all([
    supabase
      .from("spc_pipeline_overview")
      .select("*")
      .order("is_stale", { ascending: false })
      .order("jd_updated_at", { ascending: true }),
    supabase
      .from("institute_settings")
      .select("staleness_days")
      .eq("institute_id", ctx.appUser.institute_id)
      .single(),
  ]);

  const rows = (pipeline ?? []) as SpcPipelineRow[];
  const staleCount = rows.filter((r) => r.is_stale).length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Active Companies</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {rows.length} active JD{rows.length === 1 ? "" : "s"}
            {staleCount > 0 && <span className="text-amber-400"> — {staleCount} stale</span>}
          </p>
        </div>
        {isAdmin && (
          <form action={updateStalenessThreshold} className="flex items-end gap-2">
            <label className="text-xs text-neutral-400">
              Stale after (days)
              <input
                name="staleness_days"
                type="number"
                min={1}
                defaultValue={settings?.staleness_days ?? 3}
                className="mt-1 block w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
            >
              Save
            </button>
          </form>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-6 divide-y divide-neutral-800">
        {rows.map((r) => (
          <li key={r.jd_id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              {r.is_stale && (
                <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">
                  Stale
                </span>
              )}
              <div>
                <Link
                  href={`/jds/${r.jd_id}/applicants`}
                  className="text-sm text-white hover:underline"
                >
                  {r.company_name} — {r.role_title}
                </Link>
                <p className="text-xs text-neutral-500">
                  {r.jd_status} · updated {new Date(r.jd_updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <span className="text-xs text-neutral-400">
              {r.shortlisted_count} shortlisted / {r.total_applications} total
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <p className="py-6 text-sm text-neutral-500">No active JDs right now.</p>
        )}
      </ul>
    </div>
  );
}

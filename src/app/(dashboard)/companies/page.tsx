import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCompany } from "@/app/actions/companies";
import { CompanyImportReview } from "@/components/company-import-review";
import { outreachFunnel } from "@/lib/outreach-funnel";
import type { Company, PipelineStage } from "@/types/domain";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "prospect", label: "Prospect" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "committed", label: "Committed" },
  { key: "onboarded", label: "Onboarded" },
];

// FR-8.1: Company pipeline Kanban (Prospect → Contacted → Interested →
// Committed → Onboarded). Stage changes, contacts, and outreach logging
// happen on the company detail page (/companies/[id]) — this is the board view.
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string; season?: string }>;
}) {
  const { error, imported, skipped, season } = await searchParams;
  const supabase = await createClient();
  const [
    { data: companies },
    { data: batches },
    { data: activities },
    { data: users },
    { data: userRoles },
    { data: roles },
  ] = await Promise.all([
    supabase.from("companies").select("*").order("created_at", { ascending: false }),
    supabase.from("batches").select("id, name, is_active, starts_on, ends_on").order("starts_on", { ascending: false }),
    supabase.from("outreach_activities").select("batch_id, company_id, logged_by_user_id, merge_status"),
    supabase.from("users").select("id, name"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("roles").select("id, name, cloned_from_role_id"),
  ]);

  const rows = (companies ?? []) as Company[];
  const byStage = new Map<PipelineStage, Company[]>(STAGES.map((s) => [s.key, []]));
  for (const c of rows) {
    byStage.get(c.pipeline_stage)?.push(c);
  }
  const selectedSeasonId = season && (batches ?? []).some((batch) => batch.id === season)
    ? season
    : (batches ?? []).find((batch) => batch.is_active)?.id ?? batches?.[0]?.id ?? "";
  const roleById = new Map((roles ?? []).map((role) => [role.id, role]));
  const jpcUserIds = new Set<string>();
  for (const assignment of userRoles ?? []) {
    let role = roleById.get(assignment.role_id);
    const visited = new Set<string>();
    while (role && !visited.has(role.id)) {
      if (role.name === "BD" || role.name === "JPC") jpcUserIds.add(assignment.user_id);
      visited.add(role.id);
      role = role.cloned_from_role_id ? roleById.get(role.cloned_from_role_id) : undefined;
    }
  }
  const funnelRows = selectedSeasonId
    ? outreachFunnel(
        selectedSeasonId,
        (users ?? []).filter((user) => jpcUserIds.has(user.id)),
        activities ?? [],
        rows,
      )
    : [];

  return (
    <div>
      <h1 className="text-lg font-semibold text-white">Company Pipeline</h1>
      <p className="mt-1 text-sm text-neutral-400">Section 4.8 — pre-season outreach CRM.</p>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {imported != null && (
        <p className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Imported {imported} compan{Number(imported) === 1 ? "y" : "ies"}; skipped {skipped ?? 0} invalid or existing row{Number(skipped) === 1 ? "" : "s"}.
        </p>
      )}

      <form action={createCompany} className="mt-6 flex gap-2">
        <input
          name="name"
          placeholder="Company name"
          required
          className="flex-1 max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
        />
        <input
          name="sector"
          placeholder="Sector (optional)"
          className="w-40 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Add
        </button>
      </form>

      <CompanyImportReview />

      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">JPC outreach funnel</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Unique companies contacted → explicitly marked Responded → currently Onboarded, attributed to the JPC and snapshotted season.
            </p>
          </div>
          <form method="get">
            <label className="text-xs text-neutral-400">
              Season
              <select name="season" defaultValue={selectedSeasonId} className="ml-2 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white">
                {(batches ?? []).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}{batch.is_active ? " (active)" : ""}</option>)}
              </select>
            </label>
            <button className="ml-2 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300">View</button>
          </form>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500"><tr><th className="pb-2">JPC</th><th className="pb-2">Contacted</th><th className="pb-2">Responded</th><th className="pb-2">Onboarded</th><th className="pb-2">Response rate</th><th className="pb-2">Onboarding rate</th></tr></thead>
            <tbody className="divide-y divide-neutral-800">
              {funnelRows.map((row) => (
                <tr key={row.userId}><td className="py-2 text-neutral-200">{row.name}</td><td>{row.contacted}</td><td>{row.responded}</td><td>{row.onboarded}</td><td>{row.responseRate}%</td><td>{row.onboardingRate}%</td></tr>
              ))}
            </tbody>
          </table>
          {funnelRows.length === 0 && <p className="py-4 text-xs text-neutral-500">No JPC role assignments are available for this season report.</p>}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-5 gap-3 overflow-x-auto">
        {STAGES.map((stage) => (
          <div key={stage.key} className="min-w-[180px]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {stage.label} ({byStage.get(stage.key)?.length ?? 0})
            </p>
            <div className="space-y-2">
              {(byStage.get(stage.key) ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="block rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-600"
                >
                  <p className="text-sm text-white">{c.name}</p>
                  <p className="text-xs text-neutral-500">{c.sector ?? "—"}</p>
                  {c.jd_form_received && (
                    <span className="mt-1 inline-block rounded-full bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      JD form received
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

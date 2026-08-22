import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCompany } from "@/app/actions/companies";
import { CompanyImportReview } from "@/components/company-import-review";
import { outreachFunnel } from "@/lib/outreach-funnel";
import { OpsIcon } from "@/components/ops-icon";
import type { Company, PipelineStage } from "@/types/domain";

const STAGES: { key: PipelineStage; label: string; color: string; border: string; bg: string }[] = [
  { key: "prospect", label: "Prospect", color: "text-slate-400", border: "border-slate-800", bg: "bg-slate-900/40" },
  { key: "contacted", label: "Contacted", color: "text-blue-400", border: "border-blue-800/60", bg: "bg-blue-950/20" },
  { key: "interested", label: "Interested", color: "text-purple-400", border: "border-purple-800/60", bg: "bg-purple-950/20" },
  { key: "committed", label: "Committed", color: "text-amber-400", border: "border-amber-800/60", bg: "bg-amber-950/20" },
  { key: "onboarded", label: "Onboarded", color: "text-emerald-400", border: "border-emerald-800/60", bg: "bg-emerald-950/30" },
];

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
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
            <OpsIcon name="building" size={14} />
            <span>Corporate Relations CRM</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Company Outreach Pipeline</span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {rows.length} Total Partners
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Section 4.8: Pre-season corporate outreach CRM across Prospect, Contacted, Interested, Committed, and Onboarded stages.
          </p>
        </div>

        {/* Quick Add Company Form */}
        <form action={createCompany} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-2 shadow-sm">
          <input
            name="name"
            placeholder="Company name..."
            required
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
          <input
            name="sector"
            placeholder="Sector (e.g. FMCG)"
            className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <OpsIcon name="plus" size={13} />
            <span>Add Partner</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {imported != null && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/50 p-3.5 text-xs text-emerald-200">
          <OpsIcon name="check" size={16} className="text-emerald-400" />
          <span>Imported {imported} company records ({skipped ?? 0} existing skipped).</span>
        </div>
      )}

      {/* CSV Import Component */}
      <CompanyImportReview />

      {/* JPC Outreach Conversion Telemetry Funnel */}
      <section className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
              <OpsIcon name="chart" size={16} className="text-blue-400" />
              <span>JPC Outreach Velocity &amp; Funnel Telemetry</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Unique accounts contacted → Responded status → Final Onboarded attribution per coordinator.
            </p>
          </div>
          <form method="get" className="flex items-center gap-2">
            <label className="text-xs font-mono text-slate-400">
              Season:
              <select
                name="season"
                defaultValue={selectedSeasonId}
                className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white outline-none focus:border-blue-500"
              >
                {(batches ?? []).map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}{batch.is_active ? " (Active)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700">
              Filter
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
              <tr>
                <th className="pb-2">JPC Coordinator</th>
                <th className="pb-2 text-center">Contacted</th>
                <th className="pb-2 text-center">Responded</th>
                <th className="pb-2 text-center">Onboarded</th>
                <th className="pb-2 text-center">Response Rate</th>
                <th className="pb-2 text-right">Conversion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {funnelRows.map((row) => (
                <tr key={row.userId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 font-sans font-medium text-slate-200">{row.name}</td>
                  <td className="py-2.5 text-center text-slate-300">{row.contacted}</td>
                  <td className="py-2.5 text-center text-blue-300">{row.responded}</td>
                  <td className="py-2.5 text-center text-emerald-400 font-bold">{row.onboarded}</td>
                  <td className="py-2.5 text-center text-slate-300">{row.responseRate}%</td>
                  <td className="py-2.5 text-right font-bold text-emerald-400">{row.onboardingRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {funnelRows.length === 0 && (
            <p className="py-4 text-xs text-slate-500 text-center">No JPC coordinator assignments active for this season.</p>
          )}
        </div>
      </section>

      {/* 5-Stage Outreach Kanban Board */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <OpsIcon name="grid" size={16} className="text-amber-400" />
            <span>Outreach Pipeline Stages</span>
          </h2>
          <span className="text-xs text-slate-500 font-mono">Select card to manage contacts &amp; mail merge</span>
        </div>

        <div className="grid grid-cols-5 gap-3.5 overflow-x-auto min-w-[900px]">
          {STAGES.map((stage) => {
            const list = byStage.get(stage.key) ?? [];
            return (
              <div
                key={stage.key}
                className={`rounded-xl border ${stage.border} ${stage.bg} p-3 min-w-[175px] flex flex-col`}
              >
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800/80">
                  <span className={`text-xs font-bold uppercase tracking-wider font-mono ${stage.color}`}>
                    {stage.label}
                  </span>
                  <span className="flex size-5 items-center justify-center rounded-full bg-slate-900 border border-slate-700 font-mono text-[11px] font-bold text-slate-300">
                    {list.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1">
                  {list.map((c) => (
                    <Link
                      key={c.id}
                      href={`/companies/${c.id}`}
                      className="group block rounded-lg border border-slate-800 bg-slate-950 p-3 transition-colors hover:border-slate-600"
                    >
                      <p className="font-bold text-white text-xs group-hover:text-amber-300 transition-colors">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{c.sector ?? "General"}</p>
                      {c.jd_form_received && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                          <OpsIcon name="check" size={10} />
                          <span>JD Form Received</span>
                        </span>
                      )}
                    </Link>
                  ))}
                  {list.length === 0 && (
                    <p className="py-8 text-center text-[11px] font-mono text-slate-600">No accounts</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

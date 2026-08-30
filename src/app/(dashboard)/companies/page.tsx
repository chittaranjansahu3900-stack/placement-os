import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createCompany } from "@/app/actions/companies";
import { CompanyImportReview } from "@/components/companies/company-import-review";
import { outreachFunnel } from "@/lib/outreach-funnel";
import { OpsIcon } from "@/components/shared/ops-icon";
import type { Company, PipelineStage } from "@/types/domain";

const STAGES: { key: PipelineStage; label: string; color: string; border: string; bg: string }[] = [
  { key: "prospect", label: "Prospect", color: "text-slate-400", border: "border-slate-750", bg: "bg-slate-900/60" },
  { key: "contacted", label: "Contacted", color: "text-blue-400", border: "border-blue-800/80", bg: "bg-blue-950/30" },
  { key: "interested", label: "Interested", color: "text-amber-400", border: "border-amber-800/80", bg: "bg-amber-950/30" },
  { key: "committed", label: "Committed", color: "text-emerald-400", border: "border-emerald-800/80", bg: "bg-emerald-950/30" },
  { key: "onboarded", label: "Onboarded", color: "text-emerald-300", border: "border-emerald-700", bg: "bg-emerald-950/50" },
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
    <div className="space-y-7">
      {/* Top Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-amber-400">
            <OpsIcon name="building" size={14} />
            <span>Corporate Relations CRM</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Company Outreach Pipeline</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {rows.length} Total Partners
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Section 4.8: Pre-season corporate outreach CRM across Prospect, Contacted, Interested, Committed, and Onboarded stages.
          </p>
        </div>

        {/* Quick Add Company Form */}
        <form action={createCompany} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-750 bg-slate-900/90 p-2.5 shadow-sm">
          <input
            name="name"
            placeholder="Company name..."
            required
            className="ops-input text-xs text-white"
          />
          <input
            name="sector"
            placeholder="Sector (e.g. FMCG)"
            className="ops-input w-36 text-xs text-white"
          />
          <button
            type="submit"
            className="ops-button-primary text-xs shrink-0"
          >
            <OpsIcon name="plus" size={13} />
            <span>Add Partner</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {imported != null && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-800/80 bg-emerald-950/70 p-3.5 text-xs text-emerald-200 shadow-sm">
          <OpsIcon name="check" size={15} className="text-emerald-400 shrink-0" />
          <span>Imported {imported} company records ({skipped ?? 0} existing skipped).</span>
        </div>
      )}

      {/* CSV Import Component */}
      <CompanyImportReview />

      {/* JPC Outreach Conversion Telemetry Funnel */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div>
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2 font-mono">
              <OpsIcon name="chart" size={14} className="text-blue-400" />
              <span>JPC Outreach Velocity &amp; Funnel Telemetry</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Unique accounts contacted → Responded status → Final Onboarded attribution per coordinator.
            </p>
          </div>
          <form method="get" className="flex items-center gap-2">
            <label className="text-xs font-mono text-slate-300">
              Season:
              <select
                name="season"
                key={selectedSeasonId}
                defaultValue={selectedSeasonId}
                className="ops-select ml-2 text-xs text-white"
              >
                {(batches ?? []).map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}{batch.is_active ? " (Active)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="ops-button-secondary text-xs py-1 px-3 min-h-0">
              Filter
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 bg-slate-950/60">
              <tr>
                <th className="py-2.5 px-3">JPC Coordinator</th>
                <th className="py-2.5 px-3 text-center">Contacted</th>
                <th className="py-2.5 px-3 text-center">Responded</th>
                <th className="py-2.5 px-3 text-center">Onboarded</th>
                <th className="py-2.5 px-3 text-center">Response Rate</th>
                <th className="py-2.5 px-3 text-right">Conversion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {funnelRows.map((row) => (
                <tr key={row.userId} className="hover:bg-slate-850/50 transition-colors">
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-200">{row.name}</td>
                  <td className="py-2.5 px-3 text-center text-slate-300">{row.contacted}</td>
                  <td className="py-2.5 px-3 text-center text-blue-300">{row.responded}</td>
                  <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{row.onboarded}</td>
                  <td className="py-2.5 px-3 text-center text-slate-300">{row.responseRate}%</td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{row.onboardingRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {funnelRows.length === 0 && (
            <p className="py-6 text-xs text-slate-400 font-mono text-center">No JPC coordinator assignments active for this season.</p>
          )}
        </div>
      </section>

      {/* 5-Stage Outreach Kanban Board */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <OpsIcon name="grid" size={14} className="text-amber-400" />
            <span>Outreach Pipeline Stages</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">Select card to manage company contacts &amp; outreach</span>
        </div>

        <div className="grid grid-cols-5 gap-3.5 overflow-x-auto min-w-[900px]">
          {STAGES.map((stage) => {
            const list = byStage.get(stage.key) ?? [];
            return (
              <div
                key={stage.key}
                className={`rounded-lg border ${stage.border} ${stage.bg} p-3 min-w-[175px] flex flex-col shadow-sm`}
              >
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
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
                      className="group block rounded-md border border-slate-750 bg-slate-950/80 p-3 transition-all hover:border-slate-650 hover:bg-slate-900 shadow-sm"
                    >
                      <p className="font-bold text-white text-xs group-hover:text-blue-300 transition-colors">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{c.sector ?? "General"}</p>
                      {c.jd_form_received && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-950/90 border border-emerald-700/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                          <OpsIcon name="check" size={10} />
                          <span>JD Received</span>
                        </span>
                      )}
                    </Link>
                  ))}
                  {list.length === 0 && (
                    <p className="py-8 text-center text-[11px] font-mono text-slate-500">No accounts</p>
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

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { ACCREDITATION_FIELDS, REPORT_TEMPLATES } from "@/lib/placement-export";
import { metricDelta, placementBatchMetrics } from "@/lib/placement-comparison";
import { OpsIcon } from "@/components/ops-icon";
import { StatCard } from "@/components/stat-card";
import type { Batch } from "@/types/domain";
import type { Database } from "@/types/database.types";

type PlacementRow = Pick<
  Database["public"]["Tables"]["placement_records"]["Row"],
  "student_id" | "final_ctc" | "company_id"
> & { companies: { name: string } | null };

function signed(value: number | null, digits = 1, suffix = ""): string {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}${suffix}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ batch_id?: string; compare_batch_id?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !(ctx.permissionNames.has("Reports & Export") || ctx.permissionNames.has("Reports - View Only"))) {
    redirect("/dashboard");
  }

  const { batch_id, compare_batch_id } = await searchParams;
  const supabase = await createClient();

  const { data: batches } = await supabase.from("batches").select("*").order("name");
  const batchRows = (batches ?? []) as Batch[];
  const activeBatch = batchRows.find((b) => b.id === batch_id) ?? batchRows.find((b) => b.is_active) ?? batchRows[0];

  if (!activeBatch) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">Placement Reports &amp; Analytics</h1>
        <p className="text-sm text-slate-400 font-mono">No batch records found in the database.</p>
      </div>
    );
  }

  const comparisonBatch = batchRows.find((batch) => batch.id === compare_batch_id && batch.id !== activeBatch.id)
    ?? batchRows.find((batch) => batch.id !== activeBatch.id);
  const selectedBatchIds = [activeBatch.id, comparisonBatch?.id].filter((id): id is string => Boolean(id));

  const { data: students } = await supabase
    .from("students")
    .select("id, batch_id, placement_status")
    .in("batch_id", selectedBatchIds);

  const studentRows = students ?? [];
  const studentIds = studentRows.map((student) => student.id);

  const { data: placements } =
    studentIds.length > 0
      ? await supabase
          .from("placement_records")
          .select("student_id, final_ctc, company_id, companies(name)")
          .in("student_id", studentIds)
      : { data: [] };
  const placementRows = (placements ?? []) as unknown as PlacementRow[];
  const activeMetrics = placementBatchMetrics(activeBatch.id, studentRows, placementRows);
  const comparisonMetrics = comparisonBatch
    ? placementBatchMetrics(comparisonBatch.id, studentRows, placementRows)
    : null;
  const activeStudentIds = new Set(studentRows.filter((student) => student.batch_id === activeBatch.id).map((student) => student.id));
  const byCompany = new Map<string, { name: string; count: number; totalCtc: number; ctcCount: number }>();
  for (const p of placementRows.filter((placement) => activeStudentIds.has(placement.student_id))) {
    const key = p.company_id;
    const entry = byCompany.get(key) ?? { name: p.companies?.name ?? "Unknown", count: 0, totalCtc: 0, ctcCount: 0 };
    entry.count += 1;
    if (p.final_ctc != null) {
      entry.totalCtc += p.final_ctc;
      entry.ctcCount += 1;
    }
    byCompany.set(key, entry);
  }
  const companyRows = Array.from(byCompany.values()).sort((a, b) => b.count - a.count);
  const canExport = ctx.permissionNames.has("Reports & Export");

  return (
    <div className="space-y-7">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-blue-400">
            <OpsIcon name="chart" size={14} />
            <span>Audited Institutional Telemetry</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Placement Analytics &amp; Reports</span>
            <span className="rounded bg-emerald-950/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-emerald-400 border border-emerald-700/80">
              {activeBatch.name}
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Section 4.10: Live CTC telemetry, audited accreditation export templates, and batch delta analysis.
          </p>
        </div>
      </div>

      {/* Primary Metric Gauges */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Placement Rate"
          value={`${activeMetrics.placementRate.toFixed(1)}%`}
          secondary={`${activeMetrics.placed} of ${activeMetrics.total} candidates placed`}
          icon="award"
          highlight="emerald"
        />
        <StatCard
          label="Average CTC"
          value={activeMetrics.averageCtc != null ? `${activeMetrics.averageCtc.toFixed(1)} LPA` : "—"}
          secondary={`Median: ${activeMetrics.medianCtc != null ? `${activeMetrics.medianCtc.toFixed(1)} LPA` : "—"}`}
          icon="chart"
          highlight="gold"
        />
        <StatCard
          label="Highest CTC"
          value={activeMetrics.highestCtc != null ? `${activeMetrics.highestCtc.toFixed(1)} LPA` : "—"}
          secondary="Top offer of the season"
          icon="star"
          highlight="amber"
        />
        <StatCard
          label="Hiring Partners"
          value={activeMetrics.hiringCompanies}
          secondary="Companies with confirmed offers"
          icon="building"
          highlight="cobalt"
        />
      </div>

      {/* Export Accordion */}
      {canExport && (
        <details className="group rounded-lg border border-blue-800/80 bg-slate-900/90 p-5 shadow-sm" open>
          <summary className="cursor-pointer font-bold text-white text-sm flex items-center justify-between list-none">
            <span className="flex items-center gap-2 font-mono">
              <OpsIcon name="download" size={15} className="text-blue-400" />
              <span>Audited Report Template Exporter</span>
            </span>
            <span className="font-mono text-xs text-blue-400">Section 4.10 Standard</span>
          </summary>

          <form action="/reports/export" method="get" className="mt-5 space-y-4 border-t border-slate-800 pt-4">
            <input type="hidden" name="batch_id" value={activeBatch.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              {REPORT_TEMPLATES.map((template, index) => (
                <label
                  key={template.id}
                  className="rounded-md border border-slate-750 bg-slate-950/80 p-3.5 text-xs text-slate-300 hover:border-slate-650 cursor-pointer block shadow-inner transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <input type="radio" name="template" value={template.id} defaultChecked={index === 0} className="accent-blue-600 size-3.5" />
                    <strong className="text-white text-xs">{template.name}</strong>
                  </div>
                  <span className="mt-1.5 block text-[11px] text-slate-400 leading-relaxed">{template.description}</span>
                </label>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Accreditation Detail Fields (NIRF / AACSB / EQUIS)
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ACCREDITATION_FIELDS.map(([field, label]) => (
                  <label key={field} className="inline-flex items-center gap-1.5 rounded border border-slate-750 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" name="fields" value={field} defaultChecked className="accent-blue-600 size-3.5" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" name="include_unplaced" value="1" defaultChecked className="accent-blue-600 size-3.5" />
                <span>Include unplaced student rows in applicable breakdown tables</span>
              </label>
              <button
                type="submit"
                className="ops-button-primary"
              >
                <OpsIcon name="download" size={13} />
                <span>Download Audited CSV</span>
              </button>
            </div>
          </form>
        </details>
      )}

      {/* Season Comparison Table */}
      {comparisonBatch && comparisonMetrics && (
        <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white flex items-center gap-2 font-mono">
                <OpsIcon name="trending-up" size={15} className="text-amber-400" />
                <span>Season-over-Season Delta Analysis</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Variance between <strong className="text-white font-medium">{activeBatch.name}</strong> vs <strong className="text-slate-300 font-medium">{comparisonBatch.name}</strong>.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Performance Metric</th>
                  <th className="py-2.5 px-3 text-right">{activeBatch.name}</th>
                  <th className="py-2.5 px-3 text-right">{comparisonBatch.name}</th>
                  <th className="py-2.5 px-3 text-right">Variance Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr className="hover:bg-slate-850/50">
                  <td className="py-2.5 px-3 font-sans font-medium text-white">Placement Rate</td>
                  <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">{activeMetrics.placementRate.toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{comparisonMetrics.placementRate.toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">{signed(metricDelta(activeMetrics.placementRate, comparisonMetrics.placementRate), 1, " pp")}</td>
                </tr>
                <tr className="hover:bg-slate-850/50">
                  <td className="py-2.5 px-3 font-sans font-medium text-white">Average CTC</td>
                  <td className="py-2.5 px-3 text-right text-amber-300 font-bold">{activeMetrics.averageCtc?.toFixed(1) ?? "—"} LPA</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{comparisonMetrics.averageCtc?.toFixed(1) ?? "—"} LPA</td>
                  <td className="py-2.5 px-3 text-right text-amber-400 font-bold">{signed(metricDelta(activeMetrics.averageCtc, comparisonMetrics.averageCtc))}</td>
                </tr>
                <tr className="hover:bg-slate-850/50">
                  <td className="py-2.5 px-3 font-sans font-medium text-white">Highest CTC</td>
                  <td className="py-2.5 px-3 text-right text-white font-bold">{activeMetrics.highestCtc?.toFixed(1) ?? "—"} LPA</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{comparisonMetrics.highestCtc?.toFixed(1) ?? "—"} LPA</td>
                  <td className="py-2.5 px-3 text-right text-emerald-400">{signed(metricDelta(activeMetrics.highestCtc, comparisonMetrics.highestCtc))}</td>
                </tr>
                <tr className="hover:bg-slate-850/50">
                  <td className="py-2.5 px-3 font-sans font-medium text-white">Hiring Partner Companies</td>
                  <td className="py-2.5 px-3 text-right text-blue-300">{activeMetrics.hiringCompanies}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{comparisonMetrics.hiringCompanies}</td>
                  <td className="py-2.5 px-3 text-right text-blue-300">{signed(metricDelta(activeMetrics.hiringCompanies, comparisonMetrics.hiringCompanies), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Company Breakdown Table */}
      <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-sm">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2 font-mono border-b border-slate-800 pb-3">
          <OpsIcon name="building" size={14} className="text-blue-400" />
          <span>Company-Wise Offer Breakdown</span>
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Recruiting Partner</th>
                <th className="py-2.5 px-3 text-center">Offers Accepted</th>
                <th className="py-2.5 px-3 text-right">Average Offered CTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {companyRows.map((c) => (
                <tr key={c.name} className="hover:bg-slate-850/50 transition-colors">
                  <td className="py-2.5 px-3 font-sans font-semibold text-white">{c.name}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-400">{c.count}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                    {c.ctcCount > 0 ? `${(c.totalCtc / c.ctcCount).toFixed(1)} LPA` : "—"}
                  </td>
                </tr>
              ))}
              {companyRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-400 font-mono">No placements confirmed yet for this season.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

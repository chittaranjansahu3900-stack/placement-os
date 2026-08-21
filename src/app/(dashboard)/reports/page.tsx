import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { Batch } from "@/types/domain";
import type { Database } from "@/types/database.types";
import { ACCREDITATION_FIELDS, REPORT_TEMPLATES } from "@/lib/placement-export";
import { metricDelta, placementBatchMetrics } from "@/lib/placement-comparison";

type PlacementRow = Pick<
  Database["public"]["Tables"]["placement_records"]["Row"],
  "student_id" | "final_ctc" | "company_id"
> & { companies: { name: string } | null };

function signed(value: number | null, digits = 1, suffix = ""): string {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}${suffix}`;
}

// FR-7.1: live dashboard — placed/unplaced, company-wise breakdown,
// average/median/highest CTC. Gated to whoever actually holds a
// report-viewing Permission Set (Reports & Export or Reports - View Only,
// Section 7.2/7.3) — not role name, so a custom role built on either
// permission sees this too. placement_records RLS would 403 anyone else's
// queries anyway; this is just a friendlier redirect.
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
      <div>
        <h1 className="text-lg font-semibold text-white">Placement Report</h1>
        <p className="mt-2 text-sm text-neutral-500">No batch exists yet.</p>
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
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-white">Placement Report</h1>
      </div>

      {canExport && (
        <details className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4" open>
          <summary className="cursor-pointer text-sm font-medium text-white">Export template</summary>
          <form action="/reports/export" method="get" className="mt-4 space-y-4">
            <input type="hidden" name="batch_id" value={activeBatch.id} />
            <div className="grid gap-2 sm:grid-cols-3">
              {REPORT_TEMPLATES.map((template, index) => (
                <label key={template.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                  <input type="radio" name="template" value={template.id} defaultChecked={index === 0} className="mr-2 accent-blue-600" />
                  <strong className="text-white">{template.name}</strong>
                  <span className="mt-1 block text-xs text-neutral-500">{template.description}</span>
                </label>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-300">Accreditation detail fields</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {ACCREDITATION_FIELDS.map(([field, label]) => (
                  <label key={field} className="text-xs text-neutral-400"><input type="checkbox" name="fields" value={field} defaultChecked className="mr-1.5 accent-blue-600" />{label}</label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-neutral-600">Field choices apply to Accreditation Detail; official and public templates use their fixed audited layouts.</p>
            </div>
            <label className="block text-xs text-neutral-400"><input type="checkbox" name="include_unplaced" value="1" defaultChecked className="mr-1.5 accent-blue-600" />Include unplaced students where the selected template supports student rows</label>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Download CSV</button>
          </form>
        </details>
      )}
      {!canExport && <p className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">Your Reports permission is view-only. Export requires the Reports &amp; Export Permission Set.</p>}

      {batchRows.length > 1 && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <label className="text-xs text-neutral-400">Current season
            <select name="batch_id" defaultValue={activeBatch.id} className="mt-1 block rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-600">
              {batchRows.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-400">Compare with
            <select name="compare_batch_id" defaultValue={comparisonBatch?.id} className="mt-1 block rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-600">
              {batchRows.filter((batch) => batch.id !== activeBatch.id).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
          >
            Compare
          </button>
        </form>
      )}

      {batchRows.length < 2 && (
        <p className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Batch-over-batch comparison becomes available after a second season is created.
        </p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-xs text-neutral-500">Placed</p>
          <p className="text-2xl font-semibold text-white">
            {activeMetrics.placed} / {activeMetrics.total}
          </p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-xs text-neutral-500">Avg / Median CTC</p>
          <p className="text-2xl font-semibold text-white">
            {activeMetrics.averageCtc != null ? activeMetrics.averageCtc.toFixed(1) : "—"} / {activeMetrics.medianCtc != null ? activeMetrics.medianCtc.toFixed(1) : "—"}
          </p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-xs text-neutral-500">Highest CTC</p>
          <p className="text-2xl font-semibold text-white">{activeMetrics.highestCtc != null ? activeMetrics.highestCtc.toFixed(1) : "—"}</p>
        </div>
      </div>

      {comparisonBatch && comparisonMetrics && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-white">Season comparison</h2>
          <p className="mt-1 text-xs text-neutral-500">Delta is {activeBatch.name} minus {comparisonBatch.name}; CTC values use the stored report unit.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-neutral-900 text-xs text-neutral-500">
                <tr><th className="p-3 font-normal">Metric</th><th className="p-3 font-normal">{activeBatch.name}</th><th className="p-3 font-normal">{comparisonBatch.name}</th><th className="p-3 font-normal">Delta</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                <tr><td className="p-3 text-white">Placement rate</td><td className="p-3 text-neutral-300">{activeMetrics.placementRate.toFixed(1)}%</td><td className="p-3 text-neutral-300">{comparisonMetrics.placementRate.toFixed(1)}%</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.placementRate, comparisonMetrics.placementRate), 1, " pp")}</td></tr>
                <tr><td className="p-3 text-white">Placed students</td><td className="p-3 text-neutral-300">{activeMetrics.placed}</td><td className="p-3 text-neutral-300">{comparisonMetrics.placed}</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.placed, comparisonMetrics.placed), 0)}</td></tr>
                <tr><td className="p-3 text-white">Cohort size</td><td className="p-3 text-neutral-300">{activeMetrics.total}</td><td className="p-3 text-neutral-300">{comparisonMetrics.total}</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.total, comparisonMetrics.total), 0)}</td></tr>
                <tr><td className="p-3 text-white">Average CTC</td><td className="p-3 text-neutral-300">{activeMetrics.averageCtc?.toFixed(1) ?? "—"}</td><td className="p-3 text-neutral-300">{comparisonMetrics.averageCtc?.toFixed(1) ?? "—"}</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.averageCtc, comparisonMetrics.averageCtc))}</td></tr>
                <tr><td className="p-3 text-white">Median CTC</td><td className="p-3 text-neutral-300">{activeMetrics.medianCtc?.toFixed(1) ?? "—"}</td><td className="p-3 text-neutral-300">{comparisonMetrics.medianCtc?.toFixed(1) ?? "—"}</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.medianCtc, comparisonMetrics.medianCtc))}</td></tr>
                <tr><td className="p-3 text-white">Highest CTC</td><td className="p-3 text-neutral-300">{activeMetrics.highestCtc?.toFixed(1) ?? "—"}</td><td className="p-3 text-neutral-300">{comparisonMetrics.highestCtc?.toFixed(1) ?? "—"}</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.highestCtc, comparisonMetrics.highestCtc))}</td></tr>
                <tr><td className="p-3 text-white">Hiring companies</td><td className="p-3 text-neutral-300">{activeMetrics.hiringCompanies}</td><td className="p-3 text-neutral-300">{comparisonMetrics.hiringCompanies}</td><td className="p-3 text-neutral-300">{signed(metricDelta(activeMetrics.hiringCompanies, comparisonMetrics.hiringCompanies), 0)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <h2 className="mt-8 text-sm font-semibold text-white">Company-wise breakdown</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-neutral-500">
            <th className="pb-2 font-normal">Company</th>
            <th className="pb-2 font-normal">Students placed</th>
            <th className="pb-2 font-normal">Avg CTC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {companyRows.map((c) => (
            <tr key={c.name}>
              <td className="py-2 text-white">{c.name}</td>
              <td className="py-2 text-neutral-300">{c.count}</td>
              <td className="py-2 text-neutral-300">
                {c.ctcCount > 0 ? (c.totalCtc / c.ctcCount).toFixed(1) : "—"}
              </td>
            </tr>
          ))}
          {companyRows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-sm text-neutral-500">
                No placements recorded yet for this batch.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { Batch } from "@/types/domain";
import { ACCREDITATION_FIELDS, REPORT_TEMPLATES } from "@/lib/placement-export";

// FR-7.1: live dashboard — placed/unplaced, company-wise breakdown,
// average/median/highest CTC. Gated to whoever actually holds a
// report-viewing Permission Set (Reports & Export or Reports - View Only,
// Section 7.2/7.3) — not role name, so a custom role built on either
// permission sees this too. placement_records RLS would 403 anyone else's
// queries anyway; this is just a friendlier redirect.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ batch_id?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !(ctx.permissionNames.has("Reports & Export") || ctx.permissionNames.has("Reports - View Only"))) {
    redirect("/dashboard");
  }

  const { batch_id } = await searchParams;
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

  const { data: students } = await supabase
    .from("students")
    .select("id, placement_status")
    .eq("batch_id", activeBatch.id);

  const studentIds = (students ?? []).map((s) => s.id);
  const placedCount = (students ?? []).filter((s) => s.placement_status === "placed").length;
  const total = students?.length ?? 0;

  const { data: placements } =
    studentIds.length > 0
      ? await supabase
          .from("placement_records")
          .select("final_ctc, company_id, companies(name)")
          .in("student_id", studentIds)
      : { data: [] };

  const ctcValues = (placements ?? [])
    .map((p) => p.final_ctc)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  const avgCtc = ctcValues.length > 0 ? ctcValues.reduce((a, b) => a + b, 0) / ctcValues.length : null;
  const medianCtc =
    ctcValues.length > 0
      ? ctcValues.length % 2 === 1
        ? ctcValues[(ctcValues.length - 1) / 2]
        : (ctcValues[ctcValues.length / 2 - 1] + ctcValues[ctcValues.length / 2]) / 2
      : null;
  const highestCtc = ctcValues.length > 0 ? ctcValues[ctcValues.length - 1] : null;

  type PlacementRow = { final_ctc: number | null; company_id: string; companies: { name: string } | null };
  const byCompany = new Map<string, { name: string; count: number; totalCtc: number; ctcCount: number }>();
  for (const p of (placements ?? []) as unknown as PlacementRow[]) {
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
        <form method="get" className="mt-3 flex gap-2">
          <select
            name="batch_id"
            defaultValue={activeBatch.id}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          >
            {batchRows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
          >
            Switch
          </button>
        </form>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-xs text-neutral-500">Placed</p>
          <p className="text-2xl font-semibold text-white">
            {placedCount} / {total}
          </p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-xs text-neutral-500">Avg / Median CTC</p>
          <p className="text-2xl font-semibold text-white">
            {avgCtc != null ? avgCtc.toFixed(1) : "—"} / {medianCtc != null ? medianCtc.toFixed(1) : "—"}
          </p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-xs text-neutral-500">Highest CTC</p>
          <p className="text-2xl font-semibold text-white">{highestCtc != null ? highestCtc.toFixed(1) : "—"}</p>
        </div>
      </div>

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
